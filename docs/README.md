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

```bash
npm install
npm run docker:up
```

Expected endpoints:

- Web: `http://localhost:3000`
- API: `http://localhost:4000`
- API readiness: `http://localhost:4000/health/ready`

Use the demo repository:

```text
https://github.com/Anwar-04/linkforge-url-shortener
```

## Active Versus Archived Docs

Active docs in this folder describe the current codebase. Older milestone and roadmap docs are preserved in [archive](archive/) because they include future plans and historical ideas that are not visible V1 behavior.
