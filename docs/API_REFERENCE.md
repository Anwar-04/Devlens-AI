# API Reference

Base URL in local development:

```text
http://localhost:4000
```

## Health

### `GET /health`

Returns basic API health.

```json
{
  "service": "devlens-api",
  "status": "ok",
  "version": "0.1.0"
}
```

### `GET /health/ready`

Checks API readiness plus database and Redis connectivity.

## Repositories

### `POST /repositories`

Creates a repository analysis request.

Request:

```json
{
  "url": "https://github.com/owner/repo",
  "workspaceId": "optional-workspace-id"
}
```

Response includes repository and job identifiers.

### `GET /repositories/:id`

Returns repository metadata and analysis status.

### `GET /repositories/:id/overview`

Returns language counts, framework signals, and repository status summary.

### `GET /repositories/:id/tree`

Returns folder and file nodes for the Files panel.

### `GET /repositories/:id/files/source?path=<path>`

Returns source preview lines for a repository file.

### `GET /repositories/:id/docs/summary`

Returns the Repository Guide summary payload used by the frontend.

### `GET /repositories/:id/understanding`

Returns the current repository-understanding object.

### `POST /repositories/:id/guide/enhance`

Attempts to improve the guide summary through the assistant provider path. Falls back to file-backed guide content when enhancement is unavailable.

### `POST /repositories/:id/docs/readme-draft`

Returns a generated README draft from local repository data. This endpoint exists but is not a primary V1 UI surface.

### `POST /repositories/:id/docs/architecture-notes`

Returns generated architecture notes from local repository data. This endpoint exists but is not a primary V1 UI surface.

### `GET /repositories/:id/symbols`

Returns extracted code symbols.

### `GET /repositories/:id/symbols/:symbolId/references`

Returns incoming and outgoing references for one symbol.

### `GET /repositories/:id/symbols/:symbolId/source`

Returns source preview for one symbol when available.

## Search

### `GET /repositories/:repositoryId/search?q=<query>&limit=<n>`

Searches source records using lexical scoring plus optional Qdrant matches.

## Assistant

### `POST /repositories/:repositoryId/assistant/ask`

Asks DevLens AI a repository-grounded question.

Request:

```json
{
  "question": "Explain this repository",
  "requestId": "optional-client-request-id",
  "context": {
    "selectedFile": {
      "path": "app.js"
    }
  }
}
```

Response:

```json
{
  "answer": "Repository-grounded answer",
  "citations": [
    {
      "path": "README.md",
      "label": "README.md",
      "reason": "Understand the product purpose and setup notes.",
      "startLine": 1,
      "endLine": 20
    }
  ],
  "mode": "provider"
}
```

### `POST /repositories/:repositoryId/assistant/provider-health`

Runs a minimal provider health check. Intended for diagnostics.

## Jobs

### `GET /jobs/:id`

Returns analysis job status, current step, progress, and any user-safe error message.
