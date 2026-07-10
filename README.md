# DevLens AI

Understand any codebase in minutes, not days.

DevLens AI is an AI-powered repository understanding and onboarding workspace. A developer pastes a GitHub repository URL, DevLens analyzes the codebase, explains what the project does, highlights important files, supports code search, and answers repository-aware questions with file-backed citations.

V1 is deliberately focused. DevLens AI is not a multi-agent command center, documentation suite, graph dashboard, IDE replacement, or autonomous coding agent. Backend capabilities may support future versions, but the visible V1 product stays centered on repository understanding.

## Milestone Status

- Milestone 1: Product and architecture blueprint complete.
- Milestone 2: Monorepo foundation complete.
- Milestone 3: Repository ingestion MVP complete.
- Current V1 direction: focused repository understanding workspace with Guide, Files, Search, and one DevLens AI assistant.

## Apps

- `apps/web`: Next.js, React, TypeScript, Tailwind UI shell.
- `apps/api`: NestJS API Gateway.
- `apps/ai-service`: FastAPI AI orchestration service.
- `apps/repository-worker`: repository clone and parser worker.
- `apps/knowledge-worker`: embeddings and knowledge enrichment worker.

## Packages

- `packages/shared`: shared TypeScript contracts and Redis queue helper.
- `packages/config`: shared TypeScript environment helpers.
- `packages/database`: Prisma schema and database package.

## Local Development

Install dependencies:

```bash
npm install
```

Start infrastructure and app services with Docker:

```bash
npm run docker:up
```

Run checks:

```bash
npm run typecheck
npm run build -w @devlens/web
npm run build -w @devlens/api
npm run build -w @devlens/repository-worker
```

The Python AI service has its own requirements file in `apps/ai-service`.
