# DevLens AI

Understand an unfamiliar GitHub repository from one focused workspace.

DevLens AI V1 is a repository understanding and onboarding tool. Paste a public GitHub repository URL, run analysis, then use the Guide, Files, Search, and the DevLens AI assistant to inspect the project with file-backed citations.

V1 is the stable repository-understanding checkpoint. Phase 11 adds an optional provider-backed answer path inside the same DevLens AI assistant; the app still runs without provider credentials and falls back to file-backed answers.

## V1 Capabilities

- Analyze a public GitHub repository and show progress.
- Render a Repository Guide with project purpose, structure, key files, stack hints, and a suggested reading order.
- Browse the file tree, filter files, preview source and README/docs/config files, and inspect selected-file details.
- Search file names, source lines, and discovered code details.
- Use the right-panel DevLens AI assistant for guided onboarding, walkthrough evidence, completion handoff, shareable recap, and clickable citations.
- Open citations in the Files tab with line highlighting when line numbers are available.

V1 is not a multi-agent command center, documentation suite, graph dashboard, IDE replacement, code editor, billing/admin product, or autonomous coding agent. Some backend capabilities remain in the repo for later phases, but they are intentionally hidden from the V1 surface.

## Local Development

Install dependencies:

```bash
npm install
```

Start local infrastructure and app services:

```bash
npm run docker:up
```

If your Docker setup does not support `docker compose`, run the compose file directly:

```bash
docker-compose -f infra/docker/docker-compose.yml up --build
```

Required local services:

- Web: `http://localhost:3000`
- API: `http://localhost:4000`
- PostgreSQL: `localhost:55452`
- Redis: `localhost:6379`
- Qdrant: `http://localhost:6333`
- MinIO: `http://localhost:9000`

Optional provider configuration:

- `OPENAI_API_KEY`: enables enhanced assistant answers from the API service.
- `OPENAI_MODEL`: optional model override, defaults to `gpt-4.1-mini`.

API health:

```bash
curl http://localhost:4000/health
```

## Validation

Run the Phase 10 checks:

```bash
npm run typecheck -w @devlens/web
npm run build -w @devlens/web
npm run typecheck -w @devlens/api
npm run build -w @devlens/api
npm run typecheck -w @devlens/repository-worker
npm run build -w @devlens/repository-worker
```

Tested demo repository for the V1 freeze:

```text
https://github.com/Anwar-04/linkforge-url-shortener
```

For older repository analyses, run analysis again if README, docs, or config previews are missing. The current preview coverage is produced during fresh analysis.

## Known Limitations

- Only public GitHub repository analysis is supported in the V1 demo flow.
- Answers are grounded in locally analyzed repository data; provider-backed explanation quality is optional and falls back cleanly when credentials are missing or a provider request fails.
- README/docs/config source previews may require fresh analysis for repositories analyzed before the preview coverage fix.
- Citation line highlighting depends on stored line ranges.
- The visible V1 product intentionally hides broader future surfaces such as generated docs, diagrams, admin, billing, and autonomous coding workflows.

## Workspace Layout

- `apps/web`: Next.js, React, TypeScript, Tailwind V1 workspace.
- `apps/api`: NestJS API Gateway.
- `apps/repository-worker`: repository clone and analysis worker.
- `apps/ai-service`: FastAPI service boundary kept for future provider-backed work.
- `apps/knowledge-worker`: background enrichment boundary kept for future phases.
- `packages/shared`: shared TypeScript contracts and Redis helper.
- `packages/config`: shared TypeScript environment helpers.
- `packages/database`: Prisma schema and database package.
