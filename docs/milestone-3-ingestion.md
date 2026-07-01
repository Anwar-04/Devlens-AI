# DevLens AI - Milestone 3 Repository Ingestion MVP

Milestone 3 introduces the first real repository analysis flow: submit a GitHub URL, create an analysis job, enqueue repository cloning, scan files, persist metadata, and show progress in the frontend.

## Status

In progress. Core code is implemented and builds pass. Full end-to-end testing requires PostgreSQL and Redis to be running.

## Implemented

- Repository URL input in the React/Next frontend.
- Frontend calls `POST /repositories` and polls `GET /jobs/:id`.
- Frontend displays job status, progress, repository metadata, languages, frameworks, file count, and a file preview.
- API validates GitHub repository URLs.
- API creates a default local workspace for development.
- API creates repository and analysis job records.
- API enqueues `repo.clone` jobs through Redis.
- API exposes `GET /repositories/:id`, `GET /repositories/:id/overview`, and `GET /repositories/:id/tree`.
- Job API returns repository analysis metadata with job status.
- Repository worker consumes clone jobs, clones with `git clone --depth 1 --single-branch`, scans files, detects languages/frameworks, and stores file metadata.
- Worker ignores large/generated dependency folders such as `.git`, `node_modules`, `.next`, `dist`, `build`, and `__pycache__`.
- Worker uses `execFileSync` instead of shell-string clone commands.
- Prisma schema now stores detected languages, frameworks, file count, and total repository size.
- Shared Redis queue now lazily connects and supports queue size checks.


## Product Improvements Added

### Better File Explorer

- Replaced the flat file preview with an expandable folder tree.
- Added folder/file icons, nested paths, file counts per folder, language labels, and file sizes.
- Added file search and language filtering.
- Added a selected-file metadata panel for path, language, and size.

### Better Analysis Progress

- Expanded worker states from broad steps to a clearer lifecycle: queued, cloning, indexing files, detecting stack, saving metadata, completed, and failed.
- Added a frontend progress bar, elapsed time, active step spinner, completed step indicators, and failed step state.
- Disabled duplicate analyze clicks while a job is running.
## Verification

- `npm run db:generate -w @devlens/database` passed.
- `npm run typecheck` passed.
- `npm run build -w @devlens/web` passed.
- `npm run build -w @devlens/api` passed.
- `npm run build -w @devlens/repository-worker` passed.
- `npm run build -w @devlens/database` passed.
- API `GET /health` returned OK.

## End-To-End Test Prerequisites

Start infrastructure before testing actual ingestion:

```powershell
npm run docker:up
```

Then run database migration:

```powershell
$env:DATABASE_URL="postgresql://devlens:devlens@localhost:5432/devlens"
npm run db:migrate -w @devlens/database
```

Start services:

```powershell
npm run dev -w @devlens/web
npm run start -w @devlens/api
npm run dev -w @devlens/repository-worker
```

Then submit a public GitHub URL from `http://localhost:3000`.

## Remaining Work In This Milestone

- Run full end-to-end ingestion with PostgreSQL and Redis active.
- Add graceful API response for missing database connection.
- Add repository list/history in the frontend.
- Add a proper expandable folder tree instead of the current file preview.
- Add migrations committed under `packages/database/prisma/migrations`.

## Common Mistakes To Avoid

- Do not run repository code after cloning.
- Do not scan dependency directories.
- Do not clone repositories inside HTTP request handlers.
- Do not store full source file contents in PostgreSQL during this milestone.
- Do not continue to Milestone 4 until an actual public repo can be ingested end to end.