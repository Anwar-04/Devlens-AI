# DevLens AI

DevLens AI is a repository-understanding workspace for learning unfamiliar GitHub codebases. Paste a repository URL, run analysis, then use the Guide, Files, Search, and DevLens AI assistant to inspect the project with file-backed evidence.

The current product is a V1 repository onboarding experience. It is not an IDE replacement, code editor, pull-request bot, billing/admin product, or visible multi-agent system.

## What DevLens Does

- Clones and analyzes a GitHub repository.
- Builds a file tree, source previews, language/framework signals, code details, and searchable source records.
- Shows a Repository Guide with purpose, architecture signals, reading order, features, modules, and onboarding estimate.
- Provides a Files workspace for source preview, selected-file intelligence, related paths, and line-aware citations.
- Provides Search for file, symbol, and source lookup.
- Provides one DevLens AI assistant that answers from repository context, with optional Gemini/OpenAI enhancement and local fallback.
- Opens citations in the Files tab and highlights source lines when line ranges are available.

## Current Status

Implemented and visible in V1:

- Repository analysis for GitHub URLs.
- Guide, Files, Search, and right-panel assistant workspace.
- Guided investigation, walkthrough progress, evidence, handoff, and recap.
- File-backed answers and citations.
- Optional Gemini/OpenAI provider path with fallback.
- Large-repository V1 caps and prioritized analysis.

Implemented or scaffolded but not a visible V1 product surface:

- Qdrant-backed search blending with lexical results.
- FastAPI AI service boundary.
- Knowledge worker boundary.
- README draft and architecture-notes endpoints.

Not implemented as visible V1 features:

- Autonomous code editing.
- Pull request creation.
- Billing, admin, teams, or organization management.
- Graph dashboards.
- Multiple visible agents.

## Repository Layout

```text
apps/web                 Next.js frontend workspace
apps/api                 NestJS API
apps/repository-worker   GitHub clone and repository analysis worker
apps/knowledge-worker    Background knowledge-worker boundary
apps/ai-service          FastAPI AI-service boundary
packages/database        Prisma schema and database client
packages/shared          Shared contracts, queue, search helpers
packages/config          Shared config helpers
infra/docker             Local service composition
docs                     Current documentation and study pack
docs/archive             Historical planning docs
```

## Local Development

Install dependencies:

```bash
npm install
```

Start local infrastructure and app services:

```bash
npm run docker:up
```

On Windows, if `docker compose` is unavailable, run:

```bash
docker-compose -f infra/docker/docker-compose.yml up --build
```

Local endpoints:

- Web: `http://localhost:3000`
- API: `http://localhost:4000`
- API health: `http://localhost:4000/health`
- API readiness: `http://localhost:4000/health/ready`
- PostgreSQL: `localhost:55452`
- Redis: `localhost:6379`
- Qdrant: `http://localhost:6333`
- MinIO: `http://localhost:9000`

## Optional Gemini Setup

Provider credentials are optional. Without them, the assistant uses repository context and file-backed fallback.

```powershell
$env:GEMINI_API_KEY="<your-gemini-api-key>"
$env:GEMINI_MODEL="gemini-3.1-flash-lite"
$env:GEMINI_FALLBACK_MODEL="gemini-3-flash"
$env:GEMINI_HIGH_QUALITY_MODEL="gemini-3.5-flash"
$env:GEMINI_MODEL_CHAIN="gemini-3.1-flash-lite,gemini-3-flash,gemini-3.5-flash"
.\apps\api\run-live-api.cmd
```

Do not commit API keys. Keep real keys in your shell, user environment, local `.env`, or deployment secret store.

## Validation

```bash
npm run test -w @devlens/api -- --runInBand
npm run typecheck -w @devlens/web
npm run build -w @devlens/web
npm run typecheck -w @devlens/api
npm run build -w @devlens/api
npm run typecheck -w @devlens/repository-worker
npm run build -w @devlens/repository-worker
npm run typecheck -w @devlens/shared
npm run build -w @devlens/shared
```

Manual smoke repo:

```text
https://github.com/Anwar-04/linkforge-url-shortener
```

## Troubleshooting

If API port `4000` is already in use:

```powershell
netstat -ano | findstr :4000
Stop-Process -Id <PID> -Force
```

If the web UI shows stale chunk or CSS errors, stop the web server, remove `apps/web/.next`, rebuild, and restart.

Older repository analyses may need re-analysis for README/docs/config previews and improved guide summaries.

## Documentation

Start with [docs/README.md](docs/README.md).
