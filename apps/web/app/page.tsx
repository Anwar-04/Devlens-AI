"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  Braces,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Database,
  File,
  FileCode2,
  Folder,
  FolderOpen,
  GitBranch,
  GitPullRequest,
  KeyRound,
  Loader2,
  Network,
  Search,
  ShieldCheck,
  Sparkles,
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

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const navItems = [
  "Overview",
  "Folder Explorer",
  "Dependency Graph",
  "API Explorer",
  "Docs",
];
const pipelineSteps = [
  { key: "queued", label: "Queued", description: "Waiting for a worker" },
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

const modules = [
  { name: "Repository Intelligence", status: "Ready", icon: GitBranch },
  { name: "Architecture Agent", status: "Queued", icon: Network },
  { name: "Documentation Agent", status: "Queued", icon: FileCode2 },
  { name: "Knowledge Graph", status: "Indexing soon", icon: Braces },
];

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
  depth = 0,
}: {
  nodes: ExplorerNode[];
  expanded: Set<string>;
  selectedPath?: string;
  onToggle: (path: string) => void;
  onSelect: (node: ExplorerNode) => void;
  depth?: number;
}) {
  return (
    <div className={depth === 0 ? "space-y-1" : "space-y-0.5"}>
      {nodes.map((node) => {
        const isFolder = node.kind === "folder";
        const isExpanded = expanded.has(node.path);
        const isSelected = selectedPath === node.path;
        const Icon = isFolder ? (isExpanded ? FolderOpen : Folder) : File;

        return (
          <div key={node.path}>
            <button
              onClick={() => {
                onSelect(node);
                if (isFolder) onToggle(node.path);
              }}
              className={`group w-full rounded-md border border-transparent px-2 py-2 text-left text-sm hover:border-line hover:bg-cloud ${
                isSelected ? "border-line bg-cloud" : ""
              }`}
              style={{ paddingLeft: `${10 + depth * 18}px` }}
              title={node.path}
            >
              <span className="flex min-w-0 items-center gap-2">
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
                <Icon
                  size={16}
                  className={
                    isFolder ? "shrink-0 text-amber" : "shrink-0 text-signal"
                  }
                />
                <span
                  className={`min-w-0 truncate ${isFolder ? "font-medium text-ink" : "text-ink"}`}
                >
                  {node.name}
                </span>
              </span>
              <span className="ml-9 mt-1 flex min-w-0 items-center gap-2 text-xs text-graphite">
                {isFolder ? (
                  <>
                    <span>{node.fileCount} files</span>
                    <span>•</span>
                    <span>{formatBytes(node.totalSizeBytes)}</span>
                  </>
                ) : (
                  <>
                    {node.language ? (
                      <span>{node.language}</span>
                    ) : (
                      <span>file</span>
                    )}
                    <span>•</span>
                    <span>{formatBytes(node.sizeBytes ?? 0)}</span>
                  </>
                )}
              </span>
            </button>
            {isFolder && isExpanded ? (
              <div className="ml-3 border-l border-line/80">
                <ExplorerTree
                  nodes={node.children}
                  expanded={expanded}
                  selectedPath={selectedPath}
                  onToggle={onToggle}
                  onSelect={onSelect}
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
export default function Home() {
  const [repoUrl, setRepoUrl] = useState("https://github.com/vercel/ms");
  const [job, setJob] = useState<JobResponse | null>(null);
  const [tree, setTree] = useState<TreeResponse | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedNode, setSelectedNode] = useState<ExplorerNode | null>(null);
  const [fileQuery, setFileQuery] = useState("");
  const [languageFilter, setLanguageFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("function");
  const [searchResponse, setSearchResponse] = useState<SearchResponse | null>(
    null,
  );
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

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
  const languages = useMemo(() => {
    const values = new Set<string>();
    tree?.nodes.forEach((node) => {
      if (node.kind === "file" && node.language) values.add(node.language);
    });
    return [...values].sort();
  }, [tree]);

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
          const treeResponse = await fetch(
            `${API_URL}/repositories/${nextJob.repositoryId}/tree`,
          );
          if (treeResponse.ok) {
            setTree((await treeResponse.json()) as TreeResponse);
          }
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Unable to refresh job status.",
        );
      }
    }, 1200);

    return () => window.clearInterval(interval);
  }, [job]);

  async function analyzeRepository() {
    setError(null);
    setTree(null);
    setSelectedNode(null);
    setExpanded(new Set());
    setSearchResponse(null);
    setSearchError(null);
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
    setFileQuery(result.path);
    setLanguageFilter("all");
    setExpanded((current) => {
      const next = new Set(current);
      getParentPaths(result.path).forEach((path) => next.add(path));
      return next;
    });
    const node = findExplorerNode(explorerTree, result.path);
    if (node) setSelectedNode(node);
  }

  const activeStepIndex = getStepIndex(job?.currentStep);
  const isRunning =
    job?.status === "QUEUED" || job?.status === "RUNNING" || isSubmitting;

  return (
    <main className="min-h-screen bg-cloud text-ink">
      <header className="flex h-16 items-center justify-between border-b border-line bg-white px-6">
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
        <div className="flex items-center gap-2">
          <button className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-medium text-graphite">
            <ShieldCheck size={16} />
            Security
          </button>
          <button className="inline-flex h-9 items-center gap-2 rounded-md bg-ink px-3 text-sm font-medium text-white">
            <KeyRound size={16} />
            GitHub OAuth
          </button>
        </div>
      </header>

      <section className="grid min-h-[calc(100vh-4rem)] grid-cols-[300px_1fr_360px]">
        <aside className="border-r border-line bg-white p-4">
          <div className="mb-4 flex items-center gap-2 rounded-md border border-line bg-cloud px-3 py-2">
            <Search size={16} className="text-graphite" />
            <input
              className="w-full bg-transparent text-sm outline-none"
              placeholder="Search repositories"
            />
          </div>

          <nav className="space-y-1">
            {navItems.map((item) => (
              <button
                key={item}
                className="flex h-9 w-full items-center justify-between rounded-md px-3 text-left text-sm text-graphite hover:bg-cloud"
              >
                {item}
                <ChevronRight size={15} />
              </button>
            ))}
          </nav>

          <div className="mt-8">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-graphite">
              Analysis Pipeline
            </p>
            <div className="space-y-3">
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
                  <div key={step.key} className="flex gap-3 text-sm">
                    <span
                      className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold ${
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
                        <XCircle size={15} />
                      ) : complete ? (
                        <CheckCircle2 size={15} />
                      ) : active ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        index + 1
                      )}
                    </span>
                    <div className="min-w-0">
                      <p
                        className={
                          active ? "font-medium text-ink" : "text-graphite"
                        }
                      >
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
        </aside>

        <section className="p-6">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold tracking-normal">
              Repository Workspace
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-graphite">
              Paste a GitHub repository, analyze its structure, and turn the
              result into a navigable engineering knowledge model.
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

          <div className="mb-6 grid grid-cols-4 gap-4">
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
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-md border border-line bg-white p-4"
              >
                <p className="text-xs font-medium uppercase tracking-wide text-graphite">
                  {label}
                </p>
                <p
                  className="mt-2 truncate text-lg font-semibold"
                  title={value}
                >
                  {value}
                </p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-[1fr_360px] gap-4">
            <div className="rounded-md border border-line bg-white">
              <div className="border-b border-line px-4 py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">Repository file explorer</p>
                    <p className="text-sm text-graphite">
                      {tree
                        ? `${tree.fileCount} files extracted`
                        : "Run an analysis to populate files."}
                    </p>
                  </div>
                  <Activity size={18} className="text-mint" />
                </div>
                <div className="mt-3 grid grid-cols-[1fr_160px] gap-2">
                  <div className="flex items-center gap-2 rounded-md border border-line bg-cloud px-3 py-2">
                    <Search size={15} className="text-graphite" />
                    <input
                      value={fileQuery}
                      onChange={(event) => setFileQuery(event.target.value)}
                      className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                      placeholder="Filter files"
                    />
                  </div>
                  <select
                    value={languageFilter}
                    onChange={(event) => setLanguageFilter(event.target.value)}
                    className="h-10 rounded-md border border-line bg-white px-3 text-sm outline-none"
                  >
                    <option value="all">All languages</option>
                    {languages.map((language) => (
                      <option key={language} value={language}>
                        {language}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex h-[560px] flex-col">
                <div className="min-h-0 flex-1 overflow-auto bg-white p-3">
                  {visibleTree.length ? (
                    <ExplorerTree
                      nodes={visibleTree}
                      expanded={expanded}
                      selectedPath={selectedNode?.path}
                      onToggle={toggleFolder}
                      onSelect={setSelectedNode}
                    />
                  ) : (
                    <div className="grid h-full place-items-center text-center text-sm text-graphite">
                      <div>
                        <Database className="mx-auto mb-3 text-amber" />
                        Repository metadata will appear here after the worker
                        finishes.
                      </div>
                    </div>
                  )}
                </div>
                <div className="border-t border-line bg-cloud/50 p-4 text-sm">
                  <p className="font-semibold">Structure Details</p>
                  {selectedNode ? (
                    <div className="mt-3 space-y-4 text-graphite">
                      <div className="rounded-md border border-line bg-white p-3">
                        <p className="text-xs uppercase tracking-wide text-graphite">
                          Selected {selectedNode.kind}
                        </p>
                        <p className="mt-1 break-all font-medium text-ink">
                          {selectedNode.path}
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-md border border-line bg-white p-3">
                          <p className="text-xs uppercase tracking-wide">
                            Files
                          </p>
                          <p className="mt-1 font-semibold text-ink">
                            {selectedNode.fileCount}
                          </p>
                        </div>
                        <div className="rounded-md border border-line bg-white p-3">
                          <p className="text-xs uppercase tracking-wide">
                            Size
                          </p>
                          <p className="mt-1 font-semibold text-ink">
                            {formatBytes(
                              selectedNode.totalSizeBytes ||
                                selectedNode.sizeBytes ||
                                0,
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="rounded-md border border-line bg-white p-3">
                        <p className="text-xs uppercase tracking-wide">Type</p>
                        <p className="mt-1 text-ink">
                          {selectedNode.kind === "folder"
                            ? "Folder grouping related source files"
                            : selectedNode.language
                              ? `${selectedNode.language} source file`
                              : "Repository file"}
                        </p>
                      </div>
                      {selectedNode.kind === "folder" ? (
                        <p className="leading-6">
                          Expand folders to trace how the repository is
                          organized before moving into symbols and dependencies.
                        </p>
                      ) : (
                        <p className="leading-6">
                          Code preview and symbol extraction will attach here in
                          the next milestone.
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="mt-3 leading-6 text-graphite">
                      Select a folder or file to understand what role it plays
                      in the repository structure.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="grid gap-4">
              {modules.map((module) => {
                const Icon = module.icon;
                return (
                  <div
                    key={module.name}
                    className="rounded-md border border-line bg-white p-4"
                  >
                    <Icon size={20} className="text-signal" />
                    <p className="mt-3 font-medium">{module.name}</p>
                    <p className="mt-1 text-sm text-graphite">
                      {module.status}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <aside className="flex min-h-0 flex-col border-l border-line bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold">Repository Search</p>
              <p className="mt-1 text-sm leading-6 text-graphite">
                Search indexed code chunks with file and line citations.
              </p>
            </div>
            <Search size={18} className="shrink-0 text-signal" />
          </div>

          <form onSubmit={searchRepository} className="mt-4">
            <div className="flex items-center gap-2 rounded-md border border-line bg-cloud px-3 py-2 focus-within:border-signal">
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
              disabled={!repositoryReady || isSearching || !searchQuery.trim()}
              className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-ink px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSearching ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Search size={16} />
              )}
              Search repository
            </button>
          </form>

          {searchError ? (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{searchError}</span>
            </div>
          ) : null}

          <div className="mt-4 min-h-0 flex-1 overflow-auto">
            {!repositoryReady ? (
              <div className="rounded-md border border-line bg-cloud p-3 text-sm leading-6 text-graphite">
                Search becomes available after repository analysis completes.
              </div>
            ) : searchResponse ? (
              <div>
                <div className="mb-3 flex items-center justify-between text-sm">
                  <span className="font-medium">
                    {searchResponse.count} results
                  </span>
                  <span
                    className="max-w-[180px] truncate text-graphite"
                    title={searchResponse.query}
                  >
                    {searchResponse.query}
                  </span>
                </div>
                <div className="space-y-3">
                  {searchResponse.results.length ? (
                    searchResponse.results.map((result) => (
                      <button
                        key={result.id}
                        onClick={() => focusSearchResult(result)}
                        className="w-full rounded-md border border-line bg-white p-3 text-left hover:border-signal hover:bg-cloud"
                      >
                        <div className="flex min-w-0 items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p
                              className="truncate text-sm font-semibold text-ink"
                              title={result.path}
                            >
                              {result.path}
                            </p>
                            <p className="mt-1 text-xs text-graphite">
                              Lines {result.startLine}-{result.endLine}
                              {result.language ? ` • ${result.language}` : ""}
                            </p>
                            {result.symbol ? (
                              <p className="mt-1 truncate text-xs font-medium text-signal">
                                {result.symbol.kind} {result.symbol.name}
                              </p>
                            ) : null}
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <span className="rounded-md bg-cloud px-2 py-1 text-xs font-medium text-graphite">
                              {result.score}
                            </span>
                            <span
                              className={`rounded-md px-2 py-1 text-xs font-medium ${
                                result.chunkKind === "SYMBOL"
                                  ? "bg-signal/10 text-signal"
                                  : result.isTest
                                    ? "bg-amber/10 text-amber"
                                    : "bg-mint/10 text-mint"
                              }`}
                            >
                              {result.chunkKind === "SYMBOL"
                                ? "symbol"
                                : result.isTest
                                  ? "test"
                                  : "source"}
                            </span>
                            {result.vectorScore ? (
                              <span className="rounded-md bg-cloud px-2 py-1 text-xs font-medium text-graphite">
                                vector
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <p className="mt-3 line-clamp-5 whitespace-pre-wrap break-words text-xs leading-5 text-graphite">
                          {highlightSnippet(result.snippet, result.matchedTerm)}
                        </p>
                      </button>
                    ))
                  ) : (
                    <div className="rounded-md border border-line bg-cloud p-3 text-sm leading-6 text-graphite">
                      No chunks matched this query.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {["function", "parse", "format"].map((query) => (
                  <button
                    key={query}
                    onClick={() => {
                      setSearchQuery(query);
                      void searchRepository(undefined, query);
                    }}
                    className="w-full rounded-md border border-line bg-cloud p-3 text-left text-sm text-graphite hover:border-signal"
                  >
                    {query}
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>
      </section>
    </main>
  );
}
