import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";

import { AiAgentService } from "./ai-agent.service";
import { CreateAiAgentDto } from "./dto/create-ai-agent.dto";
import { ListAiAgentsQueryDto } from "./dto/list-ai-agents-query.dto";
import { UpdateAiAgentDto } from "./dto/update-ai-agent.dto";

@Controller("ai-agents")
export class AiAgentController {
  constructor(private readonly aiAgentService: AiAgentService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateAiAgentDto) {
    return this.aiAgentService.createAiAgent(dto);
  }

  @Get()
  list(@Query() query: ListAiAgentsQueryDto) {
    const { workspaceId, search, ...pagination } = query;

    return this.aiAgentService.listAiAgents(workspaceId, pagination, search);
  }

  @Get(":id")
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.aiAgentService.getAiAgentById(id);
  }

  @Patch(":id")
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateAiAgentDto,
  ) {
    return this.aiAgentService.updateAiAgent(id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param("id", ParseUUIDPipe) id: string): Promise<void> {
    await this.aiAgentService.softDeleteAiAgent(id);
  }
}
