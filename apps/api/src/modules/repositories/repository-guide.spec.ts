import { describe, expect, it, jest } from "@jest/globals";

jest.mock("@devlens/database", () => ({
  db: {}
}));

jest.mock("../assistant/assistant.service", () => ({
  createAssistantAnswer: jest.fn()
}));

jest.mock("@devlens/shared", () => ({
  RedisQueue: jest.fn()
}));

const {
  buildGuideEnhanceResponse,
  buildReadingOrder,
  buildRepositoryUnderstanding,
  cleanGuideSummaryText,
  getReadmePurpose,
  inferDomain
} = require("./repositories.controller") as typeof import("./repositories.controller");

function context(overrides: Partial<Parameters<typeof buildRepositoryUnderstanding>[0]> = {}) {
  return {
    repository: {
      owner: "test",
      name: "sample",
      detectedFrameworks: []
    },
    files: [],
    symbols: [],
    primaryLanguage: { language: "TypeScript" },
    ...overrides
  } as Parameters<typeof buildRepositoryUnderstanding>[0];
}

describe("repository guide understanding", () => {
  it("cleans README image markup while preserving useful alt text", () => {
    const purpose = getReadmePurpose([
      {
        path: "README.md",
        content:
          '<img src=".github/assets/banner.svg" alt="Keystone: The superpowered CMS for developers" />\n\n## Getting started'
      }
    ]);

    expect(purpose).toBe("Keystone: The superpowered CMS for developers");
    expect(purpose).not.toContain("<img");
    expect(purpose).not.toContain("src=");
  });

  it("classifies Keystone-style repositories as CMS/framework projects", () => {
    const summary = buildRepositoryUnderstanding(
      context({
        repository: {
          owner: "keystonejs",
          name: "keystone",
          detectedFrameworks: ["React"]
        },
        files: [
          { path: "README.md" },
          { path: "package.json" },
          { path: "packages/core/package.json" },
          { path: "packages/core/src/index.ts" },
          { path: "packages/auth/src/index.ts" },
          { path: "docs/components/docs/docs-navigation.tsx" }
        ],
        symbols: [
          { name: "createAuth" },
          { name: "redirectToAdminUI" }
        ]
      }),
      [
        {
          path: "README.md",
          content:
            '<img src=".github/assets/banner.svg" alt="Keystone: The superpowered CMS for developers" />'
        },
        {
          path: "package.json",
          content: JSON.stringify({
            name: "@keystone-6/core",
            description: "The superpowered CMS for developers",
            dependencies: { react: "^19.0.0" }
          })
        }
      ]
    );

    expect(summary.domain).toBe("CMS and application framework");
    expect(summary.summary).toMatch(/CMS|framework/i);
    expect(summary.summary).not.toMatch(/URL shortening|short URL/i);
    expect(summary.coreFeatures).toContain("Content management");
  });

  it("keeps strong URL shortener repos classified as URL shortening", () => {
    const summary = buildRepositoryUnderstanding(
      context({
        repository: {
          owner: "Anwar-04",
          name: "linkforge-url-shortener",
          detectedFrameworks: ["Express"]
        },
        files: [
          { path: "README.md" },
          { path: "package.json" },
          { path: "services/url.service.js" },
          { path: "controllers/redirect.controller.js" }
        ],
        symbols: [{ name: "createShortUrl" }, { name: "redirectToOriginalUrl" }],
        primaryLanguage: { language: "JavaScript" }
      }),
      [
        {
          path: "README.md",
          content: "# LinkForge\n\nA URL shortener for creating short links and redirecting users."
        },
        {
          path: "package.json",
          content: JSON.stringify({
            name: "linkforge-url-shortener",
            description: "URL shortener"
          })
        }
      ]
    );

    expect(summary.domain).toBe("URL shortening and link management");
    expect(summary.coreFeatures).toContain("Short URL creation and redirect handling");
  });

  it("prioritizes monorepo core package and docs paths in reading order", () => {
    const order = buildReadingOrder(
      context({
        files: [
          { path: "README.md" },
          { path: "package.json" },
          { path: "examples/framework-remix/app/routes/index.tsx" },
          { path: "packages/core/package.json" },
          { path: "packages/core/src/index.ts" },
          { path: "docs/getting-started.md" }
        ]
      })
    ).map((item) => item.file);

    expect(order.slice(0, 5)).toEqual([
      "README.md",
      "package.json",
      "packages/core/package.json",
      "packages/core/src/index.ts",
      "docs/getting-started.md"
    ]);
  });

  it("does not classify generic route or redirect words as URL shortening", () => {
    const domain = inferDomain(
      context({
        repository: {
          owner: "example",
          name: "cms-platform",
          detectedFrameworks: []
        },
        files: [
          { path: "routes/auth.ts" },
          { path: "services/session.ts" },
          { path: "controllers/redirect.controller.ts" }
        ],
        symbols: [{ name: "redirectAfterLogin" }]
      }),
      [
        {
          path: "README.md",
          content: "# CMS Platform\n\nA content management platform for teams."
        }
      ]
    );

    expect(domain).not.toBe("URL shortening and link management");
  });

  it("classifies portfolio repositories from product signals", () => {
    const domain = inferDomain(
      context({
        repository: {
          owner: "Anwar-04",
          name: "Portfolio-project",
          detectedFrameworks: ["React"]
        },
        files: [{ path: "README.md" }, { path: "src/App.jsx" }],
        symbols: []
      }),
      [
        {
          path: "README.md",
          content: "# Portfolio Project\n\nA personal portfolio website for showcasing projects and resume details."
        }
      ]
    );

    expect(domain).toBe("Personal portfolio and showcase content");
  });

  it("uses provider guide summary when citations are valid", () => {
    const understanding = buildRepositoryUnderstanding(
      context({
        repository: {
          owner: "keystonejs",
          name: "keystone",
          detectedFrameworks: ["React"]
        },
        files: [{ path: "README.md" }, { path: "package.json" }]
      }),
      [
        {
          path: "README.md",
          content: "# Keystone\n\nThe superpowered CMS for developers."
        }
      ]
    );

    const provider = buildGuideEnhanceResponse({
      repositoryId: "repo-1",
      understanding,
      answer: {
        answer: "Keystone is a CMS/framework monorepo for building content-backed apps.",
        citations: [
          {
            path: "README.md",
            label: "README.md",
            reason: "Project overview"
          }
        ],
        mode: "provider"
      }
    });

    const weak = buildGuideEnhanceResponse({
      repositoryId: "repo-1",
      understanding,
      answer: {
        answer: "Invented summary with no usable files.",
        citations: [],
        mode: "provider",
        fallbackReason: "weak_citations"
      }
    });

    expect(provider.mode).toBe("provider");
    expect(provider.summary).toMatch(/CMS\/framework monorepo/i);
    expect(provider.domain).toBe(understanding.domain);
    expect(provider.readingOrder).toEqual(understanding.readingOrder);
    expect(weak.mode).toBe("fallback");
    expect(weak.summary).toBe(understanding.summary);
    expect(weak.fallbackReason).toBe("weak_citations");
  });

  it("repairs weak provider guide citations with verified reading order files", () => {
    const understanding = buildRepositoryUnderstanding(
      context({
        repository: {
          owner: "Anwar-04",
          name: "linkforge-url-shortener",
          detectedFrameworks: ["Express"]
        },
        files: [
          { path: "README.md" },
          { path: "package.json" },
          { path: "routes/auth.routes.js" },
          { path: "services/auth.services.js" }
        ],
        symbols: [{ name: "authenticateUser" }]
      }),
      [
        {
          path: "README.md",
          content: "# LinkForge\n\nA URL shortener for creating short links and redirecting users."
        }
      ]
    );

    const response = buildGuideEnhanceResponse({
      repositoryId: "repo-1",
      understanding,
      answer: {
        answer:
          "LinkForge is an Express URL shortener backend for creating, managing, and redirecting short links. It combines authentication, route handlers, service-layer business logic, and database-backed persistence, so a new developer should start with README.md, then package.json, then inspect the route and service files. I could not verify the exact source references returned with this answer, so the citations below are the closest verified repository anchors.",
        citations: [],
        mode: "fallback",
        fallbackReason: "weak_citations"
      }
    });

    expect(response.mode).toBe("provider");
    expect(response.summary).toMatch(/Express URL shortener backend/i);
    expect(response.summary).not.toMatch(/could not verify/i);
    expect(response.citations.map((citation) => citation.path)).toEqual(
      understanding.readingOrder.slice(0, 5).map((item) => item.file)
    );
  });

  it("repairs provider guide summaries that cite invented paths", () => {
    const understanding = buildRepositoryUnderstanding(
      context({
        files: [{ path: "README.md" }, { path: "package.json" }]
      }),
      [
        {
          path: "README.md",
          content: "# Sample\n\nA TypeScript service for managing repository onboarding workflows."
        }
      ]
    );

    const response = buildGuideEnhanceResponse({
      repositoryId: "repo-1",
      understanding,
      answer: {
        answer:
          "Sample is a TypeScript service for repository onboarding workflows. It uses package metadata and README guidance to explain the project purpose, runtime shape, and first files a new developer should inspect before tracing implementation details.",
        citations: [
          { path: "README.routes.js", label: "README.routes.js", reason: "Fake route file" }
        ],
        mode: "provider"
      }
    });

    expect(response.mode).toBe("provider");
    expect(response.citations.map((citation) => citation.path)).toEqual(
      understanding.readingOrder.slice(0, 5).map((item) => item.file)
    );
    expect(response.citations).not.toContainEqual(
      expect.objectContaining({ path: "README.routes.js" })
    );
  });

  it("does not present provider errors as improved guide summaries", () => {
    const understanding = buildRepositoryUnderstanding(
      context({
        files: [{ path: "README.md" }, { path: "package.json" }]
      }),
      [
        {
          path: "README.md",
          content: "# Sample\n\nA TypeScript service for managing repository onboarding workflows."
        }
      ]
    );

    const response = buildGuideEnhanceResponse({
      repositoryId: "repo-1",
      understanding,
      answer: {
        answer: understanding.summary,
        citations: [{ path: "README.md", label: "README.md", reason: "Project overview" }],
        mode: "fallback",
        fallbackReason: "provider_error"
      }
    });

    expect(response.mode).toBe("fallback");
    expect(response.fallbackReason).toBe("provider_error");
    expect(response.summary).toBe(understanding.summary);
  });

  it("rejects weak provider guide summaries that are not usable", () => {
    const understanding = buildRepositoryUnderstanding(
      context({
        files: [{ path: "README.md" }, { path: "package.json" }]
      }),
      [
        {
          path: "README.md",
          content: "# Sample\n\nA small TypeScript project."
        }
      ]
    );

    const response = buildGuideEnhanceResponse({
      repositoryId: "repo-1",
      understanding,
      answer: {
        answer: "Invented summary with no usable files.",
        citations: [{ path: "README.routes.js", label: "README.routes.js", reason: "Fake file" }],
        mode: "fallback",
        fallbackReason: "weak_citations"
      }
    });

    expect(response.mode).toBe("fallback");
    expect(response.summary).toBe(understanding.summary);
    expect(response.citations).toEqual([]);
  });

  it("cleans fallback guide summary text from README markup and emoji-heavy wording", () => {
    const cleaned = cleanGuideSummaryText(
      '<img src=".github/assets/banner.svg" alt="🚀 Ultimate URL Shortener – Full-Stack Powerhouse!" />'
    );

    expect(cleaned).not.toContain("<img");
    expect(cleaned).not.toContain("🚀");
    expect(cleaned).not.toMatch(/ultimate|powerhouse/i);
    expect(cleaned).toContain("URL Shortener");
  });
});
