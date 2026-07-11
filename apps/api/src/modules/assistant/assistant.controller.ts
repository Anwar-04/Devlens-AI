import { Body, Controller, NotFoundException, Param, Post } from "@nestjs/common";
import { db } from "@devlens/database";
import {
  createAssistantAnswer,
  type AssistantAskRequest,
  type AssistantAskResponse,
} from "./assistant.service";

@Controller("repositories/:repositoryId/assistant")
export class AssistantController {
  @Post("ask")
  async ask(
    @Param("repositoryId") repositoryId: string,
    @Body() body: AssistantAskRequest,
  ): Promise<AssistantAskResponse> {
    const repository = await db.repository.findUnique({
      where: { id: repositoryId },
      select: { id: true },
    });
    if (!repository) {
      throw new NotFoundException("Repository not found");
    }

    return createAssistantAnswer(body.question, body.context ?? {});
  }
}
