# DevLens AI Documentation

This folder is the current DevLens AI documentation and interview study pack. It describes what is implemented now, what is optional, and what remains future scope.

## Start Here

- [Architecture](ARCHITECTURE.md)
- [Architecture Cheat Sheet](ARCHITECTURE_CHEAT_SHEET.md)
- [Codebase Study Guide](CODEBASE_STUDY_GUIDE.md)
- [API Reference](API_REFERENCE.md)
- [Data Model](DATA_MODEL.md)
- [Analysis Pipeline](ANALYSIS_PIPELINE.md)
- [Assistant and Intelligence](ASSISTANT_AND_INTELLIGENCE.md)
- [Frontend Guide](FRONTEND_GUIDE.md)
- [Backend Guide](BACKEND_GUIDE.md)
- [Deployment](DEPLOYMENT.md)
- [Environment Variables](ENVIRONMENT_VARIABLES.md)
- [Testing](TESTING.md)
- [Interview Prep](INTERVIEW_PREP.md)
- [Implementation Status](IMPLEMENTATION_STATUS.md)

## Product Summary

DevLens AI helps developers understand a GitHub repository from one workspace:

- Left column: Repository Status, file controls, file filter, and file tree.
- Center column: repository analysis controls, metadata, Guide, Files, and Search.
- Right column: one DevLens AI assistant with guided investigation, answers, citations, and recap.

The app is intentionally citation-first. Provider-backed answers are optional and must stay grounded in repository files.

## Local Run

```powershell
npm install
docker-compose -f infra/docker/docker-compose.yml up -d postgres redis qdrant minio
.\apps\api\run-live-api.cmd
.\apps\repository-worker\run-live-worker.cmd
$env:NEXT_PUBLIC_API_URL="http://localhost:4000"
npm run start -w @devlens/web
```

Expected endpoints:

- Web: `http://localhost:3000`
- API: `http://localhost:4000`
- API readiness: `http://localhost:4000/health/ready`

Use the demo repository:

```text
https://github.com/Anwar-04/linkforge-url-shortener
```

Required local service environment:

```text
DATABASE_URL=postgresql://devlens:devlens@localhost:55452/devlens
REDIS_URL=redis://localhost:6379
QDRANT_URL=http://localhost:6333
```

If repository analysis stays on "Preparing 0%", the repository worker is usually not running or cannot reach the database. Start Docker services, start the API, then start `apps/repository-worker/run-live-worker.cmd`. The worker now exits before taking jobs if `DATABASE_URL` is missing.

## Active Versus Archived Docs

Active docs in this folder describe the current codebase. Older milestone and roadmap docs are preserved in [archive](archive/) because they include future plans and historical ideas that are not visible V1 behavior.
