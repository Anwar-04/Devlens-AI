# Backend Guide

The backend consists of the NestJS API and repository worker.

## API

Location: `apps/api`

Main modules:

- `health`: basic and readiness health checks.
- `repositories`: repository creation, metadata, guide, files, source, symbols, docs helpers.
- `repository-search`: search endpoint.
- `assistant`: assistant answer and provider health endpoints.
- `jobs`: analysis job polling.

## Repository Worker

Location: `apps/repository-worker`

Responsibilities:

- consume `repo.clone` jobs from Redis
- clone GitHub repositories
- detect files, languages, and frameworks
- extract JavaScript/TypeScript symbols and references
- build source records
- save analysis results
- write optional Qdrant points
- classify and sanitize errors

## Shared Packages

- `packages/database`: Prisma schema and `db` export.
- `packages/shared`: shared contracts, queue, local vector helper, Qdrant helper.
- `packages/config`: shared config helper boundary.

## Backend Development Notes

- Keep provider keys server-side only.
- Keep worker clone tokens out of logs.
- Keep UI errors user-safe.
- Prefer adding tests around contract behavior, fallback handling, and error classification.
- Do not delete hidden backend functionality just because the V1 UI does not expose it.
