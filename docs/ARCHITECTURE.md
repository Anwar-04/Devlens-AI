# Architecture

DevLens AI is a TypeScript monorepo with a Next.js frontend, NestJS API, Redis-backed job queue, repository analysis worker, Prisma/PostgreSQL database, and optional provider-backed assistant answers.

## High-Level System

```text
Browser
  -> apps/web
  -> apps/api
  -> PostgreSQL via Prisma
  -> Redis queue
  -> apps/repository-worker
  -> GitHub clone
  -> source analysis
  -> PostgreSQL knowledge records
  -> optional Qdrant upsert
```

## Main Packages

- `apps/web`: the V1 repository workspace. It renders the fixed three-column UI, runs repository analysis from the browser, polls jobs, opens citations, and calls the assistant endpoint.
- `apps/api`: the HTTP boundary. It validates repository URLs, creates analysis jobs, reads repository intelligence, serves source previews, exposes search, and handles assistant requests.
- `apps/repository-worker`: the analysis worker. It clones repositories, crawls files, detects languages/frameworks, extracts JavaScript/TypeScript symbols, creates source records, and persists results.
- `packages/database`: Prisma schema and generated database client.
- `packages/shared`: shared contracts plus Redis queue, local embedding, and Qdrant helper utilities.
- `apps/ai-service` and `apps/knowledge-worker`: service boundaries present for future growth, not the visible V1 experience.

## Runtime Flow

1. User submits a GitHub URL in the web app.
2. API validates the URL and creates a `Repository` plus `AnalysisJob`.
3. API enqueues a `repo.clone` job in Redis.
4. Repository worker clones the repo into a temporary folder.
5. Worker crawls files, applies caps, extracts metadata, symbols, references, and source records.
6. Worker saves records in PostgreSQL and optionally upserts search points to Qdrant.
7. Web polls the job endpoint and fetches tree, summary, symbols, and source data.
8. Guide, Files, Search, and assistant render from stored repository data.

## Design Principles

- Keep repository evidence first.
- Keep provider credentials optional.
- Keep one visible assistant.
- Keep V1 UI focused on understanding, not editing.
- Hide future infrastructure until it has a product surface.

## Important Boundaries

- The frontend never receives provider API keys.
- The worker should not execute repository code.
- Private repository access is optional and uses backend-only `GITHUB_TOKEN`.
- Source citations come from stored local repository records.
