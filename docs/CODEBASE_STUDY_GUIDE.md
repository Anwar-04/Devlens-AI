# Codebase Study Guide

Use this guide when preparing to explain DevLens AI in an interview or when onboarding to the codebase.

## Recommended Reading Order

1. `README.md`
2. `docs/ARCHITECTURE.md`
3. `apps/web/app/page.tsx`
4. `apps/api/src/modules/repositories/repositories.controller.ts`
5. `apps/repository-worker/src/index.ts`
6. `apps/api/src/modules/assistant/assistant.service.ts`
7. `packages/database/prisma/schema.prisma`
8. `packages/shared/src/queue.ts`

## What To Understand First

- The product is a repository-understanding workspace.
- Repository analysis is asynchronous.
- PostgreSQL stores canonical repository metadata and source records.
- Redis connects API job creation to the repository worker.
- The assistant is grounded in citations and has provider fallback behavior.
- The frontend is currently concentrated in one large page component.

## Core User Journey

1. Paste a GitHub repository URL.
2. API creates repository and analysis job.
3. Worker analyzes source files.
4. Web shows progress.
5. User opens Guide, Files, or Search.
6. User asks DevLens AI a question.
7. Assistant answers with verified repository citations.

## Files Worth Studying

- `apps/web/app/page.tsx`: V1 UI state, tabs, file tree, source preview, assistant, citation handling.
- `apps/web/app/devlens-icons.tsx`: centralized icon mapping.
- `apps/api/src/modules/repositories/repositories.controller.ts`: repository creation, summaries, guide, source, symbols, docs helpers.
- `apps/api/src/modules/repositories/repository-search.controller.ts`: search scoring and Qdrant/lexical blending.
- `apps/api/src/modules/assistant/assistant.service.ts`: provider prompts, citation filtering, Gemini retry/model chain, local fallback.
- `apps/repository-worker/src/index.ts`: clone, file crawl, symbol extraction, source records, DB save, error classification.
- `packages/database/prisma/schema.prisma`: current data model.
- `packages/shared/src/queue.ts`: Redis queue abstraction.

## Architectural Tradeoffs

- The frontend is large but fast to iterate for V1.
- The worker uses TypeScript compiler APIs for JavaScript/TypeScript symbol extraction.
- Search combines local scoring with optional Qdrant results.
- Provider answers are treated as enhancement, not the source of truth.
- Large repositories are capped and prioritized to keep V1 usable.

## Common Pitfalls

- Do not treat archived milestone docs as current implementation.
- Do not claim hidden services are active user-facing features.
- Do not hardcode API keys.
- Do not expose raw provider errors or secrets.
- Do not remove citation filtering when improving answer quality.
