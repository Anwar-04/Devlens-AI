# Assistant and Intelligence

DevLens AI has one visible assistant in the right panel. It answers practical repository questions using analyzed repository data and file-backed citations.

## Assistant Flow

1. Frontend builds a question and context package.
2. API loads trusted repository context from the database.
3. API merges selected-file context, guide context, search results, and source snippets.
4. Assistant service builds provider instructions and allowed citations.
5. If provider credentials are present, the service asks the configured provider.
6. Provider citations are filtered against known local citations.
7. If provider output is unavailable or weak, DevLens returns a local fallback answer.

## Gemini Behavior

Gemini is optional and environment-based.

Default local model chain:

```text
gemini-3.1-flash-lite,gemini-3-flash,gemini-3.5-flash
```

Retry behavior:

- Retry temporary `502`, `503`, `504`, and short-term retryable `429` errors.
- Switch models on daily free-tier quota exhaustion.
- Do not retry permanent request, auth, permission, or model-not-found errors.
- Never log full API keys or prompts containing source code.

## Local Fallback

Fallback is expected behavior when:

- provider credentials are missing
- provider request fails
- provider output lacks usable citations
- repository evidence is weak

The fallback answer still uses repository files, guide context, search matches, and citations.

## Citation Rules

- Provider responses cannot introduce arbitrary paths.
- Citations must be filtered to known repository files and known line ranges when available.
- The UI opens citations in the Files tab.
- Line highlighting works when `startLine` and `endLine` exist.

## Current Scope

Implemented:

- provider-backed assistant path
- Gemini model chain and fallback
- OpenAI provider path
- request IDs and safe diagnostics
- citation filtering
- local fallback

Not visible V1 scope:

- multiple visible agents
- autonomous repository actions
- code editing
- pull requests
- graph dashboards
