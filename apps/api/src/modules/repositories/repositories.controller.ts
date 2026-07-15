import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { db } from "@devlens/database";
import {
  AssistantCitation,
  AssistantContext,
  AssistantSourceSnippet,
  CloneJobPayload,
  RedisQueue
} from "@devlens/shared";
import { createAssistantAnswer } from "../assistant/assistant.service";

interface CreateRepositoryRequest {
  workspaceId?: string;
  url: string;
}

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const TEST_FILE_PATTERN =
  /(^|\/)(__tests__|tests?)\/|(\.|-)(test|spec)\.[^.]+$/i;
const DOCS_QUEUED_SECTIONS = [
  {
    title: "README summary",
    description: "Condensed project overview from README and repository docs."
  },
  {
    title: "Architecture notes",
    description: "Generated system map, boundaries, and module responsibilities."
  },
  {
    title: "API/reference docs",
    description: "Symbol and public interface documentation from code intelligence."
  },
  {
    title: "Explain repository",
    description: "Guided narrative for onboarding and repository Q&A."
  }
];
const SOURCE_SIGNAL_PATTERNS = [
  /^README(\.|$)/i,
  /^package\.json$/i,
  /(^|\/)(app|server|main|index)\.[cm]?[jt]sx?$/i,
  /(^|\/)routes?\//i,
  /(^|\/)controllers?\//i,
  /(^|\/)services?\//i,
  /(^|\/)(models?|schema|schemas|drizzle|prisma|data|database|db)\//i,
  /(^|\/)middlewares?\//i,
  /(^|\/)(validators?|validation)\//i,
  /(^|\/)(config|configs)\//i,
  /^\.env(\.|$)|(^|\/)\.env\.example$/i
];

type SignalSnippet = { path: string; content: string };
type UnderstandingContext = {
  repository: {
    owner: string;
    name: string;
    detectedFrameworks: string[];
  };
  files: Array<{ path: string }>;
  symbols: Array<{ name: string }>;
  primaryLanguage?: { language: string } | undefined;
};
type RepositoryUnderstanding = {
  purpose: string;
  domain: string;
  coreFeatures: string[];
  architecture: string;
  mainModules: Array<{ name: string; purpose: string }>;
  readingOrder: Array<{ file: string; reason: string }>;
  summary: string;
};

type GuideEnhanceResponse = {
  repositoryId: string;
  summary: string;
  purpose: string;
  domain: string;
  coreFeatures: string[];
  architecture: string;
  readingOrder: Array<{ file: string; reason: string }>;
  citations: AssistantCitation[];
  mode: "provider" | "fallback";
  fallbackReason?: "missing_credentials" | "provider_error" | "weak_citations";
};

function parseGitHubUrl(url: string): { owner: string; name: string; normalizedUrl: string } {
  const trimmed = url.trim();
  const match = trimmed.match(/^https?:\/\/(?:www\.)?github\.com\/([^/\s]+)\/([^/\s#?]+?)(?:\.git)?\/?(?:[?#].*)?$/i);
  if (!match?.[1] || !match?.[2]) {
    throw new BadRequestException(
      "Invalid GitHub repository URL. Use a public repository URL like https://github.com/owner/repo."
    );
  }

  const owner = match[1];
  const name = match[2].replace(/\.git$/i, "");
  return {
    owner,
    name,
    normalizedUrl: `https://github.com/${owner}/${name}`
  };
}

async function ensureWorkspace(workspaceId?: string): Promise<string> {
  if (workspaceId) {
    const workspace = await db.workspace.findUnique({ where: { id: workspaceId } });
    if (!workspace) {
      throw new BadRequestException("Workspace not found.");
    }
    return workspace.id;
  }

  const user = await db.user.upsert({
    where: { email: "default@devlens.ai" },
    update: {},
    create: {
      email: "default@devlens.ai",
      name: "Default User"
    }
  });

  const existingWorkspace = await db.workspace.findFirst({ where: { ownerUserId: user.id } });
  if (existingWorkspace) {
    return existingWorkspace.id;
  }

  const workspace = await db.workspace.create({
    data: {
      name: "Default Workspace",
      slug: "default-workspace",
      ownerUserId: user.id,
      members: {
        create: {
          userId: user.id,
          role: "OWNER"
        }
      }
    }
  });

  return workspace.id;
}

function serializeRelatedSymbol(reference: {
  id: string;
  kind: "REFERENCE" | "CALL";
  sourceSymbol?: {
    id: string;
    name: string;
    kind: string;
    startLine: number;
    endLine: number;
    signature: string | null;
    visibility: string | null;
    file: { path: string };
  };
  targetSymbol?: {
    id: string;
    name: string;
    kind: string;
    startLine: number;
    endLine: number;
    signature: string | null;
    visibility: string | null;
    file: { path: string };
  };
}) {
  const symbol = reference.targetSymbol ?? reference.sourceSymbol;
  if (!symbol) return null;

  return {
    referenceId: reference.id,
    referenceKind: reference.kind,
    symbol: {
      id: symbol.id,
      name: symbol.name,
      kind: symbol.kind,
      filePath: symbol.file.path,
      startLine: symbol.startLine,
      endLine: symbol.endLine,
      signature: symbol.signature,
      visibility: symbol.visibility
    }
  };
}

function serializeSymbol(symbol: {
  id: string;
  name: string;
  kind: string;
  startLine: number;
  endLine: number;
  signature: string | null;
  visibility: string | null;
  file: { path: string };
  outgoingReferences: Array<{
    id: string;
    kind: "REFERENCE" | "CALL";
    targetSymbol: {
      id: string;
      name: string;
      kind: string;
      startLine: number;
      endLine: number;
      signature: string | null;
      visibility: string | null;
      file: { path: string };
    };
  }>;
  incomingReferences: Array<{
    id: string;
    kind: "REFERENCE" | "CALL";
    sourceSymbol: {
      id: string;
      name: string;
      kind: string;
      startLine: number;
      endLine: number;
      signature: string | null;
      visibility: string | null;
      file: { path: string };
    };
  }>;
}) {
  const outgoingReferences = symbol.outgoingReferences
    .filter((reference) => reference.kind === "REFERENCE")
    .map((reference) => serializeRelatedSymbol(reference))
    .filter(Boolean);
  const outgoingCalls = symbol.outgoingReferences
    .filter((reference) => reference.kind === "CALL")
    .map((reference) => serializeRelatedSymbol(reference))
    .filter(Boolean);
  const incomingReferences = symbol.incomingReferences
    .map((reference) => serializeRelatedSymbol(reference))
    .filter(Boolean);

  return {
    id: symbol.id,
    name: symbol.name,
    kind: symbol.kind,
    filePath: symbol.file.path,
    startLine: symbol.startLine,
    endLine: symbol.endLine,
    signature: symbol.signature,
    visibility: symbol.visibility,
    outgoingReferences,
    outgoingCalls,
    incomingReferences
  };
}

function buildSymbolSourceLines(
  source: string,
  startLine: number,
  endLine: number
) {
  return source.split("\n").map((content, index) => {
    const lineNumber = startLine + index;
    return {
      lineNumber,
      content,
      isSymbolLine: lineNumber >= startLine && lineNumber <= endLine
    };
  });
}

function buildSourceLines(source: string, startLine: number) {
  return source.split("\n").map((content, index) => ({
    lineNumber: startLine + index,
    content
  }));
}

function buildMergedSourceLines(
  chunks: Array<{ startLine: number; content: string }>
) {
  const linesByNumber = new Map<
    number,
    { lineNumber: number; content: string }
  >();

  for (const chunk of chunks) {
    for (const line of buildSourceLines(chunk.content, chunk.startLine)) {
      if (!linesByNumber.has(line.lineNumber)) {
        linesByNumber.set(line.lineNumber, line);
      }
    }
  }

  return [...linesByNumber.values()].sort(
    (left, right) => left.lineNumber - right.lineNumber
  );
}

function buildDocsLanguageSummary(
  files: Array<{ language: string | null; sizeBytes: number }>
) {
  const totals = new Map<string, { files: number; sizeBytes: number }>();

  files.forEach((file) => {
    const language = file.language ?? "Other";
    const current = totals.get(language) ?? { files: 0, sizeBytes: 0 };
    totals.set(language, {
      files: current.files + 1,
      sizeBytes: current.sizeBytes + file.sizeBytes
    });
  });

  return [...totals.entries()]
    .map(([language, summary]) => ({ language, ...summary }))
    .sort((left, right) => {
      if (left.language === "Other") return 1;
      if (right.language === "Other") return -1;
      return (
        right.files - left.files || left.language.localeCompare(right.language)
      );
    });
}

function buildDocsImportantPaths(files: Array<{ path: string }>) {
  const priorityPatterns = [
    /^README(\.|$)/i,
    /^package\.json$/i,
    /^src\/index\./i,
    /^tsconfig\.json$/i,
    /^apps\//i,
    /^packages\//i,
    /^src\//i,
    /^docs\//i,
    /config\./i
  ];

  return files
    .filter((file) => priorityPatterns.some((pattern) => pattern.test(file.path)))
    .sort((left, right) => {
      const leftTest = TEST_FILE_PATTERN.test(left.path);
      const rightTest = TEST_FILE_PATTERN.test(right.path);
      if (leftTest !== rightTest) return leftTest ? 1 : -1;

      const leftIndex = priorityPatterns.findIndex((pattern) =>
        pattern.test(left.path)
      );
      const rightIndex = priorityPatterns.findIndex((pattern) =>
        pattern.test(right.path)
      );
      return leftIndex - rightIndex || left.path.localeCompare(right.path);
    })
    .slice(0, 6);
}

function getDocsSymbolConnectionCount(symbol: {
  outgoingReferences: Array<{ kind: "REFERENCE" | "CALL" }>;
  incomingReferences: Array<{ kind: "REFERENCE" | "CALL" }>;
}) {
  return symbol.outgoingReferences.length + symbol.incomingReferences.length;
}

function serializeDocsSymbol(symbol: {
  id: string;
  name: string;
  kind: string;
  startLine: number;
  endLine: number;
  signature: string | null;
  visibility: string | null;
  file: { path: string };
  outgoingReferences: Array<{ kind: "REFERENCE" | "CALL" }>;
  incomingReferences: Array<{ kind: "REFERENCE" | "CALL" }>;
}) {
  const outgoingCalls = symbol.outgoingReferences.filter(
    (reference) => reference.kind === "CALL"
  ).length;
  const outgoingReferences = symbol.outgoingReferences.filter(
    (reference) => reference.kind === "REFERENCE"
  ).length;
  const incomingReferences = symbol.incomingReferences.length;

  return {
    id: symbol.id,
    name: symbol.name,
    kind: symbol.kind,
    filePath: symbol.file.path,
    startLine: symbol.startLine,
    endLine: symbol.endLine,
    signature: symbol.signature,
    visibility: symbol.visibility,
    connectionCount: outgoingCalls + outgoingReferences + incomingReferences,
    outgoingCalls,
    outgoingReferences,
    incomingReferences
  };
}

export function normalizeSignalText(value: string): string {
  return value
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/<img\b[^>]*\balt=["']([^"']+)["'][^>]*>/gi, " $1 ")
    .replace(/<img\b[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, " ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/[`*_>#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanGuideSummaryText(value: string): string {
  return normalizeSignalText(value)
    .replace(/\b(ultimate|powerhouse|awesome|amazing|beautiful|modern)\b/gi, "")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function getCleanReadmeLines(content: string): string[] {
  return content
    .split("\n")
    .map(normalizeSignalText)
    .filter((line) => {
      if (!line) return false;
      if (/^install|usage|setup|scripts$/i.test(line)) return false;
      if (/^(build|status|coverage|npm|license|version)$/i.test(line)) return false;
      if (/^https?:\/\//i.test(line)) return false;
      return true;
    });
}

function humanizeIdentifier(value: string): string {
  return value
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim();
}

function getArticle(value: string): "a" | "an" {
  return /^[aeiou]/i.test(value.trim()) ? "an" : "a";
}

function splitPathParts(path: string): string[] {
  return path
    .split("/")
    .map((part) => part.replace(/\.[^.]+$/, "").toLowerCase())
    .filter(Boolean);
}

function getSignalPaths(files: Array<{ path: string }>) {
  return files
    .map((file) => file.path)
    .filter((path) =>
      SOURCE_SIGNAL_PATTERNS.some((pattern) => pattern.test(path))
    )
    .slice(0, 40);
}

function getSnippetForPath(snippets: SignalSnippet[], path: string): string {
  return snippets
    .filter((snippet) => snippet.path.toLowerCase() === path.toLowerCase())
    .map((snippet) => snippet.content)
    .join("\n")
    .slice(0, 5000);
}

export function getReadmePurpose(snippets: SignalSnippet[]): string | null {
  const readme = snippets.find((snippet) => /^README(\.|$)/i.test(snippet.path));
  if (!readme) return null;

  const lines = getCleanReadmeLines(readme.content);
  const heading = lines.find((line) => line.length > 3 && line.length < 90);
  const paragraph = lines.find((line) => line.length >= 40 && line.length < 260);
  const text = paragraph ?? heading;

  return text ? text.replace(/^#+\s*/, "") : null;
}

function parsePackageSignals(packageContent: string) {
  if (!packageContent) {
    return {
      name: null as string | null,
      description: null as string | null,
      dependencies: [] as string[]
    };
  }

  try {
    const parsed = JSON.parse(packageContent) as {
      name?: string;
      description?: string;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return {
      name: parsed.name ?? null,
      description: parsed.description ?? null,
      dependencies: [
        ...Object.keys(parsed.dependencies ?? {}),
        ...Object.keys(parsed.devDependencies ?? {})
      ]
    };
  } catch {
    return {
      name: null,
      description: null,
      dependencies: []
    };
  }
}

function hasSignal(values: string[], pattern: RegExp): boolean {
  return values.some((value) => pattern.test(value));
}

function buildEvidenceText(
  context: UnderstandingContext,
  snippets: SignalSnippet[],
  dependencies: string[] = []
) {
  return {
    repo: context.repository.name.toLowerCase(),
    readme: snippets
      .filter((snippet) => /^README(\.|$)/i.test(snippet.path))
      .flatMap((snippet) => getCleanReadmeLines(snippet.content))
      .join(" ")
      .toLowerCase(),
    packageText: dependencies.join(" ").toLowerCase(),
    paths: context.files.map((file) => file.path.toLowerCase()).join(" "),
    symbols: context.symbols.map((symbol) => symbol.name.toLowerCase()).join(" ")
  };
}

function hasCmsSignals(evidence: ReturnType<typeof buildEvidenceText>) {
  const productText = `${evidence.repo} ${evidence.readme} ${evidence.packageText}`;
  const structuralText = evidence.paths;
  return (
    /(^|[\s_-])(cms|content management|keystone)([\s_-]|$)/i.test(productText) ||
    /superpowered cms|admin ui|schema.*content|content.*schema/i.test(productText) ||
    /(^|\/)packages\/core(\/|$)|(^|\/)packages\/fields(\/|$)|(^|\/)packages\/auth(\/|$)/i.test(
      structuralText
    )
  );
}

function hasUrlShortenerSignals(evidence: ReturnType<typeof buildEvidenceText>) {
  const productText = `${evidence.repo} ${evidence.readme} ${evidence.packageText}`;
  const implementationText = `${evidence.paths} ${evidence.symbols}`;
  return (
    /url[-_\s]?short|short[-_\s]?url|shortener|shortlink|short[-_\s]?link/i.test(
      productText
    ) ||
    (/slug/i.test(productText) &&
      /redirect|short|url/i.test(productText)) ||
    /(^|\/)(routes?|controllers?|services?)\/[^ ]*(short|slug|redirect)[^ ]*/i.test(
      implementationText
    )
  );
}

function inferFrameworkLabel(context: UnderstandingContext, dependencies: string[]) {
  const signals = [...context.repository.detectedFrameworks, ...dependencies];
  const repoAndFiles = [
    context.repository.name,
    ...context.files.map((file) => file.path)
  ].join(" ");

  if (/keystone|packages\/core|packages\/fields/i.test(repoAndFiles)) {
    return "TypeScript framework monorepo";
  }
  if (hasSignal(signals, /express/i)) return "Express.js backend";
  if (hasSignal(signals, /nest/i)) return "NestJS backend";
  if (hasSignal(signals, /fastify/i)) return "Fastify backend";
  if (hasSignal(signals, /hono/i)) return "Hono backend";
  if (hasSignal(signals, /next/i)) return "Next.js application";
  if (hasSignal(signals, /react/i)) return "React frontend";
  if (hasSignal(signals, /vue/i)) return "Vue frontend";
  if (hasSignal(signals, /django/i)) return "Django backend";
  if (hasSignal(signals, /fastapi/i)) return "FastAPI backend";
  return context.primaryLanguage?.language
    ? `${context.primaryLanguage.language} project`
    : "software project";
}

function inferDatabaseLabel(context: UnderstandingContext, dependencies: string[]) {
  const source = [
    ...dependencies,
    ...context.files.map((file) => file.path),
    ...context.repository.detectedFrameworks
  ].join(" ");

  if (/drizzle/i.test(source)) return "Drizzle";
  if (/prisma/i.test(source)) return "Prisma";
  if (/mongoose|mongo/i.test(source)) return "MongoDB";
  if (/postgres|pg\b/i.test(source)) return "Postgres";
  if (/mysql|mariadb/i.test(source)) return "MySQL";
  if (/sqlite/i.test(source)) return "SQLite";
  return null;
}

export function inferDomain(context: UnderstandingContext, snippets: SignalSnippet[]) {
  const evidence = buildEvidenceText(context, snippets);
  const productText = `${evidence.repo} ${evidence.readme}`;
  const fullText = `${productText} ${evidence.paths} ${evidence.symbols}`;

  if (hasCmsSignals(evidence)) {
    return "CMS and application framework";
  }
  if (/portfolio|personal.?site|personal.?website|resume|cv|showcase/.test(productText)) {
    return "Personal portfolio and showcase content";
  }
  if (hasUrlShortenerSignals(evidence)) {
    return "URL shortening and link management";
  }
  if (/auth|login|session|user|account/.test(fullText)) {
    return "User access and account workflows";
  }
  if (/invoice|billing|payment|checkout|stripe/.test(fullText)) {
    return "Payments and billing";
  }
  if (/task|ticket|issue|workflow|kanban/.test(fullText)) {
    return "Project and workflow management";
  }
  if (/chat|message|conversation/.test(fullText)) {
    return "Messaging and collaboration";
  }
  if (/api|route|controller|service/.test(fullText)) {
    return "Backend API services";
  }
  return "Application logic and developer-facing workflows";
}

export function inferCoreFeatures(
  context: UnderstandingContext,
  dependencies: string[],
  snippets: SignalSnippet[] = []
) {
  const evidence = buildEvidenceText(context, snippets, dependencies);
  const productText = `${evidence.repo} ${evidence.readme} ${evidence.packageText}`;
  const source = `${productText} ${evidence.paths} ${evidence.symbols}`;
  const features = new Set<string>();

  if (hasCmsSignals(evidence)) {
    features.add("Content management");
    features.add("Schema-driven application development");
    features.add("Admin UI workflows");
  }
  if (/auth|login|session|token|jwt|passport|oauth/i.test(source) && !hasCmsSignals(evidence)) {
    features.add("User authentication");
  }
  if (hasUrlShortenerSignals(evidence)) {
    features.add("Short URL creation and redirect handling");
  }
  if (/route|router|controller|handler/i.test(source)) {
    features.add("HTTP API routing and request handling");
  }
  if (/service|usecase|business/i.test(source)) {
    features.add("Service-layer business logic");
  }
  if (/model|schema|drizzle|prisma|database|repository|db/i.test(source)) {
    features.add("Database persistence");
  }
  if (/validator|validation|zod|joi|yup/i.test(source)) {
    features.add("Request validation");
  }
  if (/middleware|guard|cors|helmet|rate.?limit/i.test(source)) {
    features.add("Middleware-based request protection");
  }
  if (/test|spec|jest|vitest|mocha/i.test(source)) {
    features.add("Automated tests or behavior checks");
  }

  return [...features].slice(0, 8);
}

function inferMainModules(context: UnderstandingContext) {
  const modules = new Map<string, string>();
  const paths = context.files.map((file) => file.path.toLowerCase());

  function add(name: string, purpose: string) {
    if (!modules.has(name)) modules.set(name, purpose);
  }

  if (paths.some((path) => /routes?/.test(path))) {
    add("routes", "API route definitions and URL-to-handler mapping.");
  }
  if (paths.some((path) => /controllers?/.test(path))) {
    add("controllers", "Request handling and response orchestration.");
  }
  if (paths.some((path) => /services?/.test(path))) {
    add("services", "Business logic and application workflows.");
  }
  if (paths.some((path) => /middlewares?/.test(path))) {
    add("middlewares", "Authentication, validation, and request processing.");
  }
  if (paths.some((path) => /models?|schema|drizzle|prisma|data|database|db/.test(path))) {
    add("database", "Persistence, schema, and data access layer.");
  }
  if (paths.some((path) => /validators?|validation/.test(path))) {
    add("validators", "Input validation and request shape checks.");
  }
  if (paths.some((path) => /config|env/.test(path))) {
    add("configuration", "Runtime configuration and environment setup.");
  }
  if (paths.some((path) => /utils?|helpers?|lib/.test(path))) {
    add("utilities", "Shared helpers used across modules.");
  }

  if (!modules.size) {
    const topFolders = [...new Set(context.files.flatMap((file) => splitPathParts(file.path).slice(0, 2)))]
      .slice(0, 5);
    topFolders.forEach((folder) =>
      add(folder, `${humanizeIdentifier(folder)} implementation area.`)
    );
  }

  return [...modules.entries()].map(([name, purpose]) => ({ name, purpose }));
}

function inferArchitecture(context: UnderstandingContext, modules: Array<{ name: string }>) {
  const moduleNames = modules.map((module) => module.name);
  const hasLayeredBackend =
    moduleNames.includes("routes") &&
    (moduleNames.includes("controllers") || moduleNames.includes("services"));
  const hasDatabase = moduleNames.includes("database");

  if (hasLayeredBackend) {
    return `The project appears to follow a layered backend structure: Routes -> ${
      moduleNames.includes("controllers") ? "Controllers -> " : ""
    }Services${hasDatabase ? " -> Database/Models" : ""}.`;
  }

  if (context.repository.detectedFrameworks.some((framework) => /next|react|vue/i.test(framework))) {
    return "The project appears to follow a frontend application structure with pages/components backed by shared utilities and configuration.";
  }

  return "The project appears to be organized around entry files, implementation modules, configuration, and supporting utilities.";
}

export function buildReadingOrder(context: UnderstandingContext) {
  const candidates = context.files.map((file) => file.path);
  const orderedPatterns: Array<[RegExp, string]> = [
    [/^README(\.|$)/i, "Understand the product purpose and setup notes."],
    [/^package\.json$/i, "Review scripts, dependencies, and runtime shape."],
    [/^packages\/core\/package\.json$/i, "Understand the core package and public package metadata."],
    [/^packages\/core\/src\/index\.[cm]?[jt]sx?$/i, "Inspect the core package entry point."],
    [/^packages\/core\//i, "Trace the core package implementation."],
    [/^docs\/(README|index|overview|getting-started|docs-navigation)\.mdx?$/i, "Read the documentation overview and navigation path."],
    [/^docs\//i, "Use project docs to confirm product concepts and usage."],
    [/(^|\/)(app|server|main|index)\.[cm]?[jt]sx?$/i, "Find the application entry point."],
    [/(^|\/)routes?\//i, "Trace API surfaces and request flow."],
    [/(^|\/)controllers?\//i, "See how requests are handled."],
    [/(^|\/)services?\//i, "Inspect business logic and orchestration."],
    [/(^|\/)(models?|schema|drizzle|prisma|data|database|db)\//i, "Understand persistence and data shape."]
  ];
  const used = new Set<string>();

  return orderedPatterns
    .map(([pattern, reason]) => {
      const file = candidates.find((path) => pattern.test(path) && !used.has(path));
      if (!file) return null;
      used.add(file);
      return { file, reason };
    })
    .filter((item): item is { file: string; reason: string } => Boolean(item))
    .slice(0, 8);
}

export function buildRepositoryUnderstanding(
  context: UnderstandingContext,
  snippets: SignalSnippet[]
): RepositoryUnderstanding {
  const packageSignals = parsePackageSignals(
    getSnippetForPath(snippets, "package.json")
  );
  const framework = inferFrameworkLabel(context, packageSignals.dependencies);
  const database = inferDatabaseLabel(context, packageSignals.dependencies);
  const domain = inferDomain(context, snippets);
  const features = inferCoreFeatures(context, packageSignals.dependencies, snippets);
  const modules = inferMainModules(context);
  const architecture = inferArchitecture(context, modules);
  const readingOrder = buildReadingOrder(context);
  const projectName =
    packageSignals.name?.replace(/^@[^/]+\//, "") ?? context.repository.name;
  const displayName = humanizeIdentifier(projectName);
  const readmePurpose = getReadmePurpose(snippets);
  const packagePurpose = packageSignals.description
    ? normalizeSignalText(packageSignals.description)
    : null;
  const fallbackPurpose = `${displayName} is ${getArticle(
    framework
  )} ${framework} for ${domain.toLowerCase()}.`;
  const purpose =
    readmePurpose ??
    packagePurpose ??
    fallbackPurpose;
  const featureSentence = features.length
    ? ` It includes ${features
        .map((feature) => feature.toLowerCase())
        .join(", ")}.`
    : "";
  const databaseSentence = database
    ? ` It stores project data through the ${database} layer.`
    : "";
  const summary =
    purpose === fallbackPurpose
      ? `${purpose}${featureSentence}${databaseSentence} ${architecture}`
      : `${displayName} appears to be ${getArticle(
          framework
        )} ${framework} for ${domain.toLowerCase()}. ${purpose}${featureSentence}${databaseSentence} ${architecture}`;

  return {
    purpose: cleanGuideSummaryText(purpose),
    domain,
    coreFeatures: features,
    architecture,
    mainModules: modules,
    readingOrder,
    summary: cleanGuideSummaryText(summary)
  };
}

function buildGuideEnhancementContext(
  context: Awaited<ReturnType<typeof loadDocsContext>>
): AssistantContext {
  const readingOrder = context.understanding.readingOrder.map((item) => ({
    path: item.file,
    label: item.file,
    reason: item.reason
  }));
  const importantPathCitations = context.importantPaths.slice(0, 8).map((file) => ({
    path: file.path,
    label: file.path,
    reason: describePathResponsibility(file.path)
  }));
  const sourceSnippets: AssistantSourceSnippet[] = context.signalSnippets
    .filter((snippet) => /^README(\.|$)|^package\.json$|^docs\//i.test(snippet.path))
    .slice(0, 6)
    .map((snippet) => ({
      path: snippet.path,
      content: normalizeSignalText(snippet.content).slice(0, 1800)
    }));

  return {
    repository: {
      owner: context.repository.owner,
      name: context.repository.name,
      url: context.repository.url,
      languages: context.repository.detectedLanguages,
      frameworks: context.repository.detectedFrameworks,
      fileCount: context.repository.fileCount
    },
    guide: {
      summary: context.understanding.summary,
      purpose: context.understanding.purpose,
      architecture: context.understanding.architecture,
      readingOrder: [...readingOrder, ...importantPathCitations]
    },
    sourceSnippets,
    localAnswer: context.understanding.summary
  };
}

function buildVerifiedGuideCitations(understanding: RepositoryUnderstanding): AssistantCitation[] {
  return understanding.readingOrder.slice(0, 5).map((item) => ({
    path: item.file,
    label: item.file,
    reason: item.reason
  }));
}

function stripWeakCitationNotice(value: string): string {
  return value
    .replace(
      /\s*I could not verify the exact source references returned with this answer, so the citations below are the closest verified repository anchors\.\s*$/i,
      ""
    )
    .trim();
}

function hasUsableGuideSummary(value: string, understanding: RepositoryUnderstanding) {
  const cleaned = cleanGuideSummaryText(stripWeakCitationNotice(value));
  if (cleaned.length < 50) return false;
  if (/invented|no usable files/i.test(cleaned)) return false;
  if (!understanding.readingOrder.length) return false;
  return true;
}

export function buildGuideEnhanceResponse({
  repositoryId,
  understanding,
  answer
}: {
  repositoryId: string;
  understanding: RepositoryUnderstanding;
  answer: Awaited<ReturnType<typeof createAssistantAnswer>>;
}): GuideEnhanceResponse {
  const knownGuidePaths = new Set(understanding.readingOrder.map((item) => item.file));
  const safeAnswerCitations = answer.citations.filter((citation) =>
    knownGuidePaths.has(citation.path)
  );
  const hasVerifiedAnswerCitations = safeAnswerCitations.length > 0;
  const canUseProviderSummary =
    answer.mode === "provider" &&
    hasVerifiedAnswerCitations &&
    hasUsableGuideSummary(answer.answer, understanding);
  const canRepairProviderSummary =
    (answer.mode === "provider" || answer.fallbackReason === "weak_citations") &&
    hasUsableGuideSummary(answer.answer, understanding);
  const repairedCitations = buildVerifiedGuideCitations(understanding);
  const useEnhancedSummary = canUseProviderSummary || canRepairProviderSummary;
  const summary = useEnhancedSummary
    ? cleanGuideSummaryText(stripWeakCitationNotice(answer.answer))
    : understanding.summary;

  return {
    repositoryId,
    summary,
    purpose: understanding.purpose,
    domain: understanding.domain,
    coreFeatures: understanding.coreFeatures,
    architecture: understanding.architecture,
    readingOrder: understanding.readingOrder,
    citations: canUseProviderSummary
      ? safeAnswerCitations
      : canRepairProviderSummary
        ? safeAnswerCitations.length
          ? safeAnswerCitations
          : repairedCitations
        : safeAnswerCitations,
    mode: useEnhancedSummary ? "provider" : "fallback",
    fallbackReason: useEnhancedSummary
      ? undefined
      : answer.fallbackReason ?? "weak_citations"
  };
}

async function loadDocsContext(id: string) {
  const repository = await db.repository.findUnique({
    where: { id },
    select: {
      id: true,
      owner: true,
      name: true,
      url: true,
      detectedLanguages: true,
      detectedFrameworks: true,
      fileCount: true,
      totalSizeBytes: true,
      analysisStatus: true,
      cloneStatus: true
    }
  });

  if (!repository) {
    throw new NotFoundException("Repository not found");
  }

  const [files, symbols] = await Promise.all([
    db.repositoryFile.findMany({
      where: { repositoryId: id },
      orderBy: { path: "asc" },
      select: {
        id: true,
        path: true,
        language: true,
        sizeBytes: true,
        isGenerated: true,
        isTest: true
      }
    }),
    db.symbol.findMany({
      where: { repositoryId: id },
      orderBy: [{ file: { path: "asc" } }, { startLine: "asc" }, { name: "asc" }],
      include: {
        file: {
          select: {
            path: true
          }
        },
        outgoingReferences: {
          select: {
            kind: true
          }
        },
        incomingReferences: {
          select: {
            kind: true
          }
        }
      }
    })
  ]);

  const topLanguages = buildDocsLanguageSummary(files);
  const importantPaths = buildDocsImportantPaths(files).map((file) => ({
    path: file.path
  }));
  const testFileCount = files.filter(
    (file) => file.isTest || TEST_FILE_PATTERN.test(file.path)
  ).length;
  const generatedFileCount = files.filter((file) => file.isGenerated).length;
  const exportedSymbols = symbols
    .filter((symbol) => symbol.visibility === "exported")
    .map(serializeDocsSymbol);
  const connectedSymbols = symbols
    .filter((symbol) => getDocsSymbolConnectionCount(symbol) > 0)
    .sort(
      (left, right) =>
        getDocsSymbolConnectionCount(right) -
          getDocsSymbolConnectionCount(left) ||
        left.name.localeCompare(right.name)
    )
    .slice(0, 8)
    .map(serializeDocsSymbol);
  const primaryLanguage =
    topLanguages.find((language) => language.language !== "Other") ??
    topLanguages[0];
  const frameworkSummary = repository.detectedFrameworks.length
    ? repository.detectedFrameworks.join(", ")
    : "No framework signal has been confirmed yet.";
  const overviewText = `${repository.owner}/${repository.name} is analyzed as a ${
    primaryLanguage?.language ?? "code"
  } repository with ${repository.fileCount} files and ${
    symbols.length
  } code details. ${frameworkSummary}`;
  const signalPaths = getSignalPaths(files);
  const signalChunks = signalPaths.length
    ? await db.knowledgeChunk.findMany({
        where: {
          repositoryId: id,
          chunkKind: "FILE",
          path: { in: signalPaths }
        },
        orderBy: [{ path: "asc" }, { startLine: "asc" }],
        select: {
          path: true,
          content: true
        },
        take: 80
      })
    : [];
  const understanding = buildRepositoryUnderstanding(
    {
      repository,
      files,
      symbols,
      primaryLanguage
    },
    signalChunks
  );

  return {
    repository,
    files,
    symbols,
    topLanguages,
    importantPaths,
    testFileCount,
    generatedFileCount,
    exportedSymbols,
    connectedSymbols,
    primaryLanguage,
    frameworkSummary,
    overviewText,
    signalSnippets: signalChunks,
    understanding
  };
}

function markdownList(values: string[], fallback: string) {
  return values.length
    ? values.map((value) => `- ${value}`).join("\n")
    : `- ${fallback}`;
}

function buildReadmeDraft(context: Awaited<ReturnType<typeof loadDocsContext>>) {
  const {
    repository,
    topLanguages,
    importantPaths,
    testFileCount,
    generatedFileCount,
    exportedSymbols,
    connectedSymbols,
    overviewText
  } = context;
  const title = `${repository.owner}/${repository.name}`;
  const languageLines = topLanguages
    .slice(0, 5)
    .map((item) => `${item.language}: ${item.files} file${item.files === 1 ? "" : "s"}`);
  const importantPathLines = importantPaths
    .slice(0, 6)
    .map((file) => `${file.path}`);
  const exportedSymbolLines = exportedSymbols
    .slice(0, 8)
    .map(
      (symbol) =>
        `\`${symbol.name}\` (${symbol.kind}) in \`${symbol.filePath}\` lines ${symbol.startLine}-${symbol.endLine}`
    );
  const connectedSymbolLines = connectedSymbols
    .slice(0, 5)
    .map(
      (symbol) =>
        `\`${symbol.name}\` has ${symbol.connectionCount} relationship${
          symbol.connectionCount === 1 ? "" : "s"
        }`
    );

  const markdown = [
    `# ${title}`,
    "",
    "## Overview",
    "",
    overviewText,
    "",
    "## Repository facts",
    "",
    `- Repository: ${repository.url}`,
    `- Analysis status: ${repository.analysisStatus}`,
    `- Files analyzed: ${repository.fileCount}`,
    `- Code details: ${context.symbols.length}`,
    `- Primary language: ${context.primaryLanguage?.language ?? "Pending"}`,
    `- Frameworks: ${
      repository.detectedFrameworks.length
        ? repository.detectedFrameworks.join(", ")
        : "No framework signal detected"
    }`,
    "",
    "## Architecture and important paths",
    "",
    "### Top languages",
    "",
    markdownList(languageLines, "Language signals will appear after analysis."),
    "",
    "### Important paths",
    "",
    markdownList(
      importantPathLines.map((path) => `\`${path}\``),
      "Important paths will appear after file analysis."
    ),
    "",
    "## Public API and symbols",
    "",
    "### Exported symbols",
    "",
    markdownList(
      exportedSymbolLines,
      "No exported symbols were identified in the current analysis."
    ),
    "",
    "### Highly connected symbols",
    "",
    markdownList(
      connectedSymbolLines,
      "No symbol relationships were identified in the current analysis."
    ),
    "",
    "## Testing signals",
    "",
    testFileCount
      ? `${testFileCount} test file${
          testFileCount === 1 ? "" : "s"
        } were detected. Use these tests to guide examples, expected behavior, and edge-case documentation.`
      : "No test files were detected from the analyzed repository paths.",
    "",
    `Generated files detected: ${generatedFileCount}.`,
    "",
    "## Next documentation steps",
    "",
    "- Expand the overview with project-specific installation and usage details.",
    "- Add examples for the exported symbols that users are most likely to call.",
    "- Document important paths and module responsibilities in more detail.",
    "- Connect test cases to behavior notes and edge cases.",
    "",
    "<!-- Generated by DevLens AI repository documentation draft. -->"
  ].join("\n");

  return {
    title,
    markdown
  };
}

function describePathResponsibility(path: string) {
  const lowerPath = path.toLowerCase();
  if (lowerPath.includes("controller")) return "HTTP routing or request handling";
  if (lowerPath.includes("service")) return "business logic or orchestration";
  if (lowerPath.includes("worker")) return "background job processing";
  if (lowerPath.includes("schema") || lowerPath.includes("prisma")) return "data model or persistence contract";
  if (lowerPath.includes("test") || lowerPath.includes("spec")) return "behavior verification";
  if (lowerPath.includes("config") || lowerPath.includes("tsconfig")) return "project configuration";
  if (lowerPath.includes("package.json")) return "package metadata and script/dependency definition";
  if (lowerPath.includes("readme") || lowerPath.startsWith("docs/")) return "documentation surface";
  if (lowerPath.startsWith("apps/")) return "application boundary";
  if (lowerPath.startsWith("packages/")) return "shared package boundary";
  if (lowerPath.startsWith("src/")) return "core source module";
  return "repository component";
}

function buildModuleResponsibilityLines(files: Array<{ path: string }>) {
  const responsibilities = new Map<string, Set<string>>();

  for (const file of files) {
    const [root, second] = file.path.split("/");
    const key = second && (root === "apps" || root === "packages")
      ? `${root}/${second}`
      : root;
    if (!key) continue;

    const current = responsibilities.get(key) ?? new Set<string>();
    current.add(describePathResponsibility(file.path));
    responsibilities.set(key, current);
  }

  return [...responsibilities.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(0, 8)
    .map(([modulePath, descriptions]) => {
      const description = [...descriptions].slice(0, 3).join(", ");
      return `\`${modulePath}\` appears to cover ${description}.`;
    });
}

function buildArchitectureRiskLines(context: Awaited<ReturnType<typeof loadDocsContext>>) {
  const risks: string[] = [];

  if (!context.importantPaths.length) {
    risks.push("No conventionally important paths were detected, so architecture entry points may need manual annotation.");
  }
  if (!context.exportedSymbols.length) {
    risks.push("No exported symbols were identified, which limits public API documentation.");
  }
  if (!context.connectedSymbols.length) {
    risks.push("No symbol relationships were found, so dependency flow is currently sparse.");
  }
  if (!context.testFileCount) {
    risks.push("No test files were detected from analyzed paths, leaving behavior and edge-case documentation without test anchors.");
  }
  if (context.generatedFileCount) {
    risks.push(`${context.generatedFileCount} generated file${context.generatedFileCount === 1 ? "" : "s"} were detected and should be separated from hand-authored architecture notes.`);
  }
  if (!context.repository.detectedFrameworks.length) {
    risks.push("No framework signal was confirmed, so framework-level architecture assumptions should stay explicit.");
  }

  return risks;
}

function buildArchitectureNotes(context: Awaited<ReturnType<typeof loadDocsContext>>) {
  const {
    repository,
    files,
    topLanguages,
    importantPaths,
    testFileCount,
    generatedFileCount,
    exportedSymbols,
    connectedSymbols,
    overviewText
  } = context;
  const title = `${repository.owner}/${repository.name} architecture notes`;
  const languageLines = topLanguages
    .slice(0, 5)
    .map((item) => `${item.language}: ${item.files} file${item.files === 1 ? "" : "s"}`);
  const importantPathLines = importantPaths
    .slice(0, 8)
    .map((file) => `\`${file.path}\` - ${describePathResponsibility(file.path)}`);
  const responsibilityLines = buildModuleResponsibilityLines(files);
  const connectedSymbolLines = connectedSymbols
    .slice(0, 8)
    .map(
      (symbol) =>
        `\`${symbol.name}\` (${symbol.kind}) in \`${symbol.filePath}\` has ${symbol.connectionCount} relationship${
          symbol.connectionCount === 1 ? "" : "s"
        }.`
    );
  const exportedSymbolLines = exportedSymbols
    .slice(0, 8)
    .map((symbol) => `\`${symbol.name}\` (${symbol.kind}) in \`${symbol.filePath}\`.`);
  const riskLines = buildArchitectureRiskLines(context);

  const markdown = [
    `# ${title}`,
    "",
    "## Repository overview",
    "",
    overviewText,
    "",
    "## Language and stack signals",
    "",
    markdownList(languageLines, "Language signals will appear after analysis."),
    "",
    `Framework signal: ${
      repository.detectedFrameworks.length
        ? repository.detectedFrameworks.join(", ")
        : "No framework signal detected"
    }.`,
    "",
    "## Important paths",
    "",
    markdownList(importantPathLines, "Important paths will appear after file analysis."),
    "",
    "## Module responsibility guesses",
    "",
    markdownList(
      responsibilityLines,
      "Module responsibilities need manual annotation once more paths are analyzed."
    ),
    "",
    "## Symbol architecture signals",
    "",
    "### Most connected symbols",
    "",
    markdownList(
      connectedSymbolLines,
      "No connected symbols were identified in the current analysis."
    ),
    "",
    "### Exported symbols",
    "",
    markdownList(
      exportedSymbolLines,
      "No exported symbols were identified in the current analysis."
    ),
    "",
    "## Test and generated file signals",
    "",
    `- Test files detected: ${testFileCount}`,
    `- Generated files detected: ${generatedFileCount}`,
    "",
    "## Architecture risks and gaps",
    "",
    markdownList(
      riskLines,
      "No architecture gaps were detected from the current repository signals."
    ),
    "",
    "## Next architecture documentation steps",
    "",
    "- Confirm the actual responsibility of each important path with maintainers or source comments.",
    "- Add a high-level module map for entry points, shared packages, workers, and persistence boundaries.",
    "- Link highly connected symbols to their callers, owners, and expected runtime behavior.",
    "- Separate generated files, test fixtures, and hand-authored source in the architecture narrative.",
    "",
    "<!-- Generated by DevLens AI architecture notes. -->"
  ].join("\n");

  return {
    title,
    markdown
  };
}

const symbolReferenceInclude = {
  outgoingReferences: {
    orderBy: { kind: "asc" as const },
    include: {
      targetSymbol: {
        include: {
          file: {
            select: {
              path: true
            }
          }
        }
      }
    }
  },
  incomingReferences: {
    orderBy: { kind: "asc" as const },
    include: {
      sourceSymbol: {
        include: {
          file: {
            select: {
              path: true
            }
          }
        }
      }
    }
  }
};

@Controller("repositories")
export class RepositoriesController {
  @Post()
  async create(@Body() body: CreateRepositoryRequest) {
    const parsed = parseGitHubUrl(body.url);
    const workspaceId = await ensureWorkspace(body.workspaceId);

    const repo = await db.repository.create({
      data: {
        workspaceId,
        provider: "GITHUB",
        owner: parsed.owner,
        name: parsed.name,
        url: parsed.normalizedUrl,
        cloneStatus: "PENDING",
        analysisStatus: "PENDING"
      }
    });

    const job = await db.analysisJob.create({
      data: {
        repositoryId: repo.id,
        status: "QUEUED",
        currentStep: "queued",
        progress: 0
      }
    });

    const cloneQueue = new RedisQueue<CloneJobPayload>("repo.clone", REDIS_URL);
    try {
      await cloneQueue.enqueue({
        repositoryId: repo.id,
        jobId: job.id,
        url: repo.url
      });
    } catch (error) {
      await db.analysisJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          currentStep: "queue_unavailable",
          progress: 100,
          errorMessage: error instanceof Error ? error.message : "Unable to start repository analysis.",
          finishedAt: new Date()
        }
      });
      await db.repository.update({
        where: { id: repo.id },
        data: {
          cloneStatus: "FAILED",
          analysisStatus: "FAILED"
        }
      });
      throw new BadRequestException("Repository was created, but the analysis service is unavailable. Start Redis and retry.");
    } finally {
      await cloneQueue.close().catch(() => undefined);
    }

    return {
      repositoryId: repo.id,
      analysisJobId: job.id,
      status: "QUEUED",
      repository: {
        id: repo.id,
        owner: repo.owner,
        name: repo.name,
        url: repo.url,
        analysisStatus: repo.analysisStatus
      }
    };
  }

  @Get(":id")
  async findOne(@Param("id") id: string) {
    const repo = await db.repository.findUnique({
      where: { id },
      include: {
        jobs: {
          orderBy: { createdAt: "desc" },
          take: 1
        }
      }
    });
    if (!repo) {
      throw new NotFoundException("Repository not found");
    }
    return repo;
  }

  @Get(":id/overview")
  async overview(@Param("id") id: string) {
    const repo = await db.repository.findUnique({
      where: { id },
      include: {
        jobs: {
          orderBy: { createdAt: "desc" },
          take: 1
        }
      }
    });
    if (!repo) {
      throw new NotFoundException("Repository not found");
    }

    const languages = await db.repositoryFile.groupBy({
      by: ["language"],
      where: {
        repositoryId: id,
        language: { not: null }
      },
      _count: true,
      _sum: { sizeBytes: true }
    });

    return {
      id: repo.id,
      owner: repo.owner,
      name: repo.name,
      url: repo.url,
      analysisStatus: repo.analysisStatus,
      cloneStatus: repo.cloneStatus,
      detectedLanguages: repo.detectedLanguages,
      detectedFrameworks: repo.detectedFrameworks,
      fileCount: repo.fileCount,
      totalSizeBytes: repo.totalSizeBytes,
      latestJob: repo.jobs[0] ?? null,
      languages: languages.map((language) => ({
        name: language.language,
        files: language._count,
        sizeBytes: language._sum.sizeBytes ?? 0
      }))
    };
  }

  @Get(":id/tree")
  async tree(@Param("id") id: string) {
    const repo = await db.repository.findUnique({ where: { id } });
    if (!repo) {
      throw new NotFoundException("Repository not found");
    }

    const files = await db.repositoryFile.findMany({
      where: { repositoryId: id },
      orderBy: { path: "asc" }
    });

    const nodes: Array<{
      id: string;
      path: string;
      name: string;
      kind: "file" | "folder";
      language?: string;
      sizeBytes?: number;
    }> = [];
    const addedFolders = new Set<string>();

    for (const file of files) {
      const parts = file.path.split("/");
      let currentPath = "";

      for (let i = 0; i < parts.length - 1; i += 1) {
        const part = parts[i];
        if (!part) continue;
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        if (!addedFolders.has(currentPath)) {
          addedFolders.add(currentPath);
          nodes.push({
            id: currentPath,
            path: currentPath,
            name: part,
            kind: "folder"
          });
        }
      }

      nodes.push({
        id: file.path,
        path: file.path,
        name: parts[parts.length - 1] ?? file.path,
        kind: "file",
        language: file.language ?? undefined,
        sizeBytes: file.sizeBytes
      });
    }

    nodes.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
      return a.path.localeCompare(b.path);
    });

    return {
      repositoryId: id,
      fileCount: files.length,
      nodes
    };
  }

  @Get(":id/files/source")
  async fileSource(@Param("id") id: string, @Query("path") filePath?: string) {
    const path = filePath?.trim();
    if (!path) {
      throw new BadRequestException("File path is required.");
    }

    const file = await db.repositoryFile.findFirst({
      where: {
        repositoryId: id,
        path
      },
      select: {
        id: true,
        path: true,
        language: true,
        sizeBytes: true,
        isGenerated: true,
        isTest: true
      }
    });

    if (!file) {
      throw new NotFoundException("File not found");
    }

    const chunks = await db.knowledgeChunk.findMany({
      where: {
        repositoryId: id,
        path,
        chunkKind: "FILE"
      },
      orderBy: [{ startLine: "asc" }, { endLine: "asc" }],
      take: 4,
      select: {
        startLine: true,
        endLine: true,
        content: true
      }
    });

    const previewLines = buildMergedSourceLines(chunks);

    return {
      repositoryId: id,
      file: {
        id: file.id,
        path: file.path,
        language: file.language,
        sizeBytes: file.sizeBytes,
        isGenerated: file.isGenerated,
        isTest: file.isTest,
        sourceAvailable: chunks.length > 0,
        previewLines,
        previewStartLine: previewLines[0]?.lineNumber ?? null,
        previewEndLine: previewLines.at(-1)?.lineNumber ?? null
      }
    };
  }

  @Get(":id/docs/summary")
  async docsSummary(@Param("id") id: string) {
    const context = await loadDocsContext(id);
    const publicSymbolNames = context.exportedSymbols
      .slice(0, 5)
      .map((symbol) => symbol.name);
    const keyFileNames = context.importantPaths
      .slice(0, 4)
      .map((file) => file.path);

    return {
      repository: context.repository,
      overview: {
        text: context.understanding.summary,
        primaryLanguage: context.primaryLanguage?.language ?? null,
        frameworkSummary: context.frameworkSummary
      },
      understanding: context.understanding,
      architecture: {
        topLanguages: context.topLanguages,
        importantPaths: context.importantPaths,
        testFileCount: context.testFileCount,
        generatedFileCount: context.generatedFileCount
      },
      symbols: {
        exported: context.exportedSymbols.slice(0, 12),
        mostConnected: context.connectedSymbols,
        counts: {
          total: context.symbols.length,
          exported: context.exportedSymbols.length,
          connected: context.symbols.filter(
            (symbol) => getDocsSymbolConnectionCount(symbol) > 0
          ).length
        }
      },
      docsPreview: [
        {
          title: "Repository Overview",
          body: context.understanding.summary
        },
        {
          title: "Key Files",
          body: keyFileNames.length
            ? `Start with ${keyFileNames.join(", ")}. These paths look central based on repository conventions and analyzed structure.`
            : "Key files will appear once the repository tree is ready."
        },
        {
          title: "Public Symbols",
          body: publicSymbolNames.length
            ? `Public documentation should begin with ${publicSymbolNames.join(", ")}. These exported symbols are available for reference docs and examples.`
            : "No exported symbols have been identified yet."
        },
        {
          title: "Testing Signals",
          body: context.testFileCount
            ? `${context.testFileCount} test file${context.testFileCount === 1 ? "" : "s"} were detected. Test coverage signals can guide usage examples and behavior notes.`
            : "No test files were detected from the analyzed paths."
        }
      ],
      queuedSections: DOCS_QUEUED_SECTIONS
    };
  }

  @Get(":id/understanding")
  async understanding(@Param("id") id: string) {
    const context = await loadDocsContext(id);

    return context.understanding;
  }

  @Post(":id/guide/enhance")
  async enhanceGuide(@Param("id") id: string): Promise<GuideEnhanceResponse> {
    const requestId = `guide_${randomUUID()}`;
    const context = await loadDocsContext(id);
    const assistantContext = buildGuideEnhancementContext(context);
    console.info(`[DevLens] Guide enhancement started requestId=${requestId} repositoryId=${id}`);
    const answer = await createAssistantAnswer(
      [
        "Improve the Repository Guide summary for this repository.",
        "Return compact JSON with keys answer and citations.",
        "Use only the supplied repository facts and cited files.",
        "Citations must use exact path values copied from the allowed citations list.",
        "Write one concise engineering paragraph that names the real product or domain, main capabilities, architecture shape, main technologies, and what a new developer should inspect first.",
        "Avoid README marketing slogans, emojis, and hype wording.",
        "State uncertainty briefly if evidence is weak.",
        "Do not invent file paths."
      ].join(" "),
      assistantContext,
      { requestId }
    );
    const response = buildGuideEnhanceResponse({
      repositoryId: id,
      understanding: context.understanding,
      answer
    });

    console.info(
      [
        "[DevLens] Guide enhancement completed",
        `requestId=${requestId}`,
        `repositoryId=${id}`,
        `mode=${answer.providerMetadata?.mode ?? response.mode}`,
        answer.providerMetadata?.model ? `model=${answer.providerMetadata.model}` : "",
        `citationCount=${response.citations.length}`,
        response.fallbackReason ? `fallbackReason=${response.fallbackReason}` : ""
      ]
        .filter(Boolean)
        .join(" ")
    );

    return response;
  }

  @Post(":id/docs/readme-draft")
  async readmeDraft(@Param("id") id: string) {
    const context = await loadDocsContext(id);
    const draft = buildReadmeDraft(context);

    return {
      repositoryId: id,
      title: draft.title,
      markdown: draft.markdown,
      generatedAt: new Date().toISOString(),
      source: "file-backed"
    };
  }

  @Post(":id/docs/architecture-notes")
  async architectureNotes(@Param("id") id: string) {
    const context = await loadDocsContext(id);
    const draft = buildArchitectureNotes(context);

    return {
      repositoryId: id,
      title: draft.title,
      markdown: draft.markdown,
      generatedAt: new Date().toISOString(),
      source: "file-backed"
    };
  }

  @Get(":id/symbols")
  async symbols(@Param("id") id: string) {
    const repo = await db.repository.findUnique({
      where: { id },
      select: { id: true, owner: true, name: true }
    });
    if (!repo) {
      throw new NotFoundException("Repository not found");
    }

    const symbols = await db.symbol.findMany({
      where: { repositoryId: id },
      orderBy: [{ file: { path: "asc" } }, { startLine: "asc" }, { name: "asc" }],
      include: {
        file: {
          select: {
            path: true
          }
        },
        ...symbolReferenceInclude
      }
    });

    return {
      repository: repo,
      count: symbols.length,
      symbols: symbols.map(serializeSymbol)
    };
  }

  @Get(":id/symbols/:symbolId/references")
  async symbolReferences(
    @Param("id") id: string,
    @Param("symbolId") symbolId: string
  ) {
    const symbol = await db.symbol.findFirst({
      where: {
        id: symbolId,
        repositoryId: id
      },
      include: {
        file: {
          select: {
            path: true
          }
        },
        ...symbolReferenceInclude
      }
    });

    if (!symbol) {
      throw new NotFoundException("Symbol not found");
    }

    return {
      repositoryId: id,
      symbol: serializeSymbol(symbol)
    };
  }

  @Get(":id/symbols/:symbolId/source")
  async symbolSource(
    @Param("id") id: string,
    @Param("symbolId") symbolId: string
  ) {
    const symbol = await db.symbol.findFirst({
      where: {
        id: symbolId,
        repositoryId: id
      },
      include: {
        file: {
          select: {
            path: true,
            language: true
          }
        }
      }
    });

    if (!symbol) {
      throw new NotFoundException("Symbol not found");
    }

    const sourceChunk = await db.knowledgeChunk.findFirst({
      where: {
        repositoryId: id,
        symbolId,
        chunkKind: "SYMBOL"
      },
      select: {
        content: true
      }
    });

    const source = sourceChunk?.content
      .split("\n\nCode intelligence:\n")[0]
      ?.trimEnd();
    const fallbackSource = symbol.signature?.trim();
    const previewSource = source || fallbackSource || "";

    return {
      repositoryId: id,
      symbol: {
        id: symbol.id,
        name: symbol.name,
        kind: symbol.kind,
        filePath: symbol.file.path,
        startLine: symbol.startLine,
        endLine: symbol.endLine,
        language: symbol.file.language,
        sourceAvailable: Boolean(source),
        sourceLines: previewSource
          ? buildSymbolSourceLines(
              previewSource,
              symbol.startLine,
              source ? symbol.endLine : symbol.startLine
            )
          : []
      }
    };
  }
}
