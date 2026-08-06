import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { ApiQuery, ApiTags } from "@nestjs/swagger";

import { UpdateVoicePersonaConfigDto } from "../workspace-settings/dto/update-voice-persona-config.dto";
import { VoicePersonaConfigService } from "../workspace-settings/voice-persona-config.service";
import { AiAgentService } from "./ai-agent.service";
import { CreateAiAgentDto } from "./dto/create-ai-agent.dto";
import { ListAiAgentsQueryDto } from "./dto/list-ai-agents-query.dto";
import { UpdateAiAgentDto } from "./dto/update-ai-agent.dto";

@ApiTags("ai-agents")
@Controller("ai-agents")
export class AiAgentController {
  constructor(
    private readonly aiAgentService: AiAgentService,
    private readonly voicePersonaConfigService: VoicePersonaConfigService,
  ) {}

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
  @ApiQuery({ name: "workspaceId", required: true, description: "Caller's workspace, for tenant-isolation" })
  async findOne(
    @Query("workspaceId", ParseUUIDPipe) workspaceId: string,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.assertAgentInWorkspace(workspaceId, id);
  }

  @Patch(":id")
  @ApiQuery({ name: "workspaceId", required: true, description: "Caller's workspace, for tenant-isolation" })
  async update(
    @Query("workspaceId", ParseUUIDPipe) workspaceId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateAiAgentDto,
  ) {
    await this.assertAgentInWorkspace(workspaceId, id);
    return this.aiAgentService.updateAiAgent(id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiQuery({ name: "workspaceId", required: true, description: "Caller's workspace, for tenant-isolation" })
  async remove(
    @Query("workspaceId", ParseUUIDPipe) workspaceId: string,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.assertAgentInWorkspace(workspaceId, id);
    await this.aiAgentService.softDeleteAiAgent(id);
  }

  @Get(":id/voice-persona")
  @ApiQuery({ name: "workspaceId", required: true, description: "Caller's workspace, for tenant-isolation" })
  async getVoicePersonaOverride(
    @Query("workspaceId", ParseUUIDPipe) workspaceId: string,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    await this.assertAgentInWorkspace(workspaceId, id);
    return this.voicePersonaConfigService.getAgentOverride(id);
  }

  @Put(":id/voice-persona")
  @ApiQuery({ name: "workspaceId", required: true, description: "Caller's workspace, for tenant-isolation" })
  async updateVoicePersonaOverride(
    @Query("workspaceId", ParseUUIDPipe) workspaceId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateVoicePersonaConfigDto,
  ) {
    await this.assertAgentInWorkspace(workspaceId, id);
    return this.voicePersonaConfigService.updateAgentOverride(id, dto);
  }

  /**
   * AiAgentService.getAiAgentById() only verifies the owning workspace
   * still exists, not that it matches the caller's -- enforce that here
   * (Sprint 21 tenant-isolation fix), the same defensive pattern already
   * established in PromptBuilderService for this exact same gap.
   */
  private async assertAgentInWorkspace(workspaceId: string, id: string) {
    const agent = await this.aiAgentService.getAiAgentById(id);
    if (agent.workspaceId !== workspaceId) {
      throw new NotFoundException(`AI Agent ${id} not found`);
    }
    return agent;
  }
}
