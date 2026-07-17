# Environment Variables

Use `.env.example` as the template. Do not store real secrets in `.env.example`.

## Web

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | yes | `http://localhost:4000` | Browser-visible API base URL. |

## API

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `API_PORT` | no | `4000` | API port. |
| `DATABASE_URL` | yes | local Postgres URL | Prisma database connection. |
| `REDIS_URL` | yes | `redis://localhost:6379` | Redis queue connection. |
| `JWT_SECRET` | future auth | `replace-me` | Placeholder for auth/session work. |

## Repository Worker

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `GITHUB_TOKEN` | no | empty | Backend-only token for private GitHub repositories. |
| `REPOSITORY_V1_MAX_ANALYZED_FILES` | no | `1200` | File cap for V1 analysis. |
| `REPOSITORY_V1_MAX_SYMBOLS` | no | `3000` | Symbol cap. |
| `REPOSITORY_V1_MAX_SOURCE_RECORDS` | no | `2500` | Source-record cap. |
| `REPOSITORY_V1_MAX_SYMBOLS_PER_FILE` | no | `80` | Per-file symbol cap. |
| `REPOSITORY_DB_WRITE_BATCH_SIZE` | no | `500` | Database write batch size. |
| `REPOSITORY_DB_TRANSACTION_TIMEOUT_MS` | no | `60000` | Transaction timeout. |
| `REPOSITORY_DB_TRANSACTION_MAX_WAIT_MS` | no | `10000` | Transaction wait limit. |

## Provider Settings

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `AI_PROVIDER` | no | `openai` | Provider selector. |
| `OPENAI_API_KEY` | no | empty | Enables OpenAI-enhanced answers. |
| `OPENAI_BASE_URL` | no | `https://api.openai.com/v1` | OpenAI-compatible base URL. |
| `OPENAI_MODEL` | no | `gpt-4.1-mini` | OpenAI model. |
| `GEMINI_API_KEY` | no | empty | Enables Gemini-enhanced answers. |
| `GEMINI_BASE_URL` | no | Google v1beta URL | Gemini REST base URL. |
| `GEMINI_MODEL` | no | `gemini-3.1-flash-lite` | Primary Gemini model. |
| `GEMINI_FALLBACK_MODEL` | no | `gemini-3-flash` | Fallback Gemini model. |
| `GEMINI_HIGH_QUALITY_MODEL` | no | `gemini-3.5-flash` | Higher-quality fallback. |
| `GEMINI_MODEL_CHAIN` | no | local chain | Ordered Gemini model chain. |
| `GEMINI_MAX_ATTEMPTS` | no | `3` | Attempts per model for temporary failures. |

## Search and Storage

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `QDRANT_URL` | no | `http://localhost:6333` | Optional search-vector service. |
| `S3_ENDPOINT` | future | `http://localhost:9000` | MinIO/S3 endpoint. |
| `S3_ACCESS_KEY` | future | `devlens` | Local storage key. |
| `S3_SECRET_KEY` | future | `devlens-secret` | Local storage secret. |
| `S3_BUCKET` | future | `devlens-artifacts` | Artifact bucket. |
