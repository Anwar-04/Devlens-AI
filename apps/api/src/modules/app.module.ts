import { Module } from "@nestjs/common";
import { HealthController } from "./health/health.controller";
import { RepositoriesController } from "./repositories/repositories.controller";
import { JobsController } from "./jobs/jobs.controller";

@Module({
  controllers: [HealthController, RepositoriesController, JobsController]
})
export class AppModule {}

