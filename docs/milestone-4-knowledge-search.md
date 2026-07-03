# DevLens AI - Milestone 4 Knowledge Model + Semantic Search

Milestone 4 starts the repository knowledge layer. The first slice creates durable code chunks during ingestion and exposes a search endpoint over those chunks.

## Implemented

- Added `KnowledgeChunk` to the Prisma schema.
- Linked knowledge chunks to repositories and repository files.
- Added deterministic chunk metadata: path, title, language, line range, content hash, token count, and an embedding placeholder.
- Repository ingestion now builds bounded line-based chunks while the cloned repository still exists on disk.
- Repository ingestion extracts TypeScript/JavaScript functions, classes, interfaces, type aliases, and arrow-function constants into the existing `Symbol` model.
- Symbol chunks are linked to `RepositoryFile`, `Symbol`, and `KnowledgeChunk` where the source range can be identified.
- Knowledge chunks now receive deterministic local embeddings during ingestion.
- Knowledge chunk vectors are stored in Postgres and upserted to Qdrant.
- Ingestion stores repository files and knowledge chunks in the same database transaction.
- Added `GET /repositories/:repositoryId/search?q=...&limit=...`.
- Search ranks candidate chunks with a lexical semantic-lite score across path, title, language, and content.
- Search boosts exact symbol/function-name matches above normal text matches.
- Search queries Qdrant for vector matches and blends semantic hits with lexical and symbol scores.
- Search responses include file citations, line ranges, scores, and focused snippets.
- Search responses include symbol metadata when a result is backed by an extracted symbol.

## API

```http
GET /repositories/:repositoryId/search?q=auth middleware&limit=10
```

Response shape:

```json
{
  "repository": {
    "id": "repo-id",
    "owner": "owner",
    "name": "repo"
  },
  "query": "auth middleware",
  "tokens": ["auth", "middleware"],
  "count": 1,
  "results": [
    {
      "id": "chunk-id",
      "score": 12,
      "title": "src/auth.ts:1-80",
      "path": "src/auth.ts",
      "language": "TypeScript",
      "startLine": 1,
      "endLine": 80,
      "snippet": "matching code excerpt",
      "file": {
        "id": "file-id",
        "path": "src/auth.ts",
        "language": "TypeScript",
        "sizeBytes": 2048,
        "isTest": false
      }
    }
  ]
}
```

## Next Steps

- Replace deterministic local embeddings with model-generated embeddings once provider credentials are configured.
- Tune vector, lexical, and symbol reranking weights against larger repositories.
- Expand symbol extraction with parser-backed AST support for more TypeScript/JavaScript patterns.
- Add module chunks once module detection is introduced.
- Add frontend search UI and citations panel.

## Verification

- `npm run db:generate -w @devlens/database` passed.
- `npm run build -w @devlens/shared` passed.
- `npm run typecheck -w @devlens/api` passed.
- `npm run typecheck -w @devlens/repository-worker` passed.
- `npm run typecheck -w @devlens/web` passed.
- `npm run build -w @devlens/api` passed.
- `npm run build -w @devlens/repository-worker` passed.
- `npm run build -w @devlens/database` passed.
