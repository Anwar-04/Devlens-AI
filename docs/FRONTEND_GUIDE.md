# Frontend Guide

The frontend lives in `apps/web`.

## Technology

- Next.js 15
- React 19
- TypeScript
- Tailwind CSS
- lucide-react icons

## Main Files

- `app/page.tsx`: main DevLens workspace.
- `app/devlens-icons.tsx`: centralized icon system.
- `app/globals.css`: global styling and fixed workspace behavior.
- `tailwind.config.ts`: Tailwind configuration.

## Workspace Layout

The desktop UI is a fixed-height app shell:

- header at the top
- left repository/file column
- center workspace column
- right assistant column

The browser page should not scroll on desktop. The intended scroll regions are:

- left file tree
- center workspace column
- right assistant content

## Major Frontend Responsibilities

- Submit repository analysis requests.
- Poll analysis jobs.
- Fetch guide summary, tree, symbols, search, and source preview data.
- Maintain active tab, selected file, expanded folders, walkthrough progress, and assistant messages.
- Open citations in the Files tab and highlight line ranges.
- Render selected-file intelligence and guide dashboard cards.

## UI Rules

- Keep repo URL and Analyze action near the top of the center workspace.
- Keep Guide, Files, and Search as the only center tabs.
- Keep one DevLens AI assistant.
- Keep icons meaningful and restrained.
- Keep long paths contained with truncation or wrapping.
- Avoid exposing implementation jargon in user-facing text.

## Known Frontend Risk

`app/page.tsx` is large. Future refactoring should split stable sections into components without changing behavior.
