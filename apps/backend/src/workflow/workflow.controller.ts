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
  UseGuards,
} from "@nestjs/common";

import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthenticatedUser } from "../auth/jwt.strategy";
import { CreateWorkflowDto } from "./dto/create-workflow.dto";
import { CreateWorkflowNodeDto } from "./dto/create-workflow-node.dto";
import { ListWorkflowsQueryDto } from "./dto/list-workflows-query.dto";
import { UpdateWorkflowDto } from "./dto/update-workflow.dto";
import { UpdateWorkflowNodeDto } from "./dto/update-workflow-node.dto";
import { WorkflowService } from "./workflow.service";

@Controller("workflows")
@UseGuards(JwtAuthGuard)
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateWorkflowDto) {
    return this.workflowService.createWorkflow(user.workspaceId, dto);
  }

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListWorkflowsQueryDto,
  ) {
    const { aiAgentId, status, search, ...pagination } = query;

    return this.workflowService.listWorkflows(user.workspaceId, pagination, {
      aiAgentId,
      status,
      search,
    });
  }

  @Get(":slug/versions")
  listVersions(
    @CurrentUser() user: AuthenticatedUser,
    @Param("slug") slug: string,
  ) {
    return this.workflowService.listVersions(user.workspaceId, slug);
  }

  @Get(":id")
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.workflowService.getWorkflowById(id);
  }

  @Patch(":id")
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateWorkflowDto,
  ) {
    return this.workflowService.updateWorkflow(id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param("id", ParseUUIDPipe) id: string): Promise<void> {
    await this.workflowService.softDeleteWorkflow(id);
  }

  @Post(":id/nodes")
  @HttpCode(HttpStatus.CREATED)
  addNode(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: CreateWorkflowNodeDto,
  ) {
    return this.workflowService.addNode(id, dto);
  }

  @Patch(":id/nodes/:nodeId")
  updateNode(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("nodeId", ParseUUIDPipe) nodeId: string,
    @Body() dto: UpdateWorkflowNodeDto,
  ) {
    return this.workflowService.updateNode(id, nodeId, dto);
  }

  @Delete(":id/nodes/:nodeId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeNode(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("nodeId", ParseUUIDPipe) nodeId: string,
  ): Promise<void> {
    await this.workflowService.removeNode(id, nodeId);
  }

  @Post(":id/validate")
  validate(@Param("id", ParseUUIDPipe) id: string) {
    return this.workflowService.validateWorkflow(id);
  }

  @Post(":id/publish")
  publish(@Param("id", ParseUUIDPipe) id: string) {
    return this.workflowService.publish(id);
  }

  @Post(":id/archive")
  archive(@Param("id", ParseUUIDPipe) id: string) {
    return this.workflowService.archive(id);
  }

  @Post(":id/new-version")
  @HttpCode(HttpStatus.CREATED)
  createNewVersion(@Param("id", ParseUUIDPipe) id: string) {
    return this.workflowService.createNewVersion(id);
  }
}
