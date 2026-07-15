import { describe, expect, it, jest } from "@jest/globals";
import {
  buildContextPack,
  buildProviderInstructions,
  checkGeminiProviderHealth,
  createAssistantAnswer,
  extractGeminiResponseText,
  filterProviderCitations,
  getAllowedCitations,
  normalizeGeminiModelPath,
  parseProviderJson,
  type AssistantContext,
} from "./assistant.service";

const baseContext: AssistantContext = {
  repository: {
    owner: "Anwar-04",
    name: "linkforge-url-shortener",
    languages: ["JavaScript"],
    frameworks: ["Express"],
    fileCount: 64,
  },
  guide: {
    summary: "Express URL shortener with authentication and short-link routing.",
    purpose: "URL shortening and link management",
    architecture: "Routes call controllers, controllers call services.",
    readingOrder: [
      {
        path: "README.md",
        label: "README.md",
        reason: "Project overview",
      },
      {
        path: "routes/auth.routes.js",
        label: "routes/auth.routes.js",
        reason: "Authentication route mapping",
        startLine: 1,
        endLine: 92,
      },
    ],
  },
  selectedFile: {
    path: "services/auth.services.js",
    role: "Service",
    previewStartLine: 1,
    previewEndLine: 80,
    preview: "1: export const authenticateUser = async () => {};",
    related: [
      {
        path: "controllers/auth.controller.js",
        label: "controllers/auth.controller.js",
        reason: "Controller calls authentication services",
        startLine: 48,
        endLine: 620,
      },
    ],
  },
  searchResults: [
    {
      path: "middlewares/verify-auth-middleware.js",
      label: "middlewares/verify-auth-middleware.js",
      reason: "Request protection middleware",
      startLine: 1,
      endLine: 38,
    },
  ],
  sourceSnippets: [
    {
      path: "services/auth.services.js",
      startLine: 1,
      endLine: 80,
      content: "export const authenticateUser = async () => {};",
    },
  ],
  localAnswer: "Local file-backed answer.",
};

function mockFetch(payload: unknown, ok = true, status = ok ? 200 : 500) {
  const fetchImpl: typeof fetch = async () => ({
    ok,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  } as Response);
  return fetchImpl;
}

function captureFetch(payload: unknown) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return {
      ok: true,
      status: 200,
      json: async () => payload,
    } as Response;
  };
  return { fetchImpl, calls };
}

function captureFetchSequence(
  responses: Array<{ payload: unknown; ok?: boolean; status?: number; headers?: HeadersInit }>,
) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    const next = responses[Math.min(calls.length - 1, responses.length - 1)];
    return {
      ok: next?.ok ?? true,
      status: next?.status ?? 200,
      headers: new Headers(next?.headers),
      json: async () => next?.payload,
      text: async () => JSON.stringify(next?.payload),
    } as Response;
  };
  return { fetchImpl, calls };
}

const geminiSuccessPayload = {
  candidates: [
    {
      content: {
        parts: [
          {
            text: JSON.stringify({
              answer: "Authentication is mapped in routes and handled by services.",
              citations: [
                {
                  path: "routes/auth.routes.js",
                  reason: "Auth route definitions",
                },
                {
                  path: "services/auth.services.js",
                  reason: "Auth service logic",
                },
              ],
            }),
          },
        ],
      },
    },
  ],
};

const geminiDailyQuotaPayload = {
  error: {
    message:
      "Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 20, model: gemini-test",
  },
};

describe("assistant service", () => {
  it("falls back cleanly when credentials are missing", async () => {
    const answer = await createAssistantAnswer("Explain this repository", baseContext, {
      apiKey: "",
    });

    expect(answer).toMatchObject({
      answer: "Local file-backed answer.",
      mode: "fallback",
      fallbackReason: "missing_credentials",
    });
    expect(answer.citations.map((citation) => citation.path)).toContain("README.md");
  });

  it("does not call the provider without verified citation context", async () => {
    const provider = captureFetch({
      output_text: JSON.stringify({
        answer: "Uncited provider answer.",
        citations: [],
      }),
    });

    const answer = await createAssistantAnswer("Explain this repository", {}, {
      apiKey: "test-key",
      fetchImpl: provider.fetchImpl,
    });

    expect(answer.mode).toBe("fallback");
    expect(answer.fallbackReason).toBe("weak_citations");
    expect(answer.answer).toContain("verified file citations");
    expect(provider.calls).toHaveLength(0);
  });

  it("falls back cleanly when the provider request fails", async () => {
    const answer = await createAssistantAnswer("Explain this repository", baseContext, {
      apiKey: "test-key",
      fetchImpl: mockFetch({ error: "boom" }, false),
    });

    expect(answer).toMatchObject({
      answer: "Local file-backed answer.",
      mode: "fallback",
      fallbackReason: "provider_error",
    });
  });

  it("filters provider citations to known local citations", () => {
    const allowed = getAllowedCitations(baseContext);
    const citations = filterProviderCitations(
      [
        { path: "routes/auth.routes.js", reason: "Routes define auth URLs" },
        { path: "README.routes.js", reason: "Invented file" },
      ],
      allowed,
    );

    expect(citations).toHaveLength(1);
    expect(citations[0]?.path).toBe("routes/auth.routes.js");
    expect(citations[0]?.reason).toBe("Routes define auth URLs");
  });

  it("uses weak-citation fallback when provider returns no valid citations", async () => {
    const answer = await createAssistantAnswer("Where is billing handled?", baseContext, {
      apiKey: "test-key",
      fetchImpl: mockFetch({
        output_text: JSON.stringify({
          answer: "Billing appears to live in billing/routes.js.",
          citations: [{ path: "billing/routes.js", reason: "Invented billing route" }],
        }),
      }),
    });

    expect(answer.mode).toBe("fallback");
    expect(answer.fallbackReason).toBe("weak_citations");
    expect(answer.answer).toContain("Billing appears to live in billing/routes.js.");
    expect(answer.answer).toContain("closest verified repository anchors");
    expect(answer.citations.every((citation) => citation.path !== "billing/routes.js")).toBe(
      true,
    );
  });

  it("unwraps provider JSON when it is nested inside the answer field", () => {
    expect(
      parseProviderJson(
        JSON.stringify({
          answer: JSON.stringify({
            answer: "Plain repository answer.",
            citations: [{ path: "README.md", reason: "Overview" }],
          }),
          citations: [],
        }),
      ),
    ).toMatchObject({
      answer: "Plain repository answer.",
      citations: [{ path: "README.md", reason: "Overview" }],
    });
  });

  it("accepts provider answers with verified citations", async () => {
    const answer = await createAssistantAnswer("Find authentication", baseContext, {
      apiKey: "test-key",
      fetchImpl: mockFetch({
        output_text: JSON.stringify({
          answer:
            "Authentication starts in the route map and continues through controller and service files.",
          citations: [
            {
              path: "routes/auth.routes.js",
              reason: "Auth route definitions",
            },
            {
              path: "services/auth.services.js",
              reason: "Auth service logic",
            },
          ],
        }),
      }),
    });

    expect(answer.mode).toBe("provider");
    expect(answer.citations.map((citation) => citation.path)).toEqual([
      "routes/auth.routes.js",
      "services/auth.services.js",
    ]);
  });

  it("accepts Gemini answers with verified citations", async () => {
    const infoSpy = jest.spyOn(console, "info").mockImplementation(() => undefined);
    const gemini = captureFetch(geminiSuccessPayload);

    const answer = await createAssistantAnswer("Find authentication", baseContext, {
      provider: "gemini",
      apiKey: "test-key",
      model: "gemini-3.5-flash",
      fetchImpl: gemini.fetchImpl,
    });

    expect(answer.mode).toBe("provider");
    expect(answer.citations.map((citation) => citation.path)).toEqual([
      "routes/auth.routes.js",
      "services/auth.services.js",
    ]);
    expect(gemini.calls[0]?.url).toContain("/models/gemini-3.5-flash:generateContent");
    expect(gemini.calls[0]?.url).toContain("key=test-key");
    expect(gemini.calls[0]?.init?.headers).toMatchObject({
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(gemini.calls[0]?.init?.body))).toMatchObject({
      systemInstruction: {
        parts: [{ text: expect.stringContaining("Do not invent file paths") }],
      },
      generationConfig: {
        responseMimeType: "application/json",
      },
    });
    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringContaining("model=gemini-3.5-flash"),
    );
    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringContaining("apiKeyPrefix=test-k******"),
    );
    expect(infoSpy.mock.calls.join("\n")).not.toContain("key=test-key");
    infoSpy.mockRestore();
  });

  it("retries Gemini 503 once and then returns provider answer", async () => {
    const infoSpy = jest.spyOn(console, "info").mockImplementation(() => undefined);
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const gemini = captureFetchSequence([
      {
        ok: false,
        status: 503,
        payload: { error: { message: "This model is currently experiencing high demand." } },
      },
      { ok: true, status: 200, payload: geminiSuccessPayload },
    ]);

    const answer = await createAssistantAnswer("Find authentication", baseContext, {
      provider: "gemini",
      apiKey: "test-key",
      model: "gemini-3.5-flash",
      fetchImpl: gemini.fetchImpl,
      retryBaseDelayMs: 0,
      retryJitterMs: 0,
    });

    expect(answer.mode).toBe("provider");
    expect(gemini.calls).toHaveLength(2);
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining("attempt=1/3"));
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining("attempt=2/3"));
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining("inputChars="));
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining("estimatedTokens="));
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Gemini temporary failure status=503 retryInMs=0"),
    );
    infoSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("returns a temporary busy fallback after repeated Gemini 503 failures", async () => {
    const infoSpy = jest.spyOn(console, "info").mockImplementation(() => undefined);
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const gemini = captureFetchSequence([
      {
        ok: false,
        status: 503,
        payload: { error: { message: "This model is currently experiencing high demand." } },
      },
      {
        ok: false,
        status: 503,
        payload: { error: { message: "This model is currently experiencing high demand." } },
      },
      {
        ok: false,
        status: 503,
        payload: { error: { message: "This model is currently experiencing high demand." } },
      },
    ]);

    const answer = await createAssistantAnswer("Find authentication", baseContext, {
      provider: "gemini",
      apiKey: "test-key",
      model: "gemini-3.5-flash",
      fallbackModel: "gemini-3.1-flash-lite",
      fetchImpl: gemini.fetchImpl,
      retryBaseDelayMs: 0,
      retryJitterMs: 0,
    });

    expect(answer).toMatchObject({
      answer: "The AI provider is temporarily busy. Please try again in a few moments.",
      mode: "fallback",
      fallbackReason: "provider_error",
    });
    expect(gemini.calls).toHaveLength(6);
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining("attempt=3/3"));
    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringContaining("model=gemini-3.1-flash-lite"),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("gemini provider request failed. status=503"),
    );
    infoSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("uses the fallback Gemini model after primary capacity failures", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const gemini = captureFetchSequence([
      {
        ok: false,
        status: 503,
        payload: { error: { message: "This model is currently experiencing high demand." } },
      },
      {
        ok: false,
        status: 503,
        payload: { error: { message: "This model is currently experiencing high demand." } },
      },
      {
        ok: false,
        status: 503,
        payload: { error: { message: "This model is currently experiencing high demand." } },
      },
      { ok: true, status: 200, payload: geminiSuccessPayload },
    ]);

    const answer = await createAssistantAnswer("Find authentication", baseContext, {
      provider: "gemini",
      apiKey: "test-key",
      model: "gemini-3.5-flash",
      fallbackModel: "gemini-3.1-flash-lite",
      fetchImpl: gemini.fetchImpl,
      retryBaseDelayMs: 0,
      retryJitterMs: 0,
      requestId: "chat_test",
    });

    expect(answer.mode).toBe("provider");
    expect(answer.providerMetadata).toMatchObject({
      provider: "gemini",
      model: "gemini-3.1-flash-lite",
      requestId: "chat_test",
      attempts: 1,
      usedFallbackModel: true,
      mode: "provider-fallback",
    });
    expect(gemini.calls).toHaveLength(4);
    expect(gemini.calls[0]?.url).toContain("/models/gemini-3.5-flash:generateContent");
    expect(gemini.calls[3]?.url).toContain("/models/gemini-3.1-flash-lite:generateContent");
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Switching Gemini model requestId=chat_test from=gemini-3.5-flash to=gemini-3.1-flash-lite"),
    );
    warnSpy.mockRestore();
  });

  it("switches models immediately when a Gemini daily quota is exhausted", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const gemini = captureFetchSequence([
      { ok: false, status: 429, payload: geminiDailyQuotaPayload },
      { ok: true, status: 200, payload: geminiSuccessPayload },
    ]);

    const answer = await createAssistantAnswer("Find authentication", baseContext, {
      provider: "gemini",
      apiKey: "test-key",
      model: "gemini-3.5-flash",
      modelChain: ["gemini-3.5-flash", "gemini-3.1-flash-lite"],
      fetchImpl: gemini.fetchImpl,
      retryBaseDelayMs: 0,
      retryJitterMs: 0,
      requestId: "chat_quota",
    });

    expect(answer.mode).toBe("provider");
    expect(answer.providerMetadata).toMatchObject({
      model: "gemini-3.1-flash-lite",
      mode: "provider-fallback",
      usedFallbackModel: true,
    });
    expect(gemini.calls).toHaveLength(2);
    expect(gemini.calls[0]?.url).toContain("/models/gemini-3.5-flash:generateContent");
    expect(gemini.calls[1]?.url).toContain("/models/gemini-3.1-flash-lite:generateContent");
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Gemini quota exhausted requestId=chat_quota model=gemini-3.5-flash"),
    );
    warnSpy.mockRestore();
  });

  it("uses the third Gemini model when the first two exhaust daily quota", async () => {
    const gemini = captureFetchSequence([
      { ok: false, status: 429, payload: geminiDailyQuotaPayload },
      { ok: false, status: 429, payload: geminiDailyQuotaPayload },
      { ok: true, status: 200, payload: geminiSuccessPayload },
    ]);

    const answer = await createAssistantAnswer("Find authentication", baseContext, {
      provider: "gemini",
      apiKey: "test-key",
      modelChain: ["gemini-3.5-flash", "gemini-3-flash", "gemini-3.1-flash-lite"],
      fetchImpl: gemini.fetchImpl,
      retryBaseDelayMs: 0,
      retryJitterMs: 0,
    });

    expect(answer.mode).toBe("provider");
    expect(answer.providerMetadata?.model).toBe("gemini-3.1-flash-lite");
    expect(answer.providerMetadata?.mode).toBe("provider-fallback");
    expect(gemini.calls).toHaveLength(3);
    expect(gemini.calls[0]?.url).toContain("/models/gemini-3.5-flash:generateContent");
    expect(gemini.calls[1]?.url).toContain("/models/gemini-3-flash:generateContent");
    expect(gemini.calls[2]?.url).toContain("/models/gemini-3.1-flash-lite:generateContent");
  });

  it("reports local fallback with no model when every Gemini model is exhausted", async () => {
    const gemini = captureFetchSequence([
      { ok: false, status: 429, payload: geminiDailyQuotaPayload },
      { ok: false, status: 429, payload: geminiDailyQuotaPayload },
      { ok: false, status: 429, payload: geminiDailyQuotaPayload },
    ]);

    const answer = await createAssistantAnswer("Find authentication", baseContext, {
      provider: "gemini",
      apiKey: "test-key",
      modelChain: ["gemini-3.5-flash", "gemini-3-flash", "gemini-3.1-flash-lite"],
      fetchImpl: gemini.fetchImpl,
      retryBaseDelayMs: 0,
      retryJitterMs: 0,
    });

    expect(answer.mode).toBe("fallback");
    expect(answer.fallbackReason).toBe("provider_error");
    expect(answer.providerMetadata).toMatchObject({
      provider: "gemini",
      model: "none",
      mode: "local-fallback",
    });
    expect(gemini.calls).toHaveLength(3);
  });

  it("does not retry non-retryable Gemini 404 model failures", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const gemini = captureFetchSequence([
      {
        ok: false,
        status: 404,
        payload: {
          error: {
            message:
              "This model models/gemini-3.5-flash is no longer available to new users.",
          },
        },
      },
    ]);

    const answer = await createAssistantAnswer("Find authentication", baseContext, {
      provider: "gemini",
      apiKey: "test-key",
      model: "gemini-3.5-flash",
      fetchImpl: gemini.fetchImpl,
      retryBaseDelayMs: 0,
      retryJitterMs: 0,
    });

    expect(answer.mode).toBe("fallback");
    expect(gemini.calls).toHaveLength(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("reason=model_unavailable not_retrying=true"),
    );
    warnSpy.mockRestore();
  });

  it("deduplicates identical in-flight assistant provider requests", async () => {
    let resolveProvider: ((response: Response) => void) | undefined;
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      calls.push({ url: String(input), init });
      return await new Promise<Response>((resolve) => {
        resolveProvider = resolve;
      });
    };

    const first = createAssistantAnswer("Find authentication", baseContext, {
      provider: "gemini",
      apiKey: "test-key",
      model: "gemini-3.5-flash",
      fetchImpl,
      retryBaseDelayMs: 0,
      retryJitterMs: 0,
    });
    const second = createAssistantAnswer("Find authentication", baseContext, {
      provider: "gemini",
      apiKey: "test-key",
      model: "gemini-3.5-flash",
      fetchImpl,
      retryBaseDelayMs: 0,
      retryJitterMs: 0,
    });

    expect(calls).toHaveLength(1);
    resolveProvider?.({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => geminiSuccessPayload,
      text: async () => JSON.stringify(geminiSuccessPayload),
    } as Response);

    const [firstAnswer, secondAnswer] = await Promise.all([first, second]);
    expect(firstAnswer.mode).toBe("provider");
    expect(secondAnswer.mode).toBe("provider");
    expect(calls).toHaveLength(1);
  });

  it("extracts Gemini response text from candidate parts", () => {
    expect(
      extractGeminiResponseText({
        candidates: [
          {
            content: {
              parts: [{ text: "{\"answer\":\"ok\"}" }],
            },
          },
        ],
      }),
    ).toBe("{\"answer\":\"ok\"}");
  });

  it("runs a minimal Gemini health check without repository context", async () => {
    const gemini = captureFetch({
      candidates: [
        {
          content: {
            parts: [{ text: "OK" }],
          },
        },
      ],
    });

    const result = await checkGeminiProviderHealth({
      apiKey: "test-key",
      model: "gemini-3.5-flash",
      fetchImpl: gemini.fetchImpl,
      requestId: "chat_health",
    });

    expect(result).toMatchObject({
      ok: true,
      model: "gemini-3.5-flash",
      requestId: "chat_health",
      answer: "OK",
    });
    expect(gemini.calls[0]?.init?.body).toContain("Reply with only: OK");
    expect(gemini.calls[0]?.init?.body).not.toContain("Repository:");
  });

  it("normalizes Gemini model paths without duplicating models prefix", async () => {
    expect(normalizeGeminiModelPath("gemini-3.5-flash")).toBe("models/gemini-3.5-flash");
    expect(normalizeGeminiModelPath("models/gemini-3.5-flash")).toBe(
      "models/gemini-3.5-flash",
    );

    const gemini = captureFetch({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  answer: "Start with README and package metadata.",
                  citations: [{ path: "README.md", reason: "Overview" }],
                }),
              },
            ],
          },
        },
      ],
    });

    await createAssistantAnswer("Explain this repository", baseContext, {
      provider: "gemini",
      apiKey: "test-key",
      model: "models/gemini-3.5-flash",
      fetchImpl: gemini.fetchImpl,
    });

    expect(gemini.calls[0]?.url).toContain("/models/gemini-3.5-flash:generateContent");
    expect(gemini.calls[0]?.url).not.toContain("/models/models/");
  });

  it("logs retired Gemini model failures without exposing the full key", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const infoSpy = jest.spyOn(console, "info").mockImplementation(() => undefined);
    const answer = await createAssistantAnswer("Explain this repository", baseContext, {
      provider: "gemini",
      apiKey: "test-key",
      model: "gemini-3.5-flash",
      fetchImpl: mockFetch(
        {
          error: {
            message:
              "This model models/gemini-3.5-flash is no longer available to new users.",
          },
        },
        false,
        404,
      ),
    });

    expect(answer.mode).toBe("fallback");
    expect(answer.fallbackReason).toBe("provider_error");
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("reason=model_unavailable not_retrying=true"),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("model=gemini-3.5-flash"),
    );
    expect([...warnSpy.mock.calls, ...infoSpy.mock.calls].join("\n")).not.toContain(
      "key=test-key",
    );
    warnSpy.mockRestore();
    infoSpy.mockRestore();
  });

  it("keeps provider instructions and context pack citation-first", () => {
    expect(buildProviderInstructions()).toContain("Do not invent file paths");
    expect(buildProviderInstructions()).toContain("exact path values");

    const contextPack = buildContextPack(baseContext, getAllowedCitations(baseContext));
    expect(contextPack).toContain("Allowed citations:");
    expect(contextPack).toContain("routes/auth.routes.js:1-92");
    expect(contextPack).toContain("Source snippets:");
  });
});
