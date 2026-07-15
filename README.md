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

V1 is not a multi-agent command center, documentation suite, technical dashboard, IDE replacement, code editor, billing/admin product, or autonomous coding agent. Some backend capabilities remain in the repo for later phases, but they are intentionally hidden from the V1 surface.

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

- `AI_PROVIDER`: optional provider selector, either `openai` or `gemini`; defaults to `openai`.
- `OPENAI_API_KEY`: enables enhanced assistant answers through OpenAI.
- `OPENAI_MODEL`: optional model override, defaults to `gpt-4.1-mini`.
- `GEMINI_API_KEY`: enables enhanced assistant answers through Gemini.
- `GEMINI_MODEL`: optional model override, defaults to `gemini-3.1-flash-lite` in the local helper.
- `GEMINI_FALLBACK_MODEL`: optional fallback model, defaults to `gemini-3-flash`.
- `GEMINI_HIGH_QUALITY_MODEL`: optional higher-quality model, defaults to `gemini-3.5-flash`.
- `GEMINI_MODEL_CHAIN`: optional ordered Gemini model list, defaults to `gemini-3.1-flash-lite,gemini-3-flash,gemini-3.5-flash`.
- `GEMINI_MAX_ATTEMPTS`: optional Gemini attempt count per model for temporary provider errors, defaults to `3`.
- `GITHUB_TOKEN`: optional backend-only token for analyzing private GitHub repositories. Public repositories do not require it.
- `REPOSITORY_V1_MAX_ANALYZED_FILES`: optional V1 file cap for large repositories, defaults to `1200`.
- `REPOSITORY_V1_MAX_SYMBOLS`: optional V1 code-detail cap for large repositories, defaults to `3000`.
- `REPOSITORY_V1_MAX_SOURCE_RECORDS`: optional V1 source-preview/search cap, defaults to `2500`.
- `REPOSITORY_V1_MAX_SYMBOLS_PER_FILE`: optional per-file code-detail cap, defaults to `80`.
- `REPOSITORY_DB_WRITE_BATCH_SIZE`: optional worker save batch size, defaults to `500`.
- `REPOSITORY_DB_TRANSACTION_TIMEOUT_MS`: optional worker save timeout, defaults to `60000`.
- `REPOSITORY_DB_TRANSACTION_MAX_WAIT_MS`: optional worker save wait time, defaults to `10000`.

For the local Gemini helper, set the key in your shell before starting the API:

```powershell
$env:GEMINI_API_KEY="<your-gemini-api-key>"
$env:GEMINI_MODEL="gemini-3.1-flash-lite"
$env:GEMINI_FALLBACK_MODEL="gemini-3-flash"
$env:GEMINI_HIGH_QUALITY_MODEL="gemini-3.5-flash"
$env:GEMINI_MODEL_CHAIN="gemini-3.1-flash-lite,gemini-3-flash,gemini-3.5-flash"
.\apps\api\run-live-api.cmd
```

API health:

```bash
curl http://localhost:4000/health
```

If port `4000` is already in use, another API process is running. Reuse it, or stop it before starting a new API process:

```powershell
netstat -ano | findstr :4000
Stop-Process -Id <PID> -Force
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

- Public GitHub repositories work without credentials. Private repositories require a local `GITHUB_TOKEN` for the repository worker.
- Very large repositories use a prioritized V1 analysis that focuses on useful onboarding files first.
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
