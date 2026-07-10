# DevLens AI Documentation

This folder contains both current V1 direction docs and earlier architecture planning notes.

Current V1 direction: DevLens AI is a focused AI-powered repository understanding and onboarding workspace. The product should help a developer paste a GitHub repository URL, analyze the codebase, understand what it does, explore important files, search the codebase, and ask repository-aware questions with file-backed citations.

For V1, treat [v1-product-refinement.md](v1-product-refinement.md) as the product direction source. Older milestone and architecture documents may describe broader future capabilities such as multiple agents, LangGraph workflows, documentation generation, knowledge graphs, diagrams, admin features, or billing. Those ideas are historical or V2+ unless they directly support the focused V1 workflow.

## Files

- [v1-product-refinement.md](v1-product-refinement.md): current V1 product scope, frozen workspace direction, assistant expectations, features to keep, and features to hide or defer.
- [milestone-1-blueprint.md](milestone-1-blueprint.md): PRD, MVP scope, architecture, service design, decisions, best practices, mistakes, and interview discussion points.
- [data-model-and-api.md](data-model-and-api.md): database schema, ER diagram, and API documentation.
- [ai-and-pipeline-design.md](ai-and-pipeline-design.md): earlier AI agents, LangGraph workflow, RAG pipeline, knowledge graph, queue architecture, and repository parsing pipeline notes. Keep these as hidden/future infrastructure context, not visible V1 product scope.
- [ux-roadmap-and-delivery.md](ux-roadmap-and-delivery.md): UI/UX design, wireframes, deployment, CI/CD, testing, monitoring, security, roadmap, and sprint plan.

## Deliverable Map

1. Current V1 Direction: `v1-product-refinement.md`
2. Historical PRD: `milestone-1-blueprint.md`
3. Feature Breakdown: `milestone-1-blueprint.md`
4. System Architecture: `milestone-1-blueprint.md`
5. Microservice Design: `milestone-1-blueprint.md`
6. Database Schema: `data-model-and-api.md`
7. ER Diagram: `data-model-and-api.md`
8. API Documentation: `data-model-and-api.md`
9. Folder Structure: `milestone-1-blueprint.md`
10. UI/UX Design: `ux-roadmap-and-delivery.md`
11. Wireframes: `ux-roadmap-and-delivery.md`
12. AI Agent Architecture: `ai-and-pipeline-design.md`
13. LangGraph Workflow: `ai-and-pipeline-design.md`
14. RAG Pipeline: `ai-and-pipeline-design.md`
15. Knowledge Graph Design: `ai-and-pipeline-design.md`
16. Queue Architecture: `ai-and-pipeline-design.md`
17. Repository Parsing Pipeline: `ai-and-pipeline-design.md`
18. Background Job Design: `ai-and-pipeline-design.md`
19. Authentication Flow: `milestone-1-blueprint.md`, `data-model-and-api.md`
20. GitHub Integration: `milestone-1-blueprint.md`, `data-model-and-api.md`
21. Deployment Architecture: `ux-roadmap-and-delivery.md`
22. CI/CD Pipeline: `ux-roadmap-and-delivery.md`
23. Testing Strategy: `ux-roadmap-and-delivery.md`
24. Monitoring & Logging: `ux-roadmap-and-delivery.md`
25. Scalability Plan: `ux-roadmap-and-delivery.md`
26. Security Plan: `ux-roadmap-and-delivery.md`
27. Development Roadmap: `ux-roadmap-and-delivery.md`
28. Sprint-wise Implementation Plan: `ux-roadmap-and-delivery.md`
29. MVP 2-4 Weeks: `ux-roadmap-and-delivery.md`
30. Version 2 Features: `milestone-1-blueprint.md`
31. Startup Roadmap: `ux-roadmap-and-delivery.md`

## Approval Gate

V1 work should follow `v1-product-refinement.md` first. Older milestone docs are useful for infrastructure context, but they do not override the focused V1 product scope.

Milestone 2 scope:

- Scaffold monorepo.
- Create Next.js web app.
- Create NestJS API Gateway.
- Create FastAPI AI Service.
- Create repository and knowledge worker placeholders.
- Add Docker Compose for PostgreSQL, Redis, and Qdrant.
- Add shared config/types.
- Add health checks and initial development scripts.
