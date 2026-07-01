import { Controller, Get, NotFoundException, Param } from "@nestjs/common";
import { db } from "@devlens/database";

@Controller("jobs")
export class JobsController {
  @Get(":id")
  async findOne(@Param("id") id: string) {
    const job = await db.analysisJob.findUnique({
      where: { id },
      include: {
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
      }
    });

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