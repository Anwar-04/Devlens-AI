# DevLens AI - Milestone 1 Blueprint

Tagline: Understand any codebase in minutes, not days.

## 1. Product Requirements Document

### Product Vision

DevLens AI is a codebase intelligence platform that turns a GitHub repository into an explorable knowledge workspace. It analyzes source code structurally, builds a semantic and graph-based knowledge model, and lets developers ask precise questions about architecture, APIs, data models, dependencies, flows, and code ownership.

The product must feel like an engineering tool a company would pay for, not a generic chatbot over files.

### Target Users

- Software engineers joining a new codebase
- Backend, frontend, and full-stack developers
- Tech leads and engineering managers
- Open source contributors
- Students learning mature repositories
- Platform and security teams reviewing unfamiliar systems

### Core Problem

Large repositories are difficult to understand because knowledge is spread across thousands of files, undocumented conventions, framework behavior, dependency chains, Git history, and tribal context. DevLens AI reduces onboarding and investigation time by constructing a repository knowledge model and exposing it through search, agents, diagrams, and generated documentation.

### MVP Success Criteria

- User can sign in and submit a public GitHub repository URL.
- System clones and analyzes the repository asynchronously.
- System extracts folder structure, languages, frameworks, modules, imports, functions/classes, API routes, config files, and basic dependencies.
- System stores relational metadata, graph relationships, and embeddings.
- User can open an AI workspace for the repository.
- User can view repository overview, file tree, architecture summary, dependency graph, and generated onboarding guide.
- User can ask repository questions using retrieval grounded in repository knowledge.

### Non-Goals For MVP

- Full private enterprise deployment
- Complete language parity across all supported languages
- Perfect call graph for dynamic languages
- Full GitHub PR review automation
- Kubernetes production deployment
- Billing and subscription management
- Browser IDE replacement

## 2. Feature Breakdown

### MVP Features

- GitHub OAuth sign-in
- Repository URL submission
- Repository clone worker
- Repository analysis job lifecycle
- Language and framework detection
- Folder and file explorer
- Module/function/class extraction for TypeScript, JavaScript, and Python first
- Import/dependency graph
- Basic API endpoint extraction for Next.js, Express, NestJS, FastAPI, Flask, and Django
- Embedding generation for symbols and documentation summaries
- Semantic repository search
- Ask Repository chat
- Repository overview
- Architecture summary
- Generated README/onboarding guide
- Basic React Flow dependency graph
- Docker Compose local stack

### V2 Features

- Java, Go, C#, Rust, and PHP parser expansion
- Advanced call graph
- Database model extraction across ORMs
- ER diagram
- Impact analysis
- Security scan
- Complexity scoring
- Refactoring suggestions
- Test generation
- Git intelligence
- Pull request review
- Export documentation
- Team workspaces and RBAC

## 3. System Architecture

### Architecture Style

Use a modular monorepo with microservice-inspired boundaries. During MVP, run services independently through Docker Compose, but keep deployment simple enough for fast iteration.

### Main Services

- Web App: Next.js frontend for dashboard, repository workspace, diagrams, and chat.
- API Gateway: NestJS service for auth, users, repositories, jobs, search, and workspace APIs.
- AI Service: FastAPI service for LangGraph agents, RAG orchestration, embeddings, summaries, and documentation generation.
- Repository Worker: Node.js worker for cloning, file walking, framework detection, parsing, and metadata extraction.
- Knowledge Worker: Python worker for embeddings, summarization, graph enrichment, and AI post-processing.
- Search Service: API facade around PostgreSQL full-text, Qdrant vector search, and graph queries.
- Visualization Service: Generates graph payloads for React Flow and Mermaid-compatible diagrams.

### Infrastructure

- PostgreSQL: source of truth for users, repositories, files, symbols, API endpoints, jobs, docs, and audit logs.
- Redis: cache, rate limiting, job coordination, and short-lived workspace state.
- Qdrant: vector storage for repository semantic search.
- Kafka: event bus for production design. MVP may use Redis queues first, with Kafka-compatible event contracts.
- S3-compatible storage: repository archives, generated docs, and large artifacts.
- Nginx: reverse proxy in production.

### High-Level Flow

1. User authenticates with GitHub OAuth.
2. User submits repository URL.
3. API Gateway creates repository and analysis job records.
4. Repository Worker clones repository into isolated storage.
5. Parser extracts project structure, symbols, dependencies, APIs, configs, and framework metadata.
6. Knowledge Worker builds summaries, embeddings, and graph relationships.
7. AI Service runs repository intelligence and architecture workflows.
8. UI shows the completed workspace.
9. User asks questions through agentic RAG grounded in the knowledge model.

## 4. Microservice Design

### API Gateway

Responsibilities:

- Authentication and session management
- Repository CRUD
- Analysis job orchestration
- Public REST/GraphQL APIs for frontend
- Rate limiting and authorization checks
- Audit logging

Preferred stack: NestJS, TypeScript, Prisma, PostgreSQL, Redis.

### AI Service

Responsibilities:

- LangGraph agent workflows
- Retrieval planning
- Prompt orchestration
- LLM provider abstraction
- Embedding jobs
- Answer citation and grounding
- Documentation generation

Preferred stack: FastAPI, Python, LangGraph, LangChain, OpenAI-compatible LLMs.

### Repository Worker

Responsibilities:

- Secure clone
- Repository size validation
- Ignore patterns
- File tree extraction
- Language/framework detection
- AST parsing
- Symbol extraction
- Import/dependency extraction
- API route extraction

Preferred stack: Node.js, TypeScript, tree-sitter, ts-morph, language-specific parsers.

### Knowledge Worker

Responsibilities:

- Chunk-free semantic model creation
- Symbol-level summaries
- Module-level summaries
- Embeddings
- Graph enrichment
- Repository health scoring
- Documentation draft generation

Preferred stack: Python, FastAPI worker process, LangChain, Qdrant client.

## 5. System Boundaries

### Clean Architecture Rule

Domain concepts should not depend on external providers. GitHub, Qdrant, Redis, PostgreSQL, and LLM providers are infrastructure adapters. Core concepts such as Repository, AnalysisJob, Symbol, Dependency, AgentRun, and KnowledgeNode must remain provider-neutral.

### MVP Boundary Decision

Use a monorepo with separate apps and packages:

- `apps/web`
- `apps/api`
- `apps/ai-service`
- `apps/repository-worker`
- `apps/knowledge-worker`
- `packages/shared`
- `packages/database`
- `packages/config`
- `infra/docker`
- `docs`

## 6. Key Architecture Decisions

### ADR-001: Use Multi-Agent RAG Instead Of One Chatbot

Decision: Model repository interactions as specialized agents coordinated through LangGraph.

Reason: Repository questions require different retrieval strategies. Architecture explanation, semantic search, documentation generation, and bug detection should not share one generic prompt.

### ADR-002: Build A Knowledge Model Before Embeddings

Decision: Parse and store structured entities before vectorizing.

Reason: Embeddings over raw chunks lose relationships. DevLens AI differentiates itself by understanding files, modules, symbols, APIs, dependencies, and flows.

### ADR-003: Start With TypeScript, JavaScript, And Python

Decision: MVP parser support focuses on TypeScript, JavaScript, and Python.

Reason: These cover Next.js, React, Express, NestJS, FastAPI, Flask, and Django while keeping parser quality high.

### ADR-004: Use PostgreSQL Plus Qdrant

Decision: PostgreSQL stores canonical structured data; Qdrant stores vector embeddings.

Reason: Relational queries, job state, permissions, and graph metadata need transactional consistency. Semantic search needs a purpose-built vector index.

### ADR-005: Use Redis Queues In MVP, Kafka Contracts For Production

Decision: Begin with Redis-backed queues but define events in a Kafka-compatible format.

Reason: Redis reduces MVP complexity. Event contracts prevent a painful migration later.

## 7. Best Practices

- Treat repository processing as untrusted input.
- Never execute cloned code during analysis.
- Use allowlisted parser behavior only.
- Run clone and parsing jobs in isolated directories.
- Store secrets encrypted.
- Enforce repository size and file count limits.
- Use idempotent background jobs.
- Track analysis state with resumable job steps.
- Cite files and symbols in AI answers.
- Separate raw extraction from AI interpretation.
- Prefer symbol-level retrieval over raw file chunk retrieval.

## 8. Common Mistakes To Avoid

- Building only a chat UI before the knowledge model exists.
- Chunking whole files and calling it code intelligence.
- Letting AI agents invent file paths or APIs without citations.
- Running arbitrary repo scripts during analysis.
- Treating all languages as equal in MVP.
- Mixing auth, AI orchestration, and repository parsing in one backend.
- Skipping job lifecycle design.
- Designing diagrams as static images instead of interactive graph data.
- Overbuilding Kubernetes before product workflows are stable.

## 9. Interview Discussion Points

- How would you parse a large repository without executing code?
- How do ASTs improve retrieval compared with raw text chunks?
- How would you detect frameworks reliably?
- How would you design idempotent background jobs?
- How would you store a dependency graph in a relational database?
- How would you prevent prompt injection from repository contents?
- What belongs in PostgreSQL versus Qdrant?
- How would you scale clone and analysis workers?
- How would you cite sources in AI-generated answers?
- How would you handle private GitHub repositories securely?

