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

export interface AssistantCitation {
  path: string;
  label: string;
  reason: string;
  startLine?: number;
  endLine?: number;
}

export interface AssistantSourceSnippet {
  path: string;
  startLine?: number;
  endLine?: number;
  content: string;
}

export interface AssistantContext {
  repository?: {
    owner: string;
    name: string;
    url?: string;
    languages?: string[];
    frameworks?: string[];
    fileCount?: number;
  };
  guide?: {
    summary?: string;
    purpose?: string;
    architecture?: string;
    readingOrder?: AssistantCitation[];
  };
  selectedFile?: {
    path: string;
    role?: string;
    previewStartLine?: number;
    previewEndLine?: number;
    preview?: string;
    related?: AssistantCitation[];
  };
  searchResults?: AssistantCitation[];
  sourceSnippets?: AssistantSourceSnippet[];
  localAnswer?: string;
}

export interface AssistantAskRequest {
  question: string;
  context: AssistantContext;
  requestId?: string;
}

export interface AssistantAskResponse {
  answer: string;
  citations: AssistantCitation[];
  mode: "provider" | "fallback";
  fallbackReason?: "missing_credentials" | "provider_error" | "weak_citations";
  providerMetadata?: {
    provider: "openai" | "gemini";
    model: string;
    requestId?: string;
    attempts?: number;
    usedFallbackModel?: boolean;
  };
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
