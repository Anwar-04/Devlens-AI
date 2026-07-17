# Testing

## Core Commands

```bash
npm run test -w @devlens/api -- --runInBand
npm run typecheck -w @devlens/web
npm run build -w @devlens/web
npm run typecheck -w @devlens/api
npm run build -w @devlens/api
npm run typecheck -w @devlens/repository-worker
npm run build -w @devlens/repository-worker
npm run typecheck -w @devlens/shared
npm run build -w @devlens/shared
```

## Existing Test Focus

API tests cover repository guide behavior and assistant/provider behavior.

Areas with useful coverage:

- provider response parsing
- citation filtering
- provider fallback
- Gemini model handling
- guide summary behavior

## Manual Smoke Test

1. Start local services.
2. Open `http://localhost:3000`.
3. Analyze:

```text
https://github.com/Anwar-04/linkforge-url-shortener
```

4. Confirm:

- analysis completes
- Guide renders
- Files renders
- Search renders
- README/source preview lines show
- selected-file intelligence renders
- assistant answers with citations
- citations open Files and highlight lines
- walkthrough, evidence, handoff, and recap still work

## Provider Smoke Test

With Gemini configured:

```powershell
$env:GEMINI_API_KEY="<key>"
$env:GEMINI_MODEL_CHAIN="gemini-3.1-flash-lite,gemini-3-flash,gemini-3.5-flash"
.\apps\api\run-live-api.cmd
```

Ask:

```text
Explain this repository
```

The answer should not expose raw provider errors and should keep repository citations.

## Known Test Gaps

- End-to-end browser automation is limited.
- Repository worker integration tests are limited.
- Private repository analysis requires manual token-based validation.
- Qdrant outage behavior is mostly handled as fallback but should be tested more deeply.
