# DevLens AI V1 Product Refinement

DevLens AI V1 is a focused repository understanding and onboarding workspace. A developer pastes a GitHub repository URL, DevLens analyzes the repo, explains what the project does, shows important files, supports search, and provides one DevLens AI assistant for file-backed questions.

Phase 10 froze the file-backed V1 workspace. Phase 11 adds optional provider-backed answers inside the existing assistant while keeping repository data and citations as the grounding layer.

The product should solve one problem exceptionally well: help developers understand unfamiliar GitHub repositories in minutes instead of days.

DevLens AI V1 is not a large AI editor, multi-agent platform, documentation suite, technical dashboard, admin product, or autonomous coding agent. Those directions are explicitly out of scope for the visible V1 product.

## Product Vision

DevLens AI is not a documentation factory, admin dashboard, or visible collection of internal AI services. It is a repo understanding workspace for developers.

The primary promise:

> Paste a repo URL. Understand the project. Explore the code. Ask questions with file-backed answers.

Every V1 feature should support that promise directly.

## Core User Journey

1. The developer pastes a GitHub repository URL.
2. DevLens clones and analyzes the repository.
3. The developer sees analysis progress and completion state.
4. DevLens shows a Repo Brief with the most useful repository facts.
5. The developer explores the file tree and source previews.
6. The developer searches files, source lines, and discovered code details.
7. The developer asks DevLens AI questions about the codebase.
8. DevLens AI answers with citations that open the relevant files or symbols.

## Product Principles

- Simplicity over feature count.
- Hide implementation complexity.
- Expose user capabilities, not internal AI systems.
- Every screen should answer one developer question.
- Reduce clicks and cognitive load.
- Keep the experience closer to Cursor, GitHub, VS Code, and Linear than to an admin console.
- Prefer file-backed intelligence before adding provider-backed answers.
- Treat implementation details as internal capabilities unless they directly improve the user experience.

## V1 Surfaces To Keep

### Analyze Repo Flow

Keep the repository URL input, Analyze action, pipeline progress, and clear completed or failed states. This is the entry point for the product and should stay prominent.

### Repo Brief

Repo Brief replaces the visible Docs concept in V1. It should summarize:

- Repository overview.
- Languages and frameworks.
- Main folders.
- Important files.
- Repository size.
- File count and symbol count.
- Testing signals.
- Main exported symbols.
- Lightweight architecture summary.
- Repository health signals.
- Estimated onboarding time.
- Suggested starting point for a new developer.

### Repository Explorer

Repository Explorer should be the main navigation experience. Keep:

- Full file tree.
- File search and filters.
- Source preview.
- Breadcrumbs or path context.
- Copy path and snippet actions.
- Jump-to-file behavior from search results and agent citations.

### Global Search

Search should be a primary workflow. It should support file, source, and code-detail search without requiring the user to understand how search is implemented.

Search results should include:

- File path.
- Code context when available.
- Line numbers when available.
- Preview text.
- Open source action.

### DevLens AI Assistant Panel

V1 should expose one assistant: DevLens AI. The user should not choose between internal agents.

The assistant should automatically use repository metadata, Repo Brief data, symbols, search results, selected-file context, and source files. Every useful answer should include clickable citations.

Example questions:

- "Explain this repository."
- "Where should I start?"
- "Where does routing happen?"
- "Find the business logic."
- "Show the request flow."
- "What are the most important files?"
- "Explain this function."

## Features To Hide From Primary UI

These can remain in the codebase or backend, but should not be primary V1 surfaces:

- README generator.
- Architecture notes generator.
- Documentation workflow console.
- Agent cards.
- Separate relationship map page.
- Separate docs page.
- Separate dependency map page.
- Intelligence rail.
- Security button if it is not functional.
- Technical pipeline labels.
- Architecture Agent, Documentation Agent, Repository Intelligence Agent, or other internal AI service names.

## Backend Capabilities To Keep

Keep the backend capabilities that support repository understanding:

- Repository analysis.
- Analysis jobs.
- Repository metadata.
- File tree.
- File source preview.
- Search.
- Symbols and references.
- Repository summary.
- Hidden docs generation endpoints for later reuse.

Do not delete working backend functionality just because it is hidden from V1. Prefer hiding UI surfaces first, then revisit backend simplification after the product direction stabilizes.

## Proposed Simplified Layout

The V1 workspace should use a direct developer layout:

```text
Top:
  Repo URL input | Analyze button | Status

Left:
  Repository file tree

Center:
  Repo Brief
  Search results
  Selected file/source preview

Right:
  DevLens AI chat
```

The interface can use a small number of modes, but should avoid many top-level tabs. If navigation is needed, keep it close to:

- Repository
- Search
- DevLens AI

Settings should stay out of the main V1 workflow unless it contains real controls.

## Implementation Phases

### Phase 0: Product Direction Lock

- Preserve the frozen V1 layout: left repository status/file tree/filter, center Guide/Files/Search, right DevLens AI assistant.
- Treat broad agent, documentation, dashboard, admin, billing, and autonomous coding ideas as hidden or V2+ unless explicitly approved.
- Do not delete useful backend capability just because it is hidden from V1.
- Keep the visible product focused on repository understanding, file exploration, search, guided investigation, and cited answers.
- Prefer file-backed behavior first; add provider-backed answers only where they improve explanation quality and keep citations/fallbacks.

### Phase 1: Simplify UI Shell

- Remove or hide dashboard clutter.
- Remove visible internal agent cards.
- Remove the intelligence rail.
- Remove non-functional buttons from the main surface.
- Keep analysis status and repository URL input prominent.
- Make the file tree and central workspace feel like the primary product.

### Phase 2: Convert Docs Summary Into Repo Brief

- Rename the visible Docs summary surface to Repo Brief.
- Keep file-backed summary data.
- Hide README draft and architecture notes generation buttons from the primary UI.
- Include key files, symbols, testing signals, health signals, and suggested starting point.

### Phase 3: Make Search Central

- Promote search as a primary workflow.
- Keep search results file-backed and clickable.
- Show file, symbol, line, and preview context without exposing implementation details.

### Phase 4: Add DevLens AI Assistant MVP

- Add one persistent DevLens AI chat panel.
- Start with grounded, retrieval-backed behavior.
- Require citations for file-backed answers.
- Let citations open files or symbols in the explorer.
- Avoid exposing multiple agents or pipelines.

### Phase 5: Guided Repository Investigation

- Make the assistant feel active without pretending to be autonomous.
- Add guided repository tour behavior inside the existing assistant panel.
- Recommend the best next file, explain why it matters, show evidence, identify related files, and suggest what to inspect after it.
- Track lightweight inspected-file history and investigation summary where it directly helps onboarding.
- Surface risk or missing signals such as weak tests, missing docs, generated files, or unclear entry points.

### Phase 6: Optional Reintroductions

Only after the core experience is sharp, consider reintroducing:

- Code Map or Code Relationships.
- Generated README or architecture docs.
- Saved generated documents.
- Advanced repository health scoring.
- Team/workspace settings.

### Phase 10: V1 Freeze and Release Notes

- Validate the frozen V1 flow end to end.
- Keep the layout fixed: Repository Status/File Tree/File Filter, Guide/Files/Search, and one DevLens AI Assistant.
- Document local run steps, required local services, the tested demo repo, V1 capabilities, and known limitations.
- Keep the assistant file-backed and citation-driven.
- Do not add provider calls, visible multiple agents, new top-level tabs, or hidden future backend features to the V1 surface.
- Note that older analyses may need re-analysis for README/docs/config preview coverage.

### Phase 11: Provider-Backed AI Integration

- Add an OpenAI/provider-backed answer path only after the V1 file-backed flow is validated.
- Preserve citations, source opening, and honest uncertainty.
- Keep the existing assistant panel as the only visible assistant.
- Use repository data first, then enrich explanation quality with provider responses.
- Provide a clear fallback when provider credentials are missing or a provider call fails.
- Do not require provider credentials for local boot or repository analysis.

## Success Criteria

A developer opening DevLens AI should quickly understand:

1. What the repository is.
2. Where to start.
3. How the project is structured.
4. Where important features are implemented.
5. How to search the codebase.
6. How to ask DevLens AI questions and follow citations into source.

If a feature does not directly help with those outcomes, it should be hidden or deferred from V1.

## Explicit Non-Goals For V1

- A full documentation generation suite.
- Multiple visible AI agents.
- Admin dashboards.
- Billing, organizations, usage analytics, or team management.
- Complex relationship-first navigation.
- Public architecture or dependency map pages as primary surfaces.
- New database tables for generated docs.
- OpenAI/provider calls before the V1 file-backed experience is validated.
- Exposing internal services or future backend workflow labels.
