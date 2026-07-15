# DevLens AI Documentation

This folder contains the current V1 freeze notes plus earlier architecture planning. For V1 product decisions, start with [v1-product-refinement.md](v1-product-refinement.md). Older milestone docs are useful background, but they do not override the focused V1 workspace.

## V1 Freeze Summary

DevLens AI V1 is a repository understanding and onboarding workspace for public GitHub repositories. The frozen visible layout is:

- Left: Repository Status, File Tree, and File Filter.
- Center: Guide, Files, and Search.
- Right: one DevLens AI Assistant.

The V1 assistant uses existing repository analysis data and citations. Phase 11 adds an optional provider-backed path inside the same assistant, but missing credentials fall back to file-backed answers.

## Current V1 Capabilities

- Analyze a public GitHub repository and show progress through completion or failure.
- Render the Repository Guide with project summary, stack hints, important files, reading order, and health signals.
- Browse and filter files, preview source, README/docs/config files, and inspect selected-file details.
- Search file names, source lines, and discovered code details.
- Run the guided walkthrough, inspect evidence, continue through recommended files, and produce a completion handoff.
- Copy a shareable onboarding recap.
- Open citations in Files and highlight cited lines when available.

Tested demo repository:

```text
https://github.com/Anwar-04/linkforge-url-shortener
```

## Local Run Notes

Install dependencies from the repository root:

```bash
npm install
```

Start services:

```bash
npm run docker:up
```

If needed on Windows, use:

```bash
docker-compose -f infra/docker/docker-compose.yml up --build
```

Expected local endpoints and services:

- Web: `http://localhost:3000`
- API health: `http://localhost:4000/health`
- PostgreSQL: `localhost:55452`
- Redis: `localhost:6379`
- Qdrant: `http://localhost:6333`
- MinIO: `http://localhost:9000`

Optional provider configuration:

- `AI_PROVIDER`: optional provider selector, either `openai` or `gemini`; defaults to `openai`.
- `OPENAI_API_KEY`: enables enhanced assistant answers through OpenAI.
- `OPENAI_MODEL`: optional model override, defaults to `gpt-4.1-mini`.
- `GEMINI_API_KEY`: enables enhanced assistant answers through Gemini.
- `GEMINI_MODEL`: optional model override, defaults to `gemini-3.5-flash` in the local helper.
- `GEMINI_FALLBACK_MODEL`: optional fallback for temporary provider capacity failures, defaults to `gemini-3.1-flash-lite`.
- `GEMINI_MAX_ATTEMPTS`: optional primary Gemini attempt count, defaults to `3`.
- `GEMINI_FALLBACK_MAX_ATTEMPTS`: optional fallback Gemini attempt count, defaults to `2`.
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
$env:GEMINI_MODEL="gemini-3.5-flash"
$env:GEMINI_FALLBACK_MODEL="gemini-3.1-flash-lite"
.\apps\api\run-live-api.cmd
```

## Phase 10 Validation Checklist

```bash
npm run typecheck -w @devlens/web
npm run build -w @devlens/web
npm run typecheck -w @devlens/api
npm run build -w @devlens/api
npm run typecheck -w @devlens/repository-worker
npm run build -w @devlens/repository-worker
```

Manual V1 smoke test:

- `http://localhost:4000/health` returns ok.
- `http://localhost:3000` loads.
- Fresh analysis of `https://github.com/Anwar-04/linkforge-url-shortener` completes.
- Guide, Files, Search, README preview, selected-file details, guided investigation, walkthrough evidence, completion handoff, Copy recap, and citation open/highlight behavior work.

If port `4000` is already in use, another API process is running. Reuse it, or stop it before starting a new API process:

```powershell
netstat -ano | findstr :4000
Stop-Process -Id <PID> -Force
```
- Fake `README.routes.js` or `README.controller.js` suggestions do not appear.

## Known Limitations

- V1 is scoped to repository understanding, not editing code or opening pull requests.
- The visible assistant is file-backed from current repository data; provider-backed answers are optional and must preserve citations.
- Private repositories require a local `GITHUB_TOKEN` for the repository worker; public repositories do not.
- Very large repositories use a prioritized V1 analysis that focuses on useful onboarding files first.
- Older analyses may need re-analysis for README/docs/config preview coverage.
- Citation highlighting depends on available line ranges.
- Hidden backend surfaces for future generated docs, diagrams, and provider workflows should not be exposed in V1.

## Documentation Map

- [v1-product-refinement.md](v1-product-refinement.md): current V1 product scope, frozen layout, capabilities, limitations, and Phase 11 direction.
- [milestone-1-blueprint.md](milestone-1-blueprint.md): historical PRD and architecture blueprint.
- [milestone-2-foundation.md](milestone-2-foundation.md): monorepo foundation notes.
- [milestone-3-ingestion.md](milestone-3-ingestion.md): repository ingestion MVP notes.
- [milestone-4-knowledge-search.md](milestone-4-knowledge-search.md): historical search and knowledge model notes.
- [data-model-and-api.md](data-model-and-api.md): database and API reference.
- [ai-and-pipeline-design.md](ai-and-pipeline-design.md): earlier provider and workflow planning, kept as future infrastructure context.
- [ux-roadmap-and-delivery.md](ux-roadmap-and-delivery.md): historical UX and delivery roadmap.
