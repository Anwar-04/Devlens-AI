# Data Model

The database schema lives in `packages/database/prisma/schema.prisma`.

## Core Models

### User, Workspace, WorkspaceMember

These models provide a multi-workspace foundation. The current V1 local workflow creates or reuses a default workspace as needed.

### Repository

Stores GitHub repository identity and analysis status:

- provider, owner, name, URL
- visibility and default branch
- clone and analysis statuses
- detected languages and frameworks
- file count and size
- latest analyzed commit

### AnalysisJob

Tracks asynchronous analysis:

- status
- current step
- progress percentage
- error message
- timestamps

### RepositoryFile

Stores discovered files:

- path
- language
- size
- hash
- generated/test flags

The `(repositoryId, path)` pair is unique.

### Module

Stores module-level groupings when available. It is currently a lightweight model.

### Symbol

Stores extracted JavaScript/TypeScript declarations:

- name
- kind
- file
- line range
- signature
- summary

### SymbolReference

Stores relationships between symbols:

- reference
- call

The schema prevents duplicate reference edges for the same repository/source/target/kind.

### KnowledgeChunk

Stores source records used for preview, search, and assistant context:

- file or symbol link
- path
- line range
- content
- content hash
- local vector field

The schema prevents duplicate records for the same repository/path/line range/content hash.

## Current Limitations

- API endpoints and database models are not first-class tables yet.
- Authentication and team features are schema foundations, not polished V1 UI surfaces.
- Knowledge records use local analysis and local vectors; provider-generated embeddings are not required for V1.
