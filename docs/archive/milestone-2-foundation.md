# DevLens AI - Milestone 2 Foundation

Milestone 2 turns the blueprint into a runnable monorepo foundation.

## Goals

- Create a React frontend with Next.js.
- Create a NestJS API Gateway.
- Create a FastAPI AI Service.
- Create repository and knowledge worker placeholders.
- Add shared packages for contracts, config, and database schema.
- Add Docker Compose for PostgreSQL, Redis, Qdrant, MinIO, and app services.
- Add health check endpoints.

## Status

Completed.

## Verification

- `npm install` completed and generated `package-lock.json`.
- `npm run typecheck` passed across TypeScript workspaces.
- `npm run build -w @devlens/api` passed.
- `npm run build -w @devlens/web` passed.
- `npm run build -w @devlens/repository-worker` passed.
- `npm run build -w @devlens/knowledge-worker` passed.
- `npm run build -w @devlens/config` passed.
- API Gateway `GET /health` returned `{"service":"devlens-api","status":"ok","version":"0.1.0"}`.
- Repository worker entrypoint returned ready status for `repo.clone`, `repo.parse`, and `repo.extract`.
- Knowledge worker entrypoint returned ready status for `knowledge.summarize`, `knowledge.embed`, and `knowledge.graph`.
- React/Next app responded with HTTP 200 at `http://localhost:3000`.

Python AI service note:

- `python -m py_compile apps\ai-service\app\main.py` passed.
- FastAPI runtime verification is pending because Python dependencies were not installed successfully within the available command timeout.

## Architecture Decisions

- Use `npm` workspaces for the monorepo.
- Keep frontend in `apps/web`.
- Keep backend API in `apps/api`.
- Keep AI orchestration in `apps/ai-service`.
- Keep long-running jobs in separate worker apps.
- Use PostgreSQL as the source of truth and Qdrant as the vector store.
- Keep parser and knowledge extraction isolated from the API Gateway.

## Folder Structure

```text
apps/
  web/
  api/
  ai-service/
  repository-worker/
  knowledge-worker/
packages/
  shared/
  config/
  database/
infra/
  docker/
docs/
```

## APIs Added

- `GET /health` in API Gateway
- `POST /repositories` in API Gateway
- `GET /repositories/:id` in API Gateway
- `GET /repositories/:id/tree` in API Gateway
- `GET /health` in AI Service
- `POST /agents/ask` in AI Service

## Database Changes

Initial Prisma schema includes:

- `User`
- `Workspace`
- `WorkspaceMember`
- `Repository`
- `AnalysisJob`
- `RepositoryFile`
- `Module`
- `Symbol`

## AI Workflow

This milestone only creates AI service boundaries. LangGraph orchestration and retrieval are added in later milestones.

## Implementation Steps

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env` and fill local secrets.
3. Start infrastructure with `npm run docker:up`.
4. Run database migrations from `packages/database`.
5. Start app services with `npm run dev`.

## Best Practices

- Keep shared contracts small and stable.
- Do not let workers depend on frontend code.
- Keep the AI service independently deployable.
- Make every service expose health checks.
- Keep repository parsing out of request/response paths.

## Common Mistakes

- Letting the API service clone repositories synchronously.
- Mixing AI prompts into frontend code.
- Designing database schema only around chat messages.
- Adding Kubernetes manifests before local development is stable.

## Interview Discussion Points

- Why use separate services for API, AI, and workers?
- How do workspaces and repositories map to RBAC?
- Why should repository parsing be asynchronous?
- What belongs in shared packages?
- How would Docker Compose differ from production deployment?
