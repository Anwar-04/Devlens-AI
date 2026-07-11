import { Module } from "@nestjs/common";
import { HealthController } from "./health/health.controller";
import { RepositoriesController } from "./repositories/repositories.controller";
import { RepositorySearchController } from "./repositories/repository-search.controller";
import { JobsController } from "./jobs/jobs.controller";
import { AssistantController } from "./assistant/assistant.controller";

@Module({
  controllers: [
    HealthController,
    RepositoriesController,
    RepositorySearchController,
    JobsController,
    AssistantController,
  ],
})
export class AppModule {}
