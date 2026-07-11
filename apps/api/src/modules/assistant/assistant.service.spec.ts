import { describe, expect, it } from "@jest/globals";
import {
  buildContextPack,
  buildProviderInstructions,
  createAssistantAnswer,
  filterProviderCitations,
  getAllowedCitations,
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

function mockFetch(payload: unknown, ok = true) {
  const fetchImpl: typeof fetch = async () => ({
    ok,
    status: ok ? 200 : 500,
    json: async () => payload,
  } as Response);
  return fetchImpl;
}

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
    expect(answer.answer).toBe("Local file-backed answer.");
    expect(answer.citations.every((citation) => citation.path !== "billing/routes.js")).toBe(
      true,
    );
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

  it("keeps provider instructions and context pack citation-first", () => {
    expect(buildProviderInstructions()).toContain("Do not invent file paths");
    expect(buildProviderInstructions()).toContain("Citations must use only paths");

    const contextPack = buildContextPack(baseContext, getAllowedCitations(baseContext));
    expect(contextPack).toContain("Allowed citations:");
    expect(contextPack).toContain("routes/auth.routes.js:1-92");
    expect(contextPack).toContain("Source snippets:");
  });
});
