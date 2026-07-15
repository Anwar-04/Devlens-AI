import { Body, Controller, NotFoundException, Param, Post } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { db } from "@devlens/database";
import {
  checkGeminiProviderHealth,
  createAssistantAnswer,
  type AssistantAskRequest,
  type AssistantAskResponse,
  type AssistantCitation,
  type AssistantContext,
} from "./assistant.service";

const starterFilePatterns: Array<[RegExp, string]> = [
  [/^README(\.[\w-]+)?$/i, "Start with the project overview and setup notes."],
  [/^package\.json$/i, "Review scripts, dependencies, and runtime shape."],
  [/(^|\/)(src|app|server|index|main)\.[cm]?[jt]sx?$/i, "Inspect the application entry point."],
  [/(^|\/)routes?\//i, "Review request routing and feature boundaries."],
  [/(^|\/)controllers?\//i, "Inspect request handling and orchestration."],
  [/(^|\/)services?\//i, "Inspect business logic and core behavior."],
  [/(^|\/)(config|db|database|schema|prisma|drizzle)/i, "Review configuration or persistence setup."],
];

function dedupeCitations(citations: AssistantCitation[]) {
  const seen = new Set<string>();
  return citations.filter((citation) => {
    const key = `${citation.path}:${citation.startLine ?? ""}:${citation.endLine ?? ""}`;
    if (!citation.path || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function pickStarterFiles(files: Array<{ path: string }>) {
  const used = new Set<string>();
  const paths = files.map((file) => file.path);
  const picked = starterFilePatterns
    .map(([pattern, reason]) => {
      const path = paths.find((candidate) => pattern.test(candidate) && !used.has(candidate));
      if (!path) return null;
      used.add(path);
      return {
        path,
        label: path,
        reason,
      };
    })
    .filter((citation): citation is AssistantCitation => Boolean(citation));

  if (picked.length) return picked.slice(0, 6);

  return paths.slice(0, 4).map((path) => ({
    path,
    label: path,
    reason: "Review this repository file.",
  }));
}

async function buildStoredAssistantContext(
  repositoryId: string,
  clientContext: AssistantContext,
): Promise<AssistantContext> {
  const repository = await db.repository.findUnique({
    where: { id: repositoryId },
    select: {
      id: true,
      owner: true,
      name: true,
      url: true,
      detectedLanguages: true,
      detectedFrameworks: true,
      fileCount: true,
    },
  });

  if (!repository) {
    throw new NotFoundException("Repository not found");
  }

  const [files, symbols] = await Promise.all([
    db.repositoryFile.findMany({
      where: { repositoryId },
      orderBy: { path: "asc" },
      select: { path: true },
      take: 250,
    }),
    db.symbol.findMany({
      where: { repositoryId },
      orderBy: [{ file: { path: "asc" } }, { startLine: "asc" }],
      select: {
        name: true,
        kind: true,
        startLine: true,
        endLine: true,
        summary: true,
        file: {
          select: {
            path: true,
          },
        },
      },
      take: 12,
    }),
  ]);

  const starterCitations = pickStarterFiles(files);
  const symbolCitations = symbols.map((symbol) => ({
    path: symbol.file.path,
    label: `${symbol.name} in ${symbol.file.path}`,
    reason: symbol.summary ?? `${symbol.name} is a ${symbol.kind} found in this file.`,
    startLine: symbol.startLine,
    endLine: symbol.endLine,
  }));
  const storedReadingOrder = dedupeCitations([
    ...(clientContext.guide?.readingOrder ?? []),
    ...starterCitations,
    ...symbolCitations,
  ]).slice(0, 12);
  const languageSummary = repository.detectedLanguages.length
    ? repository.detectedLanguages.join(", ")
    : "the detected project files";
  const frameworkSummary = repository.detectedFrameworks.length
    ? ` It shows ${repository.detectedFrameworks.join(", ")} framework signals.`
    : "";
  const storedSummary = `${repository.owner}/${repository.name} contains ${repository.fileCount} files and uses ${languageSummary}.${frameworkSummary}`;

  return {
    ...clientContext,
    repository: {
      owner: repository.owner,
      name: repository.name,
      url: repository.url,
      languages: repository.detectedLanguages,
      frameworks: repository.detectedFrameworks,
      fileCount: repository.fileCount,
      ...clientContext.repository,
    },
    guide: {
      summary: clientContext.guide?.summary ?? storedSummary,
      purpose:
        clientContext.guide?.purpose ??
        `Understand ${repository.owner}/${repository.name} from its repository files.`,
      architecture:
        clientContext.guide?.architecture ??
        "Start from the overview, package metadata, entry points, and core source files.",
      readingOrder: storedReadingOrder,
    },
    searchResults: dedupeCitations([
      ...(clientContext.searchResults ?? []),
      ...symbolCitations.slice(0, 5),
    ]),
  };
}

@Controller("repositories/:repositoryId/assistant")
export class AssistantController {
  @Post("ask")
  async ask(
    @Param("repositoryId") repositoryId: string,
    @Body() body: AssistantAskRequest,
  ): Promise<AssistantAskResponse> {
    const requestId = body.requestId ?? `chat_${randomUUID()}`;
    console.info(`[DevLens] Chat request started requestId=${requestId} repositoryId=${repositoryId}`);
    console.info(`[DevLens] RAG retrieval requestId=${requestId} repositoryId=${repositoryId}`);
    const context = await buildStoredAssistantContext(repositoryId, body.context ?? {});
    const answer = await createAssistantAnswer(body.question, context, { requestId });
    console.info(
      [
        "[DevLens] Chat request completed",
        `requestId=${requestId}`,
        `mode=${answer.mode}`,
        answer.providerMetadata?.model ? `model=${answer.providerMetadata.model}` : "",
      ]
        .filter(Boolean)
        .join(" "),
    );
    return answer;
  }

  @Post("provider-health")
  async providerHealth(@Body() body: { requestId?: string } = {}) {
    const requestId = body.requestId ?? `chat_${randomUUID()}`;
    const result = await checkGeminiProviderHealth({ requestId });
    return {
      ok: result.ok,
      model: result.model,
      requestId,
      answer: result.answer,
    };
  }
}
