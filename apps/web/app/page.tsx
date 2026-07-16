"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Braces,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Copy,
  ExternalLink,
  FolderOpen,
  Loader2,
  Maximize2,
  Network,
  Search,
  Sparkles,
  X,
  Workflow,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import {
  DevLensIcon,
  devlensIcons,
  getExplorerIconMeta,
} from "./devlens-icons";

type JobStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";

type JobResponse = {
  id: string;
  repositoryId: string;
  status: JobStatus;
  currentStep: string;
  progress: number;
  errorMessage?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt?: string;
  repository?: {
    id: string;
    owner: string;
    name: string;
    url: string;
    cloneStatus: string;
    analysisStatus: string;
    detectedLanguages: string[];
    detectedFrameworks: string[];
    fileCount: number;
    totalSizeBytes: number;
  };
};

type TreeNode = {
  id: string;
  path: string;
  name: string;
  kind: "file" | "folder";
  language?: string;
  sizeBytes?: number;
};

type TreeResponse = {
  repositoryId: string;
  fileCount: number;
  nodes: TreeNode[];
};

type ExplorerNode = TreeNode & {
  children: ExplorerNode[];
  fileCount: number;
  totalSizeBytes: number;
};

type FileSourceLine = {
  lineNumber: number;
  content: string;
};

type FileSourceResponse = {
  repositoryId: string;
  file: {
    id: string;
    path: string;
    language?: string | null;
    sizeBytes: number;
    isGenerated: boolean;
    isTest: boolean;
    sourceAvailable: boolean;
    previewLines: FileSourceLine[];
    previewStartLine?: number | null;
    previewEndLine?: number | null;
  };
};

type SearchResult = {
  id: string;
  score: number;
  lexicalScore?: number;
  vectorScore?: number;
  title: string;
  path: string;
  language?: string | null;
  startLine: number;
  endLine: number;
  snippet: string;
  matchedTerm?: string | null;
  isTest: boolean;
  chunkKind?: "FILE" | "SYMBOL" | "MODULE";
  symbol?: {
    id: string;
    name: string;
    kind: string;
    signature?: string | null;
    visibility?: string | null;
  } | null;
  file?: {
    id: string;
    path: string;
    language?: string | null;
    sizeBytes: number;
    isTest: boolean;
  } | null;
};

type SearchResponse = {
  repository: {
    id: string;
    owner: string;
    name: string;
  };
  query: string;
  tokens: string[];
  count: number;
  results: SearchResult[];
};

type DevlensCitation = {
  path: string;
  label: string;
  reason: string;
  startLine?: number;
  endLine?: number;
};

type DevlensResponse = {
  answer: string;
  citations: DevlensCitation[];
  mode?: "provider" | "fallback" | "local";
  fallbackReason?: "missing_credentials" | "provider_error" | "weak_citations";
};

type ProviderAssistantResponse = {
  answer: string;
  citations: DevlensCitation[];
  mode: "provider" | "fallback";
  fallbackReason?: "missing_credentials" | "provider_error" | "weak_citations";
  providerMetadata?: {
    provider: "openai" | "gemini";
    model: string;
    requestId?: string;
    attempts?: number;
    usedFallbackModel?: boolean;
    mode?: "provider" | "provider-fallback" | "local-fallback";
  };
};

type GuidedInvestigation = {
  status: string;
  bestNextFile: DevlensCitation | null;
  whyItMatters: string;
  connections: string[];
  inspectAfter: DevlensCitation[];
  findings: string[];
  risks: string[];
  followUps: string[];
  summary: string;
};

type WalkthroughState = {
  activeStepPath: string | null;
  completedFiles: string[];
  skippedFiles: string[];
  lastOpenedCitation: DevlensCitation | null;
  isComplete: boolean;
};

type WalkthroughSummary = {
  path: DevlensCitation[];
  current: DevlensCitation | null;
  next: DevlensCitation | null;
  completedCount: number;
  skippedCount: number;
  remainingCount: number;
  progressLabel: string;
  risks: string[];
  isComplete: boolean;
};

type WalkthroughEvidenceItem = {
  label: string;
  detail: string;
  citation: DevlensCitation;
  priority: "high" | "medium" | "low";
};

type WalkthroughHandoff = {
  projectSummary: string;
  architecturePath: string;
  inspected: DevlensCitation[];
  skipped: DevlensCitation[];
  findings: string[];
  risks: string[];
  nextDeepDive: DevlensCitation | null;
  nextDeepDiveReason: string;
};

type SymbolRelation = {
  referenceId: string;
  referenceKind: "REFERENCE" | "CALL";
  symbol: {
    id: string;
    name: string;
    kind: string;
    filePath: string;
    startLine: number;
    endLine: number;
    signature?: string | null;
    visibility?: string | null;
  };
};

type RepositorySymbol = {
  id: string;
  name: string;
  kind: string;
  filePath: string;
  startLine: number;
  endLine: number;
  signature?: string | null;
  visibility?: string | null;
  outgoingReferences: SymbolRelation[];
  outgoingCalls: SymbolRelation[];
  incomingReferences: SymbolRelation[];
};

type SymbolsResponse = {
  repository: {
    id: string;
    owner: string;
    name: string;
  };
  count: number;
  symbols: RepositorySymbol[];
};

type DocsSummarySymbol = {
  id: string;
  name: string;
  kind: string;
  filePath: string;
  startLine: number;
  endLine: number;
  signature?: string | null;
  visibility?: string | null;
  connectionCount: number;
  outgoingCalls: number;
  outgoingReferences: number;
  incomingReferences: number;
};

type RepositoryUnderstanding = {
  purpose: string;
  domain: string;
  coreFeatures: string[];
  architecture: string;
  mainModules: Array<{
    name: string;
    purpose: string;
  }>;
  readingOrder: Array<{
    file: string;
    reason: string;
  }>;
  summary: string;
};

type DocsSummaryResponse = {
  repository: {
    id: string;
    owner: string;
    name: string;
    url: string;
    detectedLanguages: string[];
    detectedFrameworks: string[];
    fileCount: number;
    totalSizeBytes: number;
    analysisStatus: string;
    cloneStatus: string;
  };
  overview: {
    text: string;
    primaryLanguage: string | null;
    frameworkSummary: string;
  };
  understanding: RepositoryUnderstanding;
  architecture: {
    topLanguages: Array<{
      language: string;
      files: number;
      sizeBytes: number;
    }>;
    importantPaths: Array<{ path: string }>;
    testFileCount: number;
    generatedFileCount: number;
  };
  symbols: {
    exported: DocsSummarySymbol[];
    mostConnected: DocsSummarySymbol[];
    counts: {
      total: number;
      exported: number;
      connected: number;
    };
  };
  docsPreview: Array<{
    title: string;
    body: string;
  }>;
  queuedSections: Array<{
    title: string;
    description: string;
  }>;
};

type GuideEnhanceResponse = {
  repositoryId: string;
  summary: string;
  purpose: string;
  domain: string;
  coreFeatures: string[];
  architecture: string;
  readingOrder: Array<{
    file: string;
    reason: string;
  }>;
  citations: DevlensCitation[];
  mode: "provider" | "fallback";
  fallbackReason?: "missing_credentials" | "provider_error" | "weak_citations";
};

type SymbolReferencesResponse = {
  repositoryId: string;
  symbol: RepositorySymbol;
};

type SymbolSourceLine = {
  lineNumber: number;
  content: string;
  isSymbolLine: boolean;
};

type SymbolSourceResponse = {
  repositoryId: string;
  symbol: {
    id: string;
    name: string;
    kind: string;
    filePath: string;
    startLine: number;
    endLine: number;
    language?: string | null;
    sourceAvailable: boolean;
    sourceLines: SymbolSourceLine[];
  };
};

type SymbolRelationshipTab = "calls" | "references" | "referencedBy";
type WorkspaceTab = "brief" | "files" | "search";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const LARGE_REPO_FILE_CAP = 1200;

const pipelineSteps = [
  { key: "queued", label: "Preparing", description: "Getting the analysis ready" },
  {
    key: "cloning",
    label: "Cloning",
    description: "Fetching repository from GitHub",
  },
  {
    key: "indexing_files",
    label: "Reading files",
    description: "Building the folder and file inventory",
  },
  {
    key: "detecting_stack",
    label: "Detecting stack",
    description: "Finding languages and frameworks",
  },
  {
    key: "saving_metadata",
    label: "Preparing workspace",
    description: "Organizing the guide, files, and search",
  },
  { key: "completed", label: "Completed", description: "Workspace is ready" },
];

const workspaceTabs: Array<{
  key: WorkspaceTab;
  label: string;
  icon: LucideIcon;
}> = [
  { key: "brief", label: "Guide", icon: devlensIcons.product.guide },
  { key: "files", label: "Files", icon: devlensIcons.product.files },
  { key: "search", label: "Search", icon: devlensIcons.product.search },
];

function formatLineRange(item: { startLine: number; endLine: number }): string {
  return `Lines ${item.startLine}-${item.endLine}`;
}

function formatCompactLineRange(item: {
  startLine: number;
  endLine: number;
}): string {
  return item.startLine === item.endLine
    ? `L${item.startLine}`
    : `L${item.startLine}-${item.endLine}`;
}

function buildSymbolOccurrenceLabels(symbols: RepositorySymbol[]) {
  const totals = new Map<string, number>();
  const seen = new Map<string, number>();
  const labels = new Map<string, string>();

  symbols.forEach((symbol) => {
    const key = `${symbol.name}:${symbol.filePath}`;
    totals.set(key, (totals.get(key) ?? 0) + 1);
  });

  symbols.forEach((symbol) => {
    const key = `${symbol.name}:${symbol.filePath}`;
    const total = totals.get(key) ?? 0;
    if (total <= 1) return;

    const next = (seen.get(key) ?? 0) + 1;
    seen.set(key, next);
    labels.set(symbol.id, `${next}/${total}`);
  });

  return labels;
}

function matchesSymbolQuery(symbol: RepositorySymbol, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  return [
    symbol.name,
    symbol.kind,
    symbol.filePath,
    symbol.visibility ?? "",
    symbol.signature ?? "",
  ].some((value) => value.toLowerCase().includes(normalizedQuery));
}

function buildSymbolKindOptions(symbols: RepositorySymbol[]) {
  const counts = new Map<string, number>();
  symbols.forEach((symbol) => {
    counts.set(symbol.kind, (counts.get(symbol.kind) ?? 0) + 1);
  });

  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([kind, count]) => ({ kind, count }));
}

function getSymbolKindMeta(kind: string) {
  const normalized = kind.toLowerCase();
  const labels: Record<
    string,
    { icon: string; singular: string; plural: string; tone: string }
  > = {
    function: {
      icon: "fn",
      singular: "function",
      plural: "Functions",
      tone: "border-blue-200 bg-blue-50 text-blue-700",
    },
    interface: {
      icon: "I",
      singular: "interface",
      plural: "Interfaces",
      tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
    },
    type: {
      icon: "T",
      singular: "type",
      plural: "Types",
      tone: "border-violet-200 bg-violet-50 text-violet-700",
    },
    variable: {
      icon: "x",
      singular: "variable",
      plural: "Variables",
      tone: "border-amber-200 bg-amber-50 text-amber-700",
    },
  };

  return (
    labels[normalized] ?? {
      icon: "{}",
      singular: normalized || "symbol",
      plural: `${kind || "Symbol"}s`,
      tone: "border-line bg-cloud text-graphite",
    }
  );
}

function getSymbolVisibilityLabel(symbol: {
  visibility?: string | null;
}): string {
  return symbol.visibility ? `${symbol.visibility} ` : "";
}

function getArticleForWord(word: string): "a" | "an" {
  return /^[aeiou]/i.test(word) ? "an" : "a";
}

function formatUsageCount(count: number, label: string): string {
  return `${count} ${label}${count === 1 ? "" : "s"}`;
}

function buildSelectedSymbolSummary(symbol: RepositorySymbol): string {
  const kindMeta = getSymbolKindMeta(symbol.kind);
  const visibility = getSymbolVisibilityLabel(symbol);
  const refs = formatUsageCount(symbol.outgoingReferences.length, "reference");
  const inbound = formatUsageCount(symbol.incomingReferences.length, "inbound link");
  const article = getArticleForWord(visibility || kindMeta.singular);

  return `${symbol.name} is ${article} ${visibility}${kindMeta.singular} in ${symbol.filePath} with ${refs} and ${inbound}.`;
}

function getSymbolSourceSnippet(source: SymbolSourceResponse | null): string {
  return source?.symbol.sourceLines.map((line) => line.content).join("\n") ?? "";
}

function getFileSourceSnippet(source: FileSourceResponse | null): string {
  return source?.file.previewLines.map((line) => line.content).join("\n") ?? "";
}

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatStepLabel(step: string): string {
  const labels: Record<string, string> = {
    queued: "Preparing",
    cloning: "Fetching repository",
    indexing_files: "Reading files",
    detecting_stack: "Detecting stack",
    saving_metadata: "Preparing workspace",
    completed: "Completed",
  };
  if (labels[step]) return labels[step];

  return step
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusTone(status?: JobStatus): string {
  if (status === "COMPLETED") return "text-mint";
  if (status === "FAILED" || status === "CANCELLED") return "text-red-600";
  return "text-signal";
}

function formatJobStatus(status?: JobStatus): string {
  const labels: Record<JobStatus, string> = {
    QUEUED: "Preparing",
    RUNNING: "Analyzing",
    COMPLETED: "Completed",
    FAILED: "Needs attention",
    CANCELLED: "Cancelled",
  };
  return status ? labels[status] : "Ready";
}

function getAnalysisStatusMessage(job: JobResponse | null, repositoryReady: boolean) {
  if (!job) {
    return "Paste a GitHub repository URL. DevLens will analyze the repo, build the file tree, prepare the guide, and enable file-backed questions.";
  }
  if (job.status === "COMPLETED" || repositoryReady) {
    return "Analysis complete. Start with the Guide, open README or package files, then use Search or the walkthrough to inspect the code.";
  }
  if (job.status === "FAILED") {
    return "Analysis needs attention. Verify the GitHub URL, make sure local services are running, then try again.";
  }
  if (job.status === "CANCELLED") {
    return "Analysis was cancelled. Start a new analysis when you are ready.";
  }
  return "Analysis is running. Keep this workspace open; files, guide, search, and assistant context will appear as each step completes.";
}

function getJobErrorMessage(job: JobResponse) {
  if (!job.errorMessage) return null;
  if (
    /private|missing|requires GitHub access|not valid|could not be reached|network|Git could not clone|analysis failed|duplicate source|large|timed out|saving results/i.test(
      job.errorMessage,
    )
  ) {
    return job.errorMessage;
  }
  return `${job.errorMessage} Verify the repository URL and local services, then retry.`;
}

function getActionableErrorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  if (/fetch|failed to fetch|network|connection|ECONNREFUSED|closed unexpectedly/i.test(message)) {
    return `${fallback} Check that the local API is running at ${API_URL}, then try again.`;
  }
  return `${message} Verify the GitHub URL and try again.`;
}

function getAssistantStatusLabel(response?: DevlensResponse | null) {
  if (!response || response.mode !== "fallback") return null;
  if (response.fallbackReason === "missing_credentials") {
    return "Using repository context because provider credentials are not configured.";
  }
  if (response.fallbackReason === "weak_citations") {
    return "Answer anchored to verified repository citations.";
  }
  if (response.fallbackReason === "provider_error") {
    return "Using repository context because the provider is unavailable.";
  }
  return null;
}

function getStepIndex(step?: string): number {
  if (!step) return -1;
  return pipelineSteps.findIndex((item) => item.key === step);
}

function calculateDuration(job: JobResponse | null): string {
  if (!job?.createdAt) return "Not started";
  const start = new Date(job.startedAt ?? job.createdAt).getTime();
  const end = job.finishedAt ? new Date(job.finishedAt).getTime() : Date.now();
  if (Number.isNaN(start) || Number.isNaN(end)) return "Tracking";
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  return seconds < 60
    ? `${seconds}s`
    : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function inferProjectType(summary: DocsSummaryResponse | null): string {
  const frameworks = summary?.repository.detectedFrameworks ?? [];
  const languages = summary?.repository.detectedLanguages ?? [];
  const frameworkText = frameworks.join(" ").toLowerCase();

  if (/next|react|vue|svelte|angular/.test(frameworkText)) {
    return "Frontend app";
  }
  if (/nest|express|fastapi|django|rails|spring/.test(frameworkText)) {
    return "API backend";
  }
  if (/cli|commander/.test(frameworkText)) return "CLI tool";
  if (languages.some((language) => /typescript|javascript/i.test(language))) {
    return "TypeScript/JavaScript project";
  }
  return summary?.overview.frameworkSummary || "Repository";
}

function inferComplexity(summary: DocsSummaryResponse | null): "Low" | "Medium" | "High" {
  const fileCount = summary?.repository.fileCount ?? 0;
  const symbolCount = summary?.symbols.counts.total ?? 0;

  if (fileCount > 250 || symbolCount > 400) return "High";
  if (fileCount > 60 || symbolCount > 120) return "Medium";
  return "Low";
}

function estimateOnboarding(summary: DocsSummaryResponse | null): string {
  const complexity = inferComplexity(summary);
  if (complexity === "High") return "1-2 days";
  if (complexity === "Medium") return "2-4 hours";
  return "10-30 minutes";
}

function getPathReason(path: string): string {
  const normalized = path.toLowerCase();

  if (normalized.endsWith("readme.md")) return "confirm the product promise, setup path, and public usage";
  if (normalized.endsWith("package.json")) return "review scripts, dependencies, and runtime entry points";
  if (normalized.includes("/test") || normalized.includes(".test.") || normalized.includes(".spec.")) {
    return "learn expected behavior from executable examples";
  }
  if (normalized.endsWith("index.ts") || normalized.endsWith("index.js")) {
    return "inspect main exports and bootstrapping flow";
  }
  if (normalized.includes("config")) return "understand runtime, build, or integration settings";
  if (normalized.includes("controller") || normalized.includes("route")) return "trace how requests enter the application";
  if (normalized.includes("service")) return "inspect the business behavior behind request handlers";
  if (normalized.includes("model") || normalized.includes("schema") || normalized.includes("db")) {
    return "understand the data shape and persistence boundary";
  }
  if (normalized.includes("app/") || normalized.includes("src/")) return "inspect the core implementation path";
  return "high-signal file from the analysis";
}

function getBusinessPurpose(summary: DocsSummaryResponse): string {
  const purpose = summary.understanding.purpose || summary.overview.text;
  const features = summary.understanding.coreFeatures.slice(0, 3);
  const featureText = features.length
    ? ` The main user-facing capabilities appear to be ${features.join(", ")}.`
    : "";

  return `${purpose}${featureText}`;
}

function isLikelyEntryPoint(path: string): boolean {
  const normalized = path.toLowerCase();
  return (
    normalized.endsWith("readme.md") ||
    normalized.endsWith("package.json") ||
    normalized.endsWith("src/index.ts") ||
    normalized.endsWith("src/index.js") ||
    normalized.endsWith("app/page.tsx") ||
    normalized.endsWith("main.ts") ||
    normalized.endsWith("main.js")
  );
}

function getBreadcrumbParts(path: string): string[] {
  return path.split("/").filter(Boolean);
}

function buildStartHereItems(summary: DocsSummaryResponse | null) {
  const candidates = summary?.architecture.importantPaths.map((item) => item.path) ?? [];
  const preferred = [
    "README.md",
    "package.json",
    "src/index.ts",
    "src/index.js",
    "app/page.tsx",
    "app/main.ts",
  ];

  const ordered = [
    ...preferred.filter((path) =>
      candidates.some((candidate) => candidate.toLowerCase() === path.toLowerCase()),
    ),
    ...candidates,
  ];

  return [...new Set(ordered)].slice(0, 5).map((path) => ({
    path,
    reason: getPathReason(path),
  }));
}

function buildKeyFileItems(summary: DocsSummaryResponse | null) {
  return (summary?.architecture.importantPaths ?? []).slice(0, 5).map((item) => ({
    path: item.path,
    reason: getPathReason(item.path),
  }));
}

function buildSeniorRepoExplanation(summary: DocsSummaryResponse | null): string {
  if (!summary) return "";
  const start = buildStartHereItems(summary);
  const entryPoint = start.find((item) => isLikelyEntryPoint(item.path))?.path ?? start[0]?.path;
  const languages = summary.repository.detectedLanguages.join(", ") || "the detected source files";
  const frameworks = summary.repository.detectedFrameworks.join(", ");
  const testSignal = summary.architecture.testFileCount
    ? `Testing signals are present in ${summary.architecture.testFileCount} file${
        summary.architecture.testFileCount === 1 ? "" : "s"
      }, so new contributors can learn expected behavior from examples.`
    : "Testing signals are light, so new contributors should rely on the README, entry points, and source flow first.";

  return `${getBusinessPurpose(summary)} In practical terms, this looks like a ${inferComplexity(
    summary,
  ).toLowerCase()} ${inferProjectType(summary).toLowerCase()} built around ${languages}${
    frameworks ? ` with ${frameworks}` : ""
  }. A new developer should start with ${start[0]?.path ?? "the README"}, then review ${
    start[1]?.path ?? "the package metadata"
  }${entryPoint ? `, and then inspect ${entryPoint} as the main implementation anchor` : ""}. ${testSignal} Estimated onboarding time is ${estimateOnboarding(summary)}.`;
}

function getFileRole(path: string): string {
  return getFileRoleLabel(path);
}

function getFileRoleLabel(path: string): string {
  const normalized = path.toLowerCase();
  if (normalized.endsWith("readme.md")) return "Documentation";
  if (normalized.endsWith("package.json")) return "Package Manifest";
  if (normalized.includes(".env")) return "Environment Config";
  if (normalized.includes(".test.") || normalized.includes(".spec.") || normalized.includes("/test")) {
    return "Test";
  }
  if (/(^|\/)(app|server|main|index)\.[cm]?[jt]sx?$/.test(normalized)) {
    return "Entry Point";
  }
  if (normalized.includes("controller")) return "Controller";
  if (normalized.includes("service")) return "Service";
  if (normalized.includes("route") || normalized.includes("router")) return "Route";
  if (normalized.includes("middleware") || normalized.includes("guard")) return "Middleware";
  if (normalized.includes("model") || normalized.includes("schema")) return "Model";
  if (normalized.includes("validator") || normalized.includes("validation")) return "Validator";
  if (normalized.includes("drizzle") || normalized.includes("prisma") || normalized.includes("database") || normalized.includes("/db")) return "Database";
  if (normalized.includes("config")) return "Config";
  if (normalized.includes("view") || normalized.includes("page") || normalized.includes("component")) return "View";
  if (normalized.includes("util") || normalized.includes("helper") || normalized.includes("lib")) return "Utility";
  return "Unknown";
}

function getFileRolePurpose(role: string): string {
  const purposes: Record<string, string> = {
    Controller: "handles incoming requests and coordinates responses.",
    Service: "contains business logic and orchestration for a feature.",
    Route: "maps URLs or API endpoints to controllers and middleware.",
    Middleware: "runs cross-cutting request logic such as auth, validation, or protection.",
    Model: "defines data shape and persistence concepts.",
    Validator: "checks request input before it reaches business logic.",
    Database: "configures persistence, schemas, or data access.",
    Config: "controls runtime behavior and integration settings.",
    Test: "documents expected behavior through executable checks.",
    Documentation: "explains project purpose, setup, and usage.",
    "Package Manifest": "defines scripts, dependencies, and package metadata.",
    "Entry Point": "boots the application and wires top-level modules together.",
    View: "defines user-facing screens or UI components.",
    Utility: "provides shared helpers used by other modules.",
    "Environment Config": "documents required runtime environment values.",
  };

  return purposes[role] ?? "contains implementation details for this part of the repository.";
}

function buildFileMatterSummary(path: string, symbols: RepositorySymbol[]) {
  const role = getFileRoleLabel(path);
  const importantSymbols = symbols.slice(0, 3).map((symbol) => symbol.name);
  const normalized = path.toLowerCase();
  const relatedFileCount = buildRelatedFileCandidates(path, symbols).length;
  const suggestedNext = normalized.endsWith("readme.md")
    ? "package.json"
    : normalized.endsWith("package.json")
      ? "README.md or the main source entry point"
      : normalized.includes(".test.") || normalized.includes(".spec.")
        ? "the source file covered by this test"
        : role === "Controller" || role === "Route"
          ? "the service, middleware, or validator that handles the request"
          : role === "Service"
            ? "the controller that calls it, then the data layer it depends on"
            : role === "Database" || role === "Model"
              ? "the service or route that reads and writes this data"
              : "the next file in the Repository Guide reading order";

  return {
    role,
    purpose: `${path} ${getFileRolePurpose(role)}`,
    whyRead: importantSymbols.length
      ? `It contains ${importantSymbols.join(", ")}, which makes it a useful anchor for understanding behavior in this part of the repository.`
      : relatedFileCount
        ? `It connects to ${relatedFileCount} nearby file${relatedFileCount === 1 ? "" : "s"}, so it can help trace the local implementation path.`
        : "It is a good place to inspect source flow, naming, and local implementation patterns.",
    suggestedNext,
  };
}

function getReadingOrderMatch(
  summary: DocsSummaryResponse | null,
  path: string,
): { file: string; reason: string } | null {
  return (
    summary?.understanding.readingOrder.find(
      (item) => item.file.toLowerCase() === path.toLowerCase(),
    ) ?? null
  );
}

function getNextReadingOrderItem(
  summary: DocsSummaryResponse | null,
  path: string,
): { file: string; reason: string } | null {
  const readingOrder = summary?.understanding.readingOrder ?? [];
  const currentIndex = readingOrder.findIndex(
    (item) => item.file.toLowerCase() === path.toLowerCase(),
  );

  if (currentIndex >= 0) return readingOrder[currentIndex + 1] ?? null;
  return readingOrder[0] ?? null;
}

function buildSuggestedFileItems(
  selectedPath: string,
  relatedFiles: string[],
  fileMatter: ReturnType<typeof buildFileMatterSummary> | null,
  summary: DocsSummaryResponse | null,
) {
  const nextReadingItem = getNextReadingOrderItem(summary, selectedPath);
  const items = [
    ...(nextReadingItem
      ? [
          {
            path: nextReadingItem.file,
            reason: `Next in the Repository Guide: ${nextReadingItem.reason}`,
          },
        ]
      : []),
    ...relatedFiles.map((path) => ({
      path,
      reason: getPathReason(path),
    })),
    ...(fileMatter?.suggestedNext && !fileMatter.suggestedNext.includes(" or ")
      ? [
          {
            path: fileMatter.suggestedNext,
            reason: "Suggested by the selected file role.",
          },
        ]
      : []),
  ];
  const seen = new Set<string>();

  return items
    .filter((item) => item.path && item.path !== selectedPath)
    .filter((item) => {
      const key = item.path.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 5);
}

function splitIdentifierLabel(value: string): string {
  return value
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase();
}

function buildFileSummaryText(path: string, role: string, symbols: RepositorySymbol[]) {
  const name = path.split("/").pop() ?? path;
  const symbolNames = symbols.slice(0, 3).map((symbol) => symbol.name);
  const symbolText = symbolNames.length
    ? ` It exposes or contains ${symbolNames.join(", ")}.`
    : "";
  const nextHint =
    role === "Controller"
      ? "Read the matching route first if you want to see how requests enter this file, then read the service it calls."
      : role === "Service"
        ? "Read the controller that calls it next, then inspect the database or model layer it depends on."
        : role === "Route"
          ? "Read this before the controller so the request path and middleware order are clear."
          : role === "Database" || role === "Model"
            ? "Read this to understand what data exists and how other modules persist or query it."
            : "Use the related files below to continue following the implementation.";

  return `${name} ${getFileRolePurpose(role)} A developer should read this file to understand ${splitIdentifierLabel(
    name,
  )} and how this part of the repository connects to nearby ${
    role === "Controller" ? "routes and services" : role === "Service" ? "controllers and persistence code" : "implementation modules"
  }.${symbolText} ${nextHint}`;
}

function buildFileResponsibilities(path: string, role: string, symbols: RepositorySymbol[]) {
  const normalized = path.toLowerCase();
  const responsibilities = new Set<string>();

  if (role === "Controller") {
    responsibilities.add("Handles incoming HTTP requests");
    responsibilities.add("Reads request parameters and payload values");
    responsibilities.add("Delegates business work to services");
    responsibilities.add("Returns responses to callers");
  }
  if (role === "Service") {
    responsibilities.add("Coordinates feature-level business logic");
    responsibilities.add("Calls database, model, or helper functions");
    responsibilities.add("Returns reusable results to controllers");
  }
  if (role === "Route") {
    responsibilities.add("Defines route paths and HTTP handlers");
    responsibilities.add("Connects middleware to controllers");
  }
  if (role === "Middleware") {
    responsibilities.add("Processes requests before handlers run");
    responsibilities.add("Protects routes or enriches request context");
  }
  if (role === "Validator") responsibilities.add("Validates request input shape");
  if (role === "Database" || role === "Model") responsibilities.add("Defines persistence and data shape");
  if (/auth|login|session|token|oauth/.test(normalized)) responsibilities.add("Supports authentication or session flow");
  if (/short|url|link|redirect|slug/.test(normalized)) responsibilities.add("Supports link creation or redirect behavior");

  symbols.slice(0, 3).forEach((symbol) =>
    responsibilities.add(`${getSymbolKindMeta(symbol.kind).plural} include ${symbol.name}`),
  );

  return [...responsibilities].slice(0, 6);
}

function extractImportsFromSnippet(snippet: string) {
  const imports = new Set<string>();
  const importPattern = /import\s+[^'"]*from\s+['"]([^'"]+)['"]/g;
  const bareImportPattern = /import\s+['"]([^'"]+)['"]/g;
  const requirePattern = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const pattern of [importPattern, bareImportPattern, requirePattern]) {
    for (const match of snippet.matchAll(pattern)) {
      if (match[1]) imports.add(match[1]);
    }
  }
  return [...imports].slice(0, 8);
}

function extractExportsFromSnippet(snippet: string, symbols: RepositorySymbol[]) {
  const exports = new Set<string>();
  symbols
    .filter((symbol) => symbol.visibility === "exported")
    .forEach((symbol) => exports.add(symbol.name));
  for (const match of snippet.matchAll(/export\s+(?:const|let|var|function|class)\s+([A-Za-z0-9_$]+)/g)) {
    if (match[1]) exports.add(match[1]);
  }
  return [...exports].slice(0, 8);
}

function buildCallNames(symbols: RepositorySymbol[]) {
  const calls = new Set<string>();
  symbols.forEach((symbol) => {
    symbol.outgoingCalls.forEach((call) => calls.add(call.symbol.name));
    symbol.outgoingReferences.forEach((reference) => calls.add(reference.symbol.name));
  });
  return [...calls].slice(0, 8);
}

function isDocsOrConfigPath(path: string) {
  const normalized = path.toLowerCase();
  const fileName = normalized.split("/").pop() ?? normalized;
  return (
    /^readme(\.|$)/i.test(fileName) ||
    /\.(md|mdx|txt|ya?ml|json)$/i.test(fileName) ||
    fileName === ".env.example" ||
    fileName.includes("license") ||
    fileName.includes("contributing")
  );
}

function buildRelatedFileCandidates(
  path: string,
  symbols: RepositorySymbol[],
  fallbackPaths: string[] = [],
) {
  const files = new Set<string>();
  const fileName = path.split("/").pop() ?? path;
  const stem = fileName
    .replace(/\.(controller|service|routes?|router|validator|model|schema|middleware)\b/i, "")
    .replace(/\.[^.]+$/, "");
  const extension = fileName.endsWith(".ts") ? "ts" : fileName.endsWith(".tsx") ? "tsx" : "js";

  symbols.forEach((symbol) => {
    symbol.outgoingCalls.forEach((call) => files.add(call.symbol.filePath));
    symbol.outgoingReferences.forEach((reference) => files.add(reference.symbol.filePath));
    symbol.incomingReferences.forEach((reference) => files.add(reference.symbol.filePath));
  });

  if (isDocsOrConfigPath(path)) {
    fallbackPaths.forEach((candidate) => {
      if (candidate !== path) files.add(candidate);
    });
  } else {
    [
      `routes/${stem}.routes.${extension}`,
      `controllers/${stem}.controller.${extension}`,
      `services/${stem}.services.${extension}`,
      `services/${stem}.service.${extension}`,
      `validators/${stem}.validator.${extension}`,
      `models/${stem}.model.${extension}`,
      `schema/${stem}.schema.${extension}`,
      `data/${stem}.json`,
    ].forEach((candidate) => {
      if (candidate !== path) files.add(candidate);
    });
  }

  files.delete(path);
  return [...files].slice(0, 6);
}

function buildFileFlow(path: string, role: string) {
  const fileName = path.split("/").pop() ?? path;
  if (["Controller", "Route", "Service"].includes(role)) {
    if (role === "Route") return [fileName, "middleware", "controller", "service", "database"];
    if (role === "Controller") return ["route", fileName, "service", "database/model"];
    return ["controller", fileName, "database/model", "response"];
  }
  if (role === "Middleware") return ["request", fileName, "route/controller"];
  if (role === "Validator") return ["request payload", fileName, "controller"];
  return ["developer opens file", fileName, "nearby related modules"];
}

function dedupeCitations(citations: DevlensCitation[]): DevlensCitation[] {
  const seen = new Set<string>();
  return citations.filter((citation) => {
    const key = `${citation.path}:${citation.startLine ?? "file"}:${citation.endLine ?? "file"}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildPathCitation(path: string, reason?: string): DevlensCitation {
  return {
    path,
    label: path,
    reason: reason ?? getPathReason(path),
  };
}

function buildSearchCitation(result: SearchResult): DevlensCitation {
  return {
    path: result.path,
    label: result.symbol
      ? `${result.symbol.name} in ${result.path}`
      : result.path,
    reason: getSearchResultPurpose(result),
    startLine: result.startLine,
    endLine: result.endLine,
  };
}

function buildSymbolCitation(
  symbol: RepositorySymbol | DocsSummarySymbol,
): DevlensCitation {
  return {
    path: symbol.filePath,
    label: `${symbol.name} in ${symbol.filePath}`,
    reason: getSymbolPurpose(symbol),
    startLine: symbol.startLine,
    endLine: symbol.endLine,
  };
}

function formatCitationPath(citation: DevlensCitation): string {
  return citation.startLine && citation.endLine
    ? `${citation.path} (${formatCompactLineRange({
        startLine: citation.startLine,
        endLine: citation.endLine,
      })})`
    : citation.path;
}

function buildReadingOrderCitations(
  summary: DocsSummaryResponse,
): DevlensCitation[] {
  return summary.understanding.readingOrder.slice(0, 5).map((item) =>
    buildPathCitation(
      item.file,
      item.reason || getPathReason(item.file),
    ),
  );
}

function buildReadingOrderFallbackPaths(summary: DocsSummaryResponse | null) {
  return summary ? buildReadingOrderCitations(summary).map((citation) => citation.path) : [];
}

function buildSearchTrail(results: SearchResult[]): string {
  return results
    .slice(0, 4)
    .map((result, index) => `${index + 1}. ${result.path} (${formatCompactLineRange(result)})`)
    .join(" ");
}

function getCitationPath(path: string, citations: DevlensCitation[]) {
  return citations.find((citation) => citation.path === path);
}

function buildSelectedFileCitation(
  selectedNode: ExplorerNode | null,
  source: FileSourceResponse | null,
): DevlensCitation | null {
  if (selectedNode?.kind !== "file") return null;

  return {
    path: selectedNode.path,
    label: selectedNode.path,
    reason: `${getFileRoleLabel(selectedNode.path)} file currently selected in Files.`,
    startLine: source?.file.previewStartLine ?? undefined,
    endLine: source?.file.previewEndLine ?? undefined,
  };
}

function buildInvestigationRisks(summary: DocsSummaryResponse): string[] {
  const risks: string[] = [];

  if (!summary.architecture.testFileCount) {
    risks.push("No test files were detected; verify behavior through request flow, examples, and important source paths.");
  }
  if (summary.architecture.generatedFileCount) {
    risks.push(`${summary.architecture.generatedFileCount} generated file${summary.architecture.generatedFileCount === 1 ? "" : "s"} may add noise; prioritize hand-written implementation files.`);
  }
  if (!summary.repository.detectedFrameworks.length) {
    risks.push("No framework signal was detected; confirm the real boot file before assuming request or app flow.");
  }
  if (!summary.understanding.readingOrder.length) {
    risks.push("The reading order is sparse; use important files and search results as the onboarding trail.");
  }

  return risks.slice(0, 3);
}

function buildConnectionLabels(
  selectedNode: ExplorerNode | null,
  symbols: RepositorySymbol[],
  summary: DocsSummaryResponse,
) {
  const labels = new Set<string>();

  if (selectedNode?.kind === "file") {
    symbols.slice(0, 3).forEach((symbol) =>
      labels.add(`${symbol.name} (${getSymbolKindMeta(symbol.kind).singular})`),
    );
    buildRelatedFileCandidates(
      selectedNode.path,
      symbols,
      buildReadingOrderFallbackPaths(summary),
    )
      .slice(0, 2)
      .forEach((path) => labels.add(path));
  }

  if (!labels.size) {
    summary.symbols.mostConnected
      .slice(0, 3)
      .forEach((symbol) => labels.add(`${symbol.name} in ${symbol.filePath}`));
  }

  return [...labels].slice(0, 5);
}

function buildGuidedInvestigation({
  summary,
  selectedNode,
  selectedFileSource,
  selectedFileSymbols,
  inspectedFilePaths,
}: {
  summary: DocsSummaryResponse | null;
  selectedNode: ExplorerNode | null;
  selectedFileSource: FileSourceResponse | null;
  selectedFileSymbols: RepositorySymbol[];
  inspectedFilePaths: string[];
}): GuidedInvestigation | null {
  if (!summary) return null;

  const readingOrder = buildReadingOrderCitations(summary);
  const startHere = buildStartHereItems(summary).map((item) =>
    buildPathCitation(item.path, item.reason),
  );
  const selectedCitation = buildSelectedFileCitation(selectedNode, selectedFileSource);
  const inspected = new Set(inspectedFilePaths);
  const nextFromReadingOrder =
    readingOrder.find((citation) => !inspected.has(citation.path)) ??
    startHere.find((citation) => !inspected.has(citation.path)) ??
    readingOrder[0] ??
    startHere[0] ??
    null;
  const bestNextFile = nextFromReadingOrder ?? selectedCitation;
  const selectedRole =
    selectedNode?.kind === "file" ? getFileRoleLabel(selectedNode.path) : null;
  const selectedMatter =
    selectedNode?.kind === "file"
      ? buildFileMatterSummary(selectedNode.path, selectedFileSymbols)
      : null;
  const inspectAfter = dedupeCitations([
    ...(selectedCitation ? [selectedCitation] : []),
    ...(selectedNode?.kind === "file"
      ? buildRelatedFileCandidates(
          selectedNode.path,
          selectedFileSymbols,
          readingOrder.map((citation) => citation.path),
        )
          .map((path) => getCitationPath(path, readingOrder) ?? buildPathCitation(path))
      : []),
    ...readingOrder,
    ...summary.symbols.mostConnected.slice(0, 2).map(buildSymbolCitation),
  ])
    .filter((citation) => citation.path !== bestNextFile?.path)
    .slice(0, 3);

  const findings = [
    getBusinessPurpose(summary),
    `${summary.repository.name} is currently identified as ${inferProjectType(summary)}.`,
    summary.architecture.testFileCount
      ? `${summary.architecture.testFileCount} test file${summary.architecture.testFileCount === 1 ? "" : "s"} can help confirm expected behavior.`
      : "Testing signals are light in the analyzed files.",
  ].slice(0, 3);
  const risks = buildInvestigationRisks(summary);
  const connections = buildConnectionLabels(selectedNode, selectedFileSymbols, summary);
  const bestFileLabel = bestNextFile?.path ?? "the Repository Guide";

  return {
    status: selectedNode?.kind === "file"
      ? `${selectedNode.name} is selected; continue with the Guide's next recommended file.`
      : "Start with the recommended reading order from the Repository Guide.",
    bestNextFile,
    whyItMatters: selectedMatter
      ? bestNextFile?.path === selectedNode?.path
        ? `${selectedMatter.purpose} ${selectedMatter.whyRead}`
        : `${bestNextFile?.reason ?? selectedMatter.suggestedNext} This keeps the investigation aligned with the Guide before diving deeper from the selected file.`
      : bestNextFile
        ? bestNextFile.reason
        : "Use the Guide and Search to choose the first source anchor.",
    connections,
    inspectAfter,
    findings,
    risks,
    followUps: selectedNode?.kind === "file"
      ? [
          "Explain selected file",
          "What should I inspect next?",
          `Search ${selectedNode.name.replace(/\.[^.]+$/, "")}`,
        ]
      : [
          "Where should I start?",
          "What are the most important files?",
          "Show request flow",
        ],
    summary: inspectedFilePaths.length
      ? `Inspected ${inspectedFilePaths.length} file${inspectedFilePaths.length === 1 ? "" : "s"}. Next recommended anchor: ${bestFileLabel}.`
      : `No files opened from guidance yet. Start with ${bestFileLabel}.`,
  };
}

function getWalkthroughPath(summary: DocsSummaryResponse | null): DevlensCitation[] {
  if (!summary) return [];
  const readingOrder = buildReadingOrderCitations(summary);
  if (readingOrder.length) return readingOrder;

  return buildStartHereItems(summary)
    .slice(0, 5)
    .map((item) => buildPathCitation(item.path, item.reason));
}

function buildWalkthroughSummary(
  summary: DocsSummaryResponse | null,
  state: WalkthroughState,
): WalkthroughSummary | null {
  const path = getWalkthroughPath(summary);
  if (!summary || !path.length) return null;

  const completed = new Set(state.completedFiles);
  const skipped = new Set(state.skippedFiles);
  const activeStep =
    state.activeStepPath && !state.isComplete
      ? path.find((citation) => citation.path === state.activeStepPath) ?? null
      : null;
  const current =
    activeStep ??
    path.find(
      (citation) =>
        !completed.has(citation.path) && !skipped.has(citation.path),
    ) ??
    path[0] ??
    null;
  const currentIndex = current
    ? path.findIndex((citation) => citation.path === current.path)
    : -1;
  const next =
    currentIndex >= 0
      ? path
          .slice(currentIndex + 1)
          .find(
            (citation) =>
              !completed.has(citation.path) && !skipped.has(citation.path),
          ) ?? null
      : null;
  const remainingCount = path.filter(
    (citation) =>
      !completed.has(citation.path) && !skipped.has(citation.path),
  ).length;
  const completedCount = path.filter((citation) =>
    completed.has(citation.path),
  ).length;
  const skippedCount = path.filter((citation) =>
    skipped.has(citation.path),
  ).length;
  const isComplete =
    state.isComplete || Boolean(path.length && remainingCount === 0);

  return {
    path,
    current: isComplete ? null : current,
    next: isComplete ? null : next,
    completedCount,
    skippedCount,
    remainingCount: isComplete ? 0 : remainingCount,
    progressLabel: `${completedCount}/${path.length} files done`,
    risks: buildInvestigationRisks(summary),
    isComplete,
  };
}

function getWalkthroughCitationForPath(
  summary: DocsSummaryResponse,
  path: string,
): DevlensCitation {
  return (
    getWalkthroughPath(summary).find((citation) => citation.path === path) ??
    buildPathCitation(path)
  );
}

function buildPreviewCitation(
  path: string,
  source: FileSourceResponse | null,
  reason: string,
): DevlensCitation {
  return {
    path,
    label: path,
    reason,
    startLine: source?.file.previewStartLine ?? undefined,
    endLine: source?.file.previewEndLine ?? undefined,
  };
}

function buildWalkthroughNextCitations(
  summary: DocsSummaryResponse,
  currentPath: string,
  symbols: RepositorySymbol[],
): DevlensCitation[] {
  const nextReadingItem = getNextReadingOrderItem(summary, currentPath);
  const related = buildRelatedFileCandidates(
    currentPath,
    symbols,
    buildReadingOrderFallbackPaths(summary),
  ).map((path) => buildPathCitation(path, getPathReason(path)));
  const guideFallback = buildKeyFileItems(summary).map((item) =>
    buildPathCitation(item.path, item.reason),
  );

  return dedupeCitations([
    ...(nextReadingItem
      ? [
          buildPathCitation(
            nextReadingItem.file,
            `Next in the Repository Guide: ${nextReadingItem.reason}`,
          ),
        ]
      : []),
    ...related,
    ...guideFallback,
  ])
    .filter((citation) => citation.path !== currentPath)
    .slice(0, 4);
}

function buildWalkthroughEvidenceItems({
  summary,
  current,
  source,
  symbols,
  imports,
  exports,
  calls,
  relatedFiles,
}: {
  summary: DocsSummaryResponse | null;
  current: DevlensCitation | null;
  source: FileSourceResponse | null;
  symbols: RepositorySymbol[];
  imports: string[];
  exports: string[];
  calls: string[];
  relatedFiles: string[];
}): WalkthroughEvidenceItem[] {
  if (!summary || !current) return [];

  const items: WalkthroughEvidenceItem[] = [];
  const currentPath = current.path;
  const sourceCitation = buildPreviewCitation(
    currentPath,
    source,
    current.reason,
  );
  const nextCitations = buildWalkthroughNextCitations(
    summary,
    currentPath,
    symbols,
  );

  items.push({
    label: "Why this file",
    detail: current.reason || getPathReason(currentPath),
    citation: sourceCitation,
    priority: "high",
  });

  if (source?.file.previewStartLine && source.file.previewEndLine) {
    items.push({
      label: "Source range",
      detail: `Start with ${formatCompactLineRange({
        startLine: source.file.previewStartLine,
        endLine: source.file.previewEndLine,
      })}; scan the visible setup, branching, and handoff points before moving on.`,
      citation: sourceCitation,
      priority: "high",
    });
  } else {
    items.push({
      label: "Source preview",
      detail: "No source preview is open yet; open this file before marking the walkthrough step done.",
      citation: current,
      priority: "medium",
    });
  }

  if (imports.length) {
    items.push({
      label: "Imports to check",
      detail: `Notice ${imports.slice(0, 3).join(", ")}; these usually reveal framework, shared helper, or data dependencies.`,
      citation: sourceCitation,
      priority: "medium",
    });
  }

  if (exports.length) {
    items.push({
      label: "Exports to understand",
      detail: `Review ${exports.slice(0, 3).join(", ")}; exported names are the contract other files are likely to use.`,
      citation: sourceCitation,
      priority: "high",
    });
  }

  if (calls.length || symbols.length) {
    const symbolCitations = symbols.slice(0, 2).map(buildSymbolCitation);
    items.push({
      label: "Connected behavior",
      detail: calls.length
        ? `Follow calls or references such as ${calls.slice(0, 3).join(", ")} to see what this file depends on.`
        : `Inspect ${symbols
            .slice(0, 3)
            .map((symbol) => symbol.name)
            .join(", ")} as the important code details in this file.`,
      citation: symbolCitations[0] ?? sourceCitation,
      priority: "high",
    });
  } else {
    items.push({
      label: "Uncertainty",
      detail: "No connected symbols were found for this file yet; verify behavior through the source preview and related paths.",
      citation: sourceCitation,
      priority: "medium",
    });
  }

  const nextTarget =
    nextCitations[0] ??
    (relatedFiles[0]
      ? buildPathCitation(relatedFiles[0], getPathReason(relatedFiles[0]))
      : null);
  if (nextTarget) {
    items.push({
      label: "Open next",
      detail: `${nextTarget.path} is the next useful follow-up because ${nextTarget.reason}.`,
      citation: nextTarget,
      priority: "medium",
    });
  }

  return items.slice(0, 6);
}

function formatWalkthroughEvidenceForAnswer(items: WalkthroughEvidenceItem[]) {
  if (!items.length) {
    return "Open the current walkthrough file, read the visible source range, then follow the next cited file.";
  }

  return items
    .slice(0, 4)
    .map((item, index) => `${index + 1}. ${item.label}: ${item.detail}`)
    .join(" ");
}

function isRiskRelatedPath(path: string): boolean {
  return /auth|config|env|database|db|route|router|service|test|spec|security|token|session/i.test(
    path,
  );
}

function getWalkthroughCitationByPath(
  summary: DocsSummaryResponse,
  path: string,
): DevlensCitation {
  return getWalkthroughCitationForPath(summary, path);
}

function buildNextDeepDiveCitation(
  summary: DocsSummaryResponse,
  state: WalkthroughState,
  inspectedFilePaths: string[],
): { citation: DevlensCitation | null; reason: string } {
  const alreadySeen = new Set([
    ...state.completedFiles,
    ...state.skippedFiles,
    ...inspectedFilePaths,
  ]);
  const connected = summary.symbols.mostConnected
    .map(buildSymbolCitation)
    .filter((citation) => !alreadySeen.has(citation.path));
  const guideFiles = buildKeyFileItems(summary)
    .map((item) => buildPathCitation(item.path, item.reason))
    .filter((citation) => !alreadySeen.has(citation.path));
  const riskRelated =
    [...connected, ...guideFiles].find((citation) =>
      isRiskRelatedPath(citation.path),
    ) ?? null;
  const citation =
    riskRelated ?? connected[0] ?? guideFiles[0] ?? connected[0] ?? null;

  if (!citation) {
    return {
      citation: state.lastOpenedCitation ?? null,
      reason:
        "No untouched high-signal file remains in the current walkthrough path; revisit the last cited file or use Search for a focused follow-up.",
    };
  }

  if (riskRelated?.path === citation.path) {
    return {
      citation,
      reason:
        "It looks risk-related or operationally important, so it is the best next verification target.",
    };
  }

  if (connected.some((item) => item.path === citation.path)) {
    return {
      citation,
      reason:
        "It has strong code connections and can reveal how the inspected files are used elsewhere.",
    };
  }

  return {
    citation,
    reason:
      "It is still important in the Repository Guide and has not been inspected in this walkthrough.",
  };
}

function buildWalkthroughHandoff(
  summary: DocsSummaryResponse,
  walkthrough: WalkthroughSummary,
  state: WalkthroughState,
  inspectedFilePaths: string[],
  guidedInvestigation: GuidedInvestigation | null,
): WalkthroughHandoff {
  const completed = state.completedFiles.map((path) =>
    getWalkthroughCitationByPath(summary, path),
  );
  const skipped = state.skippedFiles.map((path) =>
    getWalkthroughCitationByPath(summary, path),
  );
  const touchedFromFiles = inspectedFilePaths
    .filter(
      (path) =>
        !state.completedFiles.includes(path) && !state.skippedFiles.includes(path),
    )
    .map((path) => buildPathCitation(path, "Opened during repository investigation."));
  const { citation: nextDeepDive, reason: nextDeepDiveReason } =
    buildNextDeepDiveCitation(summary, state, inspectedFilePaths);
  const findings = [
    getBusinessPurpose(summary),
    `Architecture path: ${describeRepositoryArchitecture(summary)}`,
    ...(guidedInvestigation?.findings ?? []),
    walkthrough.progressLabel,
  ].slice(0, 5);
  const risks = [
    ...walkthrough.risks,
    ...(skipped.length
      ? [`${skipped.length} walkthrough file${skipped.length === 1 ? "" : "s"} skipped; revisit before treating onboarding as complete.`]
      : []),
    ...(walkthrough.remainingCount
      ? [`${walkthrough.remainingCount} walkthrough file${walkthrough.remainingCount === 1 ? "" : "s"} still left in the reading order.`]
      : []),
  ].slice(0, 5);

  return {
    projectSummary: getBusinessPurpose(summary),
    architecturePath: describeRepositoryArchitecture(summary),
    inspected: dedupeCitations([...completed, ...touchedFromFiles]).slice(0, 8),
    skipped: dedupeCitations(skipped).slice(0, 6),
    findings,
    risks,
    nextDeepDive,
    nextDeepDiveReason,
  };
}

function buildWalkthroughHandoffResponse(handoff: WalkthroughHandoff): DevlensResponse {
  const inspectedText = handoff.inspected.length
    ? handoff.inspected.map((citation) => citation.path).join(", ")
    : "No files marked done yet";
  const skippedText = handoff.skipped.length
    ? ` Skipped: ${handoff.skipped.map((citation) => citation.path).join(", ")}.`
    : "";
  const riskText = handoff.risks.length
    ? ` Still unknown: ${handoff.risks.join(" ")}`
    : " No major walkthrough risks are currently flagged.";
  const nextText = handoff.nextDeepDive
    ? ` Next deep dive: ${handoff.nextDeepDive.path} because ${handoff.nextDeepDiveReason}`
    : " Next deep dive: use Search to choose a focused follow-up.";

  return {
    answer: `Onboarding handoff: ${handoff.projectSummary} Architecture path: ${handoff.architecturePath} Inspected: ${inspectedText}.${skippedText}${riskText}${nextText}`,
    citations: dedupeCitations([
      ...handoff.inspected.slice(0, 4),
      ...handoff.skipped.slice(0, 2),
      ...(handoff.nextDeepDive ? [handoff.nextDeepDive] : []),
    ]).slice(0, 6),
  };
}

function formatRecapCitation(citation: DevlensCitation): string {
  return citation.startLine && citation.endLine
    ? `${citation.path} (${formatCompactLineRange({
        startLine: citation.startLine,
        endLine: citation.endLine,
      })})`
    : citation.path;
}

function formatRecapList(values: string[], fallback: string): string {
  return values.length ? values.map((value) => `- ${value}`).join("\n") : `- ${fallback}`;
}

function buildRepositoryRecapText(
  summary: DocsSummaryResponse,
  handoff: WalkthroughHandoff,
  walkthrough: WalkthroughSummary,
): string {
  const repositoryName = `${summary.repository.owner}/${summary.repository.name}`;
  const inspected = handoff.inspected.map(formatRecapCitation);
  const skipped = handoff.skipped.map(formatRecapCitation);
  const findings = handoff.findings.slice(0, 4);
  const risks = handoff.risks.slice(0, 4);
  const citedFiles = dedupeCitations([
    ...handoff.inspected,
    ...handoff.skipped,
    ...(handoff.nextDeepDive ? [handoff.nextDeepDive] : []),
  ]).map(formatRecapCitation);

  return [
    `# DevLens repository recap: ${repositoryName}`,
    "",
    `Purpose: ${handoff.projectSummary}`,
    "",
    `Architecture path: ${handoff.architecturePath}`,
    "",
    `Walkthrough progress: ${walkthrough.progressLabel}; ${walkthrough.remainingCount} remaining; ${walkthrough.skippedCount} skipped.`,
    "",
    "Inspected files:",
    formatRecapList(inspected, "No files marked done yet."),
    "",
    "Skipped files:",
    formatRecapList(skipped, "No skipped files."),
    "",
    "Important findings:",
    formatRecapList(findings, "No findings captured yet."),
    "",
    "Risks / unknowns:",
    formatRecapList(risks, "No major walkthrough risks are currently flagged."),
    "",
    "Recommended next deep dive:",
    handoff.nextDeepDive
      ? `- ${formatRecapCitation(handoff.nextDeepDive)}: ${handoff.nextDeepDiveReason}`
      : "- Use repository search to choose a focused follow-up.",
    "",
    "Cited files:",
    formatRecapList(citedFiles, "No cited files yet."),
  ].join("\n");
}

function buildRepositoryRecapResponse(
  summary: DocsSummaryResponse,
  handoff: WalkthroughHandoff,
  walkthrough: WalkthroughSummary,
): DevlensResponse {
  return {
    answer: `Shareable recap ready for ${summary.repository.owner}/${summary.repository.name}. It covers purpose, architecture path, inspected files, skipped files, risks, next deep dive, and cited files. Use Copy recap in the handoff area to put the formatted notes on your clipboard.`,
    citations: dedupeCitations([
      ...handoff.inspected.slice(0, 4),
      ...handoff.skipped.slice(0, 2),
      ...(handoff.nextDeepDive ? [handoff.nextDeepDive] : []),
    ]).slice(0, 6),
  };
}

function buildWalkthroughStepResponse(
  summary: DocsSummaryResponse,
  walkthrough: WalkthroughSummary,
  selectedNode: ExplorerNode | null,
  selectedFileSymbols: RepositorySymbol[],
  selectedFileSource: FileSourceResponse | null,
): DevlensResponse {
  if (walkthrough.isComplete) {
    const inspected = walkthrough.path
      .filter((citation) => walkthrough.completedCount || walkthrough.skippedCount)
      .slice(0, 5);
    const risks = walkthrough.risks.length
      ? ` Key open questions: ${walkthrough.risks.join(" ")}`
      : "";

    return {
      answer: `Walkthrough complete. ${getBusinessPurpose(
        summary,
      )} The main architecture path is: ${describeRepositoryArchitecture(
        summary,
      )} You reviewed ${walkthrough.completedCount} file${
        walkthrough.completedCount === 1 ? "" : "s"
      } and skipped ${walkthrough.skippedCount}. Recommended next deep dive: ${
        summary.symbols.mostConnected[0]?.filePath ??
        walkthrough.path[0]?.path ??
        "Search important files"
      }.${risks}`,
      citations: dedupeCitations([
        ...inspected,
        ...summary.symbols.mostConnected.slice(0, 2).map(buildSymbolCitation),
      ]).slice(0, 5),
    };
  }

  const current = walkthrough.current;
  if (!current) {
    return {
      answer:
        "The Repository Guide does not have enough reading-order files yet. Use Search and the file tree to choose a first source anchor.",
      citations: [],
    };
  }

  const selectedMatchesCurrent =
    selectedNode?.kind === "file" && selectedNode.path === current.path;
  const fileMatter = selectedMatchesCurrent
    ? buildFileMatterSummary(current.path, selectedFileSymbols)
    : null;
  const sourceSnippet = selectedMatchesCurrent
    ? getFileSourceSnippet(selectedFileSource)
    : "";
  const evidenceItems = selectedMatchesCurrent
    ? buildWalkthroughEvidenceItems({
        summary,
        current,
        source: selectedFileSource,
        symbols: selectedFileSymbols,
        imports: extractImportsFromSnippet(sourceSnippet),
        exports: extractExportsFromSnippet(sourceSnippet, selectedFileSymbols),
        calls: buildCallNames(selectedFileSymbols),
        relatedFiles: buildRelatedFileCandidates(
          current.path,
          selectedFileSymbols,
          buildReadingOrderFallbackPaths(summary),
        ),
      })
    : [];
  const lookFor = fileMatter
    ? `${fileMatter.purpose} ${fileMatter.whyRead}`
    : `${current.path} is next because ${current.reason}. Look for the entry point, exported behavior, important configuration, and any nearby files it points toward.`;
  const nextText = walkthrough.next
    ? ` After this, continue to ${walkthrough.next.path} because ${walkthrough.next.reason}.`
    : " This is the last file in the current walkthrough path.";

  return {
    answer: `Walkthrough step: open ${current.path}. ${lookFor} Evidence checklist: ${formatWalkthroughEvidenceForAnswer(
      evidenceItems,
    )}${nextText}`,
    citations: dedupeCitations([
      current,
      ...evidenceItems.map((item) => item.citation),
      ...(selectedMatchesCurrent
        ? selectedFileSymbols.slice(0, 3).map(buildSymbolCitation)
        : []),
      ...(walkthrough.next ? [walkthrough.next] : []),
    ]).slice(0, 5),
  };
}

function buildWalkthroughProgressResponse(
  summary: DocsSummaryResponse,
  walkthrough: WalkthroughSummary,
  state: WalkthroughState,
): DevlensResponse {
  if (walkthrough.isComplete) {
    return buildWalkthroughStepResponse(summary, walkthrough, null, [], null);
  }

  const current = walkthrough.current;
  const next = walkthrough.next;
  const risks = walkthrough.risks.length
    ? ` Watch-outs: ${walkthrough.risks.join(" ")}`
    : "";

  return {
    answer: `Walkthrough progress: ${walkthrough.progressLabel}, ${
      walkthrough.remainingCount
    } remaining, ${walkthrough.skippedCount} skipped. Current file: ${
      current?.path ?? "none"
    }. Next file: ${next?.path ?? "none"}.${risks}`,
    citations: dedupeCitations([
      ...(current ? [current] : []),
      ...(next ? [next] : []),
      ...(state.lastOpenedCitation ? [state.lastOpenedCitation] : []),
    ]),
  };
}

type TechnicalOverviewItem = {
  icon: typeof Workflow;
  label: string;
  value: string;
  description: string;
};

type CoreComponent = {
  name: string;
  purpose: string;
  fileCount: number;
  importance: "High" | "Medium" | "Low";
  representativePath?: string;
};

function getFrameworkByPattern(
  frameworks: string[],
  pattern: RegExp,
  fallback: string,
): string {
  return frameworks.find((framework) => pattern.test(framework)) ?? fallback;
}

function detectDatabase(summary: DocsSummaryResponse): string {
  const frameworks = summary.repository.detectedFrameworks;
  const paths = summary.architecture.importantPaths.map((item) => item.path);
  const source = [...frameworks, ...paths].join(" ").toLowerCase();

  if (/postgres|pg|prisma/.test(source)) return "Postgres / Prisma";
  if (/mysql|mariadb|drizzle/.test(source)) return "MySQL / Drizzle";
  if (/sqlite/.test(source)) return "SQLite";
  if (/mongo|mongoose/.test(source)) return "MongoDB";
  if (/redis/.test(source)) return "Redis";
  return "Not detected";
}

function detectAuthentication(summary: DocsSummaryResponse): string {
  const paths = summary.architecture.importantPaths.map((item) => item.path);
  const symbols = [
    ...summary.symbols.exported,
    ...summary.symbols.mostConnected,
  ].map((symbol) => `${symbol.name} ${symbol.filePath}`);
  const source = [...paths, ...symbols].join(" ").toLowerCase();

  if (/oauth|openid|passport/.test(source)) return "OAuth signal";
  if (/jwt|token|session|auth|login/.test(source)) return "Auth signal";
  return "Not detected";
}

function getEntryPoint(summary: DocsSummaryResponse): string {
  return (
    buildStartHereItems(summary).find((item) => isLikelyEntryPoint(item.path))
      ?.path ??
    buildStartHereItems(summary)[0]?.path ??
    "Pending"
  );
}

function buildTechnicalOverviewItems(
  summary: DocsSummaryResponse,
): TechnicalOverviewItem[] {
  const frameworks = summary.repository.detectedFrameworks;

  return [
    {
      icon: Workflow,
      label: "Architecture",
      value: inferProjectType(summary),
      description: describeRepositoryArchitecture(summary),
    },
    {
      icon: Braces,
      label: "Backend Framework",
      value: getFrameworkByPattern(
        frameworks,
        /nest|express|fastify|hono|koa|django|fastapi|rails|spring/i,
        frameworks[0] ?? "Not detected",
      ),
      description: "Primary server or application framework signal.",
    },
    {
      icon: devlensIcons.engineering.database,
      label: "Database",
      value: detectDatabase(summary),
      description: "Detected persistence or data-layer technology.",
    },
    {
      icon: CheckCircle2,
      label: "Authentication",
      value: detectAuthentication(summary),
      description: "Auth-related files, symbols, or dependency signals.",
    },
    {
      icon: devlensIcons.engineering.tests,
      label: "Testing",
      value: summary.architecture.testFileCount ? "Present" : "Light",
      description: summary.architecture.testFileCount
        ? `${summary.architecture.testFileCount} test file${
            summary.architecture.testFileCount === 1 ? "" : "s"
          } detected.`
        : "Few test signals detected in analyzed paths.",
    },
    {
      icon: devlensIcons.metrics.complexity,
      label: "Complexity",
      value: inferComplexity(summary),
      description: "Based on file count and discovered code details.",
    },
    {
      icon: devlensIcons.engineering.entryPoint,
      label: "Entry Point",
      value: getEntryPoint(summary),
      description: "Best first implementation or documentation anchor.",
    },
    {
      icon: devlensIcons.metrics.onboarding,
      label: "Estimated Onboarding",
      value: estimateOnboarding(summary),
      description: "Approximate time for a developer to get oriented.",
    },
  ];
}

function getComponentDefinition(path: string): Omit<CoreComponent, "fileCount" | "representativePath"> | null {
  const normalized = path.toLowerCase();

  if (/auth|login|session|token|oauth/.test(normalized)) {
    return {
      name: "Authentication",
      purpose: "Handles identity, sessions, tokens, or access control.",
      importance: "High",
    };
  }
  if (/controller|handler/.test(normalized)) {
    return {
      name: "Controllers",
      purpose: "Receives requests and coordinates application responses.",
      importance: "High",
    };
  }
  if (/service|usecase|use-case/.test(normalized)) {
    return {
      name: "Services",
      purpose: "Contains orchestration and core business behavior.",
      importance: "High",
    };
  }
  if (/route|router|api\//.test(normalized)) {
    return {
      name: "Routes",
      purpose: "Maps external requests to implementation paths.",
      importance: "High",
    };
  }
  if (/database|db|prisma|schema|model|repository|migration/.test(normalized)) {
    return {
      name: "Database",
      purpose: "Defines persistence, schema, and data access behavior.",
      importance: "High",
    };
  }
  if (/middleware|guard|interceptor/.test(normalized)) {
    return {
      name: "Middleware",
      purpose: "Runs cross-cutting request or application logic.",
      importance: "Medium",
    };
  }
  if (/config|env|settings/.test(normalized)) {
    return {
      name: "Configuration",
      purpose: "Controls runtime, build, and environment behavior.",
      importance: "Medium",
    };
  }
  if (/component|page|screen|view|app\//.test(normalized)) {
    return {
      name: "UI",
      purpose: "Defines screens, components, and user-facing flows.",
      importance: "Medium",
    };
  }
  if (/util|helper|lib|shared|common/.test(normalized)) {
    return {
      name: "Utilities",
      purpose: "Provides reusable helpers and shared implementation support.",
      importance: "Low",
    };
  }

  return null;
}

function buildCoreComponents(summary: DocsSummaryResponse): CoreComponent[] {
  const componentMap = new Map<string, CoreComponent & { paths: Set<string> }>();
  const candidatePaths = [
    ...summary.architecture.importantPaths.map((item) => item.path),
    ...summary.symbols.mostConnected.map((symbol) => symbol.filePath),
    ...summary.symbols.exported.map((symbol) => symbol.filePath),
  ];

  candidatePaths.forEach((path) => {
    const definition = getComponentDefinition(path);
    if (!definition) return;

    const existing = componentMap.get(definition.name);
    if (existing) {
      existing.paths.add(path);
      existing.representativePath ??= path;
      return;
    }

    componentMap.set(definition.name, {
      ...definition,
      fileCount: 1,
      representativePath: path,
      paths: new Set([path]),
    });
  });

  return [...componentMap.values()]
    .map(({ paths, ...component }) => ({
      ...component,
      fileCount: paths.size,
    }))
    .sort((left, right) => {
      const importanceOrder = { High: 0, Medium: 1, Low: 2 };
      return (
        importanceOrder[left.importance] - importanceOrder[right.importance] ||
        right.fileCount - left.fileCount ||
        left.name.localeCompare(right.name)
      );
    })
    .slice(0, 8);
}

function buildArchitectureFlow(summary: DocsSummaryResponse): Array<{
  label: string;
  detail: string;
  icon: LucideIcon;
}> {
  const components = buildCoreComponents(summary);
  const byName = new Map(components.map((component) => [component.name, component]));
  const flowCandidates = [
    {
      name: "UI",
      label: "Client",
      detail: byName.get("UI")?.purpose ?? "User-facing screens and views.",
      icon: devlensIcons.engineering.ui,
    },
    {
      name: "Routes",
      label: "Routes",
      detail: "API surfaces",
      icon: devlensIcons.engineering.route,
    },
    {
      name: "Controllers",
      label: "Controllers",
      detail: "Request handling",
      icon: devlensIcons.engineering.controller,
    },
    {
      name: "Services",
      label: "Services",
      detail: "Business logic",
      icon: devlensIcons.engineering.service,
    },
    {
      name: "Middleware",
      label: "Middleware",
      detail: "Auth and validation",
      icon: devlensIcons.engineering.middlewareSecurity,
    },
    {
      name: "Database",
      label: "Database",
      detail: "Persistence",
      icon: devlensIcons.engineering.database,
    },
  ];
  const supported = flowCandidates.filter((candidate) => byName.has(candidate.name));

  if (supported.length >= 2) return supported;

  return summary.understanding.mainModules.slice(0, 5).map((module) => ({
    label: module.name,
    detail: module.purpose,
    icon: devlensIcons.engineering.architecture,
  }));
}

function getSearchResultType(result: SearchResult): string {
  const path = result.path.toLowerCase();
  if (result.symbol?.kind) return getSymbolKindMeta(result.symbol.kind).singular;
  if (result.isTest || path.includes(".test.") || path.includes(".spec.")) return "test";
  if (path.endsWith("package.json")) return "package";
  if (path.includes("config")) return "config";
  if (path.includes("route") || path.includes("router")) return "route";
  if (path.includes("controller")) return "controller";
  if (path.includes("service")) return "service";
  if (path.includes("model") || path.includes("schema") || path.includes("db")) return "data";
  if (result.chunkKind === "SYMBOL") return "code";
  return "file";
}

function getSearchResultPurpose(result: SearchResult): string {
  const role = getFileRoleLabel(result.path);
  if (result.symbol) {
    return `${result.symbol.name} is a ${getSymbolKindMeta(
      result.symbol.kind,
    ).singular} in a ${role.toLowerCase()} file. Open the cited lines to see how this match participates in the surrounding flow.`;
  }
  return `${result.path} is a ${role.toLowerCase()} file that helps developers ${getPathReason(
    result.path,
  )}. Open the cited lines before following related files.`;
}

function describeRepositoryArchitecture(summary: DocsSummaryResponse): string {
  const modules = summary.understanding.mainModules
    .slice(0, 3)
    .map((module) => module.name);
  const moduleText = modules.length
    ? ` Main anchors: ${modules.join(", ")}.`
    : "";
  if (summary.understanding.architecture) {
    return `${summary.understanding.architecture}${moduleText}`;
  }

  const type = inferProjectType(summary);
  if (type === "Frontend app") return `UI-focused application with source files organized around screens or components.${moduleText}`;
  if (type === "API backend") return `Backend service with request handling, application logic, and supporting infrastructure.${moduleText}`;
  if (type === "CLI tool") return `Command-line project with a small operational surface and direct entry points.${moduleText}`;
  return `Straightforward repository structure with a direct path from entry files into implementation.${moduleText}`;
}

function getSymbolPurpose(symbol: RepositorySymbol | DocsSummarySymbol): string {
  const name = symbol.name.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  const kind = getSymbolKindMeta(symbol.kind).singular;
  if (/parse|read|load/.test(name)) return `Reads or converts input as part of the ${kind} flow.`;
  if (/format|render|print/.test(name)) return `Formats output for callers or users.`;
  if (/create|add|insert/.test(name)) return `Creates or registers data in this part of the codebase.`;
  if (/auth|login|token|session/.test(name)) return `Participates in authentication or session behavior.`;
  if (/route|handler|controller/.test(name)) return `Helps route or handle a request path.`;
  return `${symbol.name} is a ${kind} that supports this file's ${getFileRolePurpose(
    getFileRoleLabel(symbol.filePath),
  ).replace(/\.$/, "")}.`;
}

function describeSymbolImportance(symbol: DocsSummarySymbol): string {
  const kind = getSymbolKindMeta(symbol.kind).singular;
  if (symbol.connectionCount > 0) {
    return `${symbol.name}() - heavily referenced ${kind} - ${formatUsageCount(
      symbol.connectionCount,
      "reference",
    )}`;
  }
  if (symbol.visibility) {
    return `${symbol.name}() - public ${kind} exported from ${symbol.filePath}`;
  }
  return `${symbol.name}() - ${kind} in ${symbol.filePath}`;
}

function createFolderNode(path: string, name: string): ExplorerNode {
  return {
    id: path,
    path,
    name,
    kind: "folder",
    children: [],
    fileCount: 0,
    totalSizeBytes: 0,
  };
}

function buildExplorerTree(nodes: TreeNode[]): ExplorerNode[] {
  const root = new Map<string, ExplorerNode>();
  const folders = new Map<string, ExplorerNode>();

  function ensureFolder(folderPath: string): ExplorerNode {
    const existing = folders.get(folderPath);
    if (existing) return existing;

    const parts = folderPath.split("/");
    const name = parts[parts.length - 1] ?? folderPath;
    const folder = createFolderNode(folderPath, name);
    folders.set(folderPath, folder);

    if (parts.length === 1) {
      root.set(folderPath, folder);
      return folder;
    }

    const parentPath = parts.slice(0, -1).join("/");
    ensureFolder(parentPath).children.push(folder);
    return folder;
  }

  for (const node of nodes) {
    if (node.kind !== "file") continue;
    const parts = node.path.split("/");
    const fileNode: ExplorerNode = {
      ...node,
      children: [],
      fileCount: 1,
      totalSizeBytes: node.sizeBytes ?? 0,
    };

    if (parts.length === 1) {
      root.set(node.path, fileNode);
      continue;
    }

    const folderPath = parts.slice(0, -1).join("/");
    ensureFolder(folderPath).children.push(fileNode);
  }

  function sortAndCount(node: ExplorerNode): number {
    if (node.kind === "file") return 1;
    node.children.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    node.fileCount = node.children.reduce(
      (count, child) => count + sortAndCount(child),
      0,
    );
    node.totalSizeBytes = node.children.reduce(
      (size, child) => size + child.totalSizeBytes,
      0,
    );
    return node.fileCount;
  }

  const tree = [...root.values()].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  tree.forEach(sortAndCount);
  return tree;
}

function collectDefaultExpanded(nodes: ExplorerNode[], limit = 8): string[] {
  const expanded: string[] = [];
  const visit = (node: ExplorerNode) => {
    if (expanded.length >= limit) return;
    if (node.kind === "folder") {
      expanded.push(node.path);
      node.children.filter((child) => child.kind === "folder").forEach(visit);
    }
  };
  nodes.filter((node) => node.kind === "folder").forEach(visit);
  return expanded;
}

function filterTree(
  nodes: ExplorerNode[],
  query: string,
  language: string,
): ExplorerNode[] {
  const normalizedQuery = query.trim().toLowerCase();
  const matches = (node: ExplorerNode) => {
    const queryMatch =
      !normalizedQuery || node.path.toLowerCase().includes(normalizedQuery);
    const languageMatch =
      language === "all" ||
      node.kind === "folder" ||
      node.language === language;
    return queryMatch && languageMatch;
  };

  return nodes.flatMap((node) => {
    if (node.kind === "file") return matches(node) ? [node] : [];
    const children = filterTree(node.children, query, language);
    if (children.length || matches(node)) {
      return [
        {
          ...node,
          children,
          fileCount: children.reduce((sum, child) => sum + child.fileCount, 0),
          totalSizeBytes: children.reduce(
            (sum, child) => sum + child.totalSizeBytes,
            0,
          ),
        },
      ];
    }
    return [];
  });
}

function findExplorerNode(
  nodes: ExplorerNode[],
  path: string,
): ExplorerNode | null {
  for (const node of nodes) {
    if (node.path === path) return node;
    const child = findExplorerNode(node.children, path);
    if (child) return child;
  }
  return null;
}

function getParentPaths(path: string): string[] {
  const parts = path.split("/");
  return parts
    .slice(0, -1)
    .map((_, index) => parts.slice(0, index + 1).join("/"));
}

function highlightSnippet(snippet: string, matchedTerm?: string | null) {
  if (!matchedTerm) return snippet;

  const normalizedSnippet = snippet.toLowerCase();
  const normalizedTerm = matchedTerm.toLowerCase();
  const index = normalizedSnippet.indexOf(normalizedTerm);
  if (index < 0) return snippet;

  return (
    <>
      {snippet.slice(0, index)}
      <mark className="rounded bg-amber/20 px-0.5 text-ink">
        {snippet.slice(index, index + matchedTerm.length)}
      </mark>
      {snippet.slice(index + matchedTerm.length)}
    </>
  );
}

function ExplorerTree({
  nodes,
  expanded,
  selectedPath,
  onToggle,
  onSelect,
  onCopyPath,
  depth = 0,
}: {
  nodes: ExplorerNode[];
  expanded: Set<string>;
  selectedPath?: string;
  onToggle: (path: string) => void;
  onSelect: (node: ExplorerNode) => void;
  onCopyPath?: (path: string) => void;
  depth?: number;
}) {
  return (
    <div className={depth === 0 ? "space-y-0.5" : "space-y-0.5"}>
      {nodes.map((node) => {
        const isFolder = node.kind === "folder";
        const isExpanded = expanded.has(node.path);
        const isSelected = selectedPath === node.path;
        const iconMeta = getExplorerIconMeta(node.path, node.kind);

        return (
          <div key={node.path}>
            <button
              onClick={() => {
                onSelect(node);
                if (isFolder) onToggle(node.path);
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                onCopyPath?.(node.path);
              }}
              onKeyDown={(event) => {
                if (!isFolder) return;
                if (event.key === "ArrowRight" && !isExpanded) {
                  event.preventDefault();
                  onToggle(node.path);
                }
                if (event.key === "ArrowLeft" && isExpanded) {
                  event.preventDefault();
                  onToggle(node.path);
                }
              }}
              className={`group relative w-full rounded-md px-2 py-1 text-left text-sm transition-colors hover:bg-cloud ${
                isSelected ? "bg-signal/5 text-ink ring-1 ring-signal/20" : ""
              }`}
              style={{ paddingLeft: `${8 + depth * 16}px` }}
              title={node.path}
            >
              <span className="flex min-w-0 items-center gap-1.5">
                {isFolder ? (
                  isExpanded ? (
                    <ChevronDown size={14} className="shrink-0 text-graphite" />
                  ) : (
                    <ChevronRight
                      size={14}
                      className="shrink-0 text-graphite"
                    />
                  )
                ) : (
                  <span className="w-3.5 shrink-0" />
                )}
                <DevLensIcon
                  icon={iconMeta.icon}
                  tone={iconMeta.tone}
                  size={13}
                  framed
                  label={iconMeta.label}
                />
                <span
                  className={`min-w-0 truncate ${isFolder ? "font-medium text-ink" : "text-ink"}`}
                >
                  {node.name}
                </span>
                <span className="ml-auto hidden shrink-0 text-[11px] text-graphite group-hover:inline">
                  {isFolder
                    ? node.fileCount
                    : node.language ?? formatBytes(node.sizeBytes ?? 0)}
                </span>
              </span>
            </button>
            {isFolder && isExpanded ? (
              <div className="ml-3 border-l border-line/70">
                <ExplorerTree
                  nodes={node.children}
                  expanded={expanded}
                  selectedPath={selectedPath}
                  onToggle={onToggle}
                  onSelect={onSelect}
                  onCopyPath={onCopyPath}
                  depth={depth + 1}
                />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function SymbolRelationshipRows({
  items,
  onSelectSymbol,
  emptyTitle,
  emptyDescription,
}: {
  items: SymbolRelation[];
  onSelectSymbol: (symbolId: string) => void;
  emptyTitle: string;
  emptyDescription: string;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-md border border-line bg-white shadow-sm">
      {items.length ? (
        <div className="divide-y divide-line">
          {items.map((item) => {
            const kindMeta = getSymbolKindMeta(item.symbol.kind);

            return (
              <button
                key={item.referenceId}
                onClick={() => onSelectSymbol(item.symbol.id)}
                className="grid w-full grid-cols-[minmax(0,1fr)_96px] gap-3 px-3 py-2.5 text-left transition-colors hover:bg-cloud"
              >
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={`grid h-6 w-6 shrink-0 place-items-center rounded border text-[10px] font-semibold ${kindMeta.tone}`}
                    >
                      {kindMeta.icon}
                    </span>
                    <p className="truncate text-sm font-semibold text-ink">
                      {item.symbol.name}
                    </p>
                    {item.symbol.visibility ? (
                      <span className="shrink-0 rounded bg-cloud px-1.5 py-0.5 text-[11px] text-graphite">
                        {item.symbol.visibility}
                      </span>
                    ) : null}
                  </div>
                  <p className="ml-8 mt-1 truncate text-xs text-graphite">
                    {item.symbol.filePath}
                  </p>
                </div>
                <div className="flex flex-col items-end justify-center gap-1">
                  <span className="text-xs font-semibold text-ink">
                    {formatCompactLineRange(item.symbol)}
                  </span>
                  <span className="rounded bg-signal/10 px-1.5 py-0.5 text-[11px] font-medium text-signal">
                    {item.referenceKind === "CALL" ? "call" : "reference"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="grid h-full min-h-[132px] place-items-center px-5 py-6 text-center">
          <div>
            <p className="text-sm font-semibold text-ink">{emptyTitle}</p>
            <p className="mt-1 max-w-sm text-sm leading-6 text-graphite">
              {emptyDescription}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function SymbolSourcePreview({
  source,
  isLoading,
  error,
}: {
  source: SymbolSourceResponse | null;
  isLoading: boolean;
  error: string | null;
}) {
  const [copiedAction, setCopiedAction] = useState<"path" | "snippet" | null>(
    null,
  );
  const sourceSnippet = getSymbolSourceSnippet(source);
  const hasSourceLines = Boolean(sourceSnippet);
  const sourceLineCount = source?.symbol.sourceLines.length ?? 0;
  const sourcePreviewHeight = sourceLineCount
    ? Math.min(260, Math.max(120, sourceLineCount * 24 + 28))
    : 150;

  async function copyToClipboard(action: "path" | "snippet", value: string) {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopiedAction(action);
    window.setTimeout(() => setCopiedAction(null), 1400);
  }

  return (
    <div className="rounded-md border border-line bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-line px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">Source preview</p>
          <p className="truncate text-xs text-graphite">
            {source
              ? `${source.symbol.filePath} • ${formatLineRange(source.symbol)}`
              : "Select a symbol to inspect source lines."}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {source ? (
            <button
              type="button"
              onClick={() => copyToClipboard("path", source.symbol.filePath)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-white px-2 text-xs font-medium text-graphite transition-colors hover:border-signal hover:text-ink"
              title="Copy file path"
            >
              <Copy size={13} />
              {copiedAction === "path" ? "Copied" : "Path"}
            </button>
          ) : null}
          {source ? (
            <button
              type="button"
              onClick={() => copyToClipboard("snippet", sourceSnippet)}
              disabled={!hasSourceLines}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-white px-2 text-xs font-medium text-graphite transition-colors hover:border-signal hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
              title="Copy source snippet"
            >
              <Copy size={13} />
              {copiedAction === "snippet" ? "Copied" : "Snippet"}
            </button>
          ) : null}
          {source?.symbol.language ? (
            <span className="rounded bg-cloud px-2 py-1 text-xs font-medium text-graphite">
              {source.symbol.language}
            </span>
          ) : null}
        </div>
      </div>

      <div
        className="overflow-auto bg-[#0f172a] py-3 text-[13px] leading-6 text-slate-100"
        style={{ height: sourcePreviewHeight }}
      >
        {isLoading ? (
          <div className="grid h-full place-items-center text-slate-300">
            <span className="inline-flex items-center gap-2">
              <Loader2 size={15} className="animate-spin" />
              Loading source
            </span>
          </div>
        ) : error ? (
          <div className="grid h-full place-items-center px-4 text-center text-red-200">
            {error}
          </div>
        ) : source?.symbol.sourceLines.length ? (
          <pre className="font-mono">
            {source.symbol.sourceLines.map((line) => (
              <div
                key={line.lineNumber}
                className={`grid grid-cols-[64px_1fr] px-3 ${
                  line.isSymbolLine
                    ? "border-l-2 border-signal bg-signal/15"
                    : "border-l-2 border-transparent"
                }`}
              >
                <span className="select-none pr-5 text-right text-slate-500">
                  {line.lineNumber}
                </span>
                <code className="whitespace-pre-wrap break-words">
                  {line.content || " "}
                </code>
              </div>
            ))}
          </pre>
        ) : (
          <div className="grid h-full place-items-center px-4 text-center text-slate-300">
            No source preview is available yet. Symbol relationships and
            metadata can still be inspected below.
          </div>
        )}
      </div>
    </div>
  );
}

function FileSourcePreview({
  repositoryReady,
  selectedNode,
  relatedSymbols,
  highlightedLineRange,
  source,
  isLoading,
  error,
  summary,
  walkthroughCurrent,
  onExplainFile,
  onFindReferences,
  onOpenCitation,
  onOpenPath,
  onOpenSymbol,
}: {
  repositoryReady: boolean;
  selectedNode: ExplorerNode | null;
  relatedSymbols: RepositorySymbol[];
  highlightedLineRange: { startLine: number; endLine: number } | null;
  source: FileSourceResponse | null;
  isLoading: boolean;
  error: string | null;
  summary: DocsSummaryResponse | null;
  walkthroughCurrent: DevlensCitation | null;
  onExplainFile: () => void;
  onFindReferences: () => void;
  onOpenCitation: (citation: DevlensCitation) => void;
  onOpenPath: (path: string) => void;
  onOpenSymbol: (symbolId: string) => void;
}) {
  const [copiedAction, setCopiedAction] = useState<"path" | "snippet" | null>(
    null,
  );
  const [fileSearchQuery, setFileSearchQuery] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [areSignalsOpen, setAreSignalsOpen] = useState(false);
  const sourceSnippet = getFileSourceSnippet(source);
  const hasSourceLines = Boolean(sourceSnippet);
  const sourceLineCount = source?.file.previewLines.length ?? 0;
  const selectedPath = selectedNode?.kind === "file" ? selectedNode.path : "";
  const missingPreviewMessage = isDocsOrConfigPath(selectedPath)
    ? "This looks like a README, docs, or config file from an older analysis. Analyze the repository again to refresh its preview, or open a nearby guide file."
    : "DevLens has file metadata for this path. Try another file or search for a function name to jump into source.";
  const fileMatter =
    selectedNode?.kind === "file"
      ? buildFileMatterSummary(selectedNode.path, relatedSymbols)
      : null;
  const role = selectedNode?.kind === "file" ? getFileRoleLabel(selectedNode.path) : "Unknown";
  const imports = extractImportsFromSnippet(sourceSnippet);
  const exports = extractExportsFromSnippet(sourceSnippet, relatedSymbols);
  const calls = buildCallNames(relatedSymbols);
  const relatedFiles = selectedNode?.kind === "file"
    ? buildRelatedFileCandidates(
        selectedNode.path,
        relatedSymbols,
        buildReadingOrderFallbackPaths(summary),
      )
    : [];
  const responsibilities = selectedNode?.kind === "file"
    ? buildFileResponsibilities(selectedNode.path, role, relatedSymbols)
    : [];
  const fileFlow = selectedNode?.kind === "file"
    ? buildFileFlow(selectedNode.path, role)
    : [];
  const suggestedFiles = selectedNode?.kind === "file"
    ? buildSuggestedFileItems(selectedNode.path, relatedFiles, fileMatter, summary)
    : buildStartHereItems(summary).map((item) => ({
        path: item.path,
        reason: item.reason,
      })).slice(0, 4);
  const readingOrderMatch = selectedNode?.kind === "file"
    ? getReadingOrderMatch(summary, selectedNode.path)
    : null;
  const activeWalkthroughCitation =
    selectedNode?.kind === "file" && walkthroughCurrent?.path === selectedNode.path
      ? walkthroughCurrent
      : null;
  const walkthroughEvidenceItems = activeWalkthroughCitation
    ? buildWalkthroughEvidenceItems({
        summary,
        current: activeWalkthroughCitation,
        source,
        symbols: relatedSymbols,
        imports,
        exports,
        calls,
        relatedFiles,
      })
    : [];
  const normalizedFileSearch = fileSearchQuery.trim().toLowerCase();
  const fileSearchMatchCount = normalizedFileSearch
    ? source?.file.previewLines.filter((line) =>
        line.content.toLowerCase().includes(normalizedFileSearch),
      ).length ?? 0
    : 0;

  async function copyToClipboard(action: "path" | "snippet", value: string) {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopiedAction(action);
    window.setTimeout(() => setCopiedAction(null), 1400);
  }

  if (!repositoryReady) {
    return (
      <div className="grid h-full place-items-center rounded-md border border-line bg-white p-6 text-center">
        <div>
          <DevLensIcon
            icon={devlensIcons.product.files}
            tone="primary"
            size={24}
            className="mx-auto mb-3"
          />
          <p className="font-semibold">Analyze a repository first</p>
          <p className="mt-2 max-w-md text-sm leading-6 text-graphite">
            File previews become available after DevLens indexes repository
            files and source.
          </p>
        </div>
      </div>
    );
  }

  if (!selectedNode) {
    return (
      <div className="grid min-h-[560px] place-items-center rounded-md border border-line bg-white p-6 text-center shadow-sm">
        <div className="max-w-xl">
          <DevLensIcon
            icon={devlensIcons.product.files}
            tone="primary"
            size={24}
            className="mx-auto mb-3"
          />
          <p className="text-lg font-semibold text-ink">Select a file to inspect</p>
          <p className="mt-2 text-sm leading-6 text-graphite">
            DevLens explains purpose, dependencies, important symbols, related files, and suggested next steps once you choose a file.
          </p>
          {suggestedFiles.length ? (
            <div className="mt-5 grid gap-2 text-left">
              {suggestedFiles.map((item) => (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => onOpenPath(item.path)}
                  className="flex min-w-0 items-center gap-2 rounded-md border border-line bg-cloud px-3 py-2 text-sm font-medium text-graphite transition-colors hover:border-signal hover:bg-white hover:text-ink"
                >
                  <DevLensIcon
                    icon={devlensIcons.product.files}
                    tone="primary"
                    size={14}
                  />
                  <span className="truncate">{item.path}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  if (selectedNode.kind === "folder") {
    return (
      <div className="grid h-full place-items-center rounded-md border border-line bg-white p-6 text-center">
        <div>
          <FolderOpen className="mx-auto mb-3 text-amber" />
          <p className="font-semibold">{selectedNode.path}</p>
          <p className="mt-2 max-w-md text-sm leading-6 text-graphite">
            This folder contains {selectedNode.fileCount} files totaling{" "}
            {formatBytes(selectedNode.totalSizeBytes)}. Select a file inside it
            to preview source.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-0 rounded-md border border-line bg-white shadow-sm">
      <div className="border-b border-line bg-white px-4 py-3">
        <div className="mb-3 flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-graphite">
          <span className="font-medium text-graphite">Repository</span>
          <ChevronRight size={12} />
          {getBreadcrumbParts(selectedNode.path).map((part, index, parts) => (
            <span key={`${part}-${index}`} className="inline-flex min-w-0 items-center gap-1.5">
              <span
                className={`max-w-[160px] truncate ${
                  index === parts.length - 1 ? "font-semibold text-ink" : ""
                }`}
                title={parts.slice(0, index + 1).join("/")}
              >
                {part}
              </span>
              {index < parts.length - 1 ? <ChevronRight size={12} /> : null}
            </span>
          ))}
        </div>
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <p className="truncate text-lg font-semibold text-ink" title={selectedNode.path}>
                {selectedNode.name}
              </p>
              <span className="shrink-0 rounded bg-signal/10 px-2 py-1 text-xs font-semibold text-signal">
                {role}
              </span>
            </div>
            <p className="mt-1 text-sm leading-6 text-graphite" title={selectedNode.path}>
              {source?.file.language ?? selectedNode.language ?? "Unknown"} • {role} • {sourceLineCount ? `${sourceLineCount} preview lines` : "Preview pending"} • {formatBytes(source?.file.sizeBytes ?? selectedNode.sizeBytes ?? 0)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => copyToClipboard("path", selectedNode.path)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-white px-2 text-xs font-medium text-graphite transition-colors hover:border-signal hover:text-ink"
            >
              <Copy size={13} />
              {copiedAction === "path" ? "Copied" : "Copy Path"}
            </button>
            <button
              type="button"
              onClick={() => copyToClipboard("snippet", sourceSnippet)}
              disabled={!hasSourceLines}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-white px-2 text-xs font-medium text-graphite transition-colors hover:border-signal hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Copy size={13} />
              {copiedAction === "snippet" ? "Copied" : "Copy Snippet"}
            </button>
            <button
              type="button"
              onClick={onExplainFile}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-ink px-2.5 text-xs font-semibold text-white transition-colors hover:bg-graphite"
            >
              <Sparkles size={13} />
              Explain File
            </button>
            <button
              type="button"
              onClick={onFindReferences}
              disabled={!selectedNode}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-white px-2 text-xs font-medium text-graphite transition-colors hover:border-signal hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Search size={13} />
              Find References
            </button>
            <button
              type="button"
              onClick={() => setIsFullscreen(true)}
              disabled={!hasSourceLines}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-white px-2 text-xs font-medium text-graphite transition-colors hover:border-signal hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Maximize2 size={13} />
              Fullscreen
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-5 p-4">
        {fileMatter ? (
          <section className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
            <div className="rounded-md border border-line bg-cloud/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-signal">
                AI File Summary
              </p>
              <p className="mt-2 text-sm leading-6 text-ink">
                {buildFileSummaryText(selectedNode.path, role, relatedSymbols)}
              </p>
              <p className="mt-2 text-sm leading-6 text-graphite">
                {fileMatter.whyRead}
                {readingOrderMatch
                  ? ` It appears in the Repository Guide because ${readingOrderMatch.reason}.`
                  : ""}
              </p>
            </div>
            <div className="rounded-md border border-line bg-white p-4">
              <p className="text-sm font-semibold text-ink">Responsibilities</p>
              <ul className="mt-3 grid gap-2 text-sm leading-5 text-graphite">
                {responsibilities.length ? responsibilities.map((item) => (
                  <li key={item} className="flex gap-2">
                    <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-mint" />
                    <span>{item}</span>
                  </li>
                )) : (
                  <li>Inspect the source and symbols to identify responsibilities.</li>
                )}
              </ul>
            </div>
          </section>
        ) : null}

        {walkthroughEvidenceItems.length ? (
          <section className="rounded-md border border-signal/20 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-signal">
                  Walkthrough evidence
                </p>
                <p className="mt-1 text-sm font-semibold text-ink">
                  What to verify before moving on
                </p>
              </div>
              <span className="shrink-0 rounded bg-cloud px-2 py-1 text-[11px] font-semibold text-graphite">
                {walkthroughEvidenceItems.length} checks
              </span>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {walkthroughEvidenceItems.map((item) => (
                <button
                  key={`${item.label}-${item.citation.path}-${item.citation.startLine ?? "file"}`}
                  type="button"
                  onClick={() => onOpenCitation(item.citation)}
                  className="grid grid-cols-[20px_minmax(0,1fr)] gap-2 rounded-md border border-line bg-cloud/50 px-3 py-2 text-left transition-colors hover:border-signal hover:bg-white"
                  title={`${item.citation.path} - ${item.citation.reason}`}
                >
                  <CheckCircle2
                    size={14}
                    className={`mt-0.5 shrink-0 ${
                      item.priority === "high"
                        ? "text-signal"
                        : item.priority === "medium"
                          ? "text-amber"
                          : "text-graphite"
                    }`}
                  />
                  <span className="min-w-0">
                    <span className="flex min-w-0 items-center justify-between gap-2">
                      <span className="truncate text-xs font-semibold uppercase tracking-wide text-graphite">
                        {item.label}
                      </span>
                      {item.citation.startLine && item.citation.endLine ? (
                        <span className="shrink-0 text-[11px] text-graphite">
                          {formatCompactLineRange({
                            startLine: item.citation.startLine,
                            endLine: item.citation.endLine,
                          })}
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-1 line-clamp-2 text-sm leading-5 text-ink">
                      {item.detail}
                    </span>
                    <span className="mt-1 block truncate text-[11px] text-graphite">
                      {item.citation.path}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <div className="flex flex-col gap-2 rounded-md border border-line bg-white p-3 md:flex-row md:items-center md:justify-between">
          <div className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md border border-line bg-cloud px-3 focus-within:border-signal">
            <Search size={14} className="shrink-0 text-graphite" />
            <input
              value={fileSearchQuery}
              onChange={(event) => setFileSearchQuery(event.target.value)}
              disabled={!hasSourceLines}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none disabled:cursor-not-allowed"
              placeholder="Search in this file..."
            />
          </div>
          <span className="shrink-0 text-xs font-medium text-graphite">
            {normalizedFileSearch
              ? `${fileSearchMatchCount} match${fileSearchMatchCount === 1 ? "" : "es"}`
              : "Search only within the selected file"}
          </span>
        </div>

        <section className="overflow-hidden rounded-md border border-line bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-line bg-[#111827] px-3 py-2 text-slate-100">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{selectedNode.path}</p>
              <p className="text-xs text-slate-400">
                {source?.file.previewStartLine && source?.file.previewEndLine
                  ? `Lines ${source.file.previewStartLine}-${source.file.previewEndLine}`
                  : "Indexed source preview"}
              </p>
            </div>
            <span className="rounded bg-white/10 px-2 py-1 text-xs font-medium text-slate-200">
              {source?.file.language ?? selectedNode.language ?? "code"}
            </span>
          </div>

          {isLoading ? (
            <div className="grid min-h-[520px] place-items-center bg-[#0f172a] text-sm text-slate-300">
              <span className="inline-flex items-center gap-2">
                <Loader2 size={16} className="animate-spin" />
                Loading preview
              </span>
            </div>
          ) : error ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-700">
              {error}
            </div>
          ) : source?.file.previewLines.length ? (
            <div
              className="overflow-x-auto bg-[#0f172a] py-3 font-mono text-[13px] leading-6 text-slate-100"
            >
              {source.file.previewLines.map((line, index) => (
                <div
                  key={`${line.lineNumber}-${index}`}
                  className={`grid grid-cols-[64px_1fr] px-3 ${
                    highlightedLineRange &&
                    line.lineNumber >= highlightedLineRange.startLine &&
                    line.lineNumber <= highlightedLineRange.endLine
                      ? "border-l-2 border-signal bg-signal/20"
                      : normalizedFileSearch &&
                          line.content.toLowerCase().includes(normalizedFileSearch)
                        ? "border-l-2 border-amber bg-amber/15"
                      : "border-l-2 border-transparent hover:bg-white/5"
                  }`}
                >
                  <span className="select-none pr-5 text-right text-slate-500">
                    {line.lineNumber}
                  </span>
                  <code className="whitespace-pre-wrap break-words">
                    {line.content || " "}
                  </code>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid min-h-[520px] place-items-center bg-[#0f172a] p-6 text-center text-slate-300">
              <div>
                <DevLensIcon
                  icon={devlensIcons.product.files}
                  tone="primary"
                  size={24}
                  className="mx-auto mb-3"
                />
                <p className="font-semibold text-white">No code preview yet</p>
                <p className="mt-2 max-w-md text-sm leading-6">
                  {missingPreviewMessage}
                </p>
              </div>
            </div>
          )}
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="grid gap-4 md:grid-cols-3">
            {[
              ["Imports", imports],
              ["Exports", exports],
              ["Calls", calls],
            ].map(([label, items]) => (
              <div key={label as string} className="rounded-md border border-line bg-white p-4">
                <p className="text-sm font-semibold text-ink">{label as string}</p>
                <div className="mt-3 grid gap-2 text-sm">
                  {(items as string[]).length ? (items as string[]).map((item) => (
                    <span key={item} className="truncate rounded bg-cloud px-2 py-1 text-graphite" title={item}>
                      {item}
                    </span>
                  )) : (
                    <p className="text-sm leading-6 text-graphite">No {String(label).toLowerCase()} detected yet.</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-md border border-line bg-white p-4">
            <p className="text-sm font-semibold text-ink">Request / Call Flow</p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              {fileFlow.map((step, index) => (
                <span key={`${step}-${index}`} className="inline-flex items-center gap-2">
                  <span className={index === 1 ? "rounded bg-signal/10 px-2 py-1 font-semibold text-signal" : "rounded bg-cloud px-2 py-1 text-graphite"}>
                    {step}
                  </span>
                  {index < fileFlow.length - 1 ? <ChevronRight size={14} className="text-graphite" /> : null}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <details
            className="group rounded-md border border-line bg-white p-4"
            open={areSignalsOpen}
            onToggle={(event) => setAreSignalsOpen(event.currentTarget.open)}
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
              <span className="text-sm font-semibold text-ink">
                Related Code Signals ({relatedSymbols.length})
              </span>
              <ChevronDown
                size={16}
                className="text-graphite transition-transform group-open:rotate-180"
              />
            </summary>
            {relatedSymbols.length ? (
              <div className="mt-3 grid gap-2">
                {relatedSymbols.slice(0, 8).map((symbol) => (
                  <div key={symbol.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-md bg-cloud px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">{symbol.name}</p>
                      <p className="mt-0.5 text-xs text-graphite">
                        {getSymbolKindMeta(symbol.kind).singular} • {formatCompactLineRange(symbol)}
                      </p>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-graphite">
                        {getSymbolPurpose(symbol)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onOpenSymbol(symbol.id)}
                      className="h-8 rounded-md border border-line bg-white px-2 text-xs font-medium text-graphite hover:border-signal hover:text-ink"
                    >
                      Open
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3 rounded-md border border-dashed border-line bg-cloud p-3 text-sm leading-6 text-graphite">
                No functions, classes, or constants were detected in this file yet.
              </div>
            )}
          </details>

          <div className="rounded-md border border-line bg-white p-4">
            <p className="text-sm font-semibold text-ink">Suggested Next Files</p>
            <div className="mt-3 grid gap-2">
              {suggestedFiles.length ? suggestedFiles.map((item, index) => (
                <button
                  key={`${item.path}-${index}`}
                  type="button"
                  onClick={() => onOpenPath(item.path)}
                  className="grid grid-cols-[24px_minmax(0,1fr)] gap-2 rounded-md bg-cloud px-3 py-2 text-left text-sm hover:bg-signal/10"
                >
                  <span className="grid h-6 w-6 place-items-center rounded bg-white text-xs font-semibold text-signal">
                    {index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-ink">{item.path}</span>
                    <span className="block truncate text-xs text-graphite">
                      {item.reason}
                    </span>
                  </span>
                </button>
              )) : (
                <p className="rounded-md bg-cloud p-3 text-sm leading-6 text-graphite">
                  DevLens will suggest nearby files once related paths are available.
                </p>
              )}
            </div>
          </div>
        </section>
      </div>
      {isFullscreen ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-[#0f172a] text-slate-100">
          <div className="flex min-h-0 items-center justify-between gap-3 border-b border-white/10 bg-[#111827] px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">
                {selectedNode.name}
              </p>
              <p className="truncate text-xs text-slate-400">
                {selectedNode.path} • {source?.file.language ?? selectedNode.language ?? "code"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => copyToClipboard("path", selectedNode.path)}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 text-xs font-medium text-slate-200 transition-colors hover:bg-white/10"
              >
                <Copy size={13} />
                {copiedAction === "path" ? "Copied" : "Copy Path"}
              </button>
              <button
                type="button"
                onClick={() => copyToClipboard("snippet", sourceSnippet)}
                disabled={!hasSourceLines}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 text-xs font-medium text-slate-200 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Copy size={13} />
                {copiedAction === "snippet" ? "Copied" : "Copy Snippet"}
              </button>
              <button
                type="button"
                onClick={() => setIsFullscreen(false)}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-white px-2.5 text-xs font-semibold text-ink"
              >
                <X size={13} />
                Close Fullscreen
              </button>
            </div>
          </div>
          <div className="border-b border-white/10 bg-[#111827] px-4 py-2">
            <div className="flex h-9 max-w-xl items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3">
              <Search size={14} className="shrink-0 text-slate-400" />
              <input
                value={fileSearchQuery}
                onChange={(event) => setFileSearchQuery(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500"
                placeholder="Search in this file..."
              />
              {normalizedFileSearch ? (
                <span className="text-xs text-slate-400">
                  {fileSearchMatchCount}
                </span>
              ) : null}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto bg-[#0f172a] py-4 font-mono text-[13px] leading-6 text-slate-100">
            {source?.file.previewLines.map((line, index) => (
              <div
                key={`fullscreen-${line.lineNumber}-${index}`}
                className={`grid grid-cols-[72px_1fr] px-4 ${
                  highlightedLineRange &&
                  line.lineNumber >= highlightedLineRange.startLine &&
                  line.lineNumber <= highlightedLineRange.endLine
                    ? "border-l-2 border-signal bg-signal/20"
                    : normalizedFileSearch &&
                        line.content.toLowerCase().includes(normalizedFileSearch)
                      ? "border-l-2 border-amber bg-amber/15"
                      : "border-l-2 border-transparent hover:bg-white/5"
                }`}
              >
                <span className="select-none pr-6 text-right text-slate-500">
                  {line.lineNumber}
                </span>
                <code className="whitespace-pre-wrap break-words">
                  {line.content || " "}
                </code>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SymbolGraphNode({
  symbol,
  helper,
  metric,
  onClick,
}: {
  symbol: SymbolRelation["symbol"] | RepositorySymbol;
  helper?: string;
  metric?: string;
  onClick?: () => void;
}) {
  const kindMeta = getSymbolKindMeta(symbol.kind);
  const content = (
    <>
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={`grid h-6 w-6 shrink-0 place-items-center rounded border text-[10px] font-semibold ${kindMeta.tone}`}
        >
          {kindMeta.icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">
            {symbol.name}
          </p>
          <p className="truncate text-xs text-graphite">
            {kindMeta.singular}
            {symbol.visibility ? ` • ${symbol.visibility}` : ""}
          </p>
        </div>
        {metric ? (
          <span className="shrink-0 rounded bg-cloud px-1.5 py-0.5 text-[11px] font-semibold text-graphite">
            {metric}
          </span>
        ) : null}
      </div>
      <p className="mt-2 truncate text-xs text-graphite">
        {symbol.filePath} • {formatCompactLineRange(symbol)}
      </p>
      {helper ? <p className="mt-1 text-xs text-graphite">{helper}</p> : null}
    </>
  );

  if (!onClick) {
    return (
      <div className="rounded-md border border-signal/40 bg-signal/5 p-3 shadow-sm">
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-md border border-line bg-white p-3 text-left transition-colors hover:border-signal hover:bg-cloud"
    >
      {content}
    </button>
  );
}

function SymbolGraphGroup({
  title,
  description,
  items,
  emptyText,
  onSelectSymbol,
}: {
  title: string;
  description: string;
  items: SymbolRelation[];
  emptyText: string;
  onSelectSymbol: (symbolId: string) => void;
}) {
  return (
    <div className="min-h-0 rounded-md border border-line bg-white p-3 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">{title}</p>
          <p className="mt-0.5 text-xs leading-5 text-graphite">
            {description}
          </p>
        </div>
        <span className="shrink-0 rounded bg-cloud px-2 py-1 text-xs font-semibold text-graphite">
          {items.length}
        </span>
      </div>
      {items.length ? (
        <div className="grid max-h-56 gap-2 overflow-auto pr-1">
          {items.map((item) => (
            <SymbolGraphNode
              key={item.referenceId}
              symbol={item.symbol}
              helper={
                item.referenceKind === "CALL"
                  ? "Called by the focused symbol"
                  : "Linked symbol"
              }
              onClick={() => onSelectSymbol(item.symbol.id)}
            />
          ))}
        </div>
      ) : (
        <div className="grid min-h-[104px] place-items-center rounded-md border border-dashed border-line bg-cloud px-3 py-5 text-center text-sm leading-6 text-graphite">
          {emptyText}
        </div>
      )}
    </div>
  );
}

type SymbolGraphNodePlacement = {
  id: string;
  relation: "calls" | "references" | "inbound";
  relationLabel: string;
  symbol: SymbolRelation["symbol"];
  x: number;
  y: number;
};

function buildGraphPlacements(focusedSymbol: RepositorySymbol) {
  const visibleCalls = focusedSymbol.outgoingCalls.slice(0, 3);
  const visibleReferences = focusedSymbol.outgoingReferences.slice(0, 4);
  const visibleInbound = focusedSymbol.incomingReferences.slice(0, 3);

  const distribute = (count: number, start: number, end: number) => {
    if (count <= 1) return [start + (end - start) / 2];
    const gap = (end - start) / (count - 1);
    return Array.from({ length: count }, (_, index) => start + index * gap);
  };

  const placements: SymbolGraphNodePlacement[] = [
    ...visibleInbound.map((item, index) => ({
      id: item.referenceId,
      relation: "inbound" as const,
      relationLabel: "Inbound",
      symbol: item.symbol,
      x: 5,
      y: distribute(visibleInbound.length, 18, 58)[index] ?? 36,
    })),
    ...visibleCalls.map((item, index) => ({
      id: item.referenceId,
      relation: "calls" as const,
      relationLabel: "Call",
      symbol: item.symbol,
      x: 71,
      y: distribute(visibleCalls.length, 18, 58)[index] ?? 36,
    })),
    ...visibleReferences.map((item, index) => ({
      id: item.referenceId,
      relation: "references" as const,
      relationLabel: "Reference",
      symbol: item.symbol,
      x: distribute(visibleReferences.length, 8, 68)[index] ?? 38,
      y: 76,
    })),
  ];

  return {
    placements,
    hidden: {
      calls: Math.max(0, focusedSymbol.outgoingCalls.length - visibleCalls.length),
      references: Math.max(
        0,
        focusedSymbol.outgoingReferences.length - visibleReferences.length,
      ),
      inbound: Math.max(
        0,
        focusedSymbol.incomingReferences.length - visibleInbound.length,
      ),
    },
  };
}

function getGraphEdgeTone(relation: SymbolGraphNodePlacement["relation"]) {
  if (relation === "calls") {
    return { stroke: "#2563eb", fill: "#2563eb", label: "Calls" };
  }
  if (relation === "references") {
    return { stroke: "#7c3aed", fill: "#7c3aed", label: "References" };
  }
  return { stroke: "#059669", fill: "#059669", label: "Inbound" };
}

function getGraphPath(node: SymbolGraphNodePlacement) {
  const center = {
    x: 50,
    y: 43,
  };
  const target = {
    x: node.x + 12,
    y: node.y + 7,
  };

  if (node.relation === "inbound") {
    const startX = node.x + 24;
    const startY = node.y + 7;
    return `M ${startX} ${startY} C ${startX + 8} ${startY}, ${
      center.x - 16
    } ${center.y}, ${center.x - 12} ${center.y}`;
  }

  if (node.relation === "calls") {
    const startX = center.x + 12;
    return `M ${startX} ${center.y} C ${startX + 8} ${center.y}, ${
      node.x - 8
    } ${target.y}, ${node.x} ${target.y}`;
  }

  const startY = center.y + 11;
  return `M ${center.x} ${startY} C ${center.x} ${startY + 11}, ${
    target.x
  } ${node.y - 10}, ${target.x} ${node.y}`;
}

function SymbolGraphCanvasNode({
  symbol,
  relationLabel,
  isFocused,
  onClick,
}: {
  symbol: SymbolRelation["symbol"] | RepositorySymbol;
  relationLabel?: string;
  isFocused?: boolean;
  onClick?: () => void;
}) {
  const kindMeta = getSymbolKindMeta(symbol.kind);
  const body = (
    <>
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={`grid h-6 w-6 shrink-0 place-items-center rounded border text-[10px] font-semibold ${kindMeta.tone}`}
        >
          {kindMeta.icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">
            {symbol.name}
          </p>
          <p className="truncate text-xs text-graphite">
            {kindMeta.singular}
            {symbol.visibility ? ` • ${symbol.visibility}` : ""}
          </p>
        </div>
      </div>
      <p className="mt-2 truncate text-xs text-graphite">
        {symbol.filePath} • {formatCompactLineRange(symbol)}
      </p>
      {relationLabel ? (
        <span className="mt-2 inline-flex rounded bg-cloud px-1.5 py-0.5 text-[11px] font-semibold text-graphite">
          {relationLabel}
        </span>
      ) : null}
    </>
  );

  const className = `h-full w-full rounded-md border p-3 text-left shadow-sm transition-colors ${
    isFocused
      ? "border-signal bg-white shadow-[0_12px_32px_rgba(37,99,235,0.16)]"
      : "border-line bg-white hover:border-signal hover:bg-cloud"
  }`;

  if (!onClick) {
    return <div className={className}>{body}</div>;
  }

  return (
    <button type="button" onClick={onClick} className={className}>
      {body}
    </button>
  );
}

function SymbolGraphCanvas({
  focusedSymbol,
  relationshipCount,
  onSelectSymbol,
}: {
  focusedSymbol: RepositorySymbol;
  relationshipCount: number;
  onSelectSymbol: (symbolId: string) => void;
}) {
  const { placements, hidden } = buildGraphPlacements(focusedSymbol);
  const hiddenTotal = hidden.calls + hidden.references + hidden.inbound;

  return (
    <div className="rounded-md border border-line bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-ink">Relationship map</p>
          <p className="mt-1 text-sm leading-6 text-graphite">
            Directional symbol links around the current focus.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {[
            ["Calls", "#2563eb"],
            ["References", "#7c3aed"],
            ["Inbound", "#059669"],
          ].map(([label, color]) => (
            <span
              key={label}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-graphite"
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: color }}
              />
              {label}
            </span>
          ))}
        </div>
      </div>

      <div className="relative h-[520px] overflow-hidden rounded-md border border-line bg-cloud">
        <div className="absolute inset-x-6 top-5 grid grid-cols-3 text-xs font-semibold uppercase tracking-wide text-graphite">
          <span>Inbound</span>
          <span className="text-center">Focus</span>
          <span className="text-right">Outgoing</span>
        </div>
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          role="img"
          aria-label="Symbol relationships"
        >
          <defs>
            {(["calls", "references", "inbound"] as const).map((relation) => {
              const tone = getGraphEdgeTone(relation);
              return (
                <marker
                  key={relation}
                  id={`arrow-${relation}`}
                  markerWidth="8"
                  markerHeight="8"
                  refX="7"
                  refY="4"
                  orient="auto"
                  markerUnits="strokeWidth"
                >
                  <path d="M 0 0 L 8 4 L 0 8 z" fill={tone.fill} />
                </marker>
              );
            })}
          </defs>
          <rect width="100" height="100" fill="transparent" />
          {placements.map((node) => {
            const tone = getGraphEdgeTone(node.relation);
            return (
              <path
                key={node.id}
                d={getGraphPath(node)}
                fill="none"
                stroke={tone.stroke}
                strokeOpacity="0.62"
                strokeWidth="0.35"
                markerEnd={`url(#arrow-${node.relation})`}
              />
            );
          })}
        </svg>

        <div className="absolute left-[38%] top-[34%] h-[116px] w-[230px]">
          <SymbolGraphCanvasNode
            symbol={focusedSymbol}
            isFocused
            relationLabel={formatUsageCount(relationshipCount, "link")}
          />
        </div>

        {placements.map((node) => (
          <div
            key={node.id}
            className="absolute h-[78px] w-[220px]"
            style={{ left: `${node.x}%`, top: `${node.y}%` }}
          >
            <SymbolGraphCanvasNode
              symbol={node.symbol}
              onClick={() => onSelectSymbol(node.symbol.id)}
            />
          </div>
        ))}
      </div>

      {hiddenTotal ? (
        <div className="mt-3 rounded-md border border-line bg-cloud px-3 py-2 text-sm text-graphite">
          +{hiddenTotal} more relationships are available in the detailed lists
          below.
        </div>
      ) : null}
    </div>
  );
}

function SymbolGraphPanel({
  repositoryReady,
  symbolsResponse,
  focusedSymbol,
  onSelectSymbol,
  onInspectSymbol,
  onOpenInFiles,
}: {
  repositoryReady: boolean;
  symbolsResponse: SymbolsResponse | null;
  focusedSymbol: RepositorySymbol | null;
  onSelectSymbol: (symbolId: string) => void;
  onInspectSymbol: (symbolId: string) => void;
  onOpenInFiles: (symbol: RepositorySymbol) => void;
}) {
  const relationshipCount = focusedSymbol
    ? focusedSymbol.outgoingCalls.length +
      focusedSymbol.outgoingReferences.length +
      focusedSymbol.incomingReferences.length
    : 0;

  return (
    <div className="overflow-hidden rounded-md border border-line bg-white shadow-sm">
      <div className="border-b border-line bg-white px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold">Symbol relationships</p>
            <p className="text-sm text-graphite">
              {symbolsResponse?.count
                ? `${symbolsResponse.count} symbols available for relationship mapping.`
                : "Explore calls, references, and inbound symbol links."}
            </p>
          </div>
          <Network size={18} className="shrink-0 text-signal" />
        </div>
      </div>

      <div className="space-y-5 bg-white p-5">
        {!repositoryReady ? (
          <div className="grid h-full place-items-center rounded-md border border-line bg-white p-6 text-center">
            <div>
              <Network className="mx-auto mb-3 text-signal" />
              <p className="font-semibold">Analyze a repository first</p>
              <p className="mt-2 max-w-md text-sm leading-6 text-graphite">
                Symbol relationships appear after DevLens finishes analyzing
                the repository.
              </p>
            </div>
          </div>
        ) : !symbolsResponse?.symbols.length ? (
          <div className="grid h-full place-items-center rounded-md border border-line bg-white p-6 text-center">
            <div>
              <Braces className="mx-auto mb-3 text-signal" />
              <p className="font-semibold">No symbol relationships available</p>
              <p className="mt-2 max-w-md text-sm leading-6 text-graphite">
                No code details were detected for this repository.
              </p>
            </div>
          </div>
        ) : focusedSymbol ? (
          <div className="grid min-h-full gap-4">
            {relationshipCount ? (
              <SymbolGraphCanvas
                focusedSymbol={focusedSymbol}
                relationshipCount={relationshipCount}
                onSelectSymbol={onSelectSymbol}
              />
            ) : (
              <div className="grid min-h-[320px] place-items-center rounded-md border border-line bg-white p-6 text-center shadow-sm">
                <div>
                  <Network className="mx-auto mb-3 text-signal" />
                  <p className="font-semibold text-ink">
                    No relationships for this symbol
                  </p>
                  <p className="mt-2 max-w-md text-sm leading-6 text-graphite">
                    DevLens found this symbol, but it does not currently have
                    calls, references, or inbound links in the current analysis.
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-[minmax(0,1fr)_280px] gap-4">
              <div className="rounded-md border border-line bg-white p-4 shadow-sm">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-graphite">
                      Focused symbol
                    </p>
                    <p className="mt-1 text-sm leading-6 text-ink">
                      {buildSelectedSymbolSummary(focusedSymbol)}
                    </p>
                  </div>
                  <span className="shrink-0 rounded bg-signal/10 px-2 py-1 text-xs font-semibold text-signal">
                    {formatUsageCount(relationshipCount, "link")}
                  </span>
                </div>
                <div className="mt-3">
                  <SymbolGraphNode
                    symbol={focusedSymbol}
                    metric={formatLineRange(focusedSymbol)}
                  />
                </div>
              </div>

              <div className="rounded-md border border-line bg-white p-4 shadow-sm">
                <p className="text-sm font-semibold text-ink">Actions</p>
                <p className="mt-1 text-sm leading-6 text-graphite">
                  Keep exploring related code, inspect relationships in
                  Symbols, or jump to the file.
                </p>
                <div className="mt-3 grid gap-2">
                  <button
                    type="button"
                    onClick={() => onInspectSymbol(focusedSymbol.id)}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-ink px-3 text-sm font-semibold text-white"
                  >
                    <Braces size={15} />
                    Inspect in Symbols
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenInFiles(focusedSymbol)}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-medium text-graphite transition-colors hover:border-signal hover:text-ink"
                  >
                    <ExternalLink size={15} />
                    Open in Files
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <SymbolGraphGroup
                title="Calls"
                description="Symbols called by the focused symbol."
                items={focusedSymbol.outgoingCalls}
                emptyText="No calls found from this symbol."
                onSelectSymbol={onSelectSymbol}
              />
              <SymbolGraphGroup
                title="References"
                description="Symbols referenced by the focused symbol."
                items={focusedSymbol.outgoingReferences}
                emptyText="No outgoing references found."
                onSelectSymbol={onSelectSymbol}
              />
              <SymbolGraphGroup
                title="Inbound"
                description="Symbols that point back to the focus."
                items={focusedSymbol.incomingReferences}
                emptyText="No inbound links found."
                onSelectSymbol={onSelectSymbol}
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function RepoBriefPanel({
  repositoryReady,
  summary,
  enhancedGuide,
  isLoading,
  error,
  isEnhancingGuide,
  guideEnhanceStatus,
  onEnhanceGuide,
  onOpenInFiles,
}: {
  repositoryReady: boolean;
  summary: DocsSummaryResponse | null;
  enhancedGuide: GuideEnhanceResponse | null;
  isLoading: boolean;
  error: string | null;
  isEnhancingGuide: boolean;
  guideEnhanceStatus: string | null;
  onEnhanceGuide: () => void;
  onOpenInFiles: (symbol: { filePath: string }) => void;
}) {
  const guideSummary =
    enhancedGuide?.mode === "provider" && enhancedGuide.summary
      ? enhancedGuide.summary
      : summary
        ? buildSeniorRepoExplanation(summary)
        : "";
  const guideDomain = enhancedGuide?.domain ?? summary?.understanding.domain ?? "";
  const guideArchitecture =
    enhancedGuide?.architecture ??
    (summary ? describeRepositoryArchitecture(summary) : "");
  const guideCoreFeatures =
    enhancedGuide?.coreFeatures ?? summary?.understanding.coreFeatures ?? [];
  const guideReadingOrder =
    enhancedGuide?.readingOrder ?? summary?.understanding.readingOrder ?? [];
  const architectureFlow = summary ? buildArchitectureFlow(summary) : [];

  return (
    <div className="rounded-md bg-white">
      <div className="border-b border-line px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold">Repository Guide</p>
            <p className="text-sm text-graphite">
              A scannable engineering guide for understanding this codebase.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {summary ? (
              <button
                type="button"
                onClick={onEnhanceGuide}
                disabled={isEnhancingGuide}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-signal/20 bg-signal/5 px-2 text-xs font-medium text-signal transition-colors hover:border-signal hover:bg-white hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isEnhancingGuide ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Sparkles size={13} />
                )}
                Improve summary
              </button>
            ) : null}
            <DevLensIcon icon={devlensIcons.guide.overview} tone="primary" size={18} />
          </div>
        </div>
        {guideEnhanceStatus ? (
          <p className="mt-2 text-xs leading-5 text-graphite">
            {guideEnhanceStatus}
          </p>
        ) : null}
      </div>

      <div className="bg-white p-5">
        {!repositoryReady ? (
          <div className="grid h-full place-items-center rounded-md border border-line bg-white p-6 text-center">
            <div>
              <DevLensIcon
                icon={devlensIcons.product.guide}
                tone="primary"
                size={24}
                className="mx-auto mb-3"
              />
              <p className="font-semibold">Analyze a repository first</p>
              <p className="mt-2 max-w-md text-sm leading-6 text-graphite">
                Repository Guide uses repository metadata, files, and code
                signals from a completed analysis.
              </p>
            </div>
          </div>
        ) : isLoading ? (
          <div className="grid h-full place-items-center rounded-md border border-line bg-white p-6 text-center">
            <div>
              <Loader2 className="mx-auto mb-3 animate-spin text-signal" />
              <p className="font-semibold">Loading Repository Guide</p>
              <p className="mt-2 max-w-md text-sm leading-6 text-graphite">
                Collecting repository facts, key paths, architecture signals,
                and public symbols.
              </p>
            </div>
          </div>
        ) : error ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-700">
            {error}
          </div>
        ) : summary ? (
          <div className="space-y-5">
            <section className="rounded-md border border-line bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-5">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-signal">
                    Repository Overview
                  </p>
                  <h2 className="mt-1.5 text-xl font-semibold tracking-normal text-ink">
                    {summary.repository.owner}/{summary.repository.name}
                  </h2>
                  <p className="mt-2 line-clamp-3 max-w-4xl text-sm leading-6 text-graphite">
                    {guideSummary}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold ${
                    summary.repository.analysisStatus === "COMPLETED"
                      ? "bg-mint/10 text-mint"
                      : "bg-cloud text-graphite"
                  }`}
                >
                  {summary.repository.analysisStatus}
                </span>
              </div>

              <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
                <div className="rounded-md border border-line bg-cloud/30 p-3">
                  <div className="flex items-start gap-3">
                    <DevLensIcon
                      icon={devlensIcons.guide.purpose}
                      tone="primary"
                      size={16}
                      framed
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink">
                        What this project does
                      </p>
                      <p className="mt-1.5 line-clamp-3 text-sm leading-6 text-graphite">
                        {enhancedGuide?.mode === "provider" && enhancedGuide.summary
                          ? enhancedGuide.summary
                          : getBusinessPurpose(summary)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-md bg-white px-3 py-2 shadow-sm">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-graphite">
                        Domain
                      </p>
                      <p className="mt-1 text-sm font-medium leading-5 text-ink">
                        {guideDomain}
                      </p>
                    </div>
                    <div className="rounded-md bg-white px-3 py-2 shadow-sm">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-graphite">
                        Structure
                      </p>
                      <p className="mt-1 line-clamp-2 text-sm font-medium leading-5 text-ink">
                        {guideArchitecture}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-md border border-line bg-cloud/30 p-3">
                  <div className="flex items-center gap-2">
                    <DevLensIcon
                      icon={devlensIcons.guide.readingPath}
                      tone="primary"
                      size={15}
                    />
                    <p className="text-sm font-semibold text-ink">Start here</p>
                  </div>
                  <div className="mt-3 grid gap-2">
                    {guideReadingOrder.slice(0, 3).map((item, index) => (
                      <button
                        key={item.file}
                        type="button"
                        onClick={() => onOpenInFiles({ filePath: item.file })}
                        className="grid min-w-0 grid-cols-[28px_minmax(0,1fr)] gap-2 rounded-md border border-line bg-white px-2 py-2 text-left shadow-sm transition-colors hover:border-signal hover:bg-signal/5"
                        title={`${item.file} - ${item.reason}`}
                      >
                        <span className="grid h-7 w-7 place-items-center rounded bg-signal/10 text-xs font-semibold text-signal">
                          {index + 1}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-ink">
                            {item.file}
                          </span>
                          <span className="mt-0.5 block line-clamp-1 text-xs leading-4 text-graphite">
                            {item.reason}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {guideReadingOrder.length ? (
                <div className="mt-4 rounded-md border border-line bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <DevLensIcon
                        icon={devlensIcons.guide.readingPath}
                        tone="primary"
                        size={15}
                      />
                      <p className="text-sm font-semibold text-ink">
                        Recommended reading path
                      </p>
                    </div>
                    <span className="text-xs font-medium text-graphite">
                      {Math.min(guideReadingOrder.length, 6)} files
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                    {guideReadingOrder.slice(0, 6).map((item, index) => (
                      <button
                        key={item.file}
                        type="button"
                        onClick={() => onOpenInFiles({ filePath: item.file })}
                        className="group relative min-w-0 rounded-md border border-line bg-white px-3 py-3 text-left shadow-sm transition-colors hover:border-signal hover:bg-signal/5"
                        title={`${item.file} - ${item.reason}`}
                      >
                        <span className="mb-2 grid h-6 w-6 place-items-center rounded bg-signal/10 text-xs font-semibold text-signal">
                          {index + 1}
                        </span>
                        <span className="block truncate text-sm font-semibold text-ink">
                          {item.file}
                        </span>
                        <span className="mt-1 block line-clamp-2 text-xs leading-4 text-graphite">
                          {item.reason}
                        </span>
                        {index < Math.min(guideReadingOrder.length, 6) - 1 ? (
                          <ChevronRight
                            size={14}
                            className="absolute right-2 top-3 hidden text-line xl:block"
                          />
                        ) : null}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {architectureFlow.length ? (
                <div className="mt-4 rounded-md border border-line bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-2">
                    <DevLensIcon
                      icon={devlensIcons.guide.architecture}
                      tone="primary"
                      size={15}
                    />
                    <p className="text-sm font-semibold text-ink">
                      Architecture at a glance
                    </p>
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {architectureFlow.map((step, index) => {
                      const Icon = step.icon;
                      return (
                        <div
                          key={`${step.label}-${index}`}
                          className="relative rounded-md border border-line bg-cloud/35 px-3 py-3"
                        >
                          <div className="flex items-center gap-2">
                            <DevLensIcon
                              icon={Icon}
                              tone="code"
                              size={15}
                              framed
                              label={`${step.label} architecture role`}
                            />
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-ink">
                                {step.label}
                              </p>
                              <p className="text-[11px] leading-4 text-graphite">
                                {step.detail}
                              </p>
                            </div>
                          </div>
                          {index < architectureFlow.length - 1 ? (
                            <ChevronRight
                              size={14}
                              className="absolute -right-2 top-1/2 hidden -translate-y-1/2 rounded-full bg-white text-line xl:block"
                            />
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                <div className="rounded-md border border-line bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-2">
                    <DevLensIcon
                      icon={devlensIcons.guide.features}
                      tone="success"
                      size={15}
                    />
                    <p className="text-sm font-semibold text-ink">Core features</p>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {guideCoreFeatures.length ? (
                      guideCoreFeatures.slice(0, 8).map((feature) => (
                        <div
                          key={feature}
                          className="flex min-w-0 items-center gap-2 rounded-md border border-line bg-cloud/40 px-3 py-2"
                          title={feature}
                        >
                          <DevLensIcon
                            icon={devlensIcons.status.success}
                            tone="success"
                            size={14}
                          />
                          <span className="min-w-0 line-clamp-2 text-xs font-semibold leading-4 text-ink">
                            {feature}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm leading-6 text-graphite">
                        DevLens needs more README, route, or module signals to infer features.
                      </p>
                    )}
                  </div>
                </div>

                <div className="rounded-md border border-line bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-2">
                    <DevLensIcon
                      icon={devlensIcons.guide.modules}
                      tone="primary"
                      size={15}
                    />
                    <p className="text-sm font-semibold text-ink">Main modules</p>
                  </div>
                  <div className="mt-3 grid gap-2">
                    {summary.understanding.mainModules.slice(0, 6).map((module) => (
                      <div
                        key={module.name}
                        className="grid grid-cols-[112px_minmax(0,1fr)] gap-3 rounded-md bg-cloud/35 px-3 py-2 text-sm"
                      >
                        <p className="truncate font-semibold text-ink">
                          {module.name}
                        </p>
                        <p className="line-clamp-2 text-graphite">{module.purpose}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <details className="group rounded-md border border-line bg-white p-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wide text-graphite">
                    Technical Overview
                  </span>
                  <h3 className="mt-1 text-lg font-semibold text-ink">
                    How is it built?
                  </h3>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Workflow size={18} className="text-signal" />
                  <ChevronDown size={16} className="text-graphite transition-transform group-open:rotate-180" />
                </div>
              </summary>

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {buildTechnicalOverviewItems(summary).map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.label}
                      className="rounded-md border border-line bg-white p-3 shadow-sm"
                    >
                      <div className="flex items-center gap-2">
                        <Icon size={15} className="shrink-0 text-signal" />
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-graphite">
                          {item.label}
                        </p>
                      </div>
                      <p
                        className="mt-2 truncate text-sm font-semibold text-ink"
                        title={item.value}
                      >
                        {item.value}
                      </p>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-graphite">
                        {item.description}
                      </p>
                    </div>
                  );
                })}
              </div>
            </details>

            <details className="group rounded-md border border-line bg-white p-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wide text-graphite">
                    Core Components
                  </span>
                  <h3 className="mt-1 text-lg font-semibold text-ink">
                    Which architectural modules matter?
                  </h3>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Braces size={18} className="text-signal" />
                  <ChevronDown size={16} className="text-graphite transition-transform group-open:rotate-180" />
                </div>
              </summary>

              {buildCoreComponents(summary).length ? (
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  {buildCoreComponents(summary).map((component) => (
                    <div
                      key={component.name}
                      className="rounded-md border border-line bg-white p-4 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-2">
                            <p className="truncate text-sm font-semibold text-ink">
                              {component.name}
                            </p>
                            <span
                              className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                                component.importance === "High"
                                  ? "bg-signal/10 text-signal"
                                  : component.importance === "Medium"
                                    ? "bg-amber/10 text-amber"
                                    : "bg-cloud text-graphite"
                              }`}
                            >
                              {component.importance}
                            </span>
                          </div>
                          <p className="mt-2 text-sm leading-6 text-graphite">
                            {component.purpose}
                          </p>
                        </div>
                        <span className="shrink-0 rounded bg-cloud px-2 py-1 text-xs font-semibold text-graphite">
                          {component.fileCount} file{component.fileCount === 1 ? "" : "s"}
                        </span>
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
                        <p
                          className="min-w-0 truncate text-xs text-graphite"
                          title={component.representativePath}
                        >
                          {component.representativePath ?? "No representative path"}
                        </p>
                        <button
                          type="button"
                          onClick={() =>
                            component.representativePath &&
                            onOpenInFiles({ filePath: component.representativePath })
                          }
                          disabled={!component.representativePath}
                          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-line bg-white px-2 text-xs font-medium text-graphite transition-colors hover:border-signal hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <ExternalLink size={13} />
                          Open
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-md border border-line bg-cloud p-4 text-sm leading-6 text-graphite">
                  Core components will appear when DevLens detects architectural paths such as controllers, services, routes, database, middleware, utilities, or configuration.
                </div>
              )}
            </details>

            <details className="group rounded-md border border-line bg-white p-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                <span className="font-semibold text-ink">Additional analysis notes</span>
                <ChevronDown size={16} className="text-graphite transition-transform group-open:rotate-180" />
              </summary>
              <div className="mt-4 grid gap-3 text-sm leading-6 text-graphite">
                {summary.docsPreview
                  .filter((item) => !/overview|key files|public symbols/i.test(item.title))
                  .map((item) => (
                    <div key={item.title} className="rounded-md bg-cloud px-3 py-2">
                      <p className="font-semibold text-ink">{item.title}</p>
                      <p className="mt-1">{item.body}</p>
                    </div>
                  ))}
                {summary.queuedSections.length ? (
                  <div className="rounded-md bg-cloud px-3 py-2">
                    <p className="font-semibold text-ink">Suggested follow-ups</p>
                    <p className="mt-1">
                      {summary.queuedSections.map((section) => section.title).join(", ")}
                    </p>
                  </div>
                ) : null}
              </div>
            </details>
          </div>
        ) : (
          <div className="rounded-md border border-line bg-white p-4 text-sm text-graphite">
            Repository Guide is not available yet. Analyze a repository to get
            a guided summary, onboarding path, and important files.
          </div>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  const [repoUrl, setRepoUrl] = useState(
    "https://github.com/Anwar-04/linkforge-url-shortener",
  );
  const [job, setJob] = useState<JobResponse | null>(null);
  const [tree, setTree] = useState<TreeResponse | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedNode, setSelectedNode] = useState<ExplorerNode | null>(null);
  const [selectedFileSource, setSelectedFileSource] =
    useState<FileSourceResponse | null>(null);
  const [highlightedLineRange, setHighlightedLineRange] = useState<{
    startLine: number;
    endLine: number;
  } | null>(null);
  const [isLoadingFileSource, setIsLoadingFileSource] = useState(false);
  const [fileSourceError, setFileSourceError] = useState<string | null>(null);
  const [fileQuery, setFileQuery] = useState("");
  const [languageFilter, setLanguageFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("function");
  const [searchResponse, setSearchResponse] = useState<SearchResponse | null>(
    null,
  );
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [docsSummary, setDocsSummary] = useState<DocsSummaryResponse | null>(
    null,
  );
  const [isLoadingDocsSummary, setIsLoadingDocsSummary] = useState(false);
  const [docsSummaryError, setDocsSummaryError] = useState<string | null>(null);
  const [enhancedGuide, setEnhancedGuide] =
    useState<GuideEnhanceResponse | null>(null);
  const [isEnhancingGuide, setIsEnhancingGuide] = useState(false);
  const [guideEnhanceStatus, setGuideEnhanceStatus] = useState<string | null>(null);
  const guideEnhancementCache = useRef(new Map<string, GuideEnhanceResponse>());
  const autoEnhancedRepositoryIds = useRef(new Set<string>());
  const [symbolsResponse, setSymbolsResponse] =
    useState<SymbolsResponse | null>(null);
  const [selectedSymbolId, setSelectedSymbolId] = useState<string | null>(null);
  const [selectedSymbolDetail, setSelectedSymbolDetail] =
    useState<RepositorySymbol | null>(null);
  const [isLoadingSymbols, setIsLoadingSymbols] = useState(false);
  const [isLoadingSymbolReferences, setIsLoadingSymbolReferences] =
    useState(false);
  const [symbolsError, setSymbolsError] = useState<string | null>(null);
  const [selectedSymbolSource, setSelectedSymbolSource] =
    useState<SymbolSourceResponse | null>(null);
  const [isLoadingSymbolSource, setIsLoadingSymbolSource] = useState(false);
  const [symbolSourceError, setSymbolSourceError] = useState<string | null>(
    null,
  );
  const [symbolQuery, setSymbolQuery] = useState("");
  const [symbolKindFilter, setSymbolKindFilter] = useState("all");
  const [activeSymbolTab, setActiveSymbolTab] =
    useState<SymbolRelationshipTab>("references");
  const [activeWorkspaceTab, setActiveWorkspaceTab] =
    useState<WorkspaceTab>("brief");
  const [devlensPrompt, setDevlensPrompt] = useState("Where should I start?");
  const [devlensResponse, setDevlensResponse] =
    useState<DevlensResponse | null>(null);
  const [isAskingDevlens, setIsAskingDevlens] = useState(false);
  const devlensAskInFlight = useRef(false);
  const [inspectedFilePaths, setInspectedFilePaths] = useState<string[]>([]);
  const [walkthroughState, setWalkthroughState] = useState<WalkthroughState>({
    activeStepPath: null,
    completedFiles: [],
    skippedFiles: [],
    lastOpenedCitation: null,
    isComplete: false,
  });
  const [recapCopyState, setRecapCopyState] = useState<"idle" | "copied">("idle");
  const [sidebarCopiedPath, setSidebarCopiedPath] = useState<string | null>(null);

  const repository = job?.repository;
  const repositoryReady = job?.status === "COMPLETED" && Boolean(repository);
  const explorerTree = useMemo(
    () => buildExplorerTree(tree?.nodes ?? []),
    [tree],
  );
  const visibleTree = useMemo(
    () => filterTree(explorerTree, fileQuery, languageFilter),
    [explorerTree, fileQuery, languageFilter],
  );
  const hasFileFilters = Boolean(fileQuery.trim()) || languageFilter !== "all";
  const languages = useMemo(() => {
    const values = new Set<string>();
    tree?.nodes.forEach((node) => {
      if (node.kind === "file" && node.language) values.add(node.language);
    });
    return [...values].sort();
  }, [tree]);
  const selectedSymbol =
    selectedSymbolDetail ??
    symbolsResponse?.symbols.find((symbol) => symbol.id === selectedSymbolId) ??
    null;
  const symbolOccurrenceLabels = useMemo(
    () => buildSymbolOccurrenceLabels(symbolsResponse?.symbols ?? []),
    [symbolsResponse],
  );
  const symbolKindOptions = useMemo(
    () => buildSymbolKindOptions(symbolsResponse?.symbols ?? []),
    [symbolsResponse],
  );
  const filteredSymbols = useMemo(
    () =>
      (symbolsResponse?.symbols ?? []).filter(
        (symbol) =>
          (symbolKindFilter === "all" || symbol.kind === symbolKindFilter) &&
          matchesSymbolQuery(symbol, symbolQuery),
      ),
    [symbolsResponse, symbolKindFilter, symbolQuery],
  );
  const selectedFileSymbols = useMemo(
    () =>
      selectedNode?.kind === "file"
        ? (symbolsResponse?.symbols ?? []).filter(
            (symbol) => symbol.filePath === selectedNode.path,
          )
        : [],
    [selectedNode, symbolsResponse],
  );
  const activeSymbolRelations = selectedSymbol
    ? activeSymbolTab === "calls"
      ? selectedSymbol.outgoingCalls
      : activeSymbolTab === "references"
        ? selectedSymbol.outgoingReferences
        : selectedSymbol.incomingReferences
    : [];
  const symbolRelationshipTabs: Array<{
    key: SymbolRelationshipTab;
    label: string;
    count: number;
  }> = [
    {
      key: "calls",
      label: "Calls",
      count: selectedSymbol?.outgoingCalls.length ?? 0,
    },
    {
      key: "references",
      label: "References",
      count: selectedSymbol?.outgoingReferences.length ?? 0,
    },
    {
      key: "referencedBy",
      label: "Inbound",
      count: selectedSymbol?.incomingReferences.length ?? 0,
    },
  ];
  const activeRelationshipEmptyState =
    activeSymbolTab === "calls"
      ? {
          title: "No calls from this symbol",
          description:
            "This symbol does not call another known symbol in the current analysis.",
        }
      : activeSymbolTab === "references"
        ? {
            title: "No outgoing references",
            description:
              "DevLens did not find other known symbols referenced from this symbol.",
          }
        : {
            title: "No inbound links",
            description:
              "No known symbols currently point back to this symbol.",
          };
  const guidedInvestigation = useMemo(
    () =>
      buildGuidedInvestigation({
        summary: docsSummary,
        selectedNode,
        selectedFileSource,
        selectedFileSymbols,
        inspectedFilePaths,
      }),
    [
      docsSummary,
      inspectedFilePaths,
      selectedFileSource,
      selectedFileSymbols,
      selectedNode,
    ],
  );
  const walkthrough = useMemo(
    () => buildWalkthroughSummary(docsSummary, walkthroughState),
    [docsSummary, walkthroughState],
  );
  const walkthroughHandoff = useMemo(
    () =>
      docsSummary && walkthrough
        ? buildWalkthroughHandoff(
            docsSummary,
            walkthrough,
            walkthroughState,
            inspectedFilePaths,
            guidedInvestigation,
          )
        : null,
    [
      docsSummary,
      guidedInvestigation,
      inspectedFilePaths,
      walkthrough,
      walkthroughState,
    ],
  );

  useEffect(() => {
    if (explorerTree.length) {
      setExpanded(new Set(collectDefaultExpanded(explorerTree)));
      setSelectedNode(null);
    }
  }, [explorerTree]);

  useEffect(() => {
    if (
      !job ||
      job.status === "COMPLETED" ||
      job.status === "FAILED" ||
      job.status === "CANCELLED"
    ) {
      return;
    }

    const interval = window.setInterval(async () => {
      try {
        const response = await fetch(`${API_URL}/jobs/${job.id}`);
        if (!response.ok) throw new Error("Unable to refresh job status.");
        const nextJob = (await response.json()) as JobResponse;
        setJob(nextJob);

        if (nextJob.status === "COMPLETED") {
          await loadRepositoryArtifacts(nextJob.repositoryId);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Unable to refresh job status.",
        );
      }
    }, 1200);

    return () => window.clearInterval(interval);
  }, [job]);

  useEffect(() => {
    if (!selectedSymbolId || !job?.repositoryId) {
      setSelectedSymbolDetail(null);
      return;
    }

    let cancelled = false;
    setIsLoadingSymbolReferences(true);

    fetch(`${API_URL}/repositories/${job.repositoryId}/symbols/${selectedSymbolId}/references`)
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.message ?? "Unable to load symbol references.");
        }
        return response.json() as Promise<SymbolReferencesResponse>;
      })
      .then((body) => {
        if (!cancelled) {
          setSelectedSymbolDetail(body.symbol);
          setSymbolsError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setSelectedSymbolDetail(null);
          setSymbolsError(
            err instanceof Error
              ? err.message
              : "Unable to load symbol references.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingSymbolReferences(false);
      });

    return () => {
      cancelled = true;
    };
  }, [job?.repositoryId, selectedSymbolId]);

  useEffect(() => {
    if (!selectedSymbolId || !job?.repositoryId) {
      setSelectedSymbolSource(null);
      setSymbolSourceError(null);
      return;
    }

    let cancelled = false;
    setIsLoadingSymbolSource(true);
    setSymbolSourceError(null);

    fetch(
      `${API_URL}/repositories/${job.repositoryId}/symbols/${selectedSymbolId}/source`,
    )
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.message ?? "Unable to load symbol source.");
        }
        return response.json() as Promise<SymbolSourceResponse>;
      })
      .then((body) => {
        if (!cancelled) {
          setSelectedSymbolSource(body);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setSelectedSymbolSource(null);
          setSymbolSourceError(
            err instanceof Error ? err.message : "Unable to load symbol source.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingSymbolSource(false);
      });

    return () => {
      cancelled = true;
    };
  }, [job?.repositoryId, selectedSymbolId]);

  useEffect(() => {
    if (
      !repositoryReady ||
      !job?.repositoryId ||
      !selectedNode ||
      selectedNode.kind !== "file"
    ) {
      setSelectedFileSource(null);
      setFileSourceError(null);
      setIsLoadingFileSource(false);
      return;
    }

    let cancelled = false;
    setIsLoadingFileSource(true);
    setFileSourceError(null);

    fetch(
      `${API_URL}/repositories/${job.repositoryId}/files/source?path=${encodeURIComponent(
        selectedNode.path,
      )}`,
    )
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.message ?? "Unable to load file preview.");
        }
        return response.json() as Promise<FileSourceResponse>;
      })
      .then((body) => {
        if (!cancelled) {
          setSelectedFileSource(body);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setSelectedFileSource(null);
          setFileSourceError(
            getActionableErrorMessage(err, "Unable to load file preview."),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingFileSource(false);
      });

    return () => {
      cancelled = true;
    };
  }, [job?.repositoryId, repositoryReady, selectedNode]);

  useEffect(() => {
    if (!repositoryReady || !job?.repositoryId) {
      setDocsSummary(null);
      setDocsSummaryError(null);
      setIsLoadingDocsSummary(false);
      setEnhancedGuide(null);
      setGuideEnhanceStatus(null);
      setIsEnhancingGuide(false);
      return;
    }

    let cancelled = false;
    setIsLoadingDocsSummary(true);
    setDocsSummaryError(null);
    setEnhancedGuide(null);
    setGuideEnhanceStatus(null);

    fetch(`${API_URL}/repositories/${job.repositoryId}/docs/summary`)
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(
            body?.message ?? "Unable to load Repository Guide.",
          );
        }
        return response.json() as Promise<DocsSummaryResponse>;
      })
      .then((body) => {
        if (!cancelled) {
          setDocsSummary(body);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setDocsSummary(null);
          setDocsSummaryError(
            getActionableErrorMessage(err, "Unable to load Repository Guide."),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingDocsSummary(false);
      });

    return () => {
      cancelled = true;
    };
  }, [job?.repositoryId, repositoryReady]);

  useEffect(() => {
    const repositoryId = job?.repositoryId;
    if (!repositoryReady || !repositoryId || !docsSummary) return;

    const cachedGuide = guideEnhancementCache.current.get(repositoryId);
    if (cachedGuide) {
      setEnhancedGuide(cachedGuide);
      setGuideEnhanceStatus("Guide summary improved with repository citations.");
      return;
    }

    if (autoEnhancedRepositoryIds.current.has(repositoryId)) return;
    autoEnhancedRepositoryIds.current.add(repositoryId);
    void enhanceRepositoryGuide("auto");
  }, [docsSummary, job?.repositoryId, repositoryReady]);

  async function loadRepositoryArtifacts(repositoryId: string) {
    setIsLoadingSymbols(true);
    setSymbolsError(null);

    try {
      const [treeResponse, symbolsFetchResponse] = await Promise.all([
        fetch(`${API_URL}/repositories/${repositoryId}/tree`),
        fetch(`${API_URL}/repositories/${repositoryId}/symbols`),
      ]);

      if (treeResponse.ok) {
        setTree((await treeResponse.json()) as TreeResponse);
      }

      if (!symbolsFetchResponse.ok) {
        const body = await symbolsFetchResponse.json().catch(() => null);
        throw new Error(body?.message ?? "Unable to load symbol intelligence.");
      }

      const nextSymbols =
        (await symbolsFetchResponse.json()) as SymbolsResponse;
      setSymbolsResponse(nextSymbols);
      setSelectedSymbolId((current) => current ?? nextSymbols.symbols[0]?.id ?? null);
      setSelectedSymbolDetail(null);
    } catch (err) {
      setSymbolsError(
        getActionableErrorMessage(err, "Unable to load code details."),
      );
    } finally {
      setIsLoadingSymbols(false);
    }
  }

  async function enhanceRepositoryGuide(trigger: "auto" | "manual" = "manual") {
    if (!repositoryReady || !job?.repositoryId || !docsSummary) return;

    setIsEnhancingGuide(true);
    setGuideEnhanceStatus(
      trigger === "auto"
        ? "Improving guide summary..."
        : "Improving guide summary..."
    );

    try {
      const response = await fetch(
        `${API_URL}/repositories/${job.repositoryId}/guide/enhance`,
        {
          method: "POST",
        },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message ?? "Unable to improve Repository Guide.");
      }

      const body = (await response.json()) as GuideEnhanceResponse;
      if (body.mode === "provider" && body.summary) {
        guideEnhancementCache.current.set(job.repositoryId, body);
        setEnhancedGuide(body);
        setGuideEnhanceStatus("Guide summary improved with repository citations.");
      } else if (body.fallbackReason === "missing_credentials") {
        setEnhancedGuide(null);
        setGuideEnhanceStatus("Using file-backed guide because provider credentials are not configured.");
      } else {
        setEnhancedGuide(null);
        setGuideEnhanceStatus("Using file-backed guide because enhanced summary was unavailable.");
      }
    } catch (err) {
      setEnhancedGuide(null);
      setGuideEnhanceStatus(
        getActionableErrorMessage(err, "Unable to improve Repository Guide."),
      );
    } finally {
      setIsEnhancingGuide(false);
    }
  }

  async function analyzeRepository() {
    setError(null);
    setTree(null);
    setSelectedNode(null);
    setExpanded(new Set());
    setSearchResponse(null);
    setSearchError(null);
    setDocsSummary(null);
    setDocsSummaryError(null);
    setEnhancedGuide(null);
    setGuideEnhanceStatus(null);
    setIsEnhancingGuide(false);
    setSelectedFileSource(null);
    setFileSourceError(null);
    setIsLoadingFileSource(false);
    setSymbolsResponse(null);
    setSelectedSymbolId(null);
    setSelectedSymbolDetail(null);
    setSymbolsError(null);
    setSelectedSymbolSource(null);
    setSymbolSourceError(null);
    setSymbolQuery("");
    setSymbolKindFilter("all");
    setActiveSymbolTab("references");
    setDevlensResponse(null);
    setIsAskingDevlens(false);
    setInspectedFilePaths([]);
    setWalkthroughState({
      activeStepPath: null,
      completedFiles: [],
      skippedFiles: [],
      lastOpenedCitation: null,
      isComplete: false,
    });
    setIsSubmitting(true);

    try {
      const response = await fetch(`${API_URL}/repositories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: repoUrl }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(
          body?.message ?? "Unable to create repository analysis job.",
        );
      }

      const created = await response.json();
      const jobResponse = await fetch(
        `${API_URL}/jobs/${created.analysisJobId}`,
      );
      setJob((await jobResponse.json()) as JobResponse);
    } catch (err) {
      setError(getActionableErrorMessage(err, "Unable to start repository analysis."));
    } finally {
      setIsSubmitting(false);
    }
  }

  function toggleFolder(path: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  async function fetchRepositorySearch(query: string, limit = 8) {
    if (!job?.repositoryId || !repositoryReady) return null;

    const response = await fetch(
      `${API_URL}/repositories/${job.repositoryId}/search?q=${encodeURIComponent(query)}&limit=${limit}`,
    );
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.message ?? "Unable to search repository.");
    }
    return (await response.json()) as SearchResponse;
  }

  function buildSelectedFilePreviewText() {
    if (!selectedFileSource?.file.previewLines.length) return undefined;
    return selectedFileSource.file.previewLines
      .slice(0, 80)
      .map((line) => `${line.lineNumber}: ${line.content}`)
      .join("\n");
  }

  function shouldUseProviderAssistant(prompt: string) {
    return !/walkthrough|handoff|recap|export|shareable|onboarding notes|teammate|what did i learn|what is still unknown|after this walkthrough|why am i reading|what should i look for|what depends|what should i verify|safe to skip|show evidence|mark this file done|skip this file|summarize walkthrough progress/i.test(prompt);
  }

  async function fetchProviderAssistantResponse(
    prompt: string,
    localResponse: DevlensResponse,
    assistantSearch?: SearchResponse | null,
  ): Promise<DevlensResponse> {
    if (!job?.repositoryId || !repositoryReady || !docsSummary) {
      return { ...localResponse, mode: "local" };
    }

    const requestId =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? `chat_${crypto.randomUUID()}`
        : `chat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

    const response = await fetch(
      `${API_URL}/repositories/${job.repositoryId}/assistant/ask`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          question: prompt,
          context: {
            repository: {
              owner: docsSummary.repository.owner,
              name: docsSummary.repository.name,
              url: docsSummary.repository.url,
              languages: docsSummary.repository.detectedLanguages,
              frameworks: docsSummary.repository.detectedFrameworks,
              fileCount: docsSummary.repository.fileCount,
            },
            guide: {
              summary: docsSummary.understanding.summary,
              purpose: docsSummary.understanding.purpose,
              architecture: docsSummary.understanding.architecture,
              readingOrder: buildReadingOrderCitations(docsSummary),
            },
            selectedFile:
              selectedNode?.kind === "file"
                ? {
                    path: selectedNode.path,
                    role: getFileRoleLabel(selectedNode.path),
                    previewStartLine:
                      selectedFileSource?.file.previewStartLine ?? undefined,
                    previewEndLine:
                      selectedFileSource?.file.previewEndLine ?? undefined,
                    preview: buildSelectedFilePreviewText(),
                    related: selectedFileSymbols.slice(0, 5).map(buildSymbolCitation),
                  }
                : undefined,
            searchResults: [
              ...localResponse.citations,
              ...((assistantSearch?.results ?? []).slice(0, 5).map(buildSearchCitation)),
            ],
            sourceSnippets:
              selectedNode?.kind === "file" && selectedFileSource?.file.previewLines.length
                ? [
                    {
                      path: selectedNode.path,
                      startLine:
                        selectedFileSource.file.previewStartLine ?? undefined,
                      endLine: selectedFileSource.file.previewEndLine ?? undefined,
                      content: buildSelectedFilePreviewText() ?? "",
                    },
                  ]
                : [],
            localAnswer: localResponse.answer,
          },
        }),
      },
    );

    if (!response.ok) {
      return {
        ...localResponse,
        mode: "fallback",
        fallbackReason: "provider_error",
      };
    }

    const providerResponse = (await response.json()) as ProviderAssistantResponse;
    if (providerResponse.mode === "fallback") {
      return {
        answer: providerResponse.answer || localResponse.answer,
        citations: providerResponse.citations.length
          ? providerResponse.citations
          : localResponse.citations,
        mode: "fallback",
        fallbackReason: providerResponse.fallbackReason,
      };
    }

    return providerResponse;
  }

  async function searchRepository(
    event?: React.FormEvent<HTMLFormElement>,
    nextQuery?: string,
  ) {
    event?.preventDefault();
    const query = (nextQuery ?? searchQuery).trim();
    if (!query || !job?.repositoryId || !repositoryReady) return;

    setIsSearching(true);
    setSearchError(null);

    try {
      const nextSearchResponse = await fetchRepositorySearch(query, 8);
      if (nextSearchResponse) setSearchResponse(nextSearchResponse);
    } catch (err) {
      setSearchError(
        getActionableErrorMessage(err, "Unable to search repository."),
      );
    } finally {
      setIsSearching(false);
    }
  }

  function focusSearchResult(result: SearchResult) {
    setActiveWorkspaceTab("files");
    setFileQuery("");
    setLanguageFilter("all");
    setHighlightedLineRange({
      startLine: result.startLine,
      endLine: result.endLine,
    });
    setExpanded((current) => {
      const next = new Set(current);
      getParentPaths(result.path).forEach((path) => next.add(path));
      return next;
    });
    const node = findExplorerNode(explorerTree, result.path);
    if (node) setSelectedNode(node);
  }

  function focusSymbolFile(
    symbol: { filePath: string },
    lineRange?: { startLine: number; endLine: number },
  ) {
    setInspectedFilePaths((current) =>
      current.includes(symbol.filePath)
        ? current
        : [symbol.filePath, ...current].slice(0, 8),
    );
    setFileQuery("");
    setLanguageFilter("all");
    setHighlightedLineRange(lineRange ?? null);
    setExpanded((current) => {
      const next = new Set(current);
      getParentPaths(symbol.filePath).forEach((path) => next.add(path));
      return next;
    });
    const node = findExplorerNode(explorerTree, symbol.filePath);
    if (node) setSelectedNode(node);
  }

  function clearFileFilters() {
    setFileQuery("");
    setLanguageFilter("all");
  }

  async function copyExplorerPath(path: string) {
    await navigator.clipboard.writeText(path);
    setSidebarCopiedPath(path);
    window.setTimeout(() => setSidebarCopiedPath(null), 1400);
  }

  function expandAllFolders() {
    const paths: string[] = [];
    const visit = (node: ExplorerNode) => {
      if (node.kind !== "folder") return;
      paths.push(node.path);
      node.children.forEach(visit);
    };
    explorerTree.forEach(visit);
    setExpanded(new Set(paths));
  }

  function collapseAllFolders() {
    setExpanded(new Set());
  }

  function revealSelectedFile() {
    if (!selectedNode) return;
    setExpanded((current) => {
      const next = new Set(current);
      getParentPaths(selectedNode.path).forEach((path) => next.add(path));
      return next;
    });
    setFileQuery("");
    setLanguageFilter("all");
    setActiveWorkspaceTab("files");
  }

  function openPathInFiles(path: string) {
    focusSymbolFile({ filePath: path });
    setActiveWorkspaceTab("files");
  }

  function openCitationInFiles(source: DevlensCitation) {
    setWalkthroughState((current) => ({
      ...current,
      lastOpenedCitation: source,
    }));
    focusSymbolFile(
      { filePath: source.path },
      source.startLine && source.endLine
        ? {
            startLine: source.startLine,
            endLine: source.endLine,
          }
        : undefined,
    );
    setActiveWorkspaceTab("files");
  }

  function startWalkthrough() {
    if (!docsSummary) return;
    const firstStep = getWalkthroughPath(docsSummary)[0] ?? null;
    const nextState = {
      activeStepPath: firstStep?.path ?? null,
      completedFiles: [],
      skippedFiles: [],
      lastOpenedCitation: firstStep,
      isComplete: false,
    };
    const nextSummary = buildWalkthroughSummary(docsSummary, nextState);
    setWalkthroughState(nextState);
    setDevlensPrompt("Start walkthrough");
    setDevlensResponse(
      nextSummary
        ? buildWalkthroughStepResponse(
            docsSummary,
            nextSummary,
            selectedNode,
            selectedFileSymbols,
            selectedFileSource,
          )
        : {
            answer:
              "The Repository Guide does not have a walkthrough path yet. Use Search and important files as the first anchors.",
            citations: [],
          },
    );
    if (firstStep) openCitationInFiles(firstStep);
  }

  function continueWalkthrough() {
    if (!docsSummary) return;
    const currentSummary = buildWalkthroughSummary(docsSummary, walkthroughState);
    const target = currentSummary?.current ?? currentSummary?.next ?? null;
    setDevlensPrompt("Continue walkthrough");
    setDevlensResponse(
      currentSummary
        ? buildWalkthroughStepResponse(
            docsSummary,
            currentSummary,
            selectedNode,
            selectedFileSymbols,
            selectedFileSource,
          )
        : {
            answer:
              "The Repository Guide does not have a walkthrough path yet. Use Search and important files as the first anchors.",
            citations: [],
          },
    );
    if (target) openCitationInFiles(target);
  }

  function finishWalkthrough() {
    if (!docsSummary || !walkthrough) return;
    const handoff = buildWalkthroughHandoff(
      docsSummary,
      walkthrough,
      {
        ...walkthroughState,
        isComplete: true,
      },
      inspectedFilePaths,
      guidedInvestigation,
    );

    setWalkthroughState((current) => ({
      ...current,
      activeStepPath: null,
      isComplete: true,
    }));
    setDevlensPrompt("Give me onboarding handoff notes");
    setDevlensResponse(buildWalkthroughHandoffResponse(handoff));
  }

  async function copyRepositoryRecap() {
    if (!docsSummary || !walkthroughHandoff || !walkthrough) return;

    await navigator.clipboard.writeText(
      buildRepositoryRecapText(docsSummary, walkthroughHandoff, walkthrough),
    );
    setRecapCopyState("copied");
    window.setTimeout(() => setRecapCopyState("idle"), 1600);
  }

  function markWalkthroughFileDone() {
    if (!docsSummary || !walkthrough?.current) return;
    const currentPath = walkthrough.current.path;
    const path = getWalkthroughPath(docsSummary);
    const currentIndex = path.findIndex((citation) => citation.path === currentPath);
    const completed = [...new Set([...walkthroughState.completedFiles, currentPath])];
    const skipped = walkthroughState.skippedFiles.filter((path) => path !== currentPath);
    const next =
      path
        .slice(Math.max(currentIndex + 1, 0))
        .find(
          (citation) =>
            !completed.includes(citation.path) && !skipped.includes(citation.path),
        ) ?? null;

    const nextState = {
      activeStepPath: next?.path ?? null,
      completedFiles: completed,
      skippedFiles: skipped,
      lastOpenedCitation: next ?? walkthrough.current,
      isComplete: !next,
    };
    const nextSummary = buildWalkthroughSummary(docsSummary, nextState);
    setWalkthroughState(nextState);
    setDevlensPrompt(next ? "Continue walkthrough" : "Summarize walkthrough progress");
    setDevlensResponse(
      nextSummary
        ? next
          ? buildWalkthroughStepResponse(
              docsSummary,
              nextSummary,
              selectedNode,
              selectedFileSymbols,
              selectedFileSource,
            )
          : buildWalkthroughHandoffResponse(
              buildWalkthroughHandoff(
                docsSummary,
                nextSummary,
                nextState,
                inspectedFilePaths,
                guidedInvestigation,
              ),
            )
        : {
            answer: "Walkthrough progress is not available yet.",
            citations: [],
          },
    );
    if (next) openCitationInFiles(next);
  }

  function skipWalkthroughFile() {
    if (!docsSummary || !walkthrough?.current) return;
    const currentPath = walkthrough.current.path;
    const path = getWalkthroughPath(docsSummary);
    const currentIndex = path.findIndex((citation) => citation.path === currentPath);
    const skipped = [...new Set([...walkthroughState.skippedFiles, currentPath])];
    const completed = walkthroughState.completedFiles.filter((path) => path !== currentPath);
    const next =
      path
        .slice(Math.max(currentIndex + 1, 0))
        .find(
          (citation) =>
            !completed.includes(citation.path) && !skipped.includes(citation.path),
        ) ?? null;

    const nextState = {
      activeStepPath: next?.path ?? null,
      completedFiles: completed,
      skippedFiles: skipped,
      lastOpenedCitation: next ?? walkthrough.current,
      isComplete: !next,
    };
    const nextSummary = buildWalkthroughSummary(docsSummary, nextState);
    setWalkthroughState(nextState);
    setDevlensPrompt(next ? "Continue walkthrough" : "Summarize walkthrough progress");
    setDevlensResponse(
      nextSummary
        ? next
          ? buildWalkthroughStepResponse(
              docsSummary,
              nextSummary,
              selectedNode,
              selectedFileSymbols,
              selectedFileSource,
            )
          : buildWalkthroughHandoffResponse(
              buildWalkthroughHandoff(
                docsSummary,
                nextSummary,
                nextState,
                inspectedFilePaths,
                guidedInvestigation,
              ),
            )
        : {
            answer: "Walkthrough progress is not available yet.",
            citations: [],
          },
    );
    if (next) openCitationInFiles(next);
  }

  function explainSelectedFile() {
    if (selectedNode?.kind !== "file") return;
    void askDevlens(`Explain ${selectedNode.path} and how it fits into this repository.`);
  }

  function findSelectedFileReferences() {
    if (selectedNode?.kind !== "file") return;
    const symbolQuery =
      selectedFileSymbols[0]?.name ??
      selectedNode.name.replace(/\.[^.]+$/, "");
    setSearchQuery(symbolQuery);
    setActiveWorkspaceTab("search");
    void searchRepository(undefined, symbolQuery);
  }

  function selectSymbol(symbolId: string) {
    const symbol =
      symbolsResponse?.symbols.find((item) => item.id === symbolId) ??
      selectedSymbolDetail;
    setSelectedSymbolId(symbolId);

    if (symbol) {
      focusSymbolFile(symbol);
    }
  }

  function openSymbolInFiles(symbol: { filePath: string }) {
    focusSymbolFile(symbol);
    setActiveWorkspaceTab("files");
  }

  function inspectSymbol(symbolId: string) {
    selectSymbol(symbolId);
    setActiveWorkspaceTab("files");
  }

  function buildDevlensResponse(
    prompt: string,
    assistantSearch?: SearchResponse | null,
  ): DevlensResponse {
    if (!repositoryReady || !docsSummary) {
      return {
        answer:
          "Analyze a repository first. Once DevLens has file and symbol context, this panel can guide you through the repo with file-backed starting points.",
        citations: [],
      };
    }

    const startHere = buildStartHereItems(docsSummary);
    const keyFiles = buildKeyFileItems(docsSummary);
    const codeSignals = docsSummary.symbols.mostConnected.slice(0, 3);
    const searchHits = assistantSearch?.results ?? [];
    const readingOrder = buildReadingOrderCitations(docsSummary);
    const selectedFileCitation =
      selectedNode?.kind === "file"
        ? {
            path: selectedNode.path,
            label: selectedNode.path,
            reason: `${getFileRoleLabel(selectedNode.path)} file currently selected in the workspace.`,
            startLine: selectedFileSource?.file.previewStartLine ?? undefined,
            endLine: selectedFileSource?.file.previewEndLine ?? undefined,
          }
        : null;
    const selectedFileRole =
      selectedNode?.kind === "file" ? getFileRoleLabel(selectedNode.path) : null;
    const walkthroughSummary = buildWalkthroughSummary(docsSummary, walkthroughState);

    if (/walkthrough|handoff|recap|export|shareable|onboarding notes|teammate|what did i learn|what is still unknown|after this walkthrough|why am i reading|what should i look for|what depends|what should i verify|safe to skip|show evidence|mark this file done|skip this file|summarize walkthrough progress/i.test(prompt)) {
      if (!walkthroughSummary) {
        return {
          answer:
            "The Repository Guide does not have a walkthrough path yet. Use important files and Search as the first onboarding anchors.",
          citations: [],
        };
      }

      if (/copy recap|export handoff|shareable recap|make onboarding notes|summarize this for a teammate|create handoff notes/i.test(prompt)) {
        return buildRepositoryRecapResponse(
          docsSummary,
          buildWalkthroughHandoff(
            docsSummary,
            walkthroughSummary,
            walkthroughState,
            inspectedFilePaths,
            guidedInvestigation,
          ),
          walkthroughSummary,
        );
      }

      if (walkthroughSummary.isComplete) {
        return buildWalkthroughHandoffResponse(
          buildWalkthroughHandoff(
            docsSummary,
            walkthroughSummary,
            walkthroughState,
            inspectedFilePaths,
            guidedInvestigation,
          ),
        );
      }

      if (/finish walkthrough|handoff|what did i learn|what is still unknown|after this walkthrough|give me onboarding/i.test(prompt)) {
        return buildWalkthroughHandoffResponse(
          buildWalkthroughHandoff(
            docsSummary,
            walkthroughSummary,
            walkthroughState,
            inspectedFilePaths,
            guidedInvestigation,
          ),
        );
      }

      if (/summarize walkthrough progress|progress/i.test(prompt)) {
        if (walkthroughSummary.isComplete) {
          return buildWalkthroughHandoffResponse(
            buildWalkthroughHandoff(
              docsSummary,
              walkthroughSummary,
              walkthroughState,
              inspectedFilePaths,
              guidedInvestigation,
            ),
          );
        }
        return buildWalkthroughProgressResponse(
          docsSummary,
          walkthroughSummary,
          walkthroughState,
        );
      }

      if (/why am i reading|what should i look for|what depends|what should i verify|safe to skip|show evidence|continue walkthrough|start walkthrough|mark this file done|skip this file/i.test(prompt)) {
        return buildWalkthroughStepResponse(
          docsSummary,
          walkthroughSummary,
          selectedNode,
          selectedFileSymbols,
          selectedFileSource,
        );
      }
    }

    if (/start|onboard|first/i.test(prompt)) {
      const citations = readingOrder.length
        ? readingOrder
        : startHere.slice(0, 4).map((item) => buildPathCitation(item.path, item.reason));
      return {
        answer: citations.length
          ? `Start here: ${citations
              .slice(0, 4)
              .map((item, index) => `${index + 1}. ${item.path} (${item.reason})`)
              .join(" ")}. Open the first citation, skim its setup or entry-point notes, then move through the list in order.`
          : "Start with the README, package metadata, and the first source entry point you find in the file tree.",
        citations: citations.slice(0, 4),
      };
    }

    if (/language|languages|tech stack|stack|framework|frameworks/i.test(prompt)) {
      const languages = docsSummary.repository.detectedLanguages;
      const frameworks = docsSummary.repository.detectedFrameworks;
      const topLanguages = docsSummary.architecture.topLanguages
        .slice(0, 3)
        .map((item) => `${item.language} (${item.files} files)`);
      const citations = dedupeCitations([
        ...readingOrder.slice(0, 2),
        ...startHere.slice(0, 2).map((item) => buildPathCitation(item.path, item.reason)),
      ]).slice(0, 4);

      return {
        answer: `This repository mainly uses ${
          languages.length ? languages.join(", ") : "the languages detected from the analyzed files"
        }${
          frameworks.length ? `, with ${frameworks.join(", ")} showing up as framework signals` : ""
        }. The strongest language counts are ${
          topLanguages.length ? topLanguages.join(", ") : "still being inferred from the available files"
        }. Next, open package.json or the README citation to confirm runtime scripts, dependencies, and setup details.`,
        citations,
      };
    }

    if (/important files|business logic|where.*logic|core logic/i.test(prompt)) {
      const citations = searchHits.length
        ? searchHits.slice(0, 4).map(buildSearchCitation)
        : keyFiles
            .slice(0, 4)
            .map((item) => buildPathCitation(item.path, item.reason));

      return {
        answer: searchHits.length
          ? `The strongest current matches are ${buildSearchTrail(searchHits)} Open the citations to inspect the exact source lines before following adjacent handlers, services, or data modules.`
          : keyFiles.length
            ? `The most useful files to inspect are ${keyFiles
                .map((item) => `${item.path} (${item.reason})`)
                .join("; ")}. Open the citations to read the source preview, then compare those files with the Repository Guide reading order.`
            : "DevLens has not identified key files yet, but the file tree and search can still help you find entry points.",
        citations,
      };
    }

    if (/routing|request flow|trace.*flow|how.*request/i.test(prompt)) {
      return {
        answer: searchHits.length
          ? `This looks like a ${inferProjectType(
              docsSummary,
            )}. The route-flow trail is ${buildSearchTrail(
              searchHits,
            )} Follow those citations first, then inspect nearby handlers, middleware, and services from the file view.`
          : `This looks like a ${inferProjectType(
              docsSummary,
            )}. Search for terms like route, handler, controller, middleware, and request to trace the flow through source files.`,
        citations: searchHits.slice(0, 4).map(buildSearchCitation),
      };
    }

    if (/authentication|auth|database|data layer|persistence/i.test(prompt)) {
      const term = /authentication|auth/i.test(prompt)
        ? "auth, session, token, middleware, login"
        : "database, prisma, model, repository, query";
      return {
        answer: searchHits.length
          ? `DevLens found ${searchHits.length} matches for ${term}. Start with ${buildSearchTrail(
              searchHits,
            )} and use the citations to open the exact lines.`
          : `I did not find a strong repository match for ${term}. Try Search with a narrower project term, then DevLens can cite the matching source lines.`,
        citations: searchHits.slice(0, 4).map(buildSearchCitation),
      };
    }

    if (/architecture|component|module|structured/i.test(prompt)) {
      return {
        answer: `${inferProjectType(docsSummary)} with ${
          docsSummary.repository.detectedFrameworks.join(", ") || "no major framework detected"
        }. Complexity is ${inferComplexity(
          docsSummary,
        ).toLowerCase()}, and the recommended onboarding time is ${estimateOnboarding(
          docsSummary,
        )}. The Repository Guide describes the architecture as: ${docsSummary.understanding.architecture} Start with the reading-order citations, then inspect related code details.`,
        citations: dedupeCitations([
          ...readingOrder.slice(0, 3),
          ...codeSignals.slice(0, 2).map(buildSymbolCitation),
        ]),
      };
    }

    if (/selected file|current file|this file|explain .*fits into/i.test(prompt)) {
      if (selectedNode?.kind !== "file") {
        return {
          answer:
            "Select a file in the explorer first, then DevLens can ground the explanation in that file.",
          citations: [],
        };
      }

      const previewStart = selectedFileSource?.file.previewStartLine ?? undefined;
      const previewEnd = selectedFileSource?.file.previewEndLine ?? undefined;
      const fileMatter = buildFileMatterSummary(selectedNode.path, selectedFileSymbols);
      const relatedCitations = selectedFileSymbols.slice(0, 3).map(buildSymbolCitation);
      const relatedNames = relatedCitations.map(formatCitationPath).join("; ");

      return {
        answer: `${selectedNode.path} is selected. ${fileMatter.purpose} ${fileMatter.whyRead} ${
          previewStart && previewEnd
            ? `The visible source preview covers ${formatCompactLineRange({
                startLine: previewStart,
                endLine: previewEnd,
              })}.`
            : "Open the source preview for line-level context."
        }${
          relatedNames
            ? ` Follow the related code details next: ${relatedNames}.`
            : ` Use ${fileMatter.suggestedNext} as the next recommended step.`
        }`,
        citations: dedupeCitations([
          {
            path: selectedNode.path,
            label: selectedNode.path,
            reason: fileMatter.role,
            startLine: previewStart,
            endLine: previewEnd,
          },
          ...relatedCitations,
        ]),
      };
    }

    if (/next|follow.?up|inspect next|what now/i.test(prompt)) {
      const citations = dedupeCitations([
        ...(selectedFileCitation ? [selectedFileCitation] : []),
        ...selectedFileSymbols.slice(0, 3).map(buildSymbolCitation),
        ...readingOrder.slice(0, 3),
        ...searchHits.slice(0, 2).map(buildSearchCitation),
      ]).slice(0, 5);

      return {
        answer: selectedNode?.kind === "file"
          ? `From ${selectedNode.path}, inspect the cited ${selectedFileRole?.toLowerCase()} context first, then follow any related symbols and compare that file against the repository reading order. This keeps the path grounded in source lines instead of guessing from filenames alone.`
          : `Use the repository reading order as the next trail: ${readingOrder
              .slice(0, 4)
              .map((item, index) => `${index + 1}. ${item.path}`)
              .join(" ")}. Open each citation in Files and follow related code details from there.`,
        citations,
      };
    }

    if (/repository|repo|project|explain|what.*about|tell me about/i.test(prompt)) {
      return {
        answer: `This repo is about ${docsSummary.understanding.purpose}. ${docsSummary.understanding.summary} It appears to be a ${inferProjectType(
          docsSummary,
        )} with ${docsSummary.repository.fileCount} files, ${
          docsSummary.repository.detectedLanguages.join(", ") || "detected source"
        }, and ${docsSummary.symbols.counts.total} code details. Next, open the README citation for setup context, then package.json for runtime scripts and dependencies.`,
        citations: dedupeCitations([
          ...readingOrder.slice(0, 3),
          ...codeSignals.slice(0, 2).map(buildSymbolCitation),
        ]),
      };
    }

    if (codeSignals.length) {
      return {
        answer: `I found a few concrete code anchors for that: ${codeSignals
          .map((symbol) => `${symbol.name} in ${symbol.filePath}`)
          .join("; ")}. Open those citations to inspect the source lines, then ask a narrower follow-up about the behavior you want to trace.`,
        citations: codeSignals.map(buildSymbolCitation),
      };
    }

    return {
      answer:
        "Use the Repository Guide first, then open key files and search for feature terms. DevLens will keep answers tied to repository files and source lines it can cite.",
      citations: startHere
        .slice(0, 3)
        .map((item) => buildPathCitation(item.path, item.reason)),
    };
  }

  function getAssistantSearchQuery(prompt: string): string | null {
    if (/routing|request flow|trace.*flow|how.*request/i.test(prompt)) {
      return "route handler controller middleware request";
    }
    if (/authentication|auth/i.test(prompt)) {
      return "auth session token middleware login";
    }
    if (/database|data layer|persistence/i.test(prompt)) {
      return "database prisma model repository query";
    }
    if (/business logic|where.*logic|core logic/i.test(prompt)) {
      return "service handler controller business logic";
    }
    if (/next|follow.?up|inspect next|what now/i.test(prompt)) {
      return selectedNode?.kind === "file"
        ? selectedNode.name.replace(/\.[^.]+$/, "")
        : null;
    }
    if (/walkthrough|handoff|recap|export|shareable|onboarding notes|teammate|what did i learn|what is still unknown|after this walkthrough|why am i reading|what should i look for|what depends|what should i verify|safe to skip|show evidence/i.test(prompt)) {
      return selectedNode?.kind === "file"
        ? selectedNode.name.replace(/\.[^.]+$/, "")
        : null;
    }
    return null;
  }

  async function askDevlens(prompt: string) {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) return;
    if (devlensAskInFlight.current) return;

    devlensAskInFlight.current = true;
    setDevlensPrompt(prompt);
    setIsAskingDevlens(true);

    try {
      const assistantSearchQuery = getAssistantSearchQuery(trimmedPrompt);
      const assistantSearch =
        assistantSearchQuery && repositoryReady
          ? await fetchRepositorySearch(assistantSearchQuery, 5)
          : null;

      if (assistantSearch) {
        setSearchQuery(assistantSearch.query);
        setSearchResponse(assistantSearch);
      }

      const localResponse = {
        ...buildDevlensResponse(trimmedPrompt, assistantSearch),
        mode: "local" as const,
      };
      const nextResponse = shouldUseProviderAssistant(trimmedPrompt)
        ? await fetchProviderAssistantResponse(
            trimmedPrompt,
            localResponse,
            assistantSearch,
          )
        : localResponse;

      setDevlensResponse(nextResponse);
    } catch (err) {
      setDevlensResponse({
        answer:
          err instanceof Error
            ? err.message
            : "DevLens could not gather repository context for that question.",
        citations: [],
      });
    } finally {
      devlensAskInFlight.current = false;
      setIsAskingDevlens(false);
    }
  }

  function handleSuggestedQuestion(prompt: string) {
    if (prompt === "Start walkthrough") {
      startWalkthrough();
      return;
    }
    if (prompt === "Continue walkthrough") {
      continueWalkthrough();
      return;
    }
    if (prompt === "Copy recap" && walkthroughHandoff) {
      void copyRepositoryRecap();
      return;
    }
    void askDevlens(prompt);
  }

  const activeStepIndex = getStepIndex(job?.currentStep);
  const isRunning =
    job?.status === "QUEUED" || job?.status === "RUNNING" || isSubmitting;
  const largeRepoModeLikely =
    job?.status === "COMPLETED" &&
    (repository?.fileCount ?? tree?.fileCount ?? 0) >= LARGE_REPO_FILE_CAP;
  const workspaceStats = [
    {
      label: "Repository",
      shortLabel: "Repo",
      value: repository ? repository.name : "Not analyzed",
      title: repository ? `${repository.owner}/${repository.name}` : "Not analyzed",
      icon: devlensIcons.metrics.repository,
      tone: "primary" as const,
    },
    {
      label: "Languages",
      shortLabel: "Stack",
      value: repository?.detectedLanguages.length
        ? repository.detectedLanguages.slice(0, 2).join(", ")
        : "Pending",
      title: repository?.detectedLanguages.length
        ? repository.detectedLanguages.join(", ")
        : "Pending",
      icon: devlensIcons.metrics.languages,
      tone: "code" as const,
    },
    {
      label: "Frameworks",
      shortLabel: "Framework",
      value: repository?.detectedFrameworks.length
        ? repository.detectedFrameworks.slice(0, 2).join(", ")
        : "Pending",
      title: repository?.detectedFrameworks.length
        ? repository.detectedFrameworks.join(", ")
        : "Pending",
      icon: devlensIcons.metrics.frameworks,
      tone: "code" as const,
    },
    {
      label: "Files",
      shortLabel: "Files",
      value: repository ? `${repository.fileCount} files` : "Pending",
      title: repository ? `${repository.fileCount} files` : "Pending",
      icon: devlensIcons.metrics.files,
      tone: "code" as const,
    },
    {
      label: "Complexity",
      shortLabel: "Complexity",
      value: docsSummary ? inferComplexity(docsSummary) : "Pending",
      title: docsSummary ? inferComplexity(docsSummary) : "Pending",
      icon: devlensIcons.metrics.complexity,
      tone: "warning" as const,
    },
    {
      label: "Onboarding",
      shortLabel: "Onboard",
      value: docsSummary ? estimateOnboarding(docsSummary) : "Pending",
      title: docsSummary ? estimateOnboarding(docsSummary) : "Pending",
      icon: devlensIcons.metrics.onboarding,
      tone: "primary" as const,
    },
  ];

  return (
    <main className="min-h-[100dvh] bg-cloud text-ink md:fixed md:inset-0 md:flex md:h-[100dvh] md:min-h-0 md:w-screen md:flex-col md:overflow-hidden">
      <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-line bg-white/95 px-6 shadow-sm backdrop-blur md:static">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-gradient-to-br from-signal to-[#4c1d95] text-white shadow-[0_12px_30px_rgba(124,58,237,0.28)]">
            <DevLensIcon icon={devlensIcons.product.assistant} size={18} />
          </div>
          <div>
            <p className="text-sm font-semibold leading-4">DevLens AI</p>
            <p className="text-xs text-graphite">
              Understand any codebase in minutes, not days.
            </p>
          </div>
        </div>
        <div className="rounded-md border border-line bg-white px-3 py-1.5 text-xs font-medium text-graphite shadow-sm">
          Repo understanding workspace
        </div>
      </header>

      <section className="grid min-w-0 grid-cols-1 overflow-x-hidden md:h-[calc(100dvh-4rem)] md:min-h-0 md:flex-1 md:grid-cols-[280px_minmax(0,1fr)_340px] md:overflow-hidden xl:grid-cols-[300px_minmax(0,1fr)_360px]">
        <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden border-b border-line bg-white/90 p-4 md:h-full md:border-b-0 md:border-r">
          <div className="rounded-md border border-line bg-white p-3 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">Repository Status</p>
                <p className="mt-1 truncate text-xs text-graphite">
                  {repository
                    ? `${repository.owner}/${repository.name}`
                    : "Paste a GitHub URL to begin"}
                </p>
              </div>
              <span
                className={`shrink-0 rounded px-2 py-1 text-xs font-semibold ${
                  job?.status === "COMPLETED"
                    ? "bg-mint/10 text-mint"
                    : job?.status === "FAILED"
                      ? "bg-red-50 text-red-700"
                      : "bg-white text-graphite"
                }`}
              >
                {formatJobStatus(job?.status)}
              </span>
            </div>

            {job ? (
              <div className="mt-3">
                <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                  <span className="truncate text-graphite">
                    {job.status === "COMPLETED"
                      ? `Analysis complete - ${repository?.fileCount ?? tree?.fileCount ?? 0} files - ${
                          symbolsResponse?.count ?? docsSummary?.symbols.counts.total ?? 0
                        } code details - ${calculateDuration(job)}`
                      : formatStepLabel(job.currentStep)}
                  </span>
                  <span className="font-semibold text-ink">{job.progress}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-line">
                  <div
                    className={`h-full rounded-full transition-all ${
                      job.status === "COMPLETED" ? "bg-mint" : "bg-signal"
                    }`}
                    style={{ width: `${job.progress}%` }}
                  />
                </div>
                {job.errorMessage ? (
                  <p className="mt-2 text-xs leading-5 text-red-600">
                    {getJobErrorMessage(job)}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          {isRunning ? (
            <div className="mt-4 rounded-md border border-line bg-white p-3">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-graphite">
                Analysis steps
              </p>
              <div className="space-y-2.5">
                {pipelineSteps.map((step, index) => {
                  const failed =
                    job?.status === "FAILED" &&
                    index === Math.max(activeStepIndex, 0);
                  const complete =
                    job?.status === "COMPLETED" ||
                    (activeStepIndex >= 0 && index < activeStepIndex);
                  const active =
                    index === activeStepIndex &&
                    (job?.status === "RUNNING" || job?.status === "QUEUED");
                  return (
                    <div key={step.key} className="flex gap-2.5 text-sm">
                      <span
                        className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${
                          failed
                            ? "bg-red-600 text-white"
                            : complete
                              ? "bg-mint text-white"
                              : active
                                ? "bg-signal text-white"
                                : "bg-line text-graphite"
                        }`}
                      >
                        {failed ? (
                          <DevLensIcon icon={devlensIcons.status.error} size={14} />
                        ) : complete ? (
                          <DevLensIcon icon={devlensIcons.status.success} size={14} />
                        ) : active ? (
                          <DevLensIcon
                            icon={devlensIcons.status.loading}
                            size={13}
                            className="animate-spin"
                          />
                        ) : (
                          index + 1
                        )}
                      </span>
                      <div className="min-w-0">
                        <p className={active ? "font-medium text-ink" : "text-graphite"}>
                          {step.label}
                        </p>
                        <p className="truncate text-xs text-graphite">
                          {step.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="mt-4 flex min-h-0 flex-1 flex-col">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">Files</p>
                <p className="text-xs text-graphite">
                  {tree ? `${tree.fileCount} files` : "Available after analysis"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={collapseAllFolders}
                  disabled={!explorerTree.length}
                  className="grid h-7 w-7 place-items-center rounded border border-line bg-white text-graphite transition-colors hover:border-signal hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
                  title="Collapse all"
                  aria-label="Collapse all folders"
                >
                  <ChevronRight size={14} />
                </button>
                <button
                  type="button"
                  onClick={expandAllFolders}
                  disabled={!explorerTree.length}
                  className="grid h-7 w-7 place-items-center rounded border border-line bg-white text-graphite transition-colors hover:border-signal hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
                  title="Expand all"
                  aria-label="Expand all folders"
                >
                  <ChevronDown size={14} />
                </button>
                <button
                  type="button"
                  onClick={revealSelectedFile}
                  disabled={!selectedNode}
                  className="grid h-7 w-7 place-items-center rounded border border-line bg-white text-graphite transition-colors hover:border-signal hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
                  title="Reveal selected file"
                  aria-label="Reveal selected file"
                >
                  <FolderOpen size={14} />
                </button>
              </div>
            </div>

            <div className="mb-3 flex h-9 items-center gap-2 rounded-md border border-line bg-white px-3 shadow-sm focus-within:border-signal focus-within:ring-2 focus-within:ring-signal/10">
              <Search size={14} className="shrink-0 text-graphite" />
              <input
                value={fileQuery}
                onChange={(event) => setFileQuery(event.target.value)}
                disabled={!repositoryReady}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none disabled:cursor-not-allowed"
                placeholder={repositoryReady ? "Filter files" : "Analyze first"}
              />
            </div>

            <div className="min-h-0 flex-1 overflow-auto rounded-md border border-line bg-white p-2 shadow-sm">
              {visibleTree.length ? (
                <ExplorerTree
                  nodes={visibleTree}
                  expanded={expanded}
                  selectedPath={selectedNode?.path}
                  onToggle={toggleFolder}
                  onCopyPath={copyExplorerPath}
                  onSelect={(node) => {
                    setSelectedNode(node);
                    if (node.kind === "file") setActiveWorkspaceTab("files");
                  }}
                />
              ) : (
                <div className="grid h-full place-items-center px-3 text-center text-sm leading-6 text-graphite">
                  {repositoryReady
                    ? "No files match the current filter. Clear the filter or expand the tree."
                    : "Paste a GitHub URL and run analysis to browse files here."}
                </div>
              )}
            </div>
            <p className="mt-2 h-4 text-xs text-graphite">
              {sidebarCopiedPath ? `Copied ${sidebarCopiedPath}` : "Right-click a file to copy its path."}
            </p>
          </div>
        </aside>

        <section className="min-h-0 min-w-0 overflow-y-auto bg-gradient-to-b from-cloud to-white/40 p-4 md:p-6">
          <div className="mb-5 rounded-md border border-line bg-white p-3 shadow-sm">
            <div className="grid gap-2 md:grid-cols-[1fr_auto]">
              <input
                value={repoUrl}
                onChange={(event) => setRepoUrl(event.target.value)}
                className="h-10 min-w-0 flex-1 rounded-md border border-line bg-white px-3 text-sm outline-none transition-colors focus:border-signal focus:ring-2 focus:ring-signal/10"
                placeholder="https://github.com/owner/repository"
              />
              <button
                onClick={analyzeRepository}
                disabled={isRunning}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-gradient-to-r from-signal to-[#5b21b6] px-4 text-sm font-semibold text-white shadow-[0_10px_20px_rgba(124,58,237,0.18)] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
              >
                {isRunning ? (
                <DevLensIcon
                  icon={devlensIcons.status.loading}
                  size={17}
                  className="animate-spin"
                />
              ) : (
                  <DevLensIcon icon={devlensIcons.product.repository} size={17} />
                )}
                Analyze repo
              </button>
            </div>
            {error ? (
              <div className="mt-3 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm leading-6 text-red-700">
                <DevLensIcon
                  icon={devlensIcons.status.notice}
                  size={16}
                  className="mt-0.5"
                />
                {error}
              </div>
            ) : null}
            {job ? (
              <div className="mt-2 rounded-md border border-line bg-cloud/50 px-3 py-2 text-sm">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className={statusTone(job.status)}>{formatJobStatus(job.status)}</span>
                  <span className="text-graphite">
                    {formatStepLabel(job.currentStep)}
                  </span>
                  <span className="font-medium">{job.progress}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-line">
                  <div
                    className={`h-full rounded-full transition-all ${
                      job.status === "COMPLETED" ? "bg-mint" : "bg-signal"
                    }`}
                    style={{ width: `${job.progress}%` }}
                  />
                </div>
                <div className="mt-1.5 flex items-center gap-2 text-xs text-graphite">
                  <Clock3 size={13} />
                  Elapsed: {calculateDuration(job)}
                  {job.errorMessage ? (
                    <span className="text-red-600">
                      - {getJobErrorMessage(job)}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1.5 text-xs leading-5 text-graphite">
                  {getAnalysisStatusMessage(job, repositoryReady)}
                </p>
                {largeRepoModeLikely ? (
                  <p className="mt-1 text-xs leading-5 text-graphite">
                    Large repository mode used. DevLens prioritized the most useful files for onboarding.
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="mt-2 text-xs leading-5 text-graphite">
                First run: use a public GitHub URL. After analysis, open Guide for the overview, Files for source, and Search for focused code lookup.
              </p>
            )}
          </div>

          <div className="mb-6 min-w-0 overflow-hidden rounded-md border border-line bg-white/95 p-3 shadow-sm">
            <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(158px,1fr))] gap-3">
              {workspaceStats.map((stat) => {
                const Icon = stat.icon;
                return (
                  <div
                    key={stat.label}
                    className="min-w-0 max-w-full overflow-hidden rounded-md border border-line bg-white px-3 py-3 shadow-sm"
                    title={`${stat.label}: ${stat.title}`}
                  >
                    <div className="flex min-w-0 max-w-full items-center gap-2 overflow-hidden">
                      <DevLensIcon
                        icon={Icon}
                        tone={stat.tone}
                        size={15}
                        framed
                        label={`${stat.label} metric`}
                      />
                      <div className="min-w-0 max-w-full overflow-hidden">
                        <p
                          className="block max-w-full truncate whitespace-nowrap text-[10px] font-semibold uppercase leading-4 tracking-wide text-graphite"
                          title={stat.label}
                        >
                          {stat.shortLabel}
                        </p>
                        <p
                          className="mt-0.5 block max-w-full truncate whitespace-nowrap text-sm font-semibold leading-5 text-ink"
                          title={stat.title}
                        >
                          {stat.value}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mb-4 flex items-center gap-1 rounded-md border border-line bg-white p-1 shadow-sm">
            {workspaceTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveWorkspaceTab(tab.key)}
                className={`inline-flex h-9 flex-1 items-center justify-center gap-2 rounded px-3 text-sm font-medium transition-colors ${
                  activeWorkspaceTab === tab.key
                    ? "bg-signal text-white shadow-[0_10px_22px_rgba(124,58,237,0.20)]"
                    : "text-graphite hover:bg-cloud"
                }`}
              >
                <DevLensIcon icon={tab.icon} size={14} />
                {tab.label}
              </button>
            ))}
          </div>

          <div
            className={
              activeWorkspaceTab === "files" ? "grid grid-cols-1 gap-4" : "hidden"
            }
          >
            <div className="rounded-md border border-line bg-white">
              <div className="border-b border-line bg-white px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">File Inspection</p>
                    <p className="mt-1 truncate text-sm text-graphite">
                      {selectedNode?.kind === "file"
                        ? selectedNode.path
                        : "Select a file from the left explorer to inspect implementation details."}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => selectedNode && copyExplorerPath(selectedNode.path)}
                      disabled={!selectedNode}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-white px-2 text-xs font-medium text-graphite transition-colors hover:border-signal hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Copy size={13} />
                      Copy Path
                    </button>
                    <button
                      type="button"
                      onClick={explainSelectedFile}
                      disabled={selectedNode?.kind !== "file"}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-white px-2 text-xs font-medium text-graphite transition-colors hover:border-signal hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Sparkles size={13} />
                      Explain File
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-cloud/50">
                <div className="p-4">
                  <FileSourcePreview
                    repositoryReady={repositoryReady}
                    selectedNode={selectedNode}
                    relatedSymbols={selectedFileSymbols}
                    highlightedLineRange={highlightedLineRange}
                    source={selectedFileSource}
                    isLoading={isLoadingFileSource}
                    error={fileSourceError}
                    summary={docsSummary}
                    walkthroughCurrent={walkthrough?.current ?? null}
                    onExplainFile={explainSelectedFile}
                    onFindReferences={findSelectedFileReferences}
                    onOpenCitation={openCitationInFiles}
                    onOpenPath={openPathInFiles}
                    onOpenSymbol={inspectSymbol}
                  />
                </div>
              </div>
            </div>

            <div className="hidden rounded-md border border-line bg-white">
              <div className="border-b border-line px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">Symbol intelligence</p>
                    <p className="text-sm text-graphite">
                      {symbolsResponse
                        ? `${symbolsResponse.count} symbols extracted`
                        : "Run an analysis to inspect code relationships."}
                    </p>
                  </div>
                  <Braces size={18} className="shrink-0 text-signal" />
                </div>
              </div>

              <div className="grid h-[640px] grid-cols-[360px_1fr]">
                <div className="flex min-h-0 flex-col border-r border-line p-3">
                  <div className="mb-3 flex h-9 shrink-0 items-center gap-2 rounded-md border border-line bg-cloud px-3 focus-within:border-signal">
                    <Search size={14} className="shrink-0 text-graphite" />
                    <input
                      value={symbolQuery}
                      onChange={(event) => setSymbolQuery(event.target.value)}
                      disabled={!repositoryReady}
                      className="min-w-0 flex-1 bg-transparent text-sm outline-none disabled:cursor-not-allowed"
                      placeholder={
                        repositoryReady ? "Filter symbols" : "Analyze first"
                      }
                    />
                  </div>

                  {symbolKindOptions.length ? (
                    <div className="relative mb-3 shrink-0">
                      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-3 bg-gradient-to-r from-white to-transparent" />
                      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-5 bg-gradient-to-l from-white to-transparent" />
                      <div className="flex gap-1.5 overflow-x-auto pb-0.5 pr-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        <button
                          type="button"
                          onClick={() => setSymbolKindFilter("all")}
                          className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold transition-colors ${
                            symbolKindFilter === "all"
                              ? "border-signal bg-signal/10 text-ink"
                              : "border-line bg-white text-graphite hover:border-signal hover:text-ink"
                          }`}
                        >
                          <span>All</span>
                          <span className="rounded bg-white/80 px-1.5 py-0.5 text-[11px] tabular-nums">
                            {symbolsResponse?.count ?? 0}
                          </span>
                        </button>
                        {symbolKindOptions.map((option) => {
                          const kindMeta = getSymbolKindMeta(option.kind);

                          return (
                            <button
                              key={option.kind}
                              type="button"
                              onClick={() => setSymbolKindFilter(option.kind)}
                              className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold transition-colors ${
                                symbolKindFilter === option.kind
                                  ? "border-signal bg-signal/10 text-ink"
                                  : "border-line bg-white text-graphite hover:border-signal hover:text-ink"
                              }`}
                            >
                              <span
                                className={`grid h-4 w-4 place-items-center rounded border text-[9px] ${kindMeta.tone}`}
                              >
                                {kindMeta.icon}
                              </span>
                              <span>{kindMeta.plural}</span>
                              <span className="rounded bg-white/80 px-1.5 py-0.5 text-[11px] tabular-nums">
                                {option.count}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  {!repositoryReady ? (
                    <div className="grid min-h-0 flex-1 place-items-center rounded-md border border-line bg-cloud p-4 text-center text-sm leading-6 text-graphite">
                      Symbol extraction appears here after analysis completes.
                    </div>
                  ) : isLoadingSymbols ? (
                    <div className="grid min-h-0 flex-1 place-items-center text-sm text-graphite">
                      <span className="inline-flex items-center gap-2">
                        <Loader2 size={16} className="animate-spin" />
                        Loading symbols
                      </span>
                    </div>
                  ) : symbolsError ? (
                    <div className="min-h-0 flex-1 rounded-md border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-700">
                      {symbolsError}
                    </div>
                  ) : symbolsResponse?.symbols.length ? (
                    <div className="min-h-0 flex-1 overflow-auto rounded-md border border-line bg-white">
                      {filteredSymbols.length ? (
                        <div className="divide-y divide-line">
                          {filteredSymbols.map((symbol) => {
                            const isSelected = selectedSymbolId === symbol.id;
                            const kindMeta = getSymbolKindMeta(symbol.kind);
                            const relationCount =
                              symbol.outgoingCalls.length +
                              symbol.outgoingReferences.length +
                              symbol.incomingReferences.length;
                            const occurrenceLabel =
                              symbolOccurrenceLabels.get(symbol.id);

                            return (
                              <button
                                key={symbol.id}
                                onClick={() => selectSymbol(symbol.id)}
                                className={`relative w-full px-3 py-2.5 text-left transition-colors hover:bg-cloud ${
                                  isSelected
                                    ? "bg-signal/5 shadow-[inset_0_0_0_1px_rgba(37,99,235,0.14)]"
                                    : ""
                                }`}
                              >
                                {isSelected ? (
                                  <span className="absolute left-0 top-2 h-[calc(100%-1rem)] w-0.5 rounded-r bg-signal" />
                                ) : null}
                                <div className="min-w-0 pl-1">
                                  <div className="flex min-w-0 items-center gap-2">
                                    <span
                                      className={`grid h-6 w-6 shrink-0 place-items-center rounded border text-[10px] font-semibold ${kindMeta.tone}`}
                                    >
                                      {kindMeta.icon}
                                    </span>
                                    <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
                                      {symbol.name}
                                    </p>
                                    {occurrenceLabel ? (
                                      <span className="shrink-0 rounded border border-line bg-white px-1.5 py-0.5 text-[11px] font-medium text-graphite">
                                        {occurrenceLabel}
                                      </span>
                                    ) : null}
                                    <span className="shrink-0 rounded bg-cloud px-1.5 py-0.5 text-[11px] font-semibold text-graphite">
                                      {formatUsageCount(relationCount, "link")}
                                    </span>
                                  </div>
                                  <p className="ml-8 mt-1 truncate text-xs text-graphite">
                                    {kindMeta.singular}
                                    {symbol.visibility ? ` • ${symbol.visibility}` : ""}{" "}
                                    • {symbol.filePath} • {formatCompactLineRange(symbol)}
                                  </p>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="grid h-full place-items-center px-3 text-center text-sm text-graphite">
                          No symbols match this filter.
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="grid min-h-0 flex-1 place-items-center rounded-md border border-line bg-cloud p-4 text-center text-sm leading-6 text-graphite">
                      No code details were detected for this repository.
                    </div>
                  )}
                </div>

                <div className="min-h-0 bg-cloud/50 p-4">
                  {selectedSymbol ? (
                    <div className="flex h-full min-h-0 flex-col gap-3">
                      <div className="rounded-md border border-line bg-white px-3 py-2.5 shadow-sm">
                        <div className="flex min-w-0 items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 items-center gap-2">
                              <span
                                className={`grid h-6 w-6 shrink-0 place-items-center rounded border text-[10px] font-semibold ${
                                  getSymbolKindMeta(selectedSymbol.kind).tone
                                }`}
                              >
                                {getSymbolKindMeta(selectedSymbol.kind).icon}
                              </span>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-ink">
                                  {selectedSymbol.name}
                                </p>
                                <p className="text-xs text-graphite">
                                  {getSymbolKindMeta(selectedSymbol.kind).singular}
                                  {selectedSymbol.visibility
                                    ? ` • ${selectedSymbol.visibility}`
                                    : ""}
                                </p>
                              </div>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openSymbolInFiles(selectedSymbol)}
                              className="inline-flex h-7 items-center gap-1.5 rounded-md border border-line bg-white px-2 text-xs font-medium text-graphite transition-colors hover:border-signal hover:text-ink"
                            >
                              <ExternalLink size={13} />
                              Open in Files
                            </button>
                            {isLoadingSymbolReferences ? (
                              <Loader2
                                size={16}
                                className="shrink-0 animate-spin text-signal"
                              />
                            ) : null}
                          </div>
                        </div>
                        <p className="mt-2 rounded-md bg-cloud px-3 py-1.5 text-sm leading-6 text-ink">
                          {buildSelectedSymbolSummary(selectedSymbol)}
                        </p>
                        <p className="mt-1.5 truncate text-xs text-graphite">
                          {selectedSymbol.filePath} • {formatLineRange(selectedSymbol)}
                        </p>
                        {selectedSymbol.signature ? (
                          <pre
                            title={selectedSymbol.signature}
                            className="mt-1.5 max-h-12 overflow-hidden whitespace-pre-wrap break-words rounded-md border border-line bg-cloud/70 px-3 py-1.5 text-xs leading-5 text-graphite"
                          >
                            {selectedSymbol.signature}
                          </pre>
                        ) : null}
                      </div>

                      <SymbolSourcePreview
                        source={selectedSymbolSource}
                        isLoading={isLoadingSymbolSource}
                        error={symbolSourceError}
                      />

                      <div className="grid grid-cols-3 gap-1 rounded-md border border-line bg-cloud p-1">
                        {symbolRelationshipTabs.map((tab) => (
                          <button
                            key={tab.key}
                            onClick={() => setActiveSymbolTab(tab.key)}
                            className={`flex min-w-0 items-center justify-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium transition-colors ${
                              activeSymbolTab === tab.key
                                ? "bg-white text-ink shadow-sm"
                                : "text-graphite hover:bg-white/70"
                            }`}
                          >
                            <span>{tab.label}</span>
                            <span
                              className={`rounded px-1.5 py-0.5 text-[11px] tabular-nums ${
                                activeSymbolTab === tab.key
                                  ? "bg-cloud text-ink"
                                  : "bg-cloud text-graphite"
                              }`}
                            >
                              {tab.count}
                            </span>
                          </button>
                        ))}
                      </div>

                      <SymbolRelationshipRows
                        items={activeSymbolRelations}
                        onSelectSymbol={selectSymbol}
                        emptyTitle={activeRelationshipEmptyState.title}
                        emptyDescription={
                          activeRelationshipEmptyState.description
                        }
                      />
                    </div>
                  ) : (
                    <div className="rounded-md border border-line bg-white p-3 text-sm leading-6 text-graphite">
                      Select a symbol to inspect calls, references, and inbound
                      usage.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {activeWorkspaceTab === "search" ? (
            <div className="rounded-md border border-line bg-white">
              <div className="border-b border-line px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">Repository search</p>
                    <p className="text-sm text-graphite">
                      Search files, symbols, and source text with line-level
                      context.
                    </p>
                  </div>
                  <Search size={18} className="shrink-0 text-signal" />
                </div>
                <form
                  onSubmit={searchRepository}
                  className="mt-3 grid grid-cols-[1fr_160px] gap-2"
                >
                  <div className="flex h-10 items-center gap-2 rounded-md border border-line bg-cloud px-3 focus-within:border-signal">
                    <Search size={15} className="shrink-0 text-graphite" />
                    <input
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      disabled={!repositoryReady}
                      className="min-w-0 flex-1 bg-transparent text-sm outline-none disabled:cursor-not-allowed"
                      placeholder={
                        repositoryReady
                          ? "Search symbols, paths, code"
                          : "Analyze a repository first"
                      }
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={
                      !repositoryReady || isSearching || !searchQuery.trim()
                    }
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-ink px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSearching ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Search size={16} />
                    )}
                    Search
                  </button>
                </form>
              </div>

              <div className="p-4">
                {searchError ? (
                  <div className="mb-3 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    <AlertCircle size={16} className="mt-0.5 shrink-0" />
                    <span>{searchError}</span>
                  </div>
                ) : null}

                {!repositoryReady ? (
                  <div className="grid h-full place-items-center rounded-md border border-line bg-cloud p-6 text-center text-sm leading-6 text-graphite">
                    <div>
                      <Search className="mx-auto mb-3 text-signal" />
                      <p className="font-semibold text-ink">Search unlocks after analysis</p>
                      <p className="mt-2 max-w-sm">
                        Paste a GitHub URL and run analysis. Then search files,
                        symbols, and source lines from this repository.
                      </p>
                    </div>
                  </div>
                ) : searchResponse ? (
                  <div>
                    <div className="mb-3 flex items-center justify-between text-sm">
                      <span className="font-medium">
                        {searchResponse.count} results
                      </span>
                      <span
                        className="max-w-[320px] truncate text-graphite"
                        title={searchResponse.query}
                      >
                        {searchResponse.query}
                      </span>
                    </div>
                    <div className="grid gap-3">
                      {searchResponse.results.length ? (
                        searchResponse.results.map((result) => (
                          <button
                            key={result.id}
                            onClick={() => focusSearchResult(result)}
                            className="w-full rounded-md border border-line bg-white p-4 text-left transition-colors hover:border-signal hover:bg-cloud"
                          >
                            <div className="flex min-w-0 items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="mb-2 flex min-w-0 items-center gap-2">
                                  <span className="rounded bg-signal/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-signal">
                                    {getSearchResultType(result)}
                                  </span>
                                  {result.symbol ? (
                                    <p className="truncate text-sm font-semibold text-ink">
                                      {result.symbol.kind} {result.symbol.name}
                                    </p>
                                  ) : null}
                                </div>
                                <p
                                  className="truncate text-sm font-medium text-ink"
                                  title={result.path}
                                >
                                  {result.path}
                                </p>
                                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                  <span className="rounded bg-cloud px-1.5 py-0.5 text-[11px] font-medium text-graphite">
                                    {formatCompactLineRange(result)}
                                  </span>
                                  {result.language ? (
                                    <span className="rounded bg-cloud px-1.5 py-0.5 text-[11px] font-medium text-graphite">
                                      {result.language}
                                    </span>
                                  ) : null}
                                  {result.isTest ? (
                                    <span className="rounded bg-amber/10 px-1.5 py-0.5 text-[11px] font-semibold text-amber">
                                      test
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                              <span className="rounded-md bg-ink px-2 py-1 text-xs font-semibold text-white">
                                Open file
                              </span>
                            </div>
                            <div className="mt-3 rounded-md bg-cloud px-3 py-2">
                              <p className="text-xs font-semibold uppercase tracking-wide text-graphite">
                                Purpose
                              </p>
                              <p className="mt-1 text-sm leading-5 text-ink">
                                {getSearchResultPurpose(result)}
                              </p>
                            </div>
                            <p className="mt-3 line-clamp-4 whitespace-pre-wrap break-words text-xs leading-5 text-graphite">
                              {highlightSnippet(
                                result.snippet,
                                result.matchedTerm,
                              )}
                            </p>
                          </button>
                        ))
                    ) : (
                      <div className="rounded-md border border-line bg-cloud p-4 text-sm leading-6 text-graphite">
                        <p className="font-semibold text-ink">No matches found</p>
                        <p className="mt-1">
                          Try a file name, route, feature word, or function name from the Guide.
                        </p>
                      </div>
                    )}
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-3">
                    {["auth", "route", "database"].map((query) => (
                      <button
                        key={query}
                        onClick={() => {
                          setSearchQuery(query);
                          void searchRepository(undefined, query);
                        }}
                        className="rounded-md border border-line bg-cloud p-3 text-left text-sm text-graphite hover:border-signal"
                      >
                        {query}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {activeWorkspaceTab === "brief" ? (
            <RepoBriefPanel
              repositoryReady={repositoryReady}
              summary={docsSummary}
              enhancedGuide={enhancedGuide}
              isLoading={isLoadingDocsSummary}
              error={docsSummaryError}
              isEnhancingGuide={isEnhancingGuide}
              guideEnhanceStatus={guideEnhanceStatus}
              onEnhanceGuide={enhanceRepositoryGuide}
              onOpenInFiles={openSymbolInFiles}
            />
          ) : null}
        </section>

        <aside className="flex min-h-[520px] min-w-0 flex-col overflow-hidden border-t border-line bg-white/90 p-4 md:h-full md:min-h-0 md:border-l md:border-t-0">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-semibold">DevLens AI</p>
                <span className="rounded bg-signal/10 px-1.5 py-0.5 text-[10px] font-semibold text-signal">
                  BETA
                </span>
              </div>
              <p className="mt-1 text-sm leading-6 text-graphite">
                Ask practical questions about this repository.
              </p>
            </div>
            <DevLensIcon
              icon={devlensIcons.product.assistant}
              tone="primary"
              size={18}
            />
          </div>

          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-graphite">
              Suggested questions
            </p>
          </div>

          <div className="mt-2 flex min-w-0 flex-wrap gap-2">
            {[
              "Explain this repository",
              "Where should I start?",
              "Explain selected file",
            ].map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => handleSuggestedQuestion(prompt)}
                disabled={isAskingDevlens}
                className="max-w-full rounded-full border border-line bg-white px-3 py-1.5 text-left text-xs font-medium text-graphite shadow-sm transition-colors hover:border-signal hover:bg-signal/5 hover:text-ink"
              >
                {prompt}
              </button>
            ))}
          </div>

          <details className="group mt-2 min-w-0 rounded-md border border-line bg-white px-3 py-2">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-semibold uppercase tracking-wide text-graphite">
              <span>More</span>
              <ChevronDown size={14} className="transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-3 grid gap-3">
              {[
                {
                  label: "Walkthrough",
                  prompts: [
                    "Start walkthrough",
                    "Continue walkthrough",
                    "Show evidence for this step",
                    "Summarize walkthrough progress",
                    "Copy recap",
                  ],
                },
                {
                  label: "Understand",
                  prompts: [
                    "Why am I reading this file?",
                    "What should I look for here?",
                    "Summarize this for a teammate",
                    "What should I inspect next?",
                  ],
                },
                {
                  label: "Locate",
                  prompts: [
                    "What are the most important files?",
                    "Find authentication",
                    "Find business logic",
                  ],
                },
              ].map((group) => (
                <div key={group.label} className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-graphite">
                    {group.label}
                  </p>
                  <div className="mt-1.5 flex min-w-0 flex-wrap gap-1.5">
                    {group.prompts.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => handleSuggestedQuestion(prompt)}
                        disabled={isAskingDevlens}
                        className="max-w-full rounded-full border border-line bg-white px-2 py-1 text-left text-xs font-medium text-graphite transition-colors hover:border-signal hover:bg-cloud hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </details>

          <div className="mt-4 min-h-0 min-w-0 flex-1 overflow-y-auto pr-1">
          {repositoryReady && guidedInvestigation ? (
            <section className="min-w-0 overflow-hidden rounded-md bg-cloud/35 p-3">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-graphite">
                    Guided investigation
                  </p>
                  <p className="mt-1 break-words text-sm font-semibold leading-5 text-ink">
                    {guidedInvestigation.status}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={startWalkthrough}
                  disabled={isAskingDevlens}
                  className="shrink-0 rounded-md border border-line bg-white px-2 py-1 text-xs font-medium text-graphite shadow-sm hover:border-signal hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Start walkthrough
                </button>
              </div>

              {walkthrough ? (
                <div className="mt-3 min-w-0 overflow-hidden rounded-md bg-white p-3 shadow-sm">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wide text-graphite">
                        Walkthrough progress
                      </p>
                      <p className="mt-1 truncate text-sm font-semibold leading-5 text-ink" title={walkthrough.current?.path ?? undefined}>
                        {walkthrough.isComplete
                          ? "Walkthrough complete"
                          : walkthrough.current?.path ?? "Choose a starting file"}
                      </p>
                    </div>
                    <span className="shrink-0 rounded bg-cloud px-2 py-1 text-[11px] font-semibold text-graphite">
                      {walkthrough.progressLabel}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded bg-cloud px-2 py-1.5">
                      <p className="text-sm font-semibold text-ink">
                        {walkthrough.completedCount}
                      </p>
                      <p className="text-[11px] text-graphite">Done</p>
                    </div>
                    <div className="rounded bg-cloud px-2 py-1.5">
                      <p className="text-sm font-semibold text-ink">
                        {walkthrough.remainingCount}
                      </p>
                      <p className="text-[11px] text-graphite">Left</p>
                    </div>
                    <div className="rounded bg-cloud px-2 py-1.5">
                      <p className="text-sm font-semibold text-ink">
                        {walkthrough.skippedCount}
                      </p>
                      <p className="text-[11px] text-graphite">Skipped</p>
                    </div>
                  </div>

                  {walkthrough.current ? (
                    <button
                      type="button"
                      onClick={() => openCitationInFiles(walkthrough.current!)}
                      className="mt-3 block max-w-full truncate text-left text-xs font-semibold text-signal hover:text-ink"
                      title={`${walkthrough.current.path} - ${walkthrough.current.reason}`}
                    >
                      Open current: {walkthrough.current.path}
                    </button>
                  ) : null}
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-graphite">
                    {walkthrough.isComplete
                      ? "Review the completion summary, then choose the next deep dive from the cited files."
                      : walkthrough.current?.reason ?? "Start the walkthrough from the Repository Guide reading order."}
                  </p>
                  <p className="mt-1 truncate text-[11px] text-graphite" title={walkthrough.next?.path ?? undefined}>
                    Next: {walkthrough.next?.path ?? "No remaining file"}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={walkthrough.completedCount || walkthrough.skippedCount ? continueWalkthrough : startWalkthrough}
                      disabled={isAskingDevlens || walkthrough.isComplete}
                      className="rounded-md bg-signal px-2 py-1 text-xs font-semibold text-white hover:bg-[#5b21b6] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {walkthrough.completedCount || walkthrough.skippedCount
                        ? "Continue"
                        : "Start"}
                    </button>
                    <button
                      type="button"
                      onClick={markWalkthroughFileDone}
                      disabled={isAskingDevlens || walkthrough.isComplete || !walkthrough.current}
                      className="rounded-md border border-line bg-white px-2 py-1 text-xs font-medium text-graphite hover:border-signal hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Mark done
                    </button>
                    <button
                      type="button"
                      onClick={skipWalkthroughFile}
                      disabled={isAskingDevlens || walkthrough.isComplete || !walkthrough.current}
                      className="rounded-md border border-line bg-white px-2 py-1 text-xs font-medium text-graphite hover:border-signal hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Skip
                    </button>
                    <button
                      type="button"
                      onClick={() => void askDevlens("Summarize walkthrough progress")}
                      disabled={isAskingDevlens}
                      className="rounded-md border border-line bg-white px-2 py-1 text-xs font-medium text-graphite hover:border-signal hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Summary
                    </button>
                    <button
                      type="button"
                      onClick={finishWalkthrough}
                      disabled={isAskingDevlens || !walkthrough}
                      className="rounded-md border border-line bg-white px-2 py-1 text-xs font-medium text-graphite hover:border-signal hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Finish
                    </button>
                    <button
                      type="button"
                      onClick={() => void copyRepositoryRecap()}
                      disabled={!walkthroughHandoff || !docsSummary}
                      className="rounded-md border border-line bg-white px-2 py-1 text-xs font-medium text-graphite hover:border-signal hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {recapCopyState === "copied" ? "Copied" : "Copy recap"}
                    </button>
                  </div>

                  {walkthrough.risks.length ? (
                    <p className="mt-2 line-clamp-2 text-[11px] leading-4 text-graphite">
                      Watch: {walkthrough.risks[0]}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {walkthrough?.isComplete && walkthroughHandoff ? (
                <div className="mt-3 min-w-0 overflow-hidden rounded-md border border-mint/20 bg-white p-3">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wide text-mint">
                        Onboarding handoff
                      </p>
                      <p className="mt-1 line-clamp-2 text-sm font-semibold leading-5 text-ink">
                        {walkthroughHandoff.projectSummary}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void copyRepositoryRecap()}
                        className="rounded-md border border-line bg-white px-2 py-1 text-xs font-medium text-graphite hover:border-signal hover:text-ink"
                      >
                        {recapCopyState === "copied" ? "Copied" : "Copy recap"}
                      </button>
                      <DevLensIcon
                        icon={devlensIcons.status.success}
                        tone="success"
                        size={16}
                      />
                    </div>
                  </div>

                  <div className="mt-3 grid gap-2">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-graphite">
                        Inspected
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {walkthroughHandoff.inspected.length ? (
                          walkthroughHandoff.inspected.slice(0, 4).map((citation) => (
                            <button
                              key={`${citation.path}-${citation.startLine ?? "file"}`}
                              type="button"
                              onClick={() => openCitationInFiles(citation)}
                              className="max-w-full min-w-0 truncate rounded bg-cloud px-2 py-1 text-[11px] font-medium text-graphite hover:text-signal"
                              title={`${citation.path} - ${citation.reason}`}
                            >
                              {citation.path}
                            </button>
                          ))
                        ) : (
                          <span className="text-xs text-graphite">
                            No files marked done yet
                          </span>
                        )}
                      </div>
                    </div>

                    {walkthroughHandoff.skipped.length ? (
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-graphite">
                          Skipped
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {walkthroughHandoff.skipped.slice(0, 3).map((citation) => (
                            <button
                              key={`${citation.path}-${citation.startLine ?? "file"}`}
                              type="button"
                              onClick={() => openCitationInFiles(citation)}
                              className="max-w-full min-w-0 truncate rounded bg-amber/10 px-2 py-1 text-[11px] font-medium text-amber hover:text-ink"
                              title={`${citation.path} - ${citation.reason}`}
                            >
                              {citation.path}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-graphite">
                        Still unknown
                      </p>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-graphite">
                        {walkthroughHandoff.risks[0] ??
                          "No major walkthrough risks are currently flagged."}
                      </p>
                    </div>

                    {walkthroughHandoff.nextDeepDive ? (
                      <button
                        type="button"
                        onClick={() => openCitationInFiles(walkthroughHandoff.nextDeepDive!)}
                        className="min-w-0 rounded-md border border-line bg-cloud px-2 py-1.5 text-left text-xs hover:border-signal hover:bg-white"
                        title={walkthroughHandoff.nextDeepDiveReason}
                      >
                        <span className="block font-semibold text-ink">
                          Next deep dive
                        </span>
                        <span className="mt-0.5 block truncate text-graphite" title={walkthroughHandoff.nextDeepDive.path}>
                          {walkthroughHandoff.nextDeepDive.path}
                        </span>
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {guidedInvestigation.bestNextFile ? (
                <div className="mt-3 min-w-0 overflow-hidden rounded-md bg-white p-3 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-graphite">
                    Best next file
                  </p>
                  <button
                    type="button"
                    onClick={() => openCitationInFiles(guidedInvestigation.bestNextFile!)}
                    className="mt-1 block max-w-full truncate text-left text-sm font-semibold text-ink hover:text-signal"
                    title={guidedInvestigation.bestNextFile.path}
                  >
                    {guidedInvestigation.bestNextFile.path}
                  </button>
                  <p className="mt-2 line-clamp-3 break-words text-xs leading-5 text-graphite">
                    {guidedInvestigation.whyItMatters}
                  </p>
                  <button
                    type="button"
                    onClick={() => openCitationInFiles(guidedInvestigation.bestNextFile!)}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-signal px-2 py-1 text-xs font-semibold text-white hover:bg-[#5b21b6]"
                  >
                    <DevLensIcon icon={devlensIcons.product.citations} size={12} />
                    Open evidence
                  </button>
                </div>
              ) : null}

              <div className="mt-3 grid gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-graphite">
                    Important findings
                  </p>
                  <ul className="mt-2 grid gap-1.5 text-xs leading-5 text-graphite">
                    {guidedInvestigation.findings.map((finding) => (
                      <li key={finding} className="flex min-w-0 gap-2">
                        <DevLensIcon
                          icon={devlensIcons.status.success}
                          tone="success"
                          size={13}
                          className="mt-0.5"
                        />
                        <span className="min-w-0 line-clamp-2 break-words">{finding}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {guidedInvestigation.connections.length ? (
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-graphite">
                      Connects to
                    </p>
                    <div className="mt-2 flex min-w-0 flex-wrap gap-1.5">
                      {guidedInvestigation.connections.map((connection) => (
                        <span
                          key={connection}
                          className="inline-block max-w-full min-w-0 truncate rounded bg-white px-2 py-1 text-xs font-medium text-graphite"
                          title={connection}
                        >
                          {connection}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {guidedInvestigation.inspectAfter.length ? (
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-graphite">
                      Inspect after this
                    </p>
                    <div className="mt-2 grid min-w-0 gap-1.5">
                      {guidedInvestigation.inspectAfter.map((citation) => (
                        <button
                          key={`${citation.path}-${citation.startLine ?? "file"}`}
                          type="button"
                          onClick={() => openCitationInFiles(citation)}
                          className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2 rounded bg-white px-2 py-1.5 text-left text-xs text-graphite hover:bg-signal/10 hover:text-ink"
                          title={`${citation.path} - ${citation.reason}`}
                        >
                          <span className="min-w-0 truncate font-medium">
                            {citation.path}
                          </span>
                          {citation.startLine && citation.endLine ? (
                            <span className="shrink-0 text-[11px]">
                              {formatCompactLineRange({
                                startLine: citation.startLine,
                                endLine: citation.endLine,
                              })}
                            </span>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {guidedInvestigation.risks.length ? (
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-graphite">
                      Risk signals
                    </p>
                    <ul className="mt-2 grid gap-1.5 text-xs leading-5 text-graphite">
                      {guidedInvestigation.risks.map((risk) => (
                        <li key={risk} className="flex min-w-0 gap-2">
                          <DevLensIcon
                            icon={devlensIcons.status.warning}
                            tone="warning"
                            size={13}
                            className="mt-0.5"
                          />
                          <span className="min-w-0 line-clamp-2 break-words">{risk}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>

              <div className="mt-3 min-w-0 border-t border-line pt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-graphite">
                  Suggested follow-ups
                </p>
                <div className="mt-2 flex min-w-0 flex-wrap gap-1.5">
                  {guidedInvestigation.followUps.map((followUp) => (
                    <button
                      key={followUp}
                      type="button"
                      onClick={() => void askDevlens(followUp)}
                      disabled={isAskingDevlens}
                      className="max-w-full rounded-full border border-line bg-white px-2 py-1 text-xs text-graphite hover:border-signal hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {followUp}
                    </button>
                  ))}
                </div>
                <p className="mt-2 break-words text-xs leading-5 text-graphite">
                  {guidedInvestigation.summary}
                </p>
                {inspectedFilePaths.length ? (
                  <div className="mt-2 flex min-w-0 flex-wrap gap-1">
                    {inspectedFilePaths.slice(0, 4).map((path) => (
                      <button
                        key={path}
                        type="button"
                        onClick={() => openPathInFiles(path)}
                        className="max-w-full min-w-0 truncate rounded bg-white px-2 py-1 text-[11px] font-medium text-graphite hover:text-signal"
                        title={path}
                      >
                        {path}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          <div className="mt-4 min-w-0 rounded-md bg-cloud/35 p-3">
            <div className="ml-auto max-w-[88%] break-words rounded-md bg-gradient-to-r from-[#1f1635] to-[#312052] px-3 py-2 text-sm leading-6 text-white">
              {devlensPrompt}
            </div>
            <div className="mt-3 flex min-w-0 items-start gap-3">
              <DevLensIcon
                icon={devlensIcons.product.assistant}
                tone="primary"
                size={14}
                framed
                label="DevLens assistant"
              />
              <div className="min-w-0 max-w-full overflow-hidden rounded-md bg-white p-3 shadow-sm">
                <p className="break-words text-sm leading-6 text-graphite">
                  {isAskingDevlens ? (
                    <span className="inline-flex items-center gap-2">
                      <DevLensIcon
                        icon={devlensIcons.status.loading}
                        tone="primary"
                        size={14}
                        className="animate-spin"
                      />
                      Gathering file-backed context
                    </span>
                  ) : (
                    devlensResponse?.answer ??
                    (repositoryReady
                      ? "Choose a question above. DevLens will use the Repository Guide, file tree, and code details already available in this workspace."
                      : "Analyze a repository first, then DevLens can guide you through where to start and what to inspect.")
                  )}
                </p>
                {getAssistantStatusLabel(devlensResponse) ? (
                  <p className="mt-2 rounded bg-cloud px-2 py-1 text-xs leading-5 text-graphite">
                    {getAssistantStatusLabel(devlensResponse)}
                  </p>
                ) : null}
                {devlensResponse?.citations.length ? (
                  <div className="mt-3 border-t border-line pt-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-graphite">
                      Citations
                    </p>
                    <div className="mt-2 grid min-w-0 gap-1.5">
                      {devlensResponse.citations.map((source) => (
                        <button
                          key={`${source.path}-${source.startLine ?? "file"}`}
                          type="button"
                          onClick={() => openCitationInFiles(source)}
                          className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2 rounded bg-cloud px-2 py-1.5 text-left text-xs font-medium text-graphite transition-colors hover:bg-signal/10 hover:text-ink"
                          title={`${source.path} - ${source.reason}`}
                        >
                          <DevLensIcon
                            icon={devlensIcons.product.citations}
                            tone="primary"
                            size={12}
                            className="mt-0.5"
                          />
                          <span className="min-w-0">
                            <span className="block truncate">{source.label}</span>
                            <span className="mt-0.5 block line-clamp-2 font-normal leading-4 text-graphite">
                              {source.reason}
                            </span>
                          </span>
                          {source.startLine && source.endLine ? (
                            <span className="shrink-0 text-[11px]">
                              {formatCompactLineRange({
                                startLine: source.startLine,
                                endLine: source.endLine,
                              })}
                            </span>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="mt-3 flex min-w-0 flex-wrap gap-1.5">
                  {["Explain selected file", "Search important files"].map((followUp) => (
                    <button
                      key={followUp}
                      type="button"
                      onClick={() => void askDevlens(followUp)}
                      disabled={isAskingDevlens}
                      className="max-w-full rounded-full border border-line px-2 py-1 text-xs text-graphite hover:border-signal hover:text-ink"
                    >
                      {followUp}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          </div>

          <div className="mt-auto min-w-0 shrink-0 bg-white/90 pt-4">
            <div className="min-w-0 rounded-md border border-line bg-white px-3 py-2 shadow-sm">
              <textarea
                value={devlensPrompt}
                onChange={(event) => setDevlensPrompt(event.target.value)}
                rows={3}
                placeholder={
                  repositoryReady
                    ? "Ask anything about this repository..."
                    : "Analyze a repository to enable DevLens AI."
                }
                className="w-full resize-none break-words bg-transparent text-sm outline-none placeholder:text-graphite"
              />
              <div className="mt-2 flex min-w-0 items-center justify-between gap-3">
                <span className="min-w-0 truncate text-xs text-graphite">
                  Uses repository files and source lines
                </span>
                <button
                  type="button"
                  onClick={() => void askDevlens(devlensPrompt)}
                  disabled={!devlensPrompt.trim() || isAskingDevlens}
                  className="inline-flex items-center gap-1.5 rounded-md bg-signal px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-[#5b21b6] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isAskingDevlens ? (
                    <>
                      <DevLensIcon
                        icon={devlensIcons.status.loading}
                        size={12}
                        className="animate-spin"
                      />
                      Reading
                    </>
                  ) : (
                    <>
                      <DevLensIcon icon={devlensIcons.product.send} size={12} />
                      Ask
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
