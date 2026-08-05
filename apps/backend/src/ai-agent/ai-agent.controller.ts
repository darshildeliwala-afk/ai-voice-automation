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
  Put,
  Query,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

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

  @Get(":id/voice-persona")
  getVoicePersonaOverride(@Param("id", ParseUUIDPipe) id: string) {
    return this.voicePersonaConfigService.getAgentOverride(id);
  }

  @Put(":id/voice-persona")
  updateVoicePersonaOverride(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateVoicePersonaConfigDto,
  ) {
    return this.voicePersonaConfigService.updateAgentOverride(id, dto);
  }
}
