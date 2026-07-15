import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./modules/app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
    credentials: true
  });

  const port = Number(process.env.API_PORT ?? process.env.PORT ?? 4000);

  try {
    await app.listen(port);
  } catch (error) {
    if (isPortInUseError(error)) {
      console.error(
        `[DevLens] API port ${port} is already in use. Reuse the running API or stop the existing process before starting another.`
      );
      console.error(`[DevLens] Windows check: netstat -ano | findstr :${port}`);
      console.error("[DevLens] Windows stop: Stop-Process -Id <PID> -Force");
      await app.close();
      process.exit(1);
    }

    throw error;
  }
}

void bootstrap();

function isPortInUseError(error: unknown): error is NodeJS.ErrnoException {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "EADDRINUSE"
  );
}
