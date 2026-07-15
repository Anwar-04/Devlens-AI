import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { db } from "@devlens/database";
import Redis from "ioredis";

interface HealthResponse {
  service: string;
  status: "ok";
  version: string;
}

interface ReadyResponse extends HealthResponse {
  checks: {
    database: "ok";
    redis: "ok";
  };
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

  @Get("ready")
  async ready(): Promise<ReadyResponse> {
    const missing = ["DATABASE_URL", "REDIS_URL"].filter(
      (name) => !process.env[name]
    );
    if (missing.length) {
      throw new ServiceUnavailableException(
        `DevLens API is running, but local services are not configured: ${missing.join(", ")}.`
      );
    }

    try {
      await db.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException(
        "DevLens API is running, but the database is not reachable."
      );
    }

    const redis = new Redis(process.env.REDIS_URL as string, {
      maxRetriesPerRequest: 1,
      lazyConnect: true
    });
    try {
      await redis.connect();
      await redis.ping();
    } catch {
      throw new ServiceUnavailableException(
        "DevLens API is running, but Redis is not reachable."
      );
    } finally {
      redis.disconnect();
    }

    return {
      service: "devlens-api",
      status: "ok",
      version: "0.1.0",
      checks: {
        database: "ok",
        redis: "ok"
      }
    };
  }
}
