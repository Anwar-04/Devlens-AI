import { Module } from "@nestjs/common";
import { HealthController } from "./health/health.controller";
import { RepositoriesController } from "./repositories/repositories.controller";
import { RepositorySearchController } from "./repositories/repository-search.controller";
import { JobsController } from "./jobs/jobs.controller";

@Module({
  controllers: [
    HealthController,
    RepositoriesController,
    RepositorySearchController,
    JobsController,
  ],
})
export class AppModule {}
