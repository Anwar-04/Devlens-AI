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
  requestId?: string;
};

export type AssistantAskResponse = {
  answer: string;
  citations: AssistantCitation[];
  mode: "provider" | "fallback";
  fallbackReason?: "missing_credentials" | "provider_error" | "weak_citations";
  providerMetadata?: {
    provider: "openai" | "gemini";
    model: string;
    requestId?: string;
    attempts?: number;
    usedFallbackModel?: boolean;
    mode?: "provider" | "provider-fallback" | "local-fallback";
  };
};

type ProviderJson = {
  answer?: unknown;
  citations?: unknown;
};

type AssistantProviderOptions = {
  apiKey?: string;
  provider?: "openai" | "gemini";
  model?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  maxAttempts?: number;
  fallbackModel?: string;
  modelChain?: string[];
  retryBaseDelayMs?: number;
  retryJitterMs?: number;
  requestId?: string;
};

type GeminiRequestMetadata = {
  requestId?: string;
  retrievedSnippetCount: number;
  inputChars: number;
  estimatedTokens: number;
  messageCount: number;
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

function normalizeProvider(value?: string) {
  return value?.toLowerCase() === "gemini" ? "gemini" : "openai";
}

export function normalizeGeminiModelPath(model: string) {
  const trimmed = model.trim().replace(/^\/+/, "");
  if (trimmed.startsWith("models/")) return trimmed;
  return `models/${trimmed}`;
}

function buildGeminiGenerateUrl(baseUrl: string, model: string, apiKey: string) {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  const modelPath = normalizeGeminiModelPath(model)
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  const url = new URL(`${normalizedBaseUrl}/${modelPath}:generateContent`);
  url.searchParams.set("key", apiKey);
  return url.toString();
}

function redactGeminiGenerateUrl(url: string) {
  const parsed = new URL(url);
  if (parsed.searchParams.has("key")) {
    parsed.searchParams.set("key", "[redacted]");
  }
  return parsed.toString().replace("key=%5Bredacted%5D", "key=[redacted]");
}

function getApiKeyPrefix(apiKey: string) {
  return apiKey.slice(0, 6);
}

function logGeminiRequest(
  options: Required<Pick<AssistantProviderOptions, "apiKey" | "model" | "baseUrl">>,
  attempt: number,
  maxAttempts: number,
  metadata: GeminiRequestMetadata,
) {
  const endpoint = buildGeminiGenerateUrl(options.baseUrl, options.model, options.apiKey);
  console.info(
    [
      "[DevLens] Gemini request.",
      metadata.requestId ? `requestId=${metadata.requestId}` : "",
      `attempt=${attempt}/${maxAttempts}`,
      `provider=Gemini`,
      `model=${options.model}`,
      `retrievedSnippets=${metadata.retrievedSnippetCount}`,
      `inputChars=${metadata.inputChars}`,
      `estimatedTokens=${metadata.estimatedTokens}`,
      `messages=${metadata.messageCount}`,
      `apiKeyPrefix=${getApiKeyPrefix(options.apiKey)}******`,
      `endpoint=${redactGeminiGenerateUrl(endpoint)}`,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

class ProviderRequestError extends Error {
  constructor(
    message: string,
    readonly provider: "openai" | "gemini",
    readonly status?: number,
    readonly providerMessage?: string,
    readonly model?: string,
    readonly temporary = false,
    readonly quotaExhausted = false,
  ) {
    super(message);
    this.name = "ProviderRequestError";
  }
}

const inFlightAssistantRequests = new Map<string, Promise<AssistantAskResponse>>();

function sanitizeProviderMessage(value: unknown) {
  if (typeof value !== "string") return "";
  return value
    .replace(/key=[^&\s]+/gi, "key=[redacted]")
    .replace(/x-goog-api-key["']?\s*[:=]\s*["']?[^"',\s]+/gi, "x-goog-api-key=[redacted]")
    .replace(/authorization["']?\s*[:=]\s*["']?bearer\s+[^"',\s]+/gi, "authorization=[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function getRetryAfterMs(response: Response) {
  const retryAfter = response.headers?.get("retry-after");
  if (!retryAfter) return null;

  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }

  const retryAt = new Date(retryAfter).getTime();
  if (!Number.isNaN(retryAt)) {
    return Math.max(0, retryAt - Date.now());
  }

  return null;
}

function isRetryableGeminiStatus(status: number) {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

function isGeminiDailyQuotaError(status: number | undefined, message: string | undefined) {
  return (
    status === 429 &&
    /generativelanguage\.googleapis\.com\/generate_content_free_tier_requests/i.test(
      message ?? "",
    )
  );
}

function getRetryDelayMs(response: Response | null, attempt: number, baseDelayMs: number, jitterMs: number) {
  const retryAfterMs = response ? getRetryAfterMs(response) : null;
  if (retryAfterMs !== null) return retryAfterMs;

  const exponentialDelay = attempt <= 1 ? 0 : baseDelayMs * 2 ** (attempt - 2);
  const jitter = jitterMs > 0 ? Math.floor(Math.random() * jitterMs) : 0;
  return exponentialDelay + jitter;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function logGeminiTemporaryFailure(status: number | "network", retryInMs: number, requestId?: string) {
  console.warn(
    [
      "[DevLens] Gemini temporary failure",
      requestId ? `requestId=${requestId}` : "",
      `status=${status}`,
      `retryInMs=${retryInMs}`,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function shouldTryNextGeminiModel(error: ProviderRequestError) {
  return (
    error.provider === "gemini" &&
    (error.quotaExhausted || (error.temporary && [502, 503, 504].includes(error.status ?? 0)))
  );
}

function parseGeminiModelChain(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
}

function uniqueGeminiModels(models: Array<string | undefined>) {
  const seen = new Set<string>();
  return models.filter((model): model is string => {
    const trimmed = model?.trim();
    if (!trimmed || seen.has(trimmed)) return false;
    seen.add(trimmed);
    return true;
  });
}

function buildGeminiModelChain(options: AssistantProviderOptions) {
  const configuredChain = options.modelChain?.length
    ? options.modelChain
    : parseGeminiModelChain(process.env.GEMINI_MODEL_CHAIN);

  if (configuredChain.length) return uniqueGeminiModels(configuredChain);

  return uniqueGeminiModels([
    options.model ?? process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite",
    options.fallbackModel ?? process.env.GEMINI_FALLBACK_MODEL ?? "gemini-3-flash",
    process.env.GEMINI_HIGH_QUALITY_MODEL ?? "gemini-3.5-flash",
  ]);
}

function buildGeminiMetadata(
  context: AssistantContext,
  question: string,
  contextPack: string,
  requestId?: string,
): GeminiRequestMetadata {
  const instructions = buildProviderInstructions();
  const userText = `Question: ${question}\n\n${contextPack}`;
  const inputChars = instructions.length + userText.length;
  return {
    requestId,
    retrievedSnippetCount: context.sourceSnippets?.length ?? 0,
    inputChars,
    estimatedTokens: Math.ceil(inputChars / 4),
    messageCount: 2,
  };
}

function buildAssistantRequestKey(
  question: string,
  context: AssistantContext,
  provider: "openai" | "gemini",
  model: string,
) {
  return JSON.stringify({
    provider,
    model,
    question,
    repository: context.repository,
    guide: context.guide,
    selectedFile: context.selectedFile?.path,
    searchResults: context.searchResults?.map((citation) => ({
      path: citation.path,
      startLine: citation.startLine,
      endLine: citation.endLine,
    })),
    localAnswer: context.localAnswer,
  });
}

async function readProviderErrorMessage(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text) return "";

  try {
    const parsed = JSON.parse(text) as {
      error?: { message?: unknown; status?: unknown };
      message?: unknown;
    };
    return sanitizeProviderMessage(
      typeof parsed.error?.message === "string"
        ? parsed.error.message
        : typeof parsed.message === "string"
          ? parsed.message
          : text,
    );
  } catch {
    return sanitizeProviderMessage(text);
  }
}

function logProviderFailure(error: unknown) {
  if (error instanceof ProviderRequestError) {
    const modelUnavailable =
      error.provider === "gemini" &&
      error.status === 404 &&
      /model|not found|not available|no longer available/i.test(
        error.providerMessage ?? error.message,
      );
    console.warn(
      [
        `[DevLens] ${error.provider} provider request failed.`,
        error.status ? `status=${error.status}` : "",
        error.model ? `model=${error.model}` : "",
        modelUnavailable ? "reason=model_unavailable not_retrying=true" : "",
        error.providerMessage ? `message="${error.providerMessage}"` : "",
      ]
        .filter(Boolean)
        .join(" "),
    );
    return;
  }

  if (error instanceof Error) {
    console.warn(`[DevLens] Provider request failed. message="${sanitizeProviderMessage(error.message)}"`);
  }
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
  const parsed = JSON.parse(candidate) as ProviderJson;
  const nestedAnswer = cleanText(parsed.answer);
  if (nestedAnswer.startsWith("{")) {
    try {
      const nested = parseProviderJson(nestedAnswer);
      if (cleanText(nested.answer)) return nested;
    } catch {
      return parsed;
    }
  }
  return parsed;
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

export function extractGeminiResponseText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const candidates = (payload as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates)) return "";

  return candidates
    .flatMap((candidate) => {
      if (!candidate || typeof candidate !== "object") return [];
      const content = (candidate as { content?: unknown }).content;
      if (!content || typeof content !== "object") return [];
      const parts = (content as { parts?: unknown }).parts;
      return Array.isArray(parts) ? parts : [];
    })
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      return cleanText((part as { text?: unknown }).text);
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
    "Citations must use exact path values copied from the allowed citations list.",
    "Prefer concise, repository-specific answers.",
    "For weak evidence, say what is uncertain and name the next cited file to inspect.",
  ].join(" ");
}

function buildWeakCitationResponse(
  answer: string,
  localAnswer: string | undefined,
  allowedCitations: AssistantCitation[],
): AssistantAskResponse {
  const verifiedCitations = allowedCitations.slice(0, 3);
  const honestAnswer = cleanText(answer) || localAnswer || "";
  return {
    answer: honestAnswer
      ? `${honestAnswer} I could not verify the exact source references returned with this answer, so the citations below are the closest verified repository anchors.`
      : "I could not verify enough source references for that answer. Start with the cited repository files below.",
    citations: verifiedCitations,
    mode: "fallback",
    fallbackReason: "weak_citations",
  };
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
    throw new ProviderRequestError(
      `OpenAI request failed with ${response.status}`,
      "openai",
      response.status,
      await readProviderErrorMessage(response),
    );
  }

  const payload = await response.json();
  const outputText = extractResponseText(payload);
  if (!outputText) {
    throw new ProviderRequestError("OpenAI response did not include answer text.", "openai");
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
    return buildWeakCitationResponse(answer, context.localAnswer, allowedCitations);
  }

  return {
    answer,
    citations,
    mode: "provider",
  };
}

async function askGemini(
  question: string,
  context: AssistantContext,
  allowedCitations: AssistantCitation[],
  options: Required<
    Pick<
      AssistantProviderOptions,
      | "apiKey"
      | "model"
      | "baseUrl"
      | "fetchImpl"
      | "maxAttempts"
      | "retryBaseDelayMs"
      | "retryJitterMs"
    >
  > &
    Pick<AssistantProviderOptions, "modelChain" | "requestId">,
): Promise<AssistantAskResponse> {
  const contextPack = buildContextPack(context, allowedCitations);
  const systemInstructions = buildProviderInstructions();
  const userText = `Question: ${question}\n\n${contextPack}`;
  const metadata = buildGeminiMetadata(context, question, contextPack, options.requestId);
  const requestInit: RequestInit = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: systemInstructions }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: userText }],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
      },
    }),
  };

  async function requestModel(
    model: string,
    maxAttempts: number,
    usedFallbackModel: boolean,
  ): Promise<AssistantAskResponse> {
    const endpoint = buildGeminiGenerateUrl(options.baseUrl, model, options.apiKey);
    const logOptions = {
      apiKey: options.apiKey,
      model,
      baseUrl: options.baseUrl,
    };
    let lastTemporaryError: ProviderRequestError | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      logGeminiRequest(logOptions, attempt, maxAttempts, metadata);

      let response: Response;
      try {
        response = await options.fetchImpl(endpoint, requestInit);
      } catch (error) {
        const retryInMs = getRetryDelayMs(
          null,
          attempt + 1,
          options.retryBaseDelayMs,
          options.retryJitterMs,
        );
        lastTemporaryError = new ProviderRequestError(
          "Gemini network request failed.",
          "gemini",
          undefined,
          error instanceof Error ? sanitizeProviderMessage(error.message) : "network error",
          model,
          true,
        );
        if (attempt >= maxAttempts) break;
        logGeminiTemporaryFailure("network", retryInMs, options.requestId);
        await wait(retryInMs);
        continue;
      }

      if (!response.ok) {
        const providerMessage = await readProviderErrorMessage(response);
        const quotaExhausted = isGeminiDailyQuotaError(response.status, providerMessage);
        if (quotaExhausted) {
          console.warn(
            [
              "[DevLens] Gemini quota exhausted",
              options.requestId ? `requestId=${options.requestId}` : "",
              `model=${model}`,
            ]
              .filter(Boolean)
              .join(" "),
          );
          throw new ProviderRequestError(
            `Gemini request quota exhausted for ${model}`,
            "gemini",
            response.status,
            providerMessage,
            model,
            false,
            true,
          );
        }

        const retryable = isRetryableGeminiStatus(response.status);
        if (!retryable) {
          throw new ProviderRequestError(
            `Gemini request failed with ${response.status}`,
            "gemini",
            response.status,
            providerMessage,
            model,
            false,
            false,
          );
        }

        lastTemporaryError = new ProviderRequestError(
          `Gemini request failed with ${response.status}`,
          "gemini",
          response.status,
          providerMessage,
          model,
          true,
          false,
        );
        if (attempt >= maxAttempts) break;

        const retryInMs = getRetryDelayMs(
          response,
          attempt + 1,
          options.retryBaseDelayMs,
          options.retryJitterMs,
        );
        logGeminiTemporaryFailure(response.status, retryInMs, options.requestId);
        await wait(retryInMs);
        continue;
      }

      const payload = await response.json();
      const outputText = extractResponseText(payload) || extractGeminiResponseText(payload);
      if (!outputText) {
        throw new ProviderRequestError("Gemini response did not include answer text.", "gemini");
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
          ...buildWeakCitationResponse(answer, context.localAnswer, allowedCitations),
          providerMetadata: {
            provider: "gemini",
            model,
            requestId: options.requestId,
            attempts: attempt,
            usedFallbackModel,
            mode: usedFallbackModel ? "provider-fallback" : "provider",
          },
        };
      }

      return {
        answer,
        citations,
        mode: "provider",
        providerMetadata: {
          provider: "gemini",
          model,
          requestId: options.requestId,
          attempts: attempt,
          usedFallbackModel,
          mode: usedFallbackModel ? "provider-fallback" : "provider",
        },
      };
    }

    throw (
      lastTemporaryError ??
      new ProviderRequestError("Gemini request failed.", "gemini", undefined, undefined, model, true)
    );
  }

  let lastError: ProviderRequestError | null = null;
  const modelChain = uniqueGeminiModels(options.modelChain?.length ? options.modelChain : [options.model]);
  for (let index = 0; index < modelChain.length; index += 1) {
    const model = modelChain[index] ?? options.model;
    try {
      return await requestModel(model, options.maxAttempts, index > 0);
    } catch (error) {
      if (!(error instanceof ProviderRequestError)) throw error;
      lastError = error;
      const nextModel = modelChain[index + 1];
      if (nextModel && shouldTryNextGeminiModel(error)) {
        console.warn(
          [
            "[DevLens] Switching Gemini model",
            options.requestId ? `requestId=${options.requestId}` : "",
            `from=${model}`,
            `to=${nextModel}`,
          ]
            .filter(Boolean)
            .join(" "),
        );
        continue;
      }

      throw error;
    }
  }

  throw lastError ?? new ProviderRequestError("Gemini request failed.", "gemini");
}

export async function checkGeminiProviderHealth(
  options: AssistantProviderOptions = {},
): Promise<{
  ok: boolean;
  model: string;
  requestId?: string;
  answer?: string;
}> {
  const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY;
  const model = options.model ?? process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite";
  const baseUrl =
    options.baseUrl ?? process.env.GEMINI_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta";
  const fetchImpl = options.fetchImpl ?? fetch;
  if (!apiKey) {
    throw new ProviderRequestError("Gemini credentials are not configured.", "gemini", undefined, undefined, model);
  }

  const endpoint = buildGeminiGenerateUrl(baseUrl, model, apiKey);
  const requestId = options.requestId;
  const metadata: GeminiRequestMetadata = {
    requestId,
    retrievedSnippetCount: 0,
    inputChars: "Reply with only: OK".length,
    estimatedTokens: 5,
    messageCount: 1,
  };
  logGeminiRequest({ apiKey, model, baseUrl }, 1, 1, metadata);

  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: "Reply with only: OK" }],
        },
      ],
      generationConfig: {
        temperature: 0,
      },
    }),
  });

  if (!response.ok) {
    throw new ProviderRequestError(
      `Gemini health check failed with ${response.status}`,
      "gemini",
      response.status,
      await readProviderErrorMessage(response),
      model,
      isRetryableGeminiStatus(response.status),
    );
  }

  const payload = await response.json();
  return {
    ok: true,
    model,
    requestId,
    answer: extractGeminiResponseText(payload),
  };
}

export async function createAssistantAnswer(
  question: string,
  context: AssistantContext,
  options: AssistantProviderOptions = {},
): Promise<AssistantAskResponse> {
  const allowedCitations = getAllowedCitations(context);
  if (!allowedCitations.length) {
    return {
      answer:
        context.localAnswer ||
        "I need repository analysis context before I can answer with verified file citations. Run or refresh the repository analysis, then ask again.",
      citations: [],
      mode: "fallback",
      fallbackReason: "weak_citations",
    };
  }

  const provider = normalizeProvider(
    options.provider ??
      process.env.AI_PROVIDER ??
      (process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY ? "gemini" : "openai"),
  );
  const apiKey =
    options.apiKey ??
    (provider === "gemini" ? process.env.GEMINI_API_KEY : process.env.OPENAI_API_KEY);

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

  const model =
    provider === "gemini"
      ? options.model ?? process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite"
      : options.model ?? process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
  const modelChain = provider === "gemini" ? buildGeminiModelChain({ ...options, model }) : [model];
  const requestKey = buildAssistantRequestKey(question, context, provider, model);
  const existingRequest = inFlightAssistantRequests.get(requestKey);
  if (existingRequest) return existingRequest;

  const request: Promise<AssistantAskResponse> = (async () => {
    try {
      if (provider === "gemini") {
        return await askGemini(question, context, allowedCitations, {
          apiKey,
          model,
          modelChain,
          baseUrl:
            options.baseUrl ??
            process.env.GEMINI_BASE_URL ??
            "https://generativelanguage.googleapis.com/v1beta",
          fetchImpl: options.fetchImpl ?? fetch,
          maxAttempts:
            options.maxAttempts ?? readPositiveInteger(process.env.GEMINI_MAX_ATTEMPTS, 3),
          retryBaseDelayMs: options.retryBaseDelayMs ?? 1000,
          retryJitterMs: options.retryJitterMs ?? 250,
          requestId: options.requestId,
        });
      }

      return await askOpenAI(question, context, allowedCitations, {
      apiKey,
      model,
      baseUrl: options.baseUrl ?? process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
      fetchImpl: options.fetchImpl ?? fetch,
      });
    } catch (error) {
      logProviderFailure(error);
      return {
        answer:
          error instanceof ProviderRequestError && error.provider === "gemini" && error.temporary
            ? "The AI provider is temporarily busy. Please try again in a few moments."
            : context.localAnswer ||
              "Enhanced answers are unavailable right now. Use the cited files below to continue the investigation.",
        citations: allowedCitations.slice(0, 5),
        mode: "fallback" as const,
        fallbackReason: "provider_error" as const,
        providerMetadata:
          error instanceof ProviderRequestError
            ? {
                provider: error.provider,
                model: "none",
                requestId: options.requestId,
                mode: "local-fallback",
              }
            : undefined,
      };
    }
  })();

  inFlightAssistantRequests.set(requestKey, request);
  try {
    return await request;
  } finally {
    inFlightAssistantRequests.delete(requestKey);
  }
}
