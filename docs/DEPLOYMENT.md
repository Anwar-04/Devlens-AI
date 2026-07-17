# Deployment

DevLens AI is currently optimized for local development and demo usage.

## Local Docker Services

`infra/docker/docker-compose.yml` defines:

- PostgreSQL
- Redis
- Qdrant
- MinIO
- API
- web
- repository worker
- AI service boundary
- knowledge worker boundary

Start:

```bash
npm run docker:up
```

Alternative:

```bash
docker-compose -f infra/docker/docker-compose.yml up --build
```

Stop:

```bash
npm run docker:down
```

## Required Runtime Services

- PostgreSQL for canonical data.
- Redis for job queue.
- Git available to the repository worker.
- Node.js 22+ and npm 10+.

Optional:

- Qdrant for blended search results.
- MinIO for future artifact storage.
- Gemini or OpenAI provider credentials for enhanced answers.

## Production Considerations

Before production deployment:

- Move secrets to a managed secret store.
- Run database migrations instead of relying only on local schema push.
- Add authentication and authorization around repository workspaces.
- Decide private-repository token storage and rotation policy.
- Add rate limits and request size limits.
- Add monitoring for worker failures and provider failures.

## Current Deployment Limitation

This repo does not yet include a production deployment manifest for a hosted environment. Docker Compose is the current reference runtime.
