import { Controller, Get, NotFoundException, Param } from "@nestjs/common";
import { db } from "@devlens/database";

const PREPARING_STALE_MS = Number(
  process.env.ANALYSIS_PREPARING_STALE_MS ?? 2 * 60 * 1000
);
const PREPARING_STEPS = new Set(["queued", "preparing"]);
const STALE_PREPARING_MESSAGE =
  "Analysis worker is not running or cannot reach the database. Start the repository worker with DATABASE_URL and Redis configured, then retry analysis.";

const jobInclude = {
  repository: {
    select: {
      id: true,
      owner: true,
      name: true,
      url: true,
      cloneStatus: true,
      analysisStatus: true,
      detectedLanguages: true,
      detectedFrameworks: true,
      fileCount: true,
      totalSizeBytes: true
    }
  }
};

@Controller("jobs")
export class JobsController {
  @Get(":id")
  async findOne(@Param("id") id: string) {
    let job = await db.analysisJob.findUnique({
      where: { id },
      include: jobInclude
    });

    if (!job) {
      throw new NotFoundException("Job not found");
    }

    const isPreparing =
      job.status === "QUEUED" ||
      (job.status === "RUNNING" && PREPARING_STEPS.has(job.currentStep));
    const startedOrCreatedAt = job.startedAt ?? job.createdAt;
    const ageMs = Date.now() - startedOrCreatedAt.getTime();

    if (isPreparing && ageMs > PREPARING_STALE_MS) {
      await db.$transaction([
        db.analysisJob.update({
          where: { id },
          data: {
            status: "FAILED",
            currentStep: "failed",
            progress: 100,
            errorMessage: STALE_PREPARING_MESSAGE,
            finishedAt: new Date()
          }
        }),
        db.repository.update({
          where: { id: job.repositoryId },
          data: {
            cloneStatus: "FAILED",
            analysisStatus: "FAILED"
          }
        })
      ]);

      job = await db.analysisJob.findUnique({
        where: { id },
        include: jobInclude
      });
    }

    if (!job) {
      throw new NotFoundException("Job not found");
    }

    return {
      id: job.id,
      repositoryId: job.repositoryId,
      status: job.status,
      currentStep: job.currentStep,
      progress: job.progress,
      errorMessage: job.errorMessage,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      createdAt: job.createdAt,
      repository: job.repository
    };
  }
}
