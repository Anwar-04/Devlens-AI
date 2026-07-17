# Analysis Pipeline

Repository analysis is handled by `apps/repository-worker/src/index.ts`.

## Pipeline Steps

1. API creates a repository row and analysis job.
2. API enqueues a `repo.clone` payload in Redis.
3. Worker receives the job.
4. Worker removes any previous temporary clone folder for that repository.
5. Worker clones the GitHub repository with shallow clone settings.
6. Worker crawls the directory tree.
7. Worker filters ignored folders and low-value files.
8. Worker applies V1 caps for large repositories.
9. Worker detects languages and frameworks.
10. Worker extracts JavaScript/TypeScript symbols.
11. Worker builds symbol references.
12. Worker builds source records from files and symbols.
13. Worker deduplicates source records.
14. Worker saves files, symbols, references, and source records in PostgreSQL.
15. Worker optionally upserts search points to Qdrant.
16. Worker marks the job completed or failed.

## Large Repository Behavior

Large repositories are prioritized instead of fully analyzed. Defaults:

- `REPOSITORY_V1_MAX_ANALYZED_FILES=1200`
- `REPOSITORY_V1_MAX_SYMBOLS=3000`
- `REPOSITORY_V1_MAX_SOURCE_RECORDS=2500`
- `REPOSITORY_V1_MAX_SYMBOLS_PER_FILE=80`

High-signal files such as README, package manifests, source entry points, routes, controllers, services, configs, and docs are favored.

## Error Handling

The worker classifies common clone and save failures:

- invalid repository URL
- private or missing repository
- GitHub access required
- network failure
- large repository save timeout

User-facing messages are sanitized. Tokens and internal paths should not be exposed to the UI.

## Private Repository Support

Public repositories do not require credentials. Private repositories can use backend-only `GITHUB_TOKEN`. The token must never be sent to the browser or stored in the database.
