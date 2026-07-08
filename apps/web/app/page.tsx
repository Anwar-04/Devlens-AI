"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BookOpen,
  Braces,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Copy,
  ExternalLink,
  File,
  FileCode2,
  Folder,
  FolderOpen,
  GitPullRequest,
  Loader2,
  Network,
  Search,
  Sparkles,
  Workflow,
  XCircle,
} from "lucide-react";

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

const pipelineSteps = [
  { key: "queued", label: "Preparing", description: "Getting the analysis ready" },
  {
    key: "cloning",
    label: "Cloning",
    description: "Fetching repository from GitHub",
  },
  {
    key: "indexing_files",
    label: "Indexing files",
    description: "Building the folder and file inventory",
  },
  {
    key: "detecting_stack",
    label: "Detecting stack",
    description: "Finding languages and frameworks",
  },
  {
    key: "saving_metadata",
    label: "Saving metadata",
    description: "Persisting repository knowledge",
  },
  { key: "completed", label: "Completed", description: "Workspace is ready" },
];

const workspaceTabs: Array<{ key: WorkspaceTab; label: string }> = [
  { key: "brief", label: "Guide" },
  { key: "files", label: "Files" },
  { key: "search", label: "Search" },
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
  return step
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusTone(status?: JobStatus): string {
  if (status === "COMPLETED") return "text-mint";
  if (status === "FAILED" || status === "CANCELLED") return "text-red-600";
  return "text-signal";
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

  if (normalized.endsWith("readme.md")) return "understand purpose and public usage";
  if (normalized.endsWith("package.json")) return "review scripts, dependencies, and package entry points";
  if (normalized.includes("/test") || normalized.includes(".test.") || normalized.includes(".spec.")) {
    return "learn expected behavior from tests";
  }
  if (normalized.endsWith("index.ts") || normalized.endsWith("index.js")) {
    return "inspect the main exports and entry point";
  }
  if (normalized.includes("config")) return "understand runtime and build configuration";
  if (normalized.includes("app/") || normalized.includes("src/")) return "inspect core implementation";
  return "high-signal file from the analysis";
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

  return `${summary.overview.text} In practical terms, this looks like a ${inferComplexity(
    summary,
  ).toLowerCase()} ${inferProjectType(summary).toLowerCase()} built around ${languages}${
    frameworks ? ` with ${frameworks}` : ""
  }. A new developer should start with ${start[0]?.path ?? "the README"}, then review ${
    start[1]?.path ?? "the package metadata"
  }${entryPoint ? `, and then inspect ${entryPoint} as the main implementation anchor` : ""}. ${testSignal} Estimated onboarding time is ${estimateOnboarding(summary)}.`;
}

function getFileRole(path: string): string {
  const normalized = path.toLowerCase();
  if (normalized.endsWith("readme.md")) return "Project orientation and usage guide";
  if (normalized.endsWith("package.json")) return "Package metadata, scripts, and dependency map";
  if (normalized.includes(".test.") || normalized.includes(".spec.") || normalized.includes("/test")) {
    return "Behavior validation and edge-case documentation";
  }
  if (normalized.endsWith("index.ts") || normalized.endsWith("index.js")) {
    return "Primary source entry point";
  }
  if (normalized.includes("config")) return "Configuration and runtime setup";
  if (normalized.includes("route") || normalized.includes("controller")) return "Request flow and routing";
  return "Implementation file";
}

function buildFileMatterSummary(path: string, symbols: RepositorySymbol[]) {
  const role = getFileRole(path);
  const importantSymbols = symbols.slice(0, 3).map((symbol) => symbol.name);
  const normalized = path.toLowerCase();
  const suggestedNext = normalized.endsWith("readme.md")
    ? "package.json"
    : normalized.endsWith("package.json")
      ? "README.md or the main source entry point"
      : normalized.includes(".test.") || normalized.includes(".spec.")
        ? "the source file covered by this test"
        : "README.md or nearby test files";

  return {
    role,
    purpose: `${path} is useful because it helps you ${getPathReason(path)}.`,
    whyRead: importantSymbols.length
      ? `It contains ${importantSymbols.join(", ")}, which makes it a useful anchor for understanding behavior in this part of the repository.`
      : "It is a good place to inspect source flow, naming, and local implementation patterns.",
    suggestedNext,
  };
}

function getSearchResultType(result: SearchResult): string {
  const path = result.path.toLowerCase();
  if (result.symbol?.kind) return result.symbol.kind.toLowerCase();
  if (result.isTest || path.includes(".test.") || path.includes(".spec.")) return "test";
  if (path.endsWith("package.json") || path.includes("config")) return "config";
  if (result.chunkKind === "SYMBOL") return "symbol";
  return "file";
}

function getSearchResultPurpose(result: SearchResult): string {
  if (result.symbol) {
    return `${result.symbol.name} is a ${getSymbolKindMeta(
      result.symbol.kind,
    ).singular} in ${result.path}.`;
  }
  return `${result.path} helps developers ${getPathReason(result.path)}.`;
}

function getFileIconMeta(path: string, kind: ExplorerNode["kind"]) {
  const name = path.split("/").pop()?.toLowerCase() ?? path.toLowerCase();
  const normalized = path.toLowerCase();

  if (kind === "folder") {
    if (normalized.includes("controller")) return { label: "C", tone: "bg-blue-50 text-blue-700 border-blue-200" };
    if (normalized.includes("route")) return { label: "R", tone: "bg-sky-50 text-sky-700 border-sky-200" };
    if (normalized.includes("service")) return { label: "S", tone: "bg-emerald-50 text-emerald-700 border-emerald-200" };
    if (normalized.includes("model")) return { label: "M", tone: "bg-violet-50 text-violet-700 border-violet-200" };
    return { label: "dir", tone: "bg-amber/10 text-amber border-amber/20" };
  }

  if (name === "readme.md") return { label: "R", tone: "bg-signal/10 text-signal border-signal/20" };
  if (name.endsWith(".test.ts") || name.endsWith(".test.js") || name.endsWith(".spec.ts") || name.endsWith(".spec.js")) {
    return { label: "T", tone: "bg-amber/10 text-amber border-amber/20" };
  }
  if (name.endsWith(".tsx") || name.endsWith(".ts")) return { label: "TS", tone: "bg-blue-50 text-blue-700 border-blue-200" };
  if (name.endsWith(".jsx") || name.endsWith(".js")) return { label: "JS", tone: "bg-yellow-50 text-yellow-700 border-yellow-200" };
  if (name.endsWith(".json")) return { label: "{}", tone: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  if (name.endsWith(".md")) return { label: "MD", tone: "bg-slate-100 text-slate-700 border-slate-200" };
  if (name.includes(".env")) return { label: "ENV", tone: "bg-red-50 text-red-700 border-red-200" };
  if (/\.(png|jpg|jpeg|gif|svg|webp)$/i.test(name)) return { label: "IMG", tone: "bg-pink-50 text-pink-700 border-pink-200" };
  if (normalized.includes("config") || normalized.includes("middleware") || normalized.includes("validator")) {
    return { label: "cfg", tone: "bg-violet-50 text-violet-700 border-violet-200" };
  }
  return { label: "file", tone: "bg-cloud text-graphite border-line" };
}

function describeRepositoryArchitecture(summary: DocsSummaryResponse): string {
  const type = inferProjectType(summary);
  if (type === "Frontend app") return "UI-focused application with source files organized around screens or components.";
  if (type === "API backend") return "Backend service with request handling, application logic, and supporting infrastructure.";
  if (type === "CLI tool") return "Command-line project with a small operational surface and direct entry points.";
  return "Straightforward repository structure with a direct path from entry files into implementation.";
}

function getSymbolPurpose(symbol: RepositorySymbol | DocsSummarySymbol): string {
  const name = symbol.name.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  const kind = getSymbolKindMeta(symbol.kind).singular;
  if (/parse|read|load/.test(name)) return `Reads or converts input as part of the ${kind} flow.`;
  if (/format|render|print/.test(name)) return `Formats output for callers or users.`;
  if (/create|add|insert/.test(name)) return `Creates or registers data in this part of the codebase.`;
  if (/auth|login|token|session/.test(name)) return `Participates in authentication or session behavior.`;
  if (/route|handler|controller/.test(name)) return `Helps route or handle a request path.`;
  return `A ${kind} worth inspecting because it is exposed, referenced, or close to important files.`;
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
        const iconMeta = getFileIconMeta(node.path, node.kind);

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
              className={`group relative w-full rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-cloud ${
                isSelected ? "bg-signal/10 text-ink shadow-[inset_2px_0_0_#2563eb]" : ""
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
                <span
                  className={`grid h-5 min-w-5 shrink-0 place-items-center rounded border px-1 text-[9px] font-bold uppercase ${iconMeta.tone}`}
                  title={isFolder ? "Folder" : node.language ?? "File"}
                >
                  {iconMeta.label}
                </span>
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
}: {
  repositoryReady: boolean;
  selectedNode: ExplorerNode | null;
  relatedSymbols: RepositorySymbol[];
  highlightedLineRange: { startLine: number; endLine: number } | null;
  source: FileSourceResponse | null;
  isLoading: boolean;
  error: string | null;
}) {
  const [copiedAction, setCopiedAction] = useState<"path" | "snippet" | null>(
    null,
  );
  const sourceSnippet = getFileSourceSnippet(source);
  const hasSourceLines = Boolean(sourceSnippet);
  const sourceLineCount = source?.file.previewLines.length ?? 0;
  const sourcePreviewHeight = sourceLineCount
    ? Math.min(360, Math.max(180, sourceLineCount * 24 + 28))
    : 220;
  const fileMatter =
    selectedNode?.kind === "file"
      ? buildFileMatterSummary(selectedNode.path, relatedSymbols)
      : null;

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
          <FileCode2 className="mx-auto mb-3 text-signal" />
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
      <div className="grid h-full place-items-center rounded-md border border-line bg-white p-6 text-center">
        <div>
          <FileCode2 className="mx-auto mb-3 text-signal" />
          <p className="font-semibold">Select a file</p>
          <p className="mt-2 max-w-md text-sm leading-6 text-graphite">
            Choose a file from the explorer to inspect metadata and indexed
            source preview.
          </p>
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
    <div className="flex h-full min-h-0 flex-col rounded-md border border-line bg-white shadow-sm">
      <div className="border-b border-line px-4 py-3">
        <div className="mb-3 flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-graphite">
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
              {isLikelyEntryPoint(selectedNode.path) ? (
                <span className="shrink-0 rounded bg-mint/10 px-2 py-1 text-xs font-semibold text-mint">
                  Entry point
                </span>
              ) : null}
              {source?.file.isTest ? (
                <span className="shrink-0 rounded bg-amber/10 px-2 py-1 text-xs font-semibold text-amber">
                  Test
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm leading-6 text-graphite">
              {getPathReason(selectedNode.path)}
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
          </div>
        </div>

        <div className="mt-3 grid grid-cols-4 gap-2 text-sm">
          <div className="rounded-md border border-line bg-cloud px-3 py-2">
            <p className="text-xs text-graphite">Language</p>
            <p className="mt-0.5 truncate font-medium text-ink">
              {source?.file.language ?? selectedNode.language ?? "Unknown"}
            </p>
          </div>
          <div className="rounded-md border border-line bg-cloud px-3 py-2">
            <p className="text-xs text-graphite">Size</p>
            <p className="mt-0.5 font-medium text-ink">
              {formatBytes(source?.file.sizeBytes ?? selectedNode.sizeBytes ?? 0)}
            </p>
          </div>
          <div className="rounded-md border border-line bg-cloud px-3 py-2">
            <p className="text-xs text-graphite">Type</p>
            <p className="mt-0.5 truncate font-medium text-ink">
              {source?.file.isTest
                ? "Test file"
                : source?.file.isGenerated
                  ? "Generated file"
                  : "Repository file"}
            </p>
          </div>
          <div className="rounded-md border border-line bg-cloud px-3 py-2">
            <p className="text-xs text-graphite">Preview</p>
            <p className="mt-0.5 truncate font-medium text-ink">
              {source?.file.previewStartLine && source?.file.previewEndLine
                ? `Lines ${source.file.previewStartLine}-${source.file.previewEndLine}`
                : "Pending"}
            </p>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {fileMatter ? (
          <section className="mb-4 rounded-md border border-line bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">
                  Why this file matters
                </p>
                <p className="mt-1 text-sm leading-6 text-graphite">
                  {fileMatter.purpose}
                </p>
              </div>
              <span className="shrink-0 rounded bg-cloud px-2 py-1 text-xs font-semibold text-graphite">
                {fileMatter.role}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
              <div className="rounded-md bg-cloud px-3 py-2">
                <p className="text-xs font-medium uppercase tracking-wide text-graphite">
                  Read it for
                </p>
                <p className="mt-1 leading-5 text-ink">{fileMatter.whyRead}</p>
              </div>
              <div className="rounded-md bg-cloud px-3 py-2">
                <p className="text-xs font-medium uppercase tracking-wide text-graphite">
                  Important symbols
                </p>
                <p className="mt-1 truncate text-ink">
                  {relatedSymbols.length
                    ? relatedSymbols.slice(0, 3).map((symbol) => symbol.name).join(", ")
                    : "No symbols detected yet"}
                </p>
              </div>
              <div className="rounded-md bg-cloud px-3 py-2">
                <p className="text-xs font-medium uppercase tracking-wide text-graphite">
                  Suggested next
                </p>
                <p className="mt-1 leading-5 text-ink">
                  {fileMatter.suggestedNext}
                </p>
              </div>
            </div>
          </section>
        ) : null}

        {isLoading ? (
          <div className="grid h-full min-h-[260px] place-items-center text-sm text-graphite">
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
          <div className="overflow-hidden rounded-md border border-line">
            <div className="flex items-center justify-between border-b border-line bg-cloud px-3 py-2">
              <p className="text-sm font-semibold text-ink">Code Preview</p>
              <span className="text-xs font-medium text-graphite">
                Lines {source.file.previewStartLine}-{source.file.previewEndLine}
              </span>
            </div>
            <div
              className="overflow-auto bg-[#0f172a] py-3 text-[13px] leading-6 text-slate-100"
              style={{ height: sourcePreviewHeight }}
            >
              <div className="font-mono">
                {source.file.previewLines.map((line, index) => (
                  <div
                    key={`${line.lineNumber}-${index}`}
                    className={`grid grid-cols-[64px_1fr] px-3 ${
                      highlightedLineRange &&
                      line.lineNumber >= highlightedLineRange.startLine &&
                      line.lineNumber <= highlightedLineRange.endLine
                        ? "border-l-2 border-signal bg-signal/20"
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
              </div>
            </div>
          </div>
        ) : (
          <div className="grid min-h-[260px] place-items-center rounded-md border border-dashed border-line bg-cloud p-6 text-center">
            <div>
              <FileCode2 className="mx-auto mb-3 text-signal" />
              <p className="font-semibold text-ink">No code preview yet</p>
              <p className="mt-2 max-w-md text-sm leading-6 text-graphite">
                DevLens has file metadata for this path. Try another file or
                search for a function name to jump into source.
              </p>
            </div>
          </div>
        )}
      </div>
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
          aria-label="Symbol relationship graph"
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
    <div className="rounded-md bg-white">
      <div className="border-b border-line px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold">Symbol graph</p>
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
                The graph uses extracted symbols and relationships from a
                completed analysis.
              </p>
            </div>
          </div>
        ) : !symbolsResponse?.symbols.length ? (
          <div className="grid h-full place-items-center rounded-md border border-line bg-white p-6 text-center">
            <div>
              <Braces className="mx-auto mb-3 text-signal" />
              <p className="font-semibold">No symbol graph available</p>
              <p className="mt-2 max-w-md text-sm leading-6 text-graphite">
                No code signals were detected for this repository.
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
                    DevLens indexed this symbol, but it does not currently have
                    calls, references, or inbound links in the graph data.
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
                  Keep exploring in the graph, inspect relationships in
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
  isLoading,
  error,
  onInspectSymbol,
  onOpenInFiles,
}: {
  repositoryReady: boolean;
  summary: DocsSummaryResponse | null;
  isLoading: boolean;
  error: string | null;
  onInspectSymbol: (symbolId: string) => void;
  onOpenInFiles: (symbol: { filePath: string }) => void;
}) {
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
          <FileCode2 size={18} className="shrink-0 text-signal" />
        </div>
      </div>

      <div className="bg-white p-5">
        {!repositoryReady ? (
          <div className="grid h-full place-items-center rounded-md border border-line bg-white p-6 text-center">
            <div>
              <FileCode2 className="mx-auto mb-3 text-signal" />
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
          <div className="grid gap-3">
            <details open className="group border-b border-line pb-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-1">
                <span className="font-semibold text-ink">Repository Summary</span>
                <ChevronDown size={16} className="text-graphite transition-transform group-open:rotate-180" />
              </summary>
              <section className="pt-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-graphite">
                    What is this repository?
                  </p>
                  <h2 className="mt-1 truncate text-xl font-semibold text-ink">
                    {summary.repository.owner}/{summary.repository.name}
                  </h2>
                  <p className="mt-3 max-w-4xl text-sm leading-6 text-graphite">
                    {buildSeniorRepoExplanation(summary)}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded px-2 py-1 text-xs font-semibold ${
                    summary.repository.analysisStatus === "COMPLETED"
                      ? "bg-mint/10 text-mint"
                      : "bg-cloud text-graphite"
                  }`}
                >
                  {summary.repository.analysisStatus}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-4 gap-3">
                {[
                  {
                    label: "Project Type",
                    value: inferProjectType(summary),
                  },
                  {
                    label: "Architecture",
                    value: describeRepositoryArchitecture(summary),
                  },
                  {
                    label: "Languages",
                    value: summary.repository.detectedLanguages.length
                      ? summary.repository.detectedLanguages.join(", ")
                      : "Pending",
                  },
                  {
                    label: "Frameworks",
                    value: summary.repository.detectedFrameworks.length
                      ? summary.repository.detectedFrameworks.join(", ")
                      : "Pending",
                  },
                  {
                    label: "Database",
                    value: summary.repository.detectedFrameworks.some((framework) =>
                      /prisma|postgres|mysql|sqlite|mongo|redis/i.test(framework),
                    )
                      ? "Detected"
                      : "Not detected",
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-md bg-cloud px-3 py-2"
                  >
                    <p className="text-xs font-medium uppercase tracking-wide text-graphite">
                      {item.label}
                    </p>
                    <p className="mt-1 truncate text-sm font-semibold text-ink">
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>
              </section>
            </details>

            <details open className="group rounded-md border border-signal/20 bg-signal/5 p-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                <span className="font-semibold text-ink">I am new to this repo</span>
                <ChevronDown size={16} className="text-signal transition-transform group-open:rotate-180" />
              </summary>
              <section className="pt-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="mt-1 text-sm leading-6 text-graphite">
                    Follow this onboarding path to understand the project in about{" "}
                    {estimateOnboarding(summary)}.
                  </p>
                </div>
                <Sparkles size={18} className="shrink-0 text-signal" />
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                <div className="rounded-md bg-white px-3 py-2">
                  <p className="font-semibold text-ink">1. Read the story</p>
                  <p className="mt-1 leading-5 text-graphite">
                    Start with {buildStartHereItems(summary)[0]?.path ?? "README.md"} to learn purpose and usage.
                  </p>
                </div>
                <div className="rounded-md bg-white px-3 py-2">
                  <p className="font-semibold text-ink">2. Find the entry point</p>
                  <p className="mt-1 leading-5 text-graphite">
                    Inspect {buildStartHereItems(summary)[2]?.path ?? buildStartHereItems(summary)[1]?.path ?? "the main source file"} next.
                  </p>
                </div>
                <div className="rounded-md bg-white px-3 py-2">
                  <p className="font-semibold text-ink">3. Ask DevLens</p>
                  <p className="mt-1 leading-5 text-graphite">
                    Ask for request flow, important files, or selected file explanations.
                  </p>
                </div>
              </div>
              </section>
            </details>

            <details className="group border-t border-line pt-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                <span className="font-semibold text-ink">Start Here + Key Files</span>
                <ChevronDown size={16} className="text-graphite transition-transform group-open:rotate-180" />
              </summary>
              <section className="mt-4 grid grid-cols-2 gap-4">
              <div className="rounded-md bg-cloud/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-ink">Start Here</p>
                    <p className="mt-1 text-sm leading-6 text-graphite">
                      Recommended reading path for a new developer.
                    </p>
                  </div>
                  <BookOpen size={18} className="shrink-0 text-signal" />
                </div>

                <div className="mt-4 grid gap-2">
                  {buildStartHereItems(summary).length ? (
                    buildStartHereItems(summary).map((item, index) => (
                      <div
                        key={item.path}
                            className="grid grid-cols-[28px_minmax(0,1fr)] gap-3 rounded-md bg-white px-3 py-2"
                      >
                        <span className="grid h-7 w-7 place-items-center rounded bg-white text-xs font-semibold text-signal">
                          {index + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-ink">
                            {item.path}
                          </p>
                          <p className="mt-0.5 text-xs leading-5 text-graphite">
                            {item.reason}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-md border border-line bg-cloud p-3 text-sm text-graphite">
                      Start Here recommendations will appear after file analysis.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-md bg-cloud/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-ink">Key Files</p>
                    <p className="mt-1 text-sm leading-6 text-graphite">
                      Important files with why they matter.
                    </p>
                  </div>
                  <File size={18} className="shrink-0 text-signal" />
                </div>
                <div className="mt-4 grid gap-3">
                  {buildKeyFileItems(summary).length ? (
                    buildKeyFileItems(summary).map((item) => (
                      <div
                        key={item.path}
                        className="flex min-w-0 items-start gap-2 rounded-md bg-white px-3 py-2"
                      >
                        <FileCode2 size={15} className="mt-0.5 shrink-0 text-signal" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-ink">
                            {item.path}
                          </p>
                          <p className="mt-0.5 text-xs leading-5 text-graphite">
                            {item.reason}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div
                      className="rounded-md border border-line bg-cloud p-3 text-sm text-graphite"
                    >
                      Key files will appear after indexing.
                    </div>
                  )}
                </div>
              </div>
              </section>
            </details>

            <details className="group border-t border-line pt-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                <span className="font-semibold text-ink">Key Functions & Exports</span>
                <ChevronDown size={16} className="text-graphite transition-transform group-open:rotate-180" />
              </summary>
              <section className="mt-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-ink">Key Functions & Exports</p>
                  <p className="mt-1 text-sm leading-6 text-graphite">
                    Functions, classes, and exports that can orient a developer.
                  </p>
                </div>
                <Braces size={18} className="shrink-0 text-signal" />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-semibold text-ink">
                    Most Referenced
                  </p>
                  <div className="mt-2 grid gap-2">
                    {summary.symbols.mostConnected.length ? (
                      summary.symbols.mostConnected.slice(0, 5).map((symbol) => (
                        <div
                          key={symbol.id}
                          className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-md border border-line p-3"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-ink">
                              {describeSymbolImportance(symbol)}
                            </p>
                            <p className="mt-1 truncate text-xs text-graphite">
                              {getSymbolKindMeta(symbol.kind).singular} -{" "}
                              {symbol.filePath} -{" "}
                              {formatCompactLineRange(symbol)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="rounded bg-cloud px-2 py-1 text-xs font-semibold text-graphite">
                              {formatUsageCount(symbol.connectionCount, "ref")}
                            </span>
                            <button
                              type="button"
                              onClick={() => onInspectSymbol(symbol.id)}
                              className="inline-flex h-8 items-center justify-center rounded-md border border-line bg-white px-2 text-xs font-medium text-graphite hover:border-signal hover:text-ink"
                            >
                              Inspect
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-md border border-line bg-cloud p-3 text-sm text-graphite">
                        Important code signals will appear after analysis.
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <p className="text-sm font-semibold text-ink">
                    Public Exports
                  </p>
                  <div className="mt-2 grid max-h-[268px] gap-2 overflow-auto pr-1">
                    {summary.symbols.exported.length ? (
                      summary.symbols.exported.slice(0, 5).map((symbol) => (
                        <div
                          key={symbol.id}
                          className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-md border border-line p-3"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-ink">
                              {symbol.name}
                            </p>
                            <p className="mt-1 truncate text-xs text-graphite">
                              {getSymbolKindMeta(symbol.kind).singular} -{" "}
                              {symbol.filePath}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => onOpenInFiles(symbol)}
                            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-line bg-white px-2 text-xs font-medium text-graphite hover:border-signal hover:text-ink"
                          >
                            <ExternalLink size={13} />
                            File
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-md border border-line bg-cloud p-3 text-sm text-graphite">
                        Public exports will appear when they are detected.
                      </div>
                    )}
                  </div>
                </div>
              </div>
              </section>
            </details>

            <details className="group border-t border-line pt-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                <span className="font-semibold text-ink">Engineering Snapshot</span>
                <ChevronDown size={16} className="text-graphite transition-transform group-open:rotate-180" />
              </summary>
              <section className="mt-4 rounded-md bg-cloud/50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-ink">Engineering Snapshot</p>
                  <p className="mt-1 text-sm leading-6 text-graphite">
                    Concise signals to set expectations before reading code.
                  </p>
                </div>
                <Workflow size={18} className="shrink-0 text-signal" />
              </div>

              <div className="mt-4 grid grid-cols-5 gap-3">
                {[
                  {
                    icon: Workflow,
                    label: "Architecture",
                    value: inferProjectType(summary),
                    description: describeRepositoryArchitecture(summary),
                  },
                  {
                    icon: CheckCircle2,
                    label: "Testing",
                    value: summary.architecture.testFileCount ? "Present" : "Light",
                    description: summary.architecture.testFileCount
                      ? `${summary.architecture.testFileCount} test file${
                          summary.architecture.testFileCount === 1 ? "" : "s"
                        } detected.`
                      : "Few test signals detected; read source and examples carefully.",
                  },
                  {
                    icon: Braces,
                    label: "Complexity",
                    value: inferComplexity(summary),
                    description: `${summary.repository.fileCount} files and ${summary.symbols.counts.total} code signals.`,
                  },
                  {
                    icon: GitPullRequest,
                    label: "Entry point",
                    value: buildStartHereItems(summary)[0]?.path ?? "Pending",
                    description: "Best first source or documentation file to open.",
                  },
                  {
                    icon: Clock3,
                    label: "Onboarding",
                    value: estimateOnboarding(summary),
                    description: "Estimated time to become productive in this repository.",
                  },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                  <div
                    key={item.label}
                    className="rounded-md bg-white p-3 shadow-sm"
                  >
                    <div className="flex items-center gap-2">
                      <Icon size={15} className="shrink-0 text-signal" />
                      <p className="text-xs font-medium uppercase tracking-wide text-graphite">
                        {item.label}
                      </p>
                    </div>
                    <p className="mt-1 truncate text-sm font-semibold text-ink">
                      {item.value}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-graphite">
                      {item.description}
                    </p>
                  </div>
                );
                })}
              </div>
              </section>
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
  const [repoUrl, setRepoUrl] = useState("https://github.com/vercel/ms");
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
  const [devlensAnswer, setDevlensAnswer] = useState<string | null>(null);
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
  const devlensSources = useMemo(() => {
    const sources = new Map<
      string,
      { path: string; startLine?: number; endLine?: number }
    >();
    if (selectedNode?.kind === "file") sources.set(selectedNode.path, { path: selectedNode.path });
    buildStartHereItems(docsSummary)
      .slice(0, 2)
      .forEach((item) => sources.set(item.path, { path: item.path }));
    searchResponse?.results.slice(0, 2).forEach((result) =>
      sources.set(result.path, {
        path: result.path,
        startLine: result.startLine,
        endLine: result.endLine,
      }),
    );
    return [...sources.values()].slice(0, 4);
  }, [docsSummary, searchResponse, selectedNode]);
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
            "This symbol does not call another indexed symbol in the current analysis.",
        }
      : activeSymbolTab === "references"
        ? {
            title: "No outgoing references",
            description:
              "DevLens did not find other indexed symbols referenced from this symbol.",
          }
        : {
            title: "No inbound links",
            description:
              "No indexed symbols currently point back to this symbol.",
          };

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
            err instanceof Error ? err.message : "Unable to load file preview.",
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
      return;
    }

    let cancelled = false;
    setIsLoadingDocsSummary(true);
    setDocsSummaryError(null);

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
            err instanceof Error
              ? err.message
              : "Unable to load Repository Guide.",
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
        err instanceof Error ? err.message : "Unable to load symbol intelligence.",
      );
    } finally {
      setIsLoadingSymbols(false);
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
      setError(
        err instanceof Error ? err.message : "Unable to analyze repository.",
      );
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
      const response = await fetch(
        `${API_URL}/repositories/${job.repositoryId}/search?q=${encodeURIComponent(query)}&limit=8`,
      );
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message ?? "Unable to search repository.");
      }
      setSearchResponse((await response.json()) as SearchResponse);
    } catch (err) {
      setSearchError(
        err instanceof Error ? err.message : "Unable to search repository.",
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

  function buildDevlensResponse(prompt: string): string {
    if (!repositoryReady || !docsSummary) {
      return "Analyze a repository first. Once DevLens has file and symbol context, this panel can guide you through the repo with file-backed starting points.";
    }

    const startHere = buildStartHereItems(docsSummary);
    const keyFiles = buildKeyFileItems(docsSummary);
    const codeSignals = docsSummary.symbols.mostConnected.slice(0, 3);

    if (/start/i.test(prompt)) {
      return startHere.length
        ? `Start with ${startHere
            .map((item, index) => `${index + 1}. ${item.path} (${item.reason})`)
            .join(" ")}. This path gives you purpose, entry points, and expected behavior before you dive deeper.`
        : "Start with the README, package metadata, and the first source entry point you find in the file tree.";
    }

    if (/important files/i.test(prompt) || /business logic/i.test(prompt)) {
      return keyFiles.length
        ? `The most useful files to inspect are ${keyFiles
            .map((item) => `${item.path} (${item.reason})`)
            .join("; ")}. Open them from the file tree to read the source preview.`
        : "DevLens has not identified key files yet, but the file tree and search can still help you find entry points.";
    }

    if (/routing|request flow/i.test(prompt)) {
      return `This looks like a ${inferProjectType(
        docsSummary,
      )}. Search for terms like route, handler, controller, middleware, and request to trace the flow through source files.`;
    }

    if (/authentication|database/i.test(prompt)) {
      const term = /authentication/i.test(prompt)
        ? "auth, session, token, middleware, login"
        : "database, prisma, model, repository, query";
      return `Use Search for ${term}. DevLens will open matching files in the inspection workspace so you can follow the implementation from source.`;
    }

    if (/architecture/i.test(prompt)) {
      return `${inferProjectType(docsSummary)} with ${
        docsSummary.repository.detectedFrameworks.join(", ") || "no major framework detected"
      }. Complexity is ${inferComplexity(
        docsSummary,
      ).toLowerCase()}, and the recommended onboarding time is ${estimateOnboarding(
        docsSummary,
      )}. Start with the files in the Repository Guide, then inspect related code signals.`;
    }

    if (/selected file/i.test(prompt)) {
      return selectedNode?.kind === "file"
        ? `${selectedNode.path} is selected. Use the source preview and line numbers to inspect its role, then search for its exports or key function names.`
        : "Select a file in the explorer first, then DevLens can ground the explanation in that file.";
    }

    if (/structured|repository/i.test(prompt)) {
      return `${docsSummary.overview.text} It appears to be a ${inferProjectType(
        docsSummary,
      )} with ${docsSummary.repository.fileCount} files, ${
        docsSummary.repository.detectedLanguages.join(", ") || "detected source"
      }, and ${docsSummary.symbols.counts.total} code signals.`;
    }

    if (codeSignals.length) {
      return `Key code signals include ${codeSignals
        .map((symbol) => `${symbol.name} in ${symbol.filePath}`)
        .join("; ")}. These are good anchors for understanding behavior.`;
    }

    return "Use the Repository Guide first, then open key files and search for feature terms. Full generated answers with clickable citations can build on this context next.";
  }

  function askDevlens(prompt: string) {
    setDevlensPrompt(prompt);
    setDevlensAnswer(buildDevlensResponse(prompt));
  }

  const activeStepIndex = getStepIndex(job?.currentStep);
  const isRunning =
    job?.status === "QUEUED" || job?.status === "RUNNING" || isSubmitting;

  return (
    <main className="min-h-screen bg-cloud text-ink">
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-line bg-white px-6">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-ink text-white">
            <Sparkles size={18} />
          </div>
          <div>
            <p className="text-sm font-semibold leading-4">DevLens AI</p>
            <p className="text-xs text-graphite">
              Understand any codebase in minutes, not days.
            </p>
          </div>
        </div>
        <div className="rounded-md border border-line bg-cloud px-3 py-1.5 text-xs font-medium text-graphite">
          Repo understanding workspace
        </div>
      </header>

      <section className="grid min-h-[calc(100vh-4rem)] grid-cols-[300px_1fr_360px]">
        <aside className="flex min-h-0 flex-col border-r border-line bg-white p-4">
          <div className="rounded-md border border-line bg-cloud p-3">
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
                {job?.status ?? "Idle"}
              </span>
            </div>

            {job ? (
              <div className="mt-3">
                <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                  <span className="truncate text-graphite">
                    {job.status === "COMPLETED"
                      ? `Analysis complete - ${repository?.fileCount ?? tree?.fileCount ?? 0} files - ${
                          symbolsResponse?.count ?? docsSummary?.symbols.counts.total ?? 0
                        } code signals - ${calculateDuration(job)}`
                      : formatStepLabel(job.currentStep)}
                  </span>
                  <span className="font-semibold text-ink">{job.progress}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-line">
                  <div
                    className="h-full rounded-full bg-signal transition-all"
                    style={{ width: `${job.progress}%` }}
                  />
                </div>
                {job.errorMessage ? (
                  <p className="mt-2 text-xs text-red-600">{job.errorMessage}</p>
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
                          <XCircle size={14} />
                        ) : complete ? (
                          <CheckCircle2 size={14} />
                        ) : active ? (
                          <Loader2 size={13} className="animate-spin" />
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
                >
                  <ChevronRight size={14} />
                </button>
                <button
                  type="button"
                  onClick={expandAllFolders}
                  disabled={!explorerTree.length}
                  className="grid h-7 w-7 place-items-center rounded border border-line bg-white text-graphite transition-colors hover:border-signal hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
                  title="Expand all"
                >
                  <ChevronDown size={14} />
                </button>
                <button
                  type="button"
                  onClick={revealSelectedFile}
                  disabled={!selectedNode}
                  className="grid h-7 w-7 place-items-center rounded border border-line bg-white text-graphite transition-colors hover:border-signal hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
                  title="Reveal selected file"
                >
                  <FolderOpen size={14} />
                </button>
              </div>
            </div>

            <div className="mb-3 flex h-9 items-center gap-2 rounded-md border border-line bg-cloud px-3 focus-within:border-signal">
              <Search size={14} className="shrink-0 text-graphite" />
              <input
                value={fileQuery}
                onChange={(event) => setFileQuery(event.target.value)}
                disabled={!repositoryReady}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none disabled:cursor-not-allowed"
                placeholder={repositoryReady ? "Filter files" : "Analyze first"}
              />
            </div>

            <div className="min-h-0 flex-1 overflow-auto rounded-md border border-line bg-white p-2">
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
                  Analyze a repository to browse files.
                </div>
              )}
            </div>
            <p className="mt-2 h-4 text-xs text-graphite">
              {sidebarCopiedPath ? `Copied ${sidebarCopiedPath}` : "Right-click a file to copy its path."}
            </p>
          </div>
        </aside>

        <section className="min-h-0 overflow-auto p-6">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold tracking-normal">
              Repository Workspace
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-graphite">
              Paste a GitHub repository, analyze its structure, explore files,
              search the codebase, and prepare for file-backed Q&A.
            </p>
          </div>

          <div className="mb-6 rounded-md border border-line bg-white p-4">
            <div className="flex gap-3">
              <input
                value={repoUrl}
                onChange={(event) => setRepoUrl(event.target.value)}
                className="h-11 min-w-0 flex-1 rounded-md border border-line px-3 text-sm outline-none focus:border-signal"
                placeholder="https://github.com/owner/repository"
              />
              <button
                onClick={analyzeRepository}
                disabled={isRunning}
                className="inline-flex h-11 items-center gap-2 rounded-md bg-signal px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isRunning ? (
                  <Loader2 size={17} className="animate-spin" />
                ) : (
                  <GitPullRequest size={17} />
                )}
                Analyze repo
              </button>
            </div>
            {error ? (
              <div className="mt-3 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                <AlertCircle size={16} />
                {error}
              </div>
            ) : null}
            {job ? (
              <div className="mt-3 rounded-md border border-line bg-cloud p-3 text-sm">
                <div className="mb-2 flex items-center justify-between">
                  <span className={statusTone(job.status)}>{job.status}</span>
                  <span className="text-graphite">
                    {formatStepLabel(job.currentStep)}
                  </span>
                  <span className="font-medium">{job.progress}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-line">
                  <div
                    className="h-full rounded-full bg-signal transition-all"
                    style={{ width: `${job.progress}%` }}
                  />
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-graphite">
                  <Clock3 size={13} />
                  Elapsed: {calculateDuration(job)}
                  {job.errorMessage ? (
                    <span className="text-red-600">- {job.errorMessage}</span>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>

          <div className="mb-6 rounded-md border border-line bg-white px-4 py-3 shadow-sm">
            <div className="grid grid-cols-6 gap-3">
            {[
              [
                "Repository",
                repository
                  ? `${repository.owner}/${repository.name}`
                  : "Not analyzed",
              ],
              [
                "Languages",
                repository?.detectedLanguages.length
                  ? repository.detectedLanguages.join(", ")
                  : "Pending",
              ],
              [
                "Frameworks",
                repository?.detectedFrameworks.length
                  ? repository.detectedFrameworks.join(", ")
                  : "Pending",
              ],
              [
                "Files",
                repository ? `${repository.fileCount} files` : "Pending",
              ],
              [
                "Complexity",
                docsSummary ? inferComplexity(docsSummary) : "Pending",
              ],
              [
                "Onboarding",
                docsSummary ? estimateOnboarding(docsSummary) : "Pending",
              ],
            ].map(([label, value]) => (
              <div
                key={label}
                className="min-w-0 border-r border-line pr-3 last:border-r-0"
              >
                <p className="text-[11px] font-medium uppercase tracking-wide text-graphite">
                  {label}
                </p>
                <p
                  className="mt-1 truncate text-sm font-semibold text-ink"
                  title={value}
                >
                  {value}
                </p>
              </div>
            ))}
            </div>
          </div>

          <div className="mb-4 flex items-center gap-1 rounded-md border border-line bg-white p-1">
            {workspaceTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveWorkspaceTab(tab.key)}
                className={`h-9 flex-1 rounded px-3 text-sm font-medium transition-colors ${
                  activeWorkspaceTab === tab.key
                    ? "bg-ink text-white"
                    : "text-graphite hover:bg-cloud"
                }`}
              >
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
              <div className="sticky top-0 z-10 border-b border-line bg-white px-4 py-3">
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
                      onClick={() => askDevlens("Explain selected file")}
                      disabled={selectedNode?.kind !== "file"}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-white px-2 text-xs font-medium text-graphite transition-colors hover:border-signal hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Sparkles size={13} />
                      Explain
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid h-[640px] grid-rows-[minmax(0,1fr)_auto] bg-cloud/50">
                <div className="min-h-0 overflow-auto p-4">
                  <FileSourcePreview
                    repositoryReady={repositoryReady}
                    selectedNode={selectedNode}
                    relatedSymbols={selectedFileSymbols}
                    highlightedLineRange={highlightedLineRange}
                    source={selectedFileSource}
                    isLoading={isLoadingFileSource}
                    error={fileSourceError}
                  />
                </div>

                <div className="border-t border-line bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-ink">
                        Related Code Signals
                      </p>
                      <p className="mt-0.5 text-xs text-graphite">
                        Symbols found in the selected file.
                      </p>
                    </div>
                    <span className="rounded bg-cloud px-2 py-1 text-xs font-semibold text-graphite">
                      {selectedFileSymbols.length}
                    </span>
                  </div>

                  {selectedFileSymbols.length ? (
                    <div className="mt-3 grid max-h-52 grid-cols-2 gap-2 overflow-auto">
                      {selectedFileSymbols.slice(0, 6).map((symbol) => (
                        <div
                          key={symbol.id}
                          className="rounded-md border border-line bg-cloud/60 p-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-ink">
                                {symbol.name}
                              </p>
                              <p className="mt-0.5 truncate text-xs text-graphite">
                                {getSymbolKindMeta(symbol.kind).singular} -{" "}
                                {formatCompactLineRange(symbol)}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => inspectSymbol(symbol.id)}
                              className="shrink-0 rounded border border-line bg-white px-2 py-1 text-xs font-medium text-graphite hover:border-signal hover:text-ink"
                            >
                              Open
                            </button>
                          </div>
                          <p className="mt-2 text-xs leading-5 text-graphite">
                            {getSymbolPurpose(symbol)}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-medium text-graphite">
                            <span className="rounded bg-white px-1.5 py-0.5">
                              Calls {symbol.outgoingCalls.length}
                            </span>
                            <span className="rounded bg-white px-1.5 py-0.5">
                              Uses {symbol.outgoingReferences.length}
                            </span>
                            <span className="rounded bg-white px-1.5 py-0.5">
                              Referenced by {symbol.incomingReferences.length}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-3 rounded-md border border-dashed border-line bg-cloud p-3 text-sm leading-6 text-graphite">
                      {selectedNode?.kind === "file"
                        ? "No functions or classes were detected in this file yet. Try Search for business logic, ask DevLens to explain this file, or open a nearby source file."
                        : "Select a file to see related functions, classes, and exports. DevLens can also help you find business logic or request flow."}
                    </div>
                  )}
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
                      No code signals were detected for this repository.
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

              <div className="h-[640px] overflow-auto p-4">
                {searchError ? (
                  <div className="mb-3 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    <AlertCircle size={16} className="mt-0.5 shrink-0" />
                    <span>{searchError}</span>
                  </div>
                ) : null}

                {!repositoryReady ? (
                  <div className="grid h-full place-items-center rounded-md border border-line bg-cloud text-center text-sm leading-6 text-graphite">
                    Search becomes available after repository analysis
                    completes.
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
                      <div className="rounded-md border border-line bg-cloud p-3 text-sm leading-6 text-graphite">
                          No matching files or code signals found.
                      </div>
                    )}
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-3">
                    {["function", "parse", "format"].map((query) => (
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
              isLoading={isLoadingDocsSummary}
              error={docsSummaryError}
              onInspectSymbol={inspectSymbol}
              onOpenInFiles={openSymbolInFiles}
            />
          ) : null}
        </section>

        <aside className="flex min-h-0 flex-col border-l border-line bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold">DevLens AI</p>
              <p className="mt-1 text-sm leading-6 text-graphite">
                Ask practical questions about this repository.
              </p>
            </div>
            <Sparkles size={18} className="shrink-0 text-signal" />
          </div>

          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-graphite">
              Suggested questions
            </p>
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            {[
              "Where should I start?",
              "Explain this repository",
              "Explain selected file",
              "What are the most important files?",
              "Show request flow",
              "Find authentication",
              "Find business logic",
            ].map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => askDevlens(prompt)}
                className="rounded-full border border-line bg-white px-3 py-1.5 text-left text-xs font-medium text-graphite transition-colors hover:border-signal hover:bg-cloud hover:text-ink"
              >
                {prompt}
              </button>
            ))}
          </div>

          <div className="mt-4 min-h-0 flex-1 overflow-auto rounded-md bg-cloud/70 p-3">
            <div className="ml-auto max-w-[88%] rounded-md bg-ink px-3 py-2 text-sm leading-6 text-white">
              {devlensPrompt}
            </div>
            <div className="mt-3 flex items-start gap-3">
              <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-white text-signal shadow-sm">
                <Sparkles size={14} />
              </div>
              <div className="min-w-0 rounded-md bg-white p-3 shadow-sm">
                <p className="text-sm leading-6 text-graphite">
                  {devlensAnswer ??
                    (repositoryReady
                      ? "Choose a question above. DevLens will use the Repository Guide, file tree, and code signals already available in this workspace."
                      : "Analyze a repository first, then DevLens can guide you through where to start and what to inspect.")}
                </p>
                {devlensSources.length ? (
                  <div className="mt-3 border-t border-line pt-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-graphite">
                      Sources
                    </p>
                    <div className="mt-2 grid gap-1.5">
                      {devlensSources.map((source) => (
                        <button
                          key={`${source.path}-${source.startLine ?? "file"}`}
                          type="button"
                          onClick={() => {
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
                          }}
                          className="flex min-w-0 items-center gap-2 rounded bg-cloud px-2 py-1 text-left text-xs font-medium text-graphite transition-colors hover:bg-signal/10 hover:text-ink"
                          title={source.path}
                        >
                          <FileCode2 size={12} className="shrink-0 text-signal" />
                          <span className="min-w-0 flex-1 truncate">
                            {source.path}
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
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {["Explain selected file", "Search important files"].map((followUp) => (
                    <button
                      key={followUp}
                      type="button"
                      onClick={() => askDevlens(followUp)}
                      className="rounded-full border border-line px-2 py-1 text-xs text-graphite hover:border-signal hover:text-ink"
                    >
                      {followUp}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="sticky bottom-0 mt-auto bg-white pt-4">
            <div className="rounded-md border border-line bg-cloud px-3 py-2">
              <textarea
                value={devlensPrompt}
                onChange={(event) => setDevlensPrompt(event.target.value)}
                rows={3}
                placeholder={
                  repositoryReady
                    ? "Ask anything about this repository..."
                    : "Analyze a repository to enable DevLens AI."
                }
                className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-graphite"
              />
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs text-graphite">
                  Grounded answers are next
                </span>
                <button
                  type="button"
                  onClick={() => askDevlens(devlensPrompt)}
                  disabled={!devlensPrompt.trim()}
                  className="rounded-md bg-ink px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Ask
                </button>
              </div>
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
