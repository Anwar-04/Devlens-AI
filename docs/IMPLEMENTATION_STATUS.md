# Implementation Status

## Implemented and Visible

- GitHub URL submission.
- Repository analysis jobs.
- Progress and user-safe error states.
- File tree and file filtering.
- Repository Guide.
- Files tab with source preview.
- Search tab.
- Selected-file intelligence.
- Guided investigation and walkthrough progress.
- Copy recap.
- DevLens AI assistant.
- Clickable citations.
- Optional Gemini/OpenAI provider answers.
- Provider fallback to repository-backed answers.
- Large-repository analysis caps.

## Implemented Backend Support, Not Primary V1 UI

- README draft endpoint.
- Architecture notes endpoint.
- Qdrant helper and optional search blending.
- FastAPI AI service boundary.
- Knowledge worker boundary.
- Workspace/user schema foundation.

## Partial

- Private repositories through backend-only `GITHUB_TOKEN`.
- Symbol extraction beyond JavaScript/TypeScript.
- Qdrant-backed ranking quality.
- Provider health diagnostics.
- Full production auth and authorization.

## Not Implemented

- Autonomous code editing.
- Pull request creation.
- Billing/admin/team management UI.
- Multiple visible agents.
- Graph dashboard.
- Full documentation suite UI.
- Hosted production deployment manifest.

## Known Limitations

- Older analyses may need re-analysis for improved preview and guide coverage.
- Provider quotas and model availability can affect enhanced answers.
- Very large repositories are sampled through V1 caps.
- Line highlighting depends on stored source ranges.
- The frontend page is large and would benefit from component extraction.
