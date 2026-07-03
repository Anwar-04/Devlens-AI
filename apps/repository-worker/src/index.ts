import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
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
  /\.min\.(js|css)$/,
  /dist\//,
  /build\//,
];

const TEST_FILE_PATTERNS = [
  /(^|\/)(__tests__|tests?)\//,
  /\.(test|spec)\.(ts|tsx|js|jsx|py)$/,
  /_test\.go$/,
];

const EXTENSION_MAP: Record<string, string> = {
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".mjs": "JavaScript",
  ".cjs": "JavaScript",
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
}

export function getLanguage(filePath: string): string | null {
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

function findBlockEndLine(lines: string[], startIndex: number): number {
  let braceBalance = 0;
  let sawBrace = false;

  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    for (const char of line) {
      if (char === "{") {
        braceBalance += 1;
        sawBrace = true;
      } else if (char === "}") {
        braceBalance -= 1;
      }
    }

    if (sawBrace && braceBalance <= 0) return index + 1;
    if (!sawBrace && /;\s*$/.test(line)) return index + 1;
  }

  return Math.min(lines.length, startIndex + 1);
}

function extractSymbolFromLine(line: string): {
  name: string;
  kind: string;
  visibility: string | null;
  signature: string;
} | null {
  const trimmed = line.trim();
  const exportPrefix = "(?:export\\s+)?(?:default\\s+)?";
  const visibility = /\bexport\b/.test(trimmed) ? "exported" : null;

  const functionMatch = trimmed.match(
    new RegExp(
      `^${exportPrefix}(?:async\\s+)?function\\s+([A-Za-z_$][\\w$]*)\\b`,
    ),
  );
  if (functionMatch?.[1]) {
    return {
      name: functionMatch[1],
      kind: "function",
      visibility,
      signature: trimmed,
    };
  }

  const classMatch = trimmed.match(
    new RegExp(`^${exportPrefix}class\\s+([A-Za-z_$][\\w$]*)\\b`),
  );
  if (classMatch?.[1]) {
    return {
      name: classMatch[1],
      kind: "class",
      visibility,
      signature: trimmed,
    };
  }

  const interfaceMatch = trimmed.match(
    new RegExp(`^${exportPrefix}interface\\s+([A-Za-z_$][\\w$]*)\\b`),
  );
  if (interfaceMatch?.[1]) {
    return {
      name: interfaceMatch[1],
      kind: "interface",
      visibility,
      signature: trimmed,
    };
  }

  const typeMatch = trimmed.match(
    new RegExp(`^${exportPrefix}type\\s+([A-Za-z_$][\\w$]*)\\b`),
  );
  if (typeMatch?.[1]) {
    return {
      name: typeMatch[1],
      kind: "type",
      visibility,
      signature: trimmed,
    };
  }

  const arrowFunctionMatch = trimmed.match(
    new RegExp(
      `^${exportPrefix}const\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*(?:async\\s*)?(?:\\([^)]*\\)|[A-Za-z_$][\\w$]*)\\s*=>`,
    ),
  );
  if (arrowFunctionMatch?.[1]) {
    return {
      name: arrowFunctionMatch[1],
      kind: "function",
      visibility,
      signature: trimmed,
    };
  }

  return null;
}

function extractSymbols(repoPath: string, files: FileEntry[]): SymbolEntry[] {
  const symbols: SymbolEntry[] = [];

  for (const file of files) {
    if (!shouldChunkFile(file) || !isTypeScriptOrJavaScript(file)) continue;

    const fullPath = path.join(repoPath, file.path);
    if (!fs.existsSync(fullPath)) continue;

    const content = fs.readFileSync(fullPath, "utf-8").replace(/\r\n/g, "\n");
    const lines = content.split("\n");

    for (let index = 0; index < lines.length; index += 1) {
      const extracted = extractSymbolFromLine(lines[index] ?? "");
      if (!extracted) continue;

      const startLine = index + 1;
      const endLine = findBlockEndLine(lines, index);
      const symbolContent = lines.slice(index, endLine).join("\n").trim();
      if (!symbolContent) continue;

      symbols.push({
        filePath: file.path,
        key: `${file.path}:${extracted.name}:${startLine}`,
        name: extracted.name,
        kind: extracted.kind,
        startLine,
        endLine,
        signature: extracted.signature,
        visibility: extracted.visibility,
        content: symbolContent,
      });
    }
  }

  return symbols;
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
    chunks.push({
      filePath: symbol.filePath,
      symbolKey: symbol.key,
      chunkKind: "SYMBOL",
      title: `${symbol.kind} ${symbol.name} (${symbol.filePath}:${symbol.startLine}-${symbol.endLine})`,
      language: file?.language ?? null,
      startLine: symbol.startLine,
      endLine: symbol.endLine,
      content: symbol.content,
      contentHash: hashText(symbol.content),
      tokenCount: estimateTokenCount(symbol.content),
      embedding: generateEmbedding(
        `${symbol.kind} ${symbol.name}\n${symbol.content}`,
      ),
    });
  }

  return chunks;
}

function cloneRepository(url: string, targetPath: string): void {
  execFileSync(
    "git",
    ["clone", "--depth", "1", "--single-branch", url, targetPath],
    {
      stdio: "ignore",
    },
  );
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

    const files = crawlDirectory(tempRepoDir, tempRepoDir);

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

    const symbols = extractSymbols(tempRepoDir, files);
    const knowledgeChunks = buildKnowledgeChunks(tempRepoDir, files, symbols);

    await db.analysisJob.update({
      where: { id: jobId },
      data: {
        currentStep: "building_knowledge_index",
        progress: 86,
      },
    });

    await db.$transaction(async (tx) => {
      await tx.knowledgeChunk.deleteMany({ where: { repositoryId } });
      await tx.symbol.deleteMany({ where: { repositoryId } });
      await tx.repositoryFile.deleteMany({ where: { repositoryId } });
      await tx.repositoryFile.createMany({
        data: files.map((file) => ({
          repositoryId,
          path: file.path,
          language: file.language,
          sizeBytes: file.sizeBytes,
          hash: file.hash,
          isGenerated: file.isGenerated,
          isTest: file.isTest,
        })),
      });

      const savedFiles = await tx.repositoryFile.findMany({
        where: { repositoryId },
        select: { id: true, path: true },
      });
      const fileIdsByPath = new Map(
        savedFiles.map((file) => [file.path, file.id]),
      );

      if (symbols.length > 0) {
        await tx.symbol.createMany({
          data: symbols.map((symbol) => ({
            repositoryId,
            fileId: fileIdsByPath.get(symbol.filePath) as string,
            name: symbol.name,
            kind: symbol.kind,
            startLine: symbol.startLine,
            endLine: symbol.endLine,
            signature: symbol.signature,
            visibility: symbol.visibility,
          })),
        });
      }

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

      if (knowledgeChunks.length > 0) {
        await tx.knowledgeChunk.createMany({
          data: knowledgeChunks.map((chunk) => ({
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
        });
      }

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
    });

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
      },
    }));

    await upsertKnowledgePoints(QDRANT_URL, qdrantPoints).catch((error) => {
      console.warn(
        `[Worker] Qdrant upsert failed for repository ${repositoryId}; lexical search remains available.`,
        error,
      );
    });

    console.log(
      `[Worker] Completed job ${jobId}: ${files.length} files, ${symbols.length} symbols, ${knowledgeChunks.length} knowledge chunks, ${qdrantPoints.length} vectors, ${detectedLanguages.join(", ")}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
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
