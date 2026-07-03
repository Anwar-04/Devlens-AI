import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
} from "@nestjs/common";
import { db } from "@devlens/database";
import { generateEmbedding, searchKnowledgePoints } from "@devlens/shared";

const MAX_LIMIT = 25;
const DEFAULT_LIMIT = 10;
const QDRANT_URL = process.env.QDRANT_URL ?? "http://localhost:6333";
const EXACT_TOKEN_PATTERN = /[a-zA-Z0-9_.$/-]+/g;
const WORD_TOKEN_PATTERN = /[a-zA-Z0-9_]+/g;
const TEST_FILE_PATTERN =
  /(^|\/)(__tests__|tests?)\/|(\.|-)(test|spec)\.[^.]+$/i;

type SearchTerms = {
  exact: string[];
  tokens: string[];
  intent: "lookup" | "usage";
  targetTokens: string[];
  all: string[];
};

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "code",
  "does",
  "find",
  "for",
  "how",
  "in",
  "is",
  "me",
  "of",
  "on",
  "or",
  "show",
  "the",
  "to",
  "what",
  "where",
  "which",
  "with",
]);

const USAGE_WORDS = new Set([
  "call",
  "called",
  "calls",
  "reference",
  "referenced",
  "references",
  "usage",
  "use",
  "used",
  "uses",
  "using",
]);

const TOKEN_ALIASES: Record<string, string> = {
  parsed: "parse",
  parser: "parse",
  parses: "parse",
  parsing: "parse",
  formatted: "format",
  formatter: "format",
  formatting: "format",
};

function parseLimit(value: string | undefined): number {
  if (!value) return DEFAULT_LIMIT;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new BadRequestException("Search limit must be a positive integer.");
  }
  return Math.min(parsed, MAX_LIMIT);
}

function buildSearchTerms(query: string): SearchTerms {
  const normalized = query.toLowerCase();
  const exact = normalized.match(EXACT_TOKEN_PATTERN) ?? [];
  const rawTokens = normalized.match(WORD_TOKEN_PATTERN) ?? [];
  const intent = rawTokens.some((token) => USAGE_WORDS.has(token))
    ? "usage"
    : "lookup";
  const tokens = rawTokens.flatMap(expandQueryToken);
  const cleanExact = exact
    .flatMap(expandQueryToken)
    .filter((token) => token.length >= 2 && !USAGE_WORDS.has(token));
  const cleanTokens = tokens.filter(
    (token) => token.length >= 2 && !USAGE_WORDS.has(token),
  );
  const targetTokens = [...new Set(cleanTokens)].slice(0, 8);
  const all = [...new Set([...cleanExact, ...cleanTokens])].slice(0, 16);

  return {
    exact: [...new Set(cleanExact)].slice(0, 8),
    tokens: [...new Set(cleanTokens)].slice(0, 12),
    intent,
    targetTokens,
    all,
  };
}

function normalizeQueryToken(token: string): string {
  return TOKEN_ALIASES[token] ?? token;
}

function expandQueryToken(token: string): string[] {
  const parts = token
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9_]+/g)
    .filter(Boolean)
    .map(normalizeQueryToken)
    .filter((part) => !STOPWORDS.has(part));

  return [...new Set(parts)];
}

function countOccurrences(
  value: string,
  token: string,
  exactIdentifier = false,
): number {
  const normalized = value.toLowerCase();
  if (exactIdentifier || token.length <= 2) {
    return countIdentifierOccurrences(normalized, token);
  }

  let count = 0;
  let index = normalized.indexOf(token);

  while (index >= 0) {
    count += 1;
    index = normalized.indexOf(token, index + token.length);
  }

  return count;
}

function countIdentifierOccurrences(value: string, token: string): number {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `(^|[^a-z0-9_$])${escaped}(?=$|[^a-z0-9_$])`,
    "gi",
  );
  return value.match(pattern)?.length ?? 0;
}

function splitIdentifier(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9_]+/g)
    .filter(Boolean)
    .map(normalizeQueryToken);
}

function scoreChunk(
  chunk: {
    title: string;
    path: string;
    content: string;
    language: string | null;
    file: { isTest: boolean } | null;
    symbol: { name: string; kind: string } | null;
    chunkKind: string;
  },
  terms: SearchTerms,
): number {
  const symbolScore = chunk.symbol
    ? terms.all.reduce((score, token) => {
        const symbolName = chunk.symbol?.name.toLowerCase() ?? "";
        const symbolParts = splitIdentifier(chunk.symbol?.name ?? "");
        if (symbolName === token) return score + 180;
        if (symbolParts.includes(token)) return score + 72;
        if (token.length > 2 && symbolName.includes(token)) return score + 24;
        return score;
      }, 0)
    : 0;

  const exactScore = terms.exact.reduce((score, token) => {
    const pathHits = countOccurrences(chunk.path, token, true);
    const titleHits = countOccurrences(chunk.title, token, true);
    const contentHits = Math.min(
      countOccurrences(chunk.content, token, true),
      terms.intent === "usage" ? 4 : 12,
    );
    return score + pathHits * 18 + titleHits * 14 + contentHits * 5;
  }, 0);

  const tokenScore = terms.tokens.reduce((score, token) => {
    const pathHits = countOccurrences(chunk.path, token, true);
    const titleHits = countOccurrences(chunk.title, token, true);
    const contentHits = Math.min(
      countOccurrences(chunk.content, token, true),
      terms.intent === "usage" ? 4 : 12,
    );
    const languageHits = chunk.language
      ? countOccurrences(chunk.language, token, true)
      : 0;
    const definitionHits = countDefinitionHits(chunk.content, token);
    const referenceHits = Math.min(
      countReferenceHits(chunk.content, token),
      terms.intent === "usage" ? 4 : 10,
    );
    return (
      score +
      pathHits * 8 +
      titleHits * 6 +
      languageHits * 3 +
      definitionHits * 10 +
      referenceHits * (terms.intent === "usage" ? 18 : 6) +
      contentHits
    );
  }, 0);

  const usageIntentBoost = scoreUsageIntent(chunk, terms);
  const typeAliasPenalty =
    terms.intent === "usage" && chunk.symbol?.kind === "type" ? 0.35 : 1;
  const baseScore = symbolScore + exactScore + tokenScore + usageIntentBoost;
  if (baseScore === 0) return 0;

  const isTest = chunk.file?.isTest ?? TEST_FILE_PATTERN.test(chunk.path);
  const sourceMultiplier = isTest
    ? terms.intent === "usage"
      ? 0.16
      : 0.45
    : 1.25;
  const symbolMultiplier = chunk.chunkKind === "SYMBOL" ? 1.35 : 1;
  return Math.max(
    1,
    Math.round(
      baseScore * sourceMultiplier * symbolMultiplier * typeAliasPenalty,
    ),
  );
}

function countDefinitionHits(content: string, token: string): number {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `\\b(function|class|interface|type|const|let|var|export\\s+function)\\s+${escaped}\\b`,
    "gi",
  );
  return content.match(pattern)?.length ?? 0;
}

function countReferenceHits(content: string, token: string): number {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(^|[^a-z0-9_$])${escaped}\\s*\\(`, "gi");
  return content.match(pattern)?.length ?? 0;
}

function scoreUsageIntent(
  chunk: {
    content: string;
    symbol: { name: string; kind: string } | null;
    chunkKind: string;
  },
  terms: SearchTerms,
): number {
  if (terms.intent !== "usage") return 0;

  return terms.targetTokens.reduce((score, token) => {
    const symbolName = chunk.symbol?.name.toLowerCase();
    const exactSymbol = symbolName === token ? 180 : 0;
    const symbolPart = splitIdentifier(chunk.symbol?.name ?? "").includes(token)
      ? 36
      : 0;
    const calls = Math.min(countReferenceHits(chunk.content, token), 4) * 24;
    return score + exactSymbol + symbolPart + calls;
  }, 0);
}

function findBestMatch(
  content: string,
  terms: SearchTerms,
): { index: number; term: string | null } {
  const normalized = content.toLowerCase();
  const orderedTerms = [...terms.exact, ...terms.tokens].sort(
    (a, b) => b.length - a.length,
  );

  for (const term of orderedTerms) {
    const index = findIdentifierMatchIndex(normalized, term);
    if (index >= 0) return { index, term };
  }

  return { index: -1, term: null };
}

function findIdentifierMatchIndex(value: string, token: string): number {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `(^|[^a-z0-9_$])(${escaped})(?=$|[^a-z0-9_$])`,
    "i",
  );
  const match = value.match(pattern);
  if (!match?.index) return match ? 0 : -1;
  return match.index + (match[1]?.length ?? 0);
}

function buildSnippet(
  content: string,
  terms: SearchTerms,
): { snippet: string; matchedTerm: string | null } {
  const match = findBestMatch(content, terms);
  const matchIndex = Math.max(0, match.index);
  const start = Math.max(0, matchIndex - 90);
  const end = Math.min(content.length, matchIndex + 260);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < content.length ? "..." : "";

  return {
    snippet: `${prefix}${content.slice(start, end).trim()}${suffix}`,
    matchedTerm: match.term,
  };
}

@Controller("repositories/:repositoryId/search")
export class RepositorySearchController {
  @Get()
  async search(
    @Param("repositoryId") repositoryId: string,
    @Query("q") query: string | undefined,
    @Query("limit") limitValue: string | undefined,
  ) {
    const normalizedQuery = query?.trim();
    if (!normalizedQuery) {
      throw new BadRequestException("Search query is required.");
    }

    const terms = buildSearchTerms(normalizedQuery);
    if (terms.all.length === 0) {
      throw new BadRequestException(
        "Search query must include at least one searchable term.",
      );
    }

    const repository = await db.repository.findUnique({
      where: { id: repositoryId },
      select: { id: true, owner: true, name: true },
    });
    if (!repository) {
      throw new NotFoundException("Repository not found");
    }

    const limit = parseLimit(limitValue);
    const vectorHits = await searchKnowledgePoints({
      qdrantUrl: QDRANT_URL,
      repositoryId,
      vector: generateEmbedding(terms.all.join(" ")),
      limit: Math.max(limit * 4, 24),
    }).catch((error) => {
      console.warn(
        `Qdrant search failed for repository ${repositoryId}; falling back to lexical search.`,
        error,
      );
      return [];
    });
    const vectorScoresById = new Map(
      vectorHits.map((hit) => [hit.id, hit.score]),
    );
    const vectorIds = vectorHits.map((hit) => hit.id);

    const candidates = await db.knowledgeChunk.findMany({
      where: {
        repositoryId,
        OR: [
          ...terms.all.flatMap((token) => [
            { title: { contains: token, mode: "insensitive" as const } },
            { path: { contains: token, mode: "insensitive" as const } },
            { content: { contains: token, mode: "insensitive" as const } },
            { language: { contains: token, mode: "insensitive" as const } },
          ]),
          ...(vectorIds.length ? [{ id: { in: vectorIds } }] : []),
        ],
      },
      include: {
        file: {
          select: {
            id: true,
            path: true,
            language: true,
            sizeBytes: true,
            isTest: true,
          },
        },
        symbol: {
          select: {
            id: true,
            name: true,
            kind: true,
            signature: true,
            visibility: true,
          },
        },
      },
      take: 200,
      orderBy: [{ path: "asc" }, { startLine: "asc" }],
    });

    const results = candidates
      .map((chunk) => {
        const lexicalScore = scoreChunk(chunk, terms);
        const vectorScore = vectorScoresById.get(chunk.id) ?? 0;
        return {
          chunk,
          lexicalScore,
          vectorScore,
          score: lexicalScore + Math.round(vectorScore * 100),
        };
      })
      .filter((result) => result.score > 0 || result.vectorScore > 0)
      .sort(
        (a, b) => b.score - a.score || a.chunk.path.localeCompare(b.chunk.path),
      )
      .slice(0, limit)
      .map(({ chunk, score, lexicalScore, vectorScore }) => {
        const { snippet, matchedTerm } = buildSnippet(chunk.content, terms);
        return {
          id: chunk.id,
          score,
          lexicalScore,
          vectorScore,
          title: chunk.title,
          path: chunk.path,
          language: chunk.language,
          startLine: chunk.startLine,
          endLine: chunk.endLine,
          snippet,
          matchedTerm,
          isTest: chunk.file?.isTest ?? TEST_FILE_PATTERN.test(chunk.path),
          chunkKind: chunk.chunkKind,
          symbol: chunk.symbol,
          file: chunk.file,
        };
      });

    return {
      repository,
      query: normalizedQuery,
      tokens: terms.all,
      count: results.length,
      results,
    };
  }
}
