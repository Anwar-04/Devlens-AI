export type AssistantCitation = {
  path: string;
  label: string;
  reason: string;
  startLine?: number;
  endLine?: number;
};

export type AssistantSourceSnippet = {
  path: string;
  startLine?: number;
  endLine?: number;
  content: string;
};

export type AssistantContext = {
  repository?: {
    owner: string;
    name: string;
    url?: string;
    languages?: string[];
    frameworks?: string[];
    fileCount?: number;
  };
  guide?: {
    summary?: string;
    purpose?: string;
    architecture?: string;
    readingOrder?: AssistantCitation[];
  };
  selectedFile?: {
    path: string;
    role?: string;
    previewStartLine?: number;
    previewEndLine?: number;
    preview?: string;
    related?: AssistantCitation[];
  };
  searchResults?: AssistantCitation[];
  sourceSnippets?: AssistantSourceSnippet[];
  localAnswer?: string;
};

export type AssistantAskRequest = {
  question: string;
  context: AssistantContext;
};

export type AssistantAskResponse = {
  answer: string;
  citations: AssistantCitation[];
  mode: "provider" | "fallback";
  fallbackReason?: "missing_credentials" | "provider_error" | "weak_citations";
};

type ProviderJson = {
  answer?: unknown;
  citations?: unknown;
};

type AssistantProviderOptions = {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
};

export function cleanText(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function compact(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength
    ? `${normalized.slice(0, Math.max(0, maxLength - 1))}...`
    : normalized;
}

function formatLineRange(value: { startLine?: number; endLine?: number }) {
  if (!value.startLine || !value.endLine) return "";
  return `:${value.startLine}-${value.endLine}`;
}

export function getAllowedCitations(context: AssistantContext) {
  const citations = [
    ...(context.guide?.readingOrder ?? []),
    ...(context.selectedFile
      ? [
          {
            path: context.selectedFile.path,
            label: context.selectedFile.path,
            reason: context.selectedFile.role ?? "Selected file",
            startLine: context.selectedFile.previewStartLine,
            endLine: context.selectedFile.previewEndLine,
          },
        ]
      : []),
    ...(context.selectedFile?.related ?? []),
    ...(context.searchResults ?? []),
  ];

  const seen = new Set<string>();
  return citations.filter((citation) => {
    const key = `${citation.path}:${citation.startLine ?? ""}:${citation.endLine ?? ""}`;
    if (!citation.path || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildContextPack(
  context: AssistantContext,
  citations: AssistantCitation[],
) {
  const repo = context.repository;
  const sourceSnippets = context.sourceSnippets ?? [];

  return [
    repo
      ? [
          `Repository: ${repo.owner}/${repo.name}`,
          repo.url ? `URL: ${repo.url}` : "",
          repo.frameworks?.length ? `Frameworks: ${repo.frameworks.join(", ")}` : "",
          repo.languages?.length ? `Languages: ${repo.languages.join(", ")}` : "",
          repo.fileCount ? `Files: ${repo.fileCount}` : "",
        ]
          .filter(Boolean)
          .join("\n")
      : "",
    context.guide
      ? [
          "Repository Guide:",
          context.guide.purpose ? `Purpose: ${context.guide.purpose}` : "",
          context.guide.summary ? `Summary: ${compact(context.guide.summary, 900)}` : "",
          context.guide.architecture
            ? `Architecture: ${compact(context.guide.architecture, 600)}`
            : "",
        ]
          .filter(Boolean)
          .join("\n")
      : "",
    context.selectedFile
      ? [
          `Selected file: ${context.selectedFile.path}`,
          context.selectedFile.role ? `Role: ${context.selectedFile.role}` : "",
          context.selectedFile.preview
            ? `Preview:\n${context.selectedFile.preview.slice(0, 2_400)}`
            : "",
        ]
          .filter(Boolean)
          .join("\n")
      : "",
    citations.length
      ? [
          "Allowed citations:",
          ...citations.slice(0, 12).map((citation, index) =>
            `${index + 1}. ${citation.path}${formatLineRange(citation)} - ${citation.reason}`,
          ),
        ].join("\n")
      : "",
    sourceSnippets.length
      ? [
          "Source snippets:",
          ...sourceSnippets.slice(0, 4).map(
            (snippet) =>
              `${snippet.path}${formatLineRange(snippet)}\n${snippet.content.slice(0, 1_500)}`,
          ),
        ].join("\n\n")
      : "",
    context.localAnswer ? `Current file-backed draft:\n${context.localAnswer}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function parseProviderJson(text: string): ProviderJson {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced?.[1] ?? trimmed;
  return JSON.parse(candidate) as ProviderJson;
}

export function filterProviderCitations(
  requested: unknown,
  allowed: AssistantCitation[],
): AssistantCitation[] {
  if (!Array.isArray(requested)) return [];
  const allowedByPath = new Map(allowed.map((citation) => [citation.path, citation]));

  return requested
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const path = cleanText((item as { path?: unknown }).path);
      const allowedCitation = allowedByPath.get(path);
      if (!allowedCitation) return null;
      return {
        ...allowedCitation,
        reason:
          cleanText((item as { reason?: unknown }).reason) ||
          allowedCitation.reason,
      };
    })
    .filter((citation): citation is AssistantCitation => Boolean(citation))
    .slice(0, 5);
}

export function extractResponseText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const directText = cleanText((payload as { output_text?: unknown }).output_text);
  if (directText) return directText;

  const output = (payload as { output?: unknown }).output;
  if (!Array.isArray(output)) return "";

  return output
    .flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const content = (item as { content?: unknown }).content;
      return Array.isArray(content) ? content : [];
    })
    .map((content) => {
      if (!content || typeof content !== "object") return "";
      const text = (content as { text?: unknown }).text;
      return cleanText(text);
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

export function buildProviderInstructions() {
  return [
    "You are DevLens AI, a repository onboarding assistant.",
    "Answer only from the provided repository context.",
    "Do not invent file paths, frameworks, APIs, routes, dependencies, or behavior.",
    "Return compact JSON with keys answer and citations.",
    "Citations must use only paths from the allowed citations list.",
    "Prefer concise, repository-specific answers.",
    "For weak evidence, say what is uncertain and name the next cited file to inspect.",
  ].join(" ");
}

async function askOpenAI(
  question: string,
  context: AssistantContext,
  allowedCitations: AssistantCitation[],
  options: Required<Pick<AssistantProviderOptions, "apiKey" | "model" | "baseUrl" | "fetchImpl">>,
): Promise<AssistantAskResponse> {
  const contextPack = buildContextPack(context, allowedCitations);
  const response = await options.fetchImpl(`${options.baseUrl}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: options.model,
      instructions: buildProviderInstructions(),
      input: `Question: ${question}\n\n${contextPack}`,
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed with ${response.status}`);
  }

  const payload = await response.json();
  const outputText = extractResponseText(payload);
  if (!outputText) {
    throw new Error("OpenAI response did not include answer text.");
  }

  let parsed: ProviderJson;
  try {
    parsed = parseProviderJson(outputText);
  } catch {
    parsed = { answer: outputText, citations: [] };
  }

  const answer = cleanText(parsed.answer, outputText);
  const citations = filterProviderCitations(parsed.citations, allowedCitations);

  if (!citations.length && allowedCitations.length) {
    return {
      answer:
        context.localAnswer ||
        `${answer} I could not tie that answer to a verified file citation, so start with the cited repository guide files and inspect the source directly.`,
      citations: allowedCitations.slice(0, 3),
      mode: "fallback",
      fallbackReason: "weak_citations",
    };
  }

  return {
    answer,
    citations,
    mode: "provider",
  };
}

export async function createAssistantAnswer(
  question: string,
  context: AssistantContext,
  options: AssistantProviderOptions = {},
): Promise<AssistantAskResponse> {
  const allowedCitations = getAllowedCitations(context);
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return {
      answer:
        context.localAnswer ||
        "Enhanced answers are unavailable because credentials are not configured. The file-backed workspace context is still available.",
      citations: allowedCitations.slice(0, 5),
      mode: "fallback",
      fallbackReason: "missing_credentials",
    };
  }

  try {
    return await askOpenAI(question, context, allowedCitations, {
      apiKey,
      model: options.model ?? process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
      baseUrl: options.baseUrl ?? process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
      fetchImpl: options.fetchImpl ?? fetch,
    });
  } catch {
    return {
      answer:
        context.localAnswer ||
        "Enhanced answers are unavailable right now. Use the cited files below to continue the investigation.",
      citations: allowedCitations.slice(0, 5),
      mode: "fallback",
      fallbackReason: "provider_error",
    };
  }
}
