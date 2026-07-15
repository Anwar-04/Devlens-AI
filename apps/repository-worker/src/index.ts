import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as ts from "typescript";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import { db } from "@devlens/database";
import {
  CloneJobPayload,
  QdrantPoint,
  RedisQueue,
  generateEmbedding,
  upsertKnowledgePoints,
} from "@devlens/shared";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const QDRANT_URL = process.env.QDRANT_URL ?? "http://localhost:6333";
const workerName = "repository-worker";
const MAX_FILES = Number(process.env.REPOSITORY_MAX_FILES ?? 5000);
const V1_MAX_ANALYZED_FILES = Number(
  process.env.REPOSITORY_V1_MAX_ANALYZED_FILES ?? 1200,
);
const V1_MAX_SYMBOLS = Number(process.env.REPOSITORY_V1_MAX_SYMBOLS ?? 3000);
const V1_MAX_SOURCE_RECORDS = Number(
  process.env.REPOSITORY_V1_MAX_SOURCE_RECORDS ?? 2500,
);
const V1_MAX_SYMBOLS_PER_FILE = Number(
  process.env.REPOSITORY_V1_MAX_SYMBOLS_PER_FILE ?? 80,
);
const MAX_FILE_SIZE_BYTES = Number(
  process.env.REPOSITORY_MAX_FILE_SIZE_BYTES ?? 1_000_000,
);
const MAX_CHUNK_FILE_SIZE_BYTES = Number(
  process.env.KNOWLEDGE_MAX_CHUNK_FILE_SIZE_BYTES ?? 250_000,
);
const CHUNK_LINE_COUNT = Number(process.env.KNOWLEDGE_CHUNK_LINE_COUNT ?? 120);
const CHUNK_LINE_OVERLAP = Number(
  process.env.KNOWLEDGE_CHUNK_LINE_OVERLAP ?? 20,
);
const DB_WRITE_BATCH_SIZE = Number(process.env.REPOSITORY_DB_WRITE_BATCH_SIZE ?? 500);
const DB_TRANSACTION_TIMEOUT_MS = Number(
  process.env.REPOSITORY_DB_TRANSACTION_TIMEOUT_MS ?? 60_000,
);
const DB_TRANSACTION_MAX_WAIT_MS = Number(
  process.env.REPOSITORY_DB_TRANSACTION_MAX_WAIT_MS ?? 10_000,
);

const IGNORED_FOLDERS = new Set([
  ".git",
  "node_modules",
  ".next",
  "dist",
  "build",
  "out",
  ".nuxt",
  ".cache",
  "coverage",
  "__pycache__",
  "vendor",
  "target",
]);

const GENERATED_FILE_PATTERNS = [
  /package-lock\.json$/,
  /pnpm-lock\.yaml$/,
  /yarn\.lock$/,
  /(^|\/)bun\.lockb?$/,
  /\.min\.(js|css)$/,
  /dist\//,
  /build\//,
  /(^|\/)snapshots?\//,
  /(^|\/)generated\//,
];

const TEST_FILE_PATTERNS = [
  /(^|\/)(__tests__|tests?)\//,
  /\.(test|spec)\.(ts|tsx|js|jsx|py)$/,
  /_test\.go$/,
];

const LOW_VALUE_FILE_PATTERNS = [
  /(^|\/)(fixtures?|examples?|samples?|demo|demos|e2e|benchmarks?)\//i,
  /(^|\/)(public|static|assets|images?|uploads?|media)\//i,
  /(^|\/)(migrations?|snapshots?)\//i,
  /\.(png|jpe?g|gif|webp|svg|ico|pdf|zip|gz|mp4|mov|woff2?|ttf)$/i,
  /(package-lock|pnpm-lock|yarn\.lock|bun\.lockb?)$/i,
];

const HIGH_SIGNAL_FILE_PATTERNS = [
  /(^|\/)README(\.[\w-]+)?$/i,
  /(^|\/)(package\.json|pyproject\.toml|requirements\.txt|pom\.xml|build\.gradle|go\.mod|cargo\.toml)$/i,
  /(^|\/)(tsconfig|vite|next|nuxt|svelte|astro|webpack|rollup|eslint|prettier|drizzle|prisma|tailwind|postcss)\.config\./i,
  /(^|\/)(src|app|apps|packages|services|controllers|routes|modules|lib)\//i,
  /(^|\/)(server|index|main|app)\.(ts|tsx|js|jsx|mjs|cjs)$/i,
];

const EXTENSION_MAP: Record<string, string> = {
  ".md": "Markdown",
  ".mdx": "MDX",
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".mjs": "JavaScript",
  ".cjs": "JavaScript",
  ".json": "JSON",
  ".yaml": "YAML",
  ".yml": "YAML",
  ".txt": "Text",
  ".py": "Python",
  ".java": "Java",
  ".go": "Go",
  ".cs": "CSharp",
  ".rs": "Rust",
  ".php": "PHP",
};

export interface FileEntry {
  path: string;
  sizeBytes: number;
  hash: string;
  language: string | null;
  isGenerated: boolean;
  isTest: boolean;
}

interface KnowledgeChunkEntry {
  filePath: string;
  symbolKey?: string;
  references?: string[];
  calls?: string[];
  chunkKind: "FILE" | "SYMBOL";
  title: string;
  language: string | null;
  startLine: number;
  endLine: number;
  content: string;
  contentHash: string;
  tokenCount: number;
  embedding: number[];
}

interface SymbolEntry {
  filePath: string;
  key: string;
  name: string;
  kind: string;
  startLine: number;
  endLine: number;
  signature: string;
  visibility: string | null;
  content: string;
  references: string[];
  calls: string[];
  node: ts.Node;
}

interface SymbolReferenceEntry {
  sourceSymbolKey: string;
  targetSymbolKey: string;
  kind: "REFERENCE" | "CALL";
}

export function getLanguage(filePath: string): string | null {
  const fileName = path.basename(filePath).toLowerCase();
  if (fileName === ".env.example") return "Environment";

  const ext = path.extname(filePath).toLowerCase();
  return EXTENSION_MAP[ext] ?? null;
}

export function hashFileContent(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

function hashText(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function isIgnoredDirectory(name: string): boolean {
  return IGNORED_FOLDERS.has(name);
}

function matchesAny(value: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

function getPathDepth(filePath: string) {
  return filePath.split("/").length;
}

function scoreFileForV1(file: FileEntry): number {
  let score = 0;
  const filePath = file.path;
  const basename = path.basename(filePath).toLowerCase();

  if (matchesAny(filePath, HIGH_SIGNAL_FILE_PATTERNS)) score += 120;
  if (/^readme(\.|$)/i.test(basename)) score += 160;
  if (basename === "package.json") score += 120;
  if (file.language === "TypeScript" || file.language === "JavaScript") score += 45;
  if (file.language === "Markdown") score += 35;
  if (file.language === "JSON" && /package\.json$|tsconfig/i.test(filePath)) score += 25;
  if (file.isTest) score -= 80;
  if (file.isGenerated) score -= 120;
  if (matchesAny(filePath, LOW_VALUE_FILE_PATTERNS)) score -= 100;
  if (file.sizeBytes > 150_000) score -= 40;
  if (file.sizeBytes > 400_000) score -= 80;
  score -= Math.min(40, getPathDepth(filePath) * 4);

  return score;
}

function prioritizeFilesForV1(files: FileEntry[]) {
  return [...files].sort((left, right) => {
    const scoreDelta = scoreFileForV1(right) - scoreFileForV1(left);
    if (scoreDelta !== 0) return scoreDelta;
    const sizeDelta = left.sizeBytes - right.sizeBytes;
    if (sizeDelta !== 0) return sizeDelta;
    return left.path.localeCompare(right.path);
  });
}

function applyV1FileCaps(files: FileEntry[]) {
  const prioritized = prioritizeFilesForV1(files);
  return {
    files: prioritized.slice(0, V1_MAX_ANALYZED_FILES),
    largeRepoMode: files.length > V1_MAX_ANALYZED_FILES,
  };
}

export function detectFrameworks(repoPath: string): string[] {
  const frameworks = new Set<string>();

  const pkgPath = path.join(repoPath, "package.json");
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    const deps = {
      ...(pkg.dependencies ?? {}),
      ...(pkg.devDependencies ?? {}),
    };
    if (deps.next) frameworks.add("Next.js");
    if (deps.express) frameworks.add("Express");
    if (deps["@nestjs/core"]) frameworks.add("NestJS");
    if (deps.react) frameworks.add("React");
    if (deps.vue) frameworks.add("Vue");
    if (deps["@angular/core"]) frameworks.add("Angular");
  }

  const pyProjectPath = path.join(repoPath, "pyproject.toml");
  const reqPath = path.join(repoPath, "requirements.txt");
  let pythonManifest = "";
  if (fs.existsSync(pyProjectPath))
    pythonManifest += fs.readFileSync(pyProjectPath, "utf-8").toLowerCase();
  if (fs.existsSync(reqPath))
    pythonManifest += fs.readFileSync(reqPath, "utf-8").toLowerCase();
  if (pythonManifest.includes("fastapi")) frameworks.add("FastAPI");
  if (pythonManifest.includes("flask")) frameworks.add("Flask");
  if (pythonManifest.includes("django")) frameworks.add("Django");

  if (
    fs.existsSync(path.join(repoPath, "pom.xml")) ||
    fs.existsSync(path.join(repoPath, "build.gradle"))
  ) {
    const pom = fs.existsSync(path.join(repoPath, "pom.xml"))
      ? fs.readFileSync(path.join(repoPath, "pom.xml"), "utf-8").toLowerCase()
      : "";
    if (pom.includes("spring-boot")) frameworks.add("Spring Boot");
  }

  return [...frameworks].sort();
}

export function crawlDirectory(
  dir: string,
  baseDir: string,
  files: FileEntry[] = [],
): FileEntry[] {
  if (!fs.existsSync(dir) || files.length >= MAX_FILES) return files;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (files.length >= MAX_FILES) break;

    if (entry.isDirectory()) {
      if (isIgnoredDirectory(entry.name)) continue;
      crawlDirectory(path.join(dir, entry.name), baseDir, files);
      continue;
    }

    if (!entry.isFile()) continue;

    const fullPath = path.join(dir, entry.name);
    const stat = fs.statSync(fullPath);
    if (stat.size > MAX_FILE_SIZE_BYTES) continue;

    const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, "/");
    files.push({
      path: relativePath,
      sizeBytes: stat.size,
      hash: hashFileContent(fullPath),
      language: getLanguage(fullPath),
      isGenerated: matchesAny(relativePath, GENERATED_FILE_PATTERNS),
      isTest: matchesAny(relativePath, TEST_FILE_PATTERNS),
    });
  }

  return files;
}

function estimateTokenCount(content: string): number {
  const words = content.trim().match(/\S+/g);
  return words?.length ?? 0;
}

function shouldChunkFile(file: FileEntry): boolean {
  return (
    Boolean(file.language) &&
    !file.isGenerated &&
    file.sizeBytes <= MAX_CHUNK_FILE_SIZE_BYTES
  );
}

function isTypeScriptOrJavaScript(file: FileEntry): boolean {
  return file.language === "TypeScript" || file.language === "JavaScript";
}

function getScriptKind(filePath: string): ts.ScriptKind {
  switch (path.extname(filePath).toLowerCase()) {
    case ".tsx":
      return ts.ScriptKind.TSX;
    case ".jsx":
      return ts.ScriptKind.JSX;
    case ".js":
    case ".mjs":
    case ".cjs":
      return ts.ScriptKind.JS;
    default:
      return ts.ScriptKind.TS;
  }
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return Boolean(
    ts.canHaveModifiers(node) &&
      ts.getModifiers(node)?.some((modifier) => modifier.kind === kind),
  );
}

function getVisibility(node: ts.Node): string | null {
  if (hasModifier(node, ts.SyntaxKind.ExportKeyword)) return "exported";
  if (hasModifier(node, ts.SyntaxKind.DefaultKeyword)) return "default";
  return null;
}

function getLineRange(sourceFile: ts.SourceFile, node: ts.Node) {
  const start = sourceFile.getLineAndCharacterOfPosition(
    node.getStart(sourceFile),
  );
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
  return {
    startLine: start.line + 1,
    endLine: end.line + 1,
  };
}

function getSignature(sourceFile: ts.SourceFile, node: ts.Node): string {
  const text = node.getText(sourceFile);
  const firstLine = text.split("\n")[0]?.trim() ?? "";
  return firstLine.length > 240 ? `${firstLine.slice(0, 237)}...` : firstLine;
}

function getVariableSymbolKind(declaration: ts.VariableDeclaration): string {
  const initializer = declaration.initializer;
  if (!initializer) return "variable";
  if (
    ts.isArrowFunction(initializer) ||
    ts.isFunctionExpression(initializer)
  ) {
    return "function";
  }
  if (ts.isClassExpression(initializer)) return "class";
  return "variable";
}

function findAncestor<T extends ts.Node>(
  node: ts.Node,
  predicate: (candidate: ts.Node) => candidate is T,
): T | undefined {
  let current = node.parent;
  while (current) {
    if (predicate(current)) return current;
    current = current.parent;
  }
  return undefined;
}

function extractDeclarationSymbols(
  sourceFile: ts.SourceFile,
  filePath: string,
): SymbolEntry[] {
  const symbols: SymbolEntry[] = [];

  const addSymbol = (
    node: ts.Node,
    nameNode: ts.Identifier | ts.PrivateIdentifier | undefined,
    kind: string,
    namePrefix = "",
  ) => {
    if (!nameNode) return;
    const name = `${namePrefix}${nameNode.text}`;
    const { startLine, endLine } = getLineRange(sourceFile, node);
    const content = node.getText(sourceFile).trim();
    if (!content) return;

    symbols.push({
      filePath,
      key: `${filePath}:${name}:${startLine}`,
      name,
      kind,
      startLine,
      endLine,
      signature: getSignature(sourceFile, node),
      visibility: getVisibility(node),
      content,
      references: [],
      calls: [],
      node,
    });
  };

  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node)) {
      addSymbol(node, node.name, "function");
    } else if (ts.isClassDeclaration(node)) {
      addSymbol(node, node.name, "class");
    } else if (ts.isInterfaceDeclaration(node)) {
      addSymbol(node, node.name, "interface");
    } else if (ts.isTypeAliasDeclaration(node)) {
      addSymbol(node, node.name, "type");
    } else if (ts.isEnumDeclaration(node)) {
      addSymbol(node, node.name, "enum");
    } else if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          addSymbol(node, declaration.name, getVariableSymbolKind(declaration));
        }
      }
    } else if (
      ts.isMethodDeclaration(node) ||
      ts.isGetAccessorDeclaration(node) ||
      ts.isSetAccessorDeclaration(node)
    ) {
      const classNode = findAncestor(node, ts.isClassDeclaration);
      if (classNode?.name && ts.isIdentifier(node.name)) {
        addSymbol(node, node.name, "method", `${classNode.name.text}.`);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return symbols.sort(
    (left, right) =>
      left.startLine - right.startLine || left.name.localeCompare(right.name),
  );
}

function getCalledName(expression: ts.Expression): string | null {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return null;
}

function isDeclarationName(identifier: ts.Identifier): boolean {
  const parent = identifier.parent;
  if (!parent) return false;
  return (
    (ts.isFunctionDeclaration(parent) && parent.name === identifier) ||
    (ts.isClassDeclaration(parent) && parent.name === identifier) ||
    (ts.isInterfaceDeclaration(parent) && parent.name === identifier) ||
    (ts.isTypeAliasDeclaration(parent) && parent.name === identifier) ||
    (ts.isEnumDeclaration(parent) && parent.name === identifier) ||
    (ts.isVariableDeclaration(parent) && parent.name === identifier) ||
    (ts.isMethodDeclaration(parent) && parent.name === identifier) ||
    (ts.isGetAccessorDeclaration(parent) && parent.name === identifier) ||
    (ts.isSetAccessorDeclaration(parent) && parent.name === identifier) ||
    (ts.isPropertyAccessExpression(parent) && parent.name === identifier)
  );
}

function attachSymbolReferences(symbols: SymbolEntry[]): void {
  const symbolNames = new Set(symbols.map((symbol) => symbol.name));
  const shortNames = new Map<string, Set<string>>();

  for (const symbol of symbols) {
    const shortName = symbol.name.split(".").at(-1) ?? symbol.name;
    if (!shortNames.has(shortName)) shortNames.set(shortName, new Set());
    shortNames.get(shortName)?.add(symbol.name);
  }

  for (const symbol of symbols) {
    const references = new Set<string>();
    const calls = new Set<string>();
    const ownShortName = symbol.name.split(".").at(-1) ?? symbol.name;

    const resolveReferenceTargets = (name: string): string[] => {
      const targets = new Set<string>();
      for (const target of shortNames.get(name) ?? []) {
        if (target !== symbol.name && name !== ownShortName) {
          targets.add(target);
        }
      }
      if (symbolNames.has(name) && name !== symbol.name) {
        targets.add(name);
      }
      return [...targets];
    };

    const addReference = (name: string): string[] => {
      const targets = resolveReferenceTargets(name);
      for (const target of targets) references.add(target);
      return targets;
    };

    const visit = (node: ts.Node) => {
      if (ts.isIdentifier(node) && !isDeclarationName(node)) {
        addReference(node.text);
      }

      if (ts.isCallExpression(node)) {
        const calledName = getCalledName(node.expression);
        if (calledName) {
          for (const target of addReference(calledName)) {
            calls.add(target);
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(symbol.node);
    symbol.references = [...references].sort();
    symbol.calls = [...calls].sort();
  }
}

export function extractSymbols(
  repoPath: string,
  files: FileEntry[],
  options: {
    maxSymbols?: number;
    maxSymbolsPerFile?: number;
  } = {},
): SymbolEntry[] {
  const symbols: SymbolEntry[] = [];
  const maxSymbols = options.maxSymbols ?? Number.POSITIVE_INFINITY;
  const maxSymbolsPerFile =
    options.maxSymbolsPerFile ?? Number.POSITIVE_INFINITY;

  for (const file of files) {
    if (symbols.length >= maxSymbols) break;
    if (!shouldChunkFile(file) || !isTypeScriptOrJavaScript(file)) continue;

    const fullPath = path.join(repoPath, file.path);
    if (!fs.existsSync(fullPath)) continue;

    const content = fs.readFileSync(fullPath, "utf-8").replace(/\r\n/g, "\n");
    const sourceFile = ts.createSourceFile(
      file.path,
      content,
      ts.ScriptTarget.Latest,
      true,
      getScriptKind(file.path),
    );
    const fileSymbols = extractDeclarationSymbols(sourceFile, file.path).slice(
      0,
      maxSymbolsPerFile,
    );
    symbols.push(...fileSymbols.slice(0, maxSymbols - symbols.length));
  }

  attachSymbolReferences(symbols);
  return symbols;
}

function buildIntelligenceSummary(symbol: SymbolEntry): string {
  const lines = [];
  if (symbol.references.length > 0) {
    lines.push(`References: ${symbol.references.join(", ")}`);
  }
  if (symbol.calls.length > 0) {
    lines.push(`Calls: ${symbol.calls.join(", ")}`);
  }
  return lines.length > 0 ? `\n\nCode intelligence:\n${lines.join("\n")}` : "";
}

function extractIntelligenceList(content: string, label: string): string[] {
  const line = content
    .split("\n")
    .find((entry) => entry.startsWith(`${label}: `));
  if (!line) return [];
  return line
    .slice(label.length + 2)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function buildSymbolReferences(symbols: SymbolEntry[]): SymbolReferenceEntry[] {
  const symbolsByName = new Map<string, SymbolEntry[]>();
  const references = new Map<string, SymbolReferenceEntry>();

  for (const symbol of symbols) {
    const existing = symbolsByName.get(symbol.name) ?? [];
    existing.push(symbol);
    symbolsByName.set(symbol.name, existing);
  }

  const addReferences = (
    source: SymbolEntry,
    targetNames: string[],
    kind: SymbolReferenceEntry["kind"],
  ) => {
    for (const targetName of targetNames) {
      for (const target of symbolsByName.get(targetName) ?? []) {
        if (target.key === source.key) continue;
        const key = `${source.key}->${target.key}:${kind}`;
        references.set(key, {
          sourceSymbolKey: source.key,
          targetSymbolKey: target.key,
          kind,
        });
      }
    }
  };

  for (const symbol of symbols) {
    addReferences(symbol, symbol.references, "REFERENCE");
    addReferences(symbol, symbol.calls, "CALL");
  }

  return [...references.values()];
}

function buildKnowledgeChunks(
  repoPath: string,
  files: FileEntry[],
  symbols: SymbolEntry[],
): KnowledgeChunkEntry[] {
  const chunks: KnowledgeChunkEntry[] = [];

  for (const file of files) {
    if (!shouldChunkFile(file)) continue;

    const fullPath = path.join(repoPath, file.path);
    if (!fs.existsSync(fullPath)) continue;

    const content = fs.readFileSync(fullPath, "utf-8").replace(/\r\n/g, "\n");
    const lines = content.split("\n");
    const step = Math.max(1, CHUNK_LINE_COUNT - CHUNK_LINE_OVERLAP);

    for (let index = 0; index < lines.length; index += step) {
      const chunkLines = lines.slice(index, index + CHUNK_LINE_COUNT);
      const chunkContent = chunkLines.join("\n").trim();
      if (!chunkContent) continue;

      const startLine = index + 1;
      const endLine = Math.min(lines.length, index + chunkLines.length);
      chunks.push({
        filePath: file.path,
        chunkKind: "FILE",
        title: `${file.path}:${startLine}-${endLine}`,
        language: file.language,
        startLine,
        endLine,
        content: chunkContent,
        contentHash: hashText(chunkContent),
        tokenCount: estimateTokenCount(chunkContent),
        embedding: generateEmbedding(`${file.path}\n${chunkContent}`),
      });

      if (index + CHUNK_LINE_COUNT >= lines.length) break;
    }
  }

  for (const symbol of symbols) {
    const file = files.find((entry) => entry.path === symbol.filePath);
    const intelligenceSummary = buildIntelligenceSummary(symbol);
    const enrichedContent = `${symbol.content}${intelligenceSummary}`;
    chunks.push({
      filePath: symbol.filePath,
      symbolKey: symbol.key,
      references: symbol.references,
      calls: symbol.calls,
      chunkKind: "SYMBOL",
      title: `${symbol.kind} ${symbol.name} (${symbol.filePath}:${symbol.startLine}-${symbol.endLine})`,
      language: file?.language ?? null,
      startLine: symbol.startLine,
      endLine: symbol.endLine,
      content: enrichedContent,
      contentHash: hashText(enrichedContent),
      tokenCount: estimateTokenCount(enrichedContent),
      embedding: generateEmbedding(
        `${symbol.kind} ${symbol.name}\n${enrichedContent}`,
      ),
    });
  }

  return chunks;
}

export function dedupeKnowledgeChunks(
  chunks: KnowledgeChunkEntry[],
): KnowledgeChunkEntry[] {
  const seen = new Set<string>();
  return chunks.filter((chunk) => {
    const key = [
      chunk.filePath,
      chunk.startLine,
      chunk.endLine,
      chunk.contentHash,
    ].join(":");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function scoreSourceRecordForV1(chunk: KnowledgeChunkEntry) {
  let score = 0;
  const file: FileEntry = {
    path: chunk.filePath,
    language: chunk.language,
    sizeBytes: chunk.content.length,
    hash: chunk.contentHash,
    isGenerated: false,
    isTest: matchesAny(chunk.filePath, TEST_FILE_PATTERNS),
  };

  score += scoreFileForV1(file);
  if (chunk.chunkKind === "FILE") score += 30;
  if (chunk.chunkKind === "SYMBOL") score += 15;
  if (chunk.startLine <= 80) score += 10;
  return score;
}

function prioritizeSourceRecordsForV1(chunks: KnowledgeChunkEntry[]) {
  return [...chunks].sort((left, right) => {
    const scoreDelta = scoreSourceRecordForV1(right) - scoreSourceRecordForV1(left);
    if (scoreDelta !== 0) return scoreDelta;
    const pathDelta = left.filePath.localeCompare(right.filePath);
    if (pathDelta !== 0) return pathDelta;
    return left.startLine - right.startLine;
  });
}

function applyV1SourceRecordCaps(chunks: KnowledgeChunkEntry[]) {
  const deduped = dedupeKnowledgeChunks(chunks);
  return prioritizeSourceRecordsForV1(deduped).slice(0, V1_MAX_SOURCE_RECORDS);
}

async function runInBatches<T>(
  items: T[],
  handler: (batch: T[]) => Promise<unknown>,
) {
  for (let index = 0; index < items.length; index += DB_WRITE_BATCH_SIZE) {
    const batch = items.slice(index, index + DB_WRITE_BATCH_SIZE);
    if (batch.length) {
      await handler(batch);
    }
  }
}

function getCommandErrorText(error: unknown) {
  if (!error || typeof error !== "object") return "Unknown Git error.";
  const stderr = (error as { stderr?: Buffer | string }).stderr;
  const stdout = (error as { stdout?: Buffer | string }).stdout;
  const message =
    (typeof stderr === "string" ? stderr : stderr?.toString("utf8")) ||
    (typeof stdout === "string" ? stdout : stdout?.toString("utf8")) ||
    (error as { message?: string }).message ||
    "Unknown Git error.";

  return message.replace(/\s+/g, " ").trim();
}

function redactSecret(value: string, secret?: string) {
  return secret ? value.split(secret).join("[redacted]") : value;
}

function buildAuthenticatedGitHubUrl(url: string) {
  const token = process.env.GITHUB_TOKEN?.trim();
  if (!token) return { cloneUrl: url, token: undefined };
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "github.com") {
      return { cloneUrl: url, token: undefined };
    }
    parsed.username = "x-access-token";
    parsed.password = token;
    return { cloneUrl: parsed.toString(), token };
  } catch {
    return { cloneUrl: url, token: undefined };
  }
}

export function classifyCloneFailure(message: string) {
  const lower = message.toLowerCase();
  if (
    lower.includes("repository not found") ||
    lower.includes("not found") ||
    lower.includes("could not read username") ||
    lower.includes("authentication failed") ||
    lower.includes("terminal prompts disabled")
  ) {
    return "Repository is private, missing, or the URL requires GitHub access. Use a public repository URL, verify the repo name, or configure GITHUB_TOKEN for private repositories.";
  }
  if (
    lower.includes("could not resolve host") ||
    lower.includes("failed to connect") ||
    lower.includes("connection timed out") ||
    lower.includes("network is unreachable") ||
    lower.includes("early eof")
  ) {
    return "GitHub could not be reached from the analysis worker. Check network access and retry.";
  }
  if (
    lower.includes("invalid") ||
    lower.includes("unsupported url protocol") ||
    lower.includes("unable to parse")
  ) {
    return "The repository URL is not valid. Use a GitHub URL like https://github.com/owner/repository.";
  }
  return "Git could not clone this repository. Verify the repository URL, access, and network connection, then retry.";
}

function buildWorkerErrorMessage(error: unknown) {
  const rawMessage = error instanceof Error ? error.message : String(error);
  if (rawMessage.startsWith("Git clone failed")) {
    return classifyCloneFailure(rawMessage);
  }
  if (
    rawMessage.includes("P2028") ||
    rawMessage.includes("Transaction already closed") ||
    rawMessage.includes("Transaction not found") ||
    rawMessage.includes("expired transaction") ||
    rawMessage.includes("transaction timeout")
  ) {
    return "This repository is large and analysis timed out while saving results. Retry after increasing worker save limits or use a smaller repository.";
  }
  if (
    rawMessage.includes("Unique constraint failed") ||
    rawMessage.includes("knowledgeChunk.createMany")
  ) {
    return "Repository analysis found duplicate source records while saving results. Retry analysis after refreshing the worker.";
  }
  return "Repository analysis failed. Verify the repository URL and local services, then retry.";
}

function cloneRepository(url: string, targetPath: string): void {
  const maxAttempts = 2;
  let lastError = "Unknown Git error.";
  const { cloneUrl, token } = buildAuthenticatedGitHubUrl(url);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      execFileSync(
        "git",
        ["clone", "--depth", "1", "--single-branch", cloneUrl, targetPath],
        {
          stdio: "pipe",
          encoding: "utf8",
          env: {
            ...process.env,
            GIT_TERMINAL_PROMPT: "0",
          },
        },
      );
      return;
    } catch (error) {
      lastError = redactSecret(getCommandErrorText(error), token);
      if (fs.existsSync(targetPath)) {
        fs.rmSync(targetPath, { recursive: true, force: true });
      }
      if (attempt < maxAttempts) {
        console.warn(
          `[Worker] Git clone attempt ${attempt} failed, retrying: ${classifyCloneFailure(lastError)}`,
        );
      }
    }
  }

  throw new Error(`Git clone failed after ${maxAttempts} attempts: ${lastError}`);
}

async function processCloneJob(payload: CloneJobPayload) {
  const { repositoryId, jobId, url } = payload;
  console.log(
    `[Worker] Started job ${jobId} for repository ${repositoryId} (${url})`,
  );

  const tempClonesDir = path.join(process.cwd(), "temp", "clones");
  const tempRepoDir = path.join(tempClonesDir, repositoryId);

  try {
    await db.analysisJob.update({
      where: { id: jobId },
      data: {
        status: "RUNNING",
        currentStep: "cloning",
        progress: 10,
        startedAt: new Date(),
      },
    });

    await db.repository.update({
      where: { id: repositoryId },
      data: {
        cloneStatus: "RUNNING",
        analysisStatus: "RUNNING",
      },
    });

    if (fs.existsSync(tempRepoDir)) {
      fs.rmSync(tempRepoDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempClonesDir, { recursive: true });

    console.log(`[Worker] Cloning ${url} to ${tempRepoDir}`);
    cloneRepository(url, tempRepoDir);

    await db.analysisJob.update({
      where: { id: jobId },
      data: {
        currentStep: "indexing_files",
        progress: 35,
      },
    });

    const crawledFiles = crawlDirectory(tempRepoDir, tempRepoDir);
    const { files, largeRepoMode } = applyV1FileCaps(crawledFiles);

    await db.analysisJob.update({
      where: { id: jobId },
      data: {
        currentStep: "detecting_stack",
        progress: 60,
      },
    });

    const detectedFrameworks = detectFrameworks(tempRepoDir);
    const detectedLanguages = [
      ...new Set(
        files.map((file) => file.language).filter(Boolean) as string[],
      ),
    ].sort();
    const totalSizeBytes = files.reduce((sum, file) => sum + file.sizeBytes, 0);

    await db.analysisJob.update({
      where: { id: jobId },
      data: {
        currentStep: "saving_metadata",
        progress: 76,
      },
    });

    const symbols = extractSymbols(tempRepoDir, files, {
      maxSymbols: V1_MAX_SYMBOLS,
      maxSymbolsPerFile: V1_MAX_SYMBOLS_PER_FILE,
    });
    const symbolReferences = buildSymbolReferences(symbols);
    const knowledgeChunks = applyV1SourceRecordCaps(
      buildKnowledgeChunks(tempRepoDir, files, symbols),
    );

    await db.analysisJob.update({
      where: { id: jobId },
      data: {
        currentStep: "building_knowledge_index",
        progress: 86,
      },
    });

    await db.$transaction(
      async (tx) => {
        await tx.knowledgeChunk.deleteMany({ where: { repositoryId } });
        await tx.symbolReference.deleteMany({ where: { repositoryId } });
        await tx.symbol.deleteMany({ where: { repositoryId } });
        await tx.repositoryFile.deleteMany({ where: { repositoryId } });

        await runInBatches(files, (batch) =>
          tx.repositoryFile.createMany({
            data: batch.map((file) => ({
              repositoryId,
              path: file.path,
              language: file.language,
              sizeBytes: file.sizeBytes,
              hash: file.hash,
              isGenerated: file.isGenerated,
              isTest: file.isTest,
            })),
          }),
        );

        const savedFiles = await tx.repositoryFile.findMany({
          where: { repositoryId },
          select: { id: true, path: true },
        });
        const fileIdsByPath = new Map(
          savedFiles.map((file) => [file.path, file.id]),
        );

        await runInBatches(symbols, (batch) =>
          tx.symbol.createMany({
            data: batch.map((symbol) => ({
              repositoryId,
              fileId: fileIdsByPath.get(symbol.filePath) as string,
              name: symbol.name,
              kind: symbol.kind,
              startLine: symbol.startLine,
              endLine: symbol.endLine,
              signature: symbol.signature,
              visibility: symbol.visibility,
            })),
          }),
        );

        const savedSymbols = await tx.symbol.findMany({
          where: { repositoryId },
          select: {
            id: true,
            file: { select: { path: true } },
            name: true,
            startLine: true,
          },
        });
        const symbolIdsByKey = new Map(
          savedSymbols.map((symbol) => [
            `${symbol.file.path}:${symbol.name}:${symbol.startLine}`,
            symbol.id,
          ]),
        );

        const symbolReferenceRows = symbolReferences
          .map((reference) => {
            const sourceSymbolId = symbolIdsByKey.get(
              reference.sourceSymbolKey,
            );
            const targetSymbolId = symbolIdsByKey.get(
              reference.targetSymbolKey,
            );
            if (!sourceSymbolId || !targetSymbolId) return null;
            return {
              repositoryId,
              sourceSymbolId,
              targetSymbolId,
              kind: reference.kind,
            };
          })
          .filter((reference) => reference !== null);

        await runInBatches(symbolReferenceRows, (batch) =>
          tx.symbolReference.createMany({
            data: batch,
            skipDuplicates: true,
          }),
        );

        await runInBatches(knowledgeChunks, (batch) =>
          tx.knowledgeChunk.createMany({
            data: batch.map((chunk) => ({
              repositoryId,
              fileId: fileIdsByPath.get(chunk.filePath),
              symbolId: chunk.symbolKey
                ? symbolIdsByKey.get(chunk.symbolKey)
                : undefined,
              chunkKind: chunk.chunkKind,
              title: chunk.title,
              path: chunk.filePath,
              language: chunk.language,
              startLine: chunk.startLine,
              endLine: chunk.endLine,
              content: chunk.content,
              contentHash: chunk.contentHash,
              tokenCount: chunk.tokenCount,
              embedding: chunk.embedding,
            })),
            skipDuplicates: true,
          }),
        );

        await tx.repository.update({
          where: { id: repositoryId },
          data: {
            cloneStatus: "COMPLETED",
            analysisStatus: "COMPLETED",
            detectedLanguages,
            detectedFrameworks,
            fileCount: files.length,
            totalSizeBytes,
          },
        });

        await tx.analysisJob.update({
          where: { id: jobId },
          data: {
            status: "COMPLETED",
            currentStep: "completed",
            progress: 100,
            finishedAt: new Date(),
          },
        });
      },
      {
        maxWait: DB_TRANSACTION_MAX_WAIT_MS,
        timeout: DB_TRANSACTION_TIMEOUT_MS,
      },
    );

    const savedKnowledgeChunks = await db.knowledgeChunk.findMany({
      where: { repositoryId },
      include: {
        file: { select: { isTest: true } },
        symbol: { select: { name: true, kind: true } },
      },
    });
    const qdrantPoints: QdrantPoint[] = savedKnowledgeChunks.map((chunk) => ({
      id: chunk.id,
      vector: chunk.embedding,
      payload: {
        repositoryId,
        fileId: chunk.fileId,
        symbolId: chunk.symbolId,
        path: chunk.path,
        title: chunk.title,
        language: chunk.language,
        chunkKind: chunk.chunkKind,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        isTest: chunk.file?.isTest ?? false,
        symbolName: chunk.symbol?.name,
        symbolKind: chunk.symbol?.kind,
        references: extractIntelligenceList(chunk.content, "References"),
        calls: extractIntelligenceList(chunk.content, "Calls"),
      },
    }));

    await upsertKnowledgePoints(QDRANT_URL, qdrantPoints).catch((error) => {
      console.warn(
        `[Worker] Qdrant upsert failed for repository ${repositoryId}; lexical search remains available.`,
        error,
      );
    });

    console.log(
      `[Worker] Completed job ${jobId}: ${files.length}/${crawledFiles.length} files, ${symbols.length} symbols, ${knowledgeChunks.length} knowledge chunks, ${qdrantPoints.length} vectors, ${detectedLanguages.join(", ")}${largeRepoMode ? " (large repository mode)" : ""}`,
    );
  } catch (error) {
    const message = buildWorkerErrorMessage(error);
    console.error(`[Worker] Job ${jobId} failed:`, error);

    await db.repository
      .update({
        where: { id: repositoryId },
        data: {
          cloneStatus: "FAILED",
          analysisStatus: "FAILED",
        },
      })
      .catch((err) =>
        console.error("Failed to mark repository as failed:", err),
      );

    await db.analysisJob
      .update({
        where: { id: jobId },
        data: {
          status: "FAILED",
          currentStep: "failed",
          progress: 100,
          errorMessage: message,
          finishedAt: new Date(),
        },
      })
      .catch((err) => console.error("Failed to mark job as failed:", err));
  } finally {
    if (fs.existsSync(tempRepoDir)) {
      fs.rmSync(tempRepoDir, { recursive: true, force: true });
    }
  }
}

async function start() {
  console.log(
    JSON.stringify({
      service: workerName,
      status: "ready",
      queues: ["repo.clone"],
    }),
  );

  const queue = new RedisQueue<CloneJobPayload>("repo.clone", REDIS_URL);
  await queue.dequeue(processCloneJob);
}

const isMain =
  process.argv[1] &&
  fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  start().catch((err) => {
    console.error("Worker failed to start:", err);
    process.exit(1);
  });
}
