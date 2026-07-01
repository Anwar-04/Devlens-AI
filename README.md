# DevLens AI

Understand any codebase in minutes, not days.

DevLens AI is an AI-powered codebase intelligence platform that analyzes GitHub repositories, builds a structured knowledge model, and gives developers an interactive workspace for architecture, search, documentation, and repository Q&A.

## Milestone Status

- Milestone 1: Product and architecture blueprint complete.
- Milestone 2: Monorepo foundation in progress.

## Apps

- `apps/web`: Next.js, React, TypeScript, Tailwind UI shell.
- `apps/api`: NestJS API Gateway.
- `apps/ai-service`: FastAPI AI orchestration service.
- `apps/repository-worker`: repository clone and parser worker.
- `apps/knowledge-worker`: embeddings and knowledge enrichment worker.

## Packages

- `packages/shared`: shared TypeScript contracts.
- `packages/config`: shared TypeScript environment helpers.
- `packages/database`: Prisma schema and database package.

## Local Development

Install dependencies:

```bash
npm install
```

Start all Node workspaces:

```bash
npm run dev
```

Start infrastructure:

```bash
npm run docker:up
```

The Python AI service has its own requirements file in `apps/ai-service`.

