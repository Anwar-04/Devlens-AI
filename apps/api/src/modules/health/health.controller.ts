import { Controller, Get } from "@nestjs/common";

interface HealthResponse {
  service: string;
  status: "ok";
  version: string;
}

@Controller("health")
export class HealthController {
  @Get()
  health(): HealthResponse {
    return {
      service: "devlens-api",
      status: "ok",
      version: "0.1.0"
    };
  }
}
