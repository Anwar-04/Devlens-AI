import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import { db } from "@devlens/database";
import { CloneJobPayload, RedisQueue } from "@devlens/shared";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const workerName = "repository-worker";
const MAX_FILES = Number(process.env.REPOSITORY_MAX_FILES ?? 5000);
const MAX_FILE_SIZE_BYTES = Number(process.env.REPOSITORY_MAX_FILE_SIZE_BYTES ?? 1_000_000);

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
  "target"
]);

const GENERATED_FILE_PATTERNS = [
  /package-lock\.json$/,
  /pnpm-lock\.yaml$/,
  /yarn\.lock$/,
  /\.min\.(js|css)$/,
  /dist\//,
  /build\//
];

const TEST_FILE_PATTERNS = [
  /(^|\/)(__tests__|tests?)\//,
  /\.(test|spec)\.(ts|tsx|js|jsx|py)$/,
  /_test\.go$/
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
  ".php": "PHP"
};

export interface FileEntry {
  path: string;
  sizeBytes: number;
  hash: string;
  language: string | null;
  isGenerated: boolean;
  isTest: boolean;
}

export function getLanguage(filePath: string): string | null {
  const ext = path.extname(filePath).toLowerCase();
  return EXTENSION_MAP[ext] ?? null;
}

export function hashFileContent(filePath: string): string {
  const content = fs.readFileSync(filePath);
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
    const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
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
  if (fs.existsSync(pyProjectPath)) pythonManifest += fs.readFileSync(pyProjectPath, "utf-8").toLowerCase();
  if (fs.existsSync(reqPath)) pythonManifest += fs.readFileSync(reqPath, "utf-8").toLowerCase();
  if (pythonManifest.includes("fastapi")) frameworks.add("FastAPI");
  if (pythonManifest.includes("flask")) frameworks.add("Flask");
  if (pythonManifest.includes("django")) frameworks.add("Django");

  if (fs.existsSync(path.join(repoPath, "pom.xml")) || fs.existsSync(path.join(repoPath, "build.gradle"))) {
    const pom = fs.existsSync(path.join(repoPath, "pom.xml"))
      ? fs.readFileSync(path.join(repoPath, "pom.xml"), "utf-8").toLowerCase()
      : "";
    if (pom.includes("spring-boot")) frameworks.add("Spring Boot");
  }

  return [...frameworks].sort();
}

export function crawlDirectory(dir: string, baseDir: string, files: FileEntry[] = []): FileEntry[] {
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
      isTest: matchesAny(relativePath, TEST_FILE_PATTERNS)
    });
  }

  return files;
}

function cloneRepository(url: string, targetPath: string): void {
  execFileSync("git", ["clone", "--depth", "1", "--single-branch", url, targetPath], {
    stdio: "ignore"
  });
}

async function processCloneJob(payload: CloneJobPayload) {
  const { repositoryId, jobId, url } = payload;
  console.log(`[Worker] Started job ${jobId} for repository ${repositoryId} (${url})`);

  const tempClonesDir = path.join(process.cwd(), "temp", "clones");
  const tempRepoDir = path.join(tempClonesDir, repositoryId);

  try {
    await db.analysisJob.update({
      where: { id: jobId },
      data: {
        status: "RUNNING",
        currentStep: "cloning",
        progress: 10,
        startedAt: new Date()
      }
    });

    await db.repository.update({
      where: { id: repositoryId },
      data: {
        cloneStatus: "RUNNING",
        analysisStatus: "RUNNING"
      }
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
        progress: 35
      }
    });

    const files = crawlDirectory(tempRepoDir, tempRepoDir);

    await db.analysisJob.update({
      where: { id: jobId },
      data: {
        currentStep: "detecting_stack",
        progress: 60
      }
    });

    const detectedFrameworks = detectFrameworks(tempRepoDir);
    const detectedLanguages = [...new Set(files.map((file) => file.language).filter(Boolean) as string[])].sort();
    const totalSizeBytes = files.reduce((sum, file) => sum + file.sizeBytes, 0);

    await db.analysisJob.update({
      where: { id: jobId },
      data: {
        currentStep: "saving_metadata",
        progress: 82
      }
    });

    await db.$transaction([
      db.repositoryFile.deleteMany({ where: { repositoryId } }),
      db.repositoryFile.createMany({
        data: files.map((file) => ({
          repositoryId,
          path: file.path,
          language: file.language,
          sizeBytes: file.sizeBytes,
          hash: file.hash,
          isGenerated: file.isGenerated,
          isTest: file.isTest
        }))
      }),
      db.repository.update({
        where: { id: repositoryId },
        data: {
          cloneStatus: "COMPLETED",
          analysisStatus: "COMPLETED",
          detectedLanguages,
          detectedFrameworks,
          fileCount: files.length,
          totalSizeBytes
        }
      }),
      db.analysisJob.update({
        where: { id: jobId },
        data: {
          status: "COMPLETED",
          currentStep: "completed",
          progress: 100,
          finishedAt: new Date()
        }
      })
    ]);

    console.log(`[Worker] Completed job ${jobId}: ${files.length} files, ${detectedLanguages.join(", ")}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Worker] Job ${jobId} failed:`, error);

    await db.repository.update({
      where: { id: repositoryId },
      data: {
        cloneStatus: "FAILED",
        analysisStatus: "FAILED"
      }
    }).catch((err) => console.error("Failed to mark repository as failed:", err));

    await db.analysisJob.update({
      where: { id: jobId },
      data: {
        status: "FAILED",
        currentStep: "failed",
        progress: 100,
        errorMessage: message,
        finishedAt: new Date()
      }
    }).catch((err) => console.error("Failed to mark job as failed:", err));
  } finally {
    if (fs.existsSync(tempRepoDir)) {
      fs.rmSync(tempRepoDir, { recursive: true, force: true });
    }
  }
}

async function start() {
  console.log(JSON.stringify({
    service: workerName,
    status: "ready",
    queues: ["repo.clone"]
  }));

  const queue = new RedisQueue<CloneJobPayload>("repo.clone", REDIS_URL);
  await queue.dequeue(processCloneJob);
}

const isMain = process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  start().catch((err) => {
    console.error("Worker failed to start:", err);
    process.exit(1);
  });
}