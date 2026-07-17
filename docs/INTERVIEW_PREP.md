# Interview Prep

## One-Minute Pitch

DevLens AI is a repository-understanding workspace. It analyzes a GitHub repository, builds a file-backed guide, lets developers browse files and source lines, and answers onboarding questions with citations. The assistant can use Gemini or OpenAI when configured, but it always falls back to repository data.

## Architecture Answer

The app has a Next.js frontend, NestJS API, Redis queue, repository worker, Prisma/PostgreSQL database, and optional Qdrant search support. The API creates jobs and serves repository intelligence. The worker does clone and analysis. The frontend renders a fixed three-column workspace with Guide, Files, Search, and one assistant.

## Why Async Analysis?

Repository cloning and source analysis can take seconds or minutes. The API should return quickly with a job ID, while the worker handles the long-running work and updates progress.

## Why File-Backed Citations?

Repository answers need trust. DevLens filters provider output to known local files and line ranges, so a user can click from an answer to source evidence.

## How Provider Fallback Works

If provider credentials are absent or provider calls fail, DevLens returns a local repository-grounded answer. Gemini can also switch models when a configured model hits daily free-tier quota.

## How Large Repositories Are Handled

The worker prioritizes high-signal files and applies V1 caps. This makes large repositories usable without pretending every file was deeply analyzed.

## Security Talking Points

- Provider keys stay server-side.
- GitHub token is optional and backend-only.
- Repository code is read, not executed.
- Logs should not contain full prompts, full API keys, or private source code.
- User-facing errors are sanitized.

## Tradeoffs To Mention

- One large frontend page helped V1 iteration but should be split later.
- TypeScript compiler APIs give useful JS/TS symbol extraction, but other languages currently have lighter analysis.
- Qdrant is optional; lexical search still works when Qdrant is unavailable.
- Hidden service boundaries exist, but V1 intentionally keeps the product focused.

## Questions To Practice

- How does a repository URL become a completed analysis?
- What happens if the provider is unavailable?
- How do citations avoid invented file paths?
- What are the database tables behind Files and Search?
- How would you add support for another language parser?
- How would you make private repository support production-ready?
- How would you split the frontend page safely?
