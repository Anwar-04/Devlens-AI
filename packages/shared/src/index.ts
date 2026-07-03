export type AnalysisStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";

export type RepositoryProvider = "GITHUB";

export type SupportedLanguage =
  | "JavaScript"
  | "TypeScript"
  | "Python"
  | "Java"
  | "Go"
  | "CSharp"
  | "Rust"
  | "PHP";

export interface HealthResponse {
  service: string;
  status: "ok";
  version: string;
}

export interface RepositorySummary {
  id: string;
  provider: RepositoryProvider;
  owner: string;
  name: string;
  url: string;
  analysisStatus: AnalysisStatus;
  languages: SupportedLanguage[];
  updatedAt: string;
}

export interface AnalysisJobSummary {
  id: string;
  repositoryId: string;
  status: AnalysisStatus;
  currentStep: string;
  progress: number;
}

export interface GraphNode {
  id: string;
  label: string;
  kind: string;
  metadata?: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind: string;
  metadata?: Record<string, unknown>;
}

export interface CloneJobPayload {
  repositoryId: string;
  jobId: string;
  url: string;
}

export interface KnowledgeIndexJobPayload {
  repositoryId: string;
  jobId?: string;
  source: "repository-ingestion" | "manual";
}

export { EMBEDDING_DIMENSIONS, generateEmbedding } from "./embeddings.js";
export {
  KNOWLEDGE_COLLECTION,
  ensureKnowledgeCollection,
  searchKnowledgePoints,
  upsertKnowledgePoints,
  type QdrantPoint,
  type QdrantSearchHit,
} from "./qdrant.js";
export { RedisQueue } from "./queue.js";
