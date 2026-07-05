import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post
} from "@nestjs/common";
import { db } from "@devlens/database";
import { CloneJobPayload, RedisQueue } from "@devlens/shared";

interface CreateRepositoryRequest {
  workspaceId?: string;
  url: string;
}

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

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
}
