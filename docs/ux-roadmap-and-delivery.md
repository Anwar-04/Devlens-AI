# DevLens AI - UX, Delivery, And Roadmap

## 1. UI/UX Design

### Product Feel

DevLens AI should feel like a serious engineering workspace: dense, calm, fast, and useful. The first screen after analysis should not be a marketing page. It should be the repository workspace.

### Main Screens

#### Sign In

- GitHub OAuth button
- Short value statement
- Security note for repository permissions

#### Repository Intake

- GitHub repository URL input
- Visibility and size validation
- Analysis progress timeline
- Clear failure states

#### Repository Workspace

- Left sidebar: repository tree, modules, APIs, database, docs
- Main panel: selected view
- Right panel: AI assistant, citations, related symbols
- Top bar: repository switcher, search, job status, export

#### Dashboard

- Recent repositories
- Analysis status
- Repository health score
- Language/framework badges
- Generated docs shortcuts

#### Architecture View

- Interactive React Flow graph
- Module nodes grouped by layer
- Expand/collapse modules
- Click node to inspect files, symbols, APIs, and dependencies

#### Ask Repository

- Chat interface with citations
- Query modes: Search, Architecture, Flow, Explain, Docs, Review
- Source cards with file paths and line ranges

### Wireframes

#### Repository Workspace

```text
+--------------------------------------------------------------------------------+
| DevLens AI | Repo: org/project | Search...             | Export | User          |
+--------------------------------------------------------------------------------+
| Tree / Modules / APIs | Main Workspace View                         | AI Panel  |
|                       |                                             |           |
| src/                  | Architecture Overview                       | Ask Repo  |
| app/                  | [Interactive Graph]                         |           |
| services/             |                                             | citations |
| models/               | Key modules, APIs, dependencies             | sources   |
| docs/                 |                                             |           |
+--------------------------------------------------------------------------------+
```

#### Analysis Progress

```text
+-------------------------------------------------------------+
| Analyze Repository                                          |
| GitHub URL: https://github.com/org/repo                     |
|                                                             |
| [done] Clone repository                                     |
| [done] Extract structure                                    |
| [run ] Parse source code                                    |
| [wait] Build dependency graph                               |
| [wait] Generate embeddings                                  |
| [wait] Launch AI workspace                                  |
+-------------------------------------------------------------+
```

## 2. Deployment Architecture

### Local Development

- Docker Compose runs PostgreSQL, Redis, Qdrant, API, AI service, workers, and web.
- Each service has hot reload where practical.
- Seed script creates demo workspace and sample repository metadata.

### Production

- Next.js hosted behind CDN.
- API Gateway and AI Service deployed as containers.
- Workers deployed as horizontally scalable container groups.
- PostgreSQL managed database.
- Redis managed cache/queue.
- Qdrant managed or self-hosted vector cluster.
- S3-compatible object storage for artifacts.
- Nginx or cloud load balancer routes traffic.

## 3. CI/CD Pipeline

### GitHub Actions

- Install dependencies
- Lint TypeScript
- Lint Python
- Type check
- Unit tests
- Integration tests with Docker services
- Build containers
- Run security scans
- Push images
- Deploy staging

### Branch Strategy

- `main`: production-ready
- `develop`: integration
- `codex/*`: feature branches

## 4. Testing Strategy

### Unit Tests

- URL validation
- Framework detection
- Parser adapters
- API controllers
- Agent routing
- Retrieval ranking

### Integration Tests

- Repository analysis job lifecycle
- PostgreSQL writes
- Qdrant embedding writes
- Redis queue retries
- Ask Repository retrieval with citations

### End-to-End Tests

- Sign in mock
- Submit repository URL
- Wait for analysis completion
- Open workspace
- Ask repository question
- View dependency graph

### Golden Repositories

Maintain small fixture repositories for:

- Next.js
- Express
- NestJS
- FastAPI
- Django
- Mixed frontend/backend monorepo

## 5. Monitoring And Logging

### Metrics

- Analysis job duration
- Clone failures
- Parser failures by language
- Embedding cost and latency
- Agent latency
- Retrieval hit rate
- Queue depth
- Worker retry rate
- API error rate

### Logs

- Structured JSON logs
- Correlation ID per request and job
- Redacted repository content
- Redacted tokens and secrets

### Tracing

- Trace HTTP request to queue job to worker execution.
- Trace AI answer generation from intent classification to retrieval to final response.

## 6. Scalability Plan

- Shard analysis workload by repository ID.
- Limit repository size per plan.
- Cache analysis results by commit hash.
- Reuse embeddings for unchanged files.
- Scale workers horizontally.
- Split parser workers by language when needed.
- Move from Redis queues to Kafka for high event volume.
- Add graph database only after PostgreSQL graph queries become a measured bottleneck.

## 7. Security Plan

- GitHub OAuth with minimal scopes.
- JWT access tokens with refresh token rotation.
- RBAC at workspace and repository level.
- Encrypted GitHub tokens.
- Webhook signature validation.
- Rate limiting per user and workspace.
- Audit logs for repository access and AI queries.
- Secret scanning before storing prompts or logs.
- Sandbox clone and parsing environments.
- No execution of repository code.
- Dependency scanning for platform code.

## 8. Development Roadmap

### Milestone 1: Product And Architecture Blueprint

Status: current.

Deliverables:

- PRD
- MVP scope
- architecture
- data model
- API design
- AI workflow
- roadmap

### Milestone 2: Monorepo Foundation

Goals:

- Create Next.js, NestJS, FastAPI, and worker apps.
- Add Docker Compose for PostgreSQL, Redis, and Qdrant.
- Add shared config and types.
- Add health checks.

Stop condition:

- All services boot locally.
- API and AI service expose `/health`.
- Web app shows initial DevLens shell.

### Milestone 3: Repository Ingestion MVP

Goals:

- Submit GitHub URL.
- Clone public repositories.
- Track analysis jobs.
- Extract file tree.
- Detect languages and frameworks.

Stop condition:

- A public repository can be analyzed enough to show file tree and overview.

### Milestone 4: Knowledge Model And Search

Goals:

- Parse symbols for TypeScript, JavaScript, and Python.
- Extract imports and API endpoints.
- Store knowledge model.
- Generate embeddings.
- Implement semantic search.

Stop condition:

- User can search "Where is X handled?" and receive cited results.

### Milestone 5: AI Workspace

Goals:

- Ask Repository chat.
- Architecture overview.
- React Flow dependency graph.
- Documentation generation.
- Onboarding guide.

Stop condition:

- Repository workspace feels like a usable product demo.

### Milestone 6: Advanced Intelligence

Goals:

- Bug detection.
- Refactoring suggestions.
- Test generation.
- Impact analysis.
- Repository health score.

Stop condition:

- Platform can generate useful engineering review outputs.

### Milestone 7: Production Hardening

Goals:

- RBAC.
- Audit logs.
- rate limits.
- CI/CD.
- monitoring.
- deployment manifests.

Stop condition:

- Staging deployment is secure and repeatable.

## 9. MVP Sprint Plan

### Sprint 1: Foundation

Goals:

- Monorepo scaffold
- Docker Compose
- Database schema baseline
- API health checks
- Web shell

Architecture decisions:

- Use Prisma for PostgreSQL in API Gateway.
- Use shared environment validation.

APIs:

- `GET /health`
- `GET /auth/me`

Database changes:

- users, workspaces, repositories, analysis_jobs

AI workflow:

- none yet, only service health.

Implementation steps:

- Scaffold apps.
- Add lint/typecheck/test scripts.
- Add Docker Compose.
- Add env examples.

Best practices:

- Validate env at startup.
- Keep shared contracts in packages.

Common mistakes:

- Starting AI features before job and repository foundations exist.

Interview discussion points:

- Why separate API Gateway from AI Service?
- How would you structure a monorepo for multiple runtimes?

### Sprint 2: Repository Intake

Goals:

- Repository URL submission
- Clone worker
- Analysis job lifecycle
- File tree extraction

APIs:

- `POST /repositories`
- `GET /jobs/:id`
- `GET /repositories/:id/tree`

Database changes:

- repository_files, folders

AI workflow:

- none yet.

### Sprint 3: Parsing And Knowledge Model

Goals:

- Language/framework detection
- Symbol extraction
- Import extraction
- API endpoint extraction

APIs:

- `GET /repositories/:id/overview`
- `GET /repositories/:id/dependencies`

Database changes:

- modules, symbols, dependencies, api_endpoints

AI workflow:

- Repository Intelligence Agent generates overview draft.

### Sprint 4: Search And AI Workspace

Goals:

- Embeddings
- Semantic search
- Ask Repository
- Generated onboarding doc
- Architecture graph UI

APIs:

- `POST /repositories/:id/search`
- `POST /repositories/:id/ask`
- `POST /repositories/:id/documents`

Database changes:

- documents, agent_runs

AI workflow:

- Intent classifier
- Repository Search Agent
- Architecture Agent
- Documentation Agent

## 10. Startup Roadmap

### Launch MVP

- Public GitHub repository analysis
- Developer onboarding workflow
- Ask Repository with citations
- Architecture graph
- Generated docs

### Early Paid Version

- Private repositories
- Team workspaces
- RBAC
- More languages
- Pull request review
- Exportable docs
- Advanced security and complexity reports

### Enterprise Version

- SSO/SAML
- Self-hosted deployment
- Audit exports
- Policy controls
- Custom LLM/provider support
- Large monorepo support
- Compliance controls

