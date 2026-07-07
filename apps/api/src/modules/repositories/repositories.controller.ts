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
import { db } from "@devlens/database";
import { CloneJobPayload, RedisQueue } from "@devlens/shared";

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
    description: "Condensed project overview from README and indexed docs."
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
  const overviewText = `${repository.owner}/${repository.name} is indexed as a ${
    primaryLanguage?.language ?? "code"
  } repository with ${repository.fileCount} files and ${
    symbols.length
  } parser-backed symbols. ${frameworkSummary}`;

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
    overviewText
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
        `\`${symbol.name}\` has ${symbol.connectionCount} indexed link${
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
    `- Files indexed: ${repository.fileCount}`,
    `- Parser-backed symbols: ${context.symbols.length}`,
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
    markdownList(languageLines, "Language signals will appear after indexing."),
    "",
    "### Important paths",
    "",
    markdownList(
      importantPathLines.map((path) => `\`${path}\``),
      "Important paths will appear after file indexing."
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
      : "No test files were detected from the indexed repository paths.",
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
    "<!-- Generated by DevLens AI deterministic documentation draft. -->"
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
  return "indexed repository component";
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
    risks.push("No exported symbols were identified, which limits deterministic public API documentation.");
  }
  if (!context.connectedSymbols.length) {
    risks.push("No symbol relationships were indexed, so dependency flow is currently sparse.");
  }
  if (!context.testFileCount) {
    risks.push("No test files were detected from indexed paths, leaving behavior and edge-case documentation without test anchors.");
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
        `\`${symbol.name}\` (${symbol.kind}) in \`${symbol.filePath}\` has ${symbol.connectionCount} indexed link${
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
    markdownList(languageLines, "Language signals will appear after indexing."),
    "",
    `Framework signal: ${
      repository.detectedFrameworks.length
        ? repository.detectedFrameworks.join(", ")
        : "No framework signal detected"
    }.`,
    "",
    "## Important paths",
    "",
    markdownList(importantPathLines, "Important paths will appear after file indexing."),
    "",
    "## Module responsibility guesses",
    "",
    markdownList(
      responsibilityLines,
      "Module responsibilities need manual annotation once more paths are indexed."
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
      "No deterministic architecture gaps were detected from the current signals."
    ),
    "",
    "## Next architecture documentation steps",
    "",
    "- Confirm the actual responsibility of each important path with maintainers or source comments.",
    "- Add a high-level module map for entry points, shared packages, workers, and persistence boundaries.",
    "- Link highly connected symbols to their callers, owners, and expected runtime behavior.",
    "- Separate generated files, test fixtures, and hand-authored source in the architecture narrative.",
    "",
    "<!-- Generated by DevLens AI deterministic architecture notes. -->"
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
          errorMessage: error instanceof Error ? error.message : "Unable to enqueue repository analysis job.",
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
      throw new BadRequestException("Repository was created, but the analysis queue is unavailable. Start Redis and retry.");
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
        text: context.overviewText,
        primaryLanguage: context.primaryLanguage?.language ?? null,
        frameworkSummary: context.frameworkSummary
      },
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
          body: context.overviewText
        },
        {
          title: "Key Files",
          body: keyFileNames.length
            ? `Start with ${keyFileNames.join(", ")}. These paths look central based on repository conventions and indexed structure.`
            : "Key files will appear once the repository tree is indexed."
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
            : "No test files were detected from the indexed paths."
        }
      ],
      queuedSections: DOCS_QUEUED_SECTIONS
    };
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
      source: "deterministic"
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
      source: "deterministic"
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
