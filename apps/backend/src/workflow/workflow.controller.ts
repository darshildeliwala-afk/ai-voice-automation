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
import { ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthenticatedUser } from "../auth/jwt.strategy";
import { CreateWorkflowDto } from "./dto/create-workflow.dto";
import { CreateWorkflowNodeDto } from "./dto/create-workflow-node.dto";
import { ListWorkflowsQueryDto } from "./dto/list-workflows-query.dto";
import { UpdateWorkflowDto } from "./dto/update-workflow.dto";
import { UpdateWorkflowNodeDto } from "./dto/update-workflow-node.dto";
import { WorkflowService } from "./workflow.service";

@ApiTags("workflows")
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
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.workflowService.getWorkflowById(user.workspaceId, id);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateWorkflowDto,
  ) {
    return this.workflowService.updateWorkflow(user.workspaceId, id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.workflowService.softDeleteWorkflow(user.workspaceId, id);
  }

  @Post(":id/nodes")
  @HttpCode(HttpStatus.CREATED)
  addNode(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: CreateWorkflowNodeDto,
  ) {
    return this.workflowService.addNode(user.workspaceId, id, dto);
  }

  @Patch(":id/nodes/:nodeId")
  updateNode(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("nodeId", ParseUUIDPipe) nodeId: string,
    @Body() dto: UpdateWorkflowNodeDto,
  ) {
    return this.workflowService.updateNode(user.workspaceId, id, nodeId, dto);
  }

  @Delete(":id/nodes/:nodeId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeNode(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("nodeId", ParseUUIDPipe) nodeId: string,
  ): Promise<void> {
    await this.workflowService.removeNode(user.workspaceId, id, nodeId);
  }

  @Post(":id/validate")
  validate(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.workflowService.validateWorkflow(user.workspaceId, id);
  }

  @Post(":id/publish")
  publish(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.workflowService.publish(user.workspaceId, id);
  }

  @Post(":id/archive")
  archive(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.workflowService.archive(user.workspaceId, id);
  }

  @Post(":id/new-version")
  @HttpCode(HttpStatus.CREATED)
  createNewVersion(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.workflowService.createNewVersion(user.workspaceId, id);
  }
}
