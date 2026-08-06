import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";

import { AiAgentService } from "../ai-agent/ai-agent.service";
import { BaseService } from "../common/base/base.service";
import type { PaginationDto } from "../common/pagination/pagination.dto";
import {
  buildPaginationMeta,
  type PaginationMeta,
} from "../common/pagination/pagination.util";
import { PrismaService } from "../common/prisma/prisma.service";
import {
  Prisma,
  WorkflowStatus,
  type Workflow,
  type WorkflowNode,
} from "../generated/prisma/client";
import { WorkspaceService } from "../workspace/workspace.service";
import { AIToolRegistry } from "../conversation-engine/tools/ai-tool-registry";
import { CreateWorkflowDto } from "./dto/create-workflow.dto";
import { CreateWorkflowNodeDto } from "./dto/create-workflow-node.dto";
import { UpdateWorkflowDto } from "./dto/update-workflow.dto";
import { UpdateWorkflowNodeDto } from "./dto/update-workflow-node.dto";
import {
  WorkflowValidationResult,
  WorkflowValidatorService,
} from "./validator/workflow-validator.service";
import {
  DEFAULT_WORKFLOW_GRAPH,
  type WorkflowGraph,
  type WorkflowGraphNode,
} from "./workflow.types";

export type WorkflowWithNodes = Workflow & { nodes: WorkflowNode[] };

export interface PaginatedWorkflows {
  data: Workflow[];
  meta: PaginationMeta;
}

export interface ListWorkflowsFilters {
  aiAgentId?: string;
  status?: WorkflowStatus;
  search?: string;
}

const WITH_NODES = { nodes: true } as const;

/**
 * CRUD + lifecycle for AI Agent Workflows. Versioning follows the same
 * insert-only pattern as AiProviderConfig/TelephonyConfig: a Workflow row
 * is immutable once PUBLISHED, `slug` groups a named workflow's versions
 * together, and at most one PUBLISHED version per (workspaceId, slug) is
 * `isActive`. Editing a published workflow means createNewVersion() (clone
 * into a new DRAFT) -> edit -> publish(), which atomically deactivates the
 * version it supersedes.
 */
@Injectable()
export class WorkflowService extends BaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
    private readonly aiAgentService: AiAgentService,
    private readonly validator: WorkflowValidatorService,
    private readonly toolRegistry: AIToolRegistry,
  ) {
    super();
  }

  async createWorkflow(
    workspaceId: string,
    dto: CreateWorkflowDto,
  ): Promise<WorkflowWithNodes> {
    await this.workspaceService.getWorkspaceById(workspaceId);

    if (dto.aiAgentId) {
      await this.assertAgentBelongsToWorkspace(workspaceId, dto.aiAgentId);
    }

    const existing = await this.prisma.workflow.findFirst({
      where: { workspaceId, slug: dto.slug, version: 1 },
    });
    if (existing) {
      throw new ConflictException(
        `A workflow with slug "${dto.slug}" already exists in this workspace`,
      );
    }

    return this.prisma.workflow.create({
      data: {
        workspaceId,
        aiAgentId: dto.aiAgentId,
        slug: dto.slug,
        name: dto.name,
        description: dto.description,
        version: 1,
        status: WorkflowStatus.DRAFT,
        isActive: false,
        entryNodeKey: dto.entryNodeKey,
        nodes: dto.nodes
          ? { create: dto.nodes.map((node) => this.toNodeCreateInput(node)) }
          : undefined,
      },
      include: WITH_NODES,
    });
  }

  /** Scoped to workspaceId -- a workflow belonging to another workspace is treated as not found (Sprint 21 tenant-isolation fix). */
  async getWorkflowById(workspaceId: string, id: string): Promise<WorkflowWithNodes> {
    return this.throwIfNotFound(
      await this.prisma.workflow.findFirst({
        where: this.applySoftDelete({ id, workspaceId }),
        include: WITH_NODES,
      }),
      "Workflow",
      id,
    );
  }

  async listWorkflows(
    workspaceId: string,
    pagination: PaginationDto,
    filters: ListWorkflowsFilters = {},
  ): Promise<PaginatedWorkflows> {
    await this.workspaceService.getWorkspaceById(workspaceId);

    const where: Prisma.WorkflowWhereInput = {
      workspaceId,
      deletedAt: null,
      ...(filters.aiAgentId ? { aiAgentId: filters.aiAgentId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.search
        ? { name: { contains: filters.search, mode: Prisma.QueryMode.insensitive } }
        : {}),
    };

    const all = await this.prisma.workflow.findMany({
      where,
      orderBy: [{ slug: "asc" }, { version: "desc" }],
    });

    const latestBySlug = new Map<string, Workflow>();
    for (const workflow of all) {
      if (!latestBySlug.has(workflow.slug)) {
        latestBySlug.set(workflow.slug, workflow);
      }
    }
    const latest = [...latestBySlug.values()].sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
    );

    const { skip, take } = this.buildPagination(pagination);
    const data = latest.slice(skip, skip + take);

    return { data, meta: buildPaginationMeta(latest.length, pagination) };
  }

  async listVersions(workspaceId: string, slug: string): Promise<Workflow[]> {
    await this.workspaceService.getWorkspaceById(workspaceId);

    return this.prisma.workflow.findMany({
      where: { workspaceId, slug, deletedAt: null },
      orderBy: { version: "desc" },
    });
  }

  async updateWorkflow(
    workspaceId: string,
    id: string,
    dto: UpdateWorkflowDto,
  ): Promise<Workflow> {
    const workflow = await this.getWorkflowById(workspaceId, id);
    this.assertMutable(workflow);

    if (dto.aiAgentId) {
      await this.assertAgentBelongsToWorkspace(workflow.workspaceId, dto.aiAgentId);
    }

    return this.prisma.workflow.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        aiAgentId: dto.aiAgentId,
        entryNodeKey: dto.entryNodeKey,
      },
    });
  }

  async addNode(
    workspaceId: string,
    workflowId: string,
    dto: CreateWorkflowNodeDto,
  ): Promise<WorkflowNode> {
    const workflow = await this.getWorkflowById(workspaceId, workflowId);
    this.assertMutable(workflow);

    const duplicate = workflow.nodes.find((node) => node.key === dto.key);
    if (duplicate) {
      throw new ConflictException(`Node key "${dto.key}" already exists on this workflow`);
    }

    return this.prisma.workflowNode.create({
      data: { workflowId, ...this.toNodeCreateInput(dto) },
    });
  }

  async updateNode(
    workspaceId: string,
    workflowId: string,
    nodeId: string,
    dto: UpdateWorkflowNodeDto,
  ): Promise<WorkflowNode> {
    const workflow = await this.getWorkflowById(workspaceId, workflowId);
    this.assertMutable(workflow);

    const node = this.throwIfNotFound(
      workflow.nodes.find((candidate) => candidate.id === nodeId),
      "WorkflowNode",
      nodeId,
    );

    return this.prisma.workflowNode.update({
      where: { id: node.id },
      data: { config: dto.config as Prisma.InputJsonValue },
    });
  }

  async removeNode(workspaceId: string, workflowId: string, nodeId: string): Promise<void> {
    const workflow = await this.getWorkflowById(workspaceId, workflowId);
    this.assertMutable(workflow);

    const node = this.throwIfNotFound(
      workflow.nodes.find((candidate) => candidate.id === nodeId),
      "WorkflowNode",
      nodeId,
    );

    await this.prisma.workflowNode.delete({ where: { id: node.id } });
  }

  async validateWorkflow(workspaceId: string, id: string): Promise<WorkflowValidationResult> {
    const workflow = await this.getWorkflowById(workspaceId, id);
    return this.runValidation(workflow);
  }

  async publish(workspaceId: string, id: string): Promise<Workflow> {
    const workflow = await this.getWorkflowById(workspaceId, id);

    if (workflow.status === WorkflowStatus.ARCHIVED) {
      throw new ConflictException("An archived workflow cannot be published");
    }

    const validation = this.runValidation(workflow);
    if (!validation.valid) {
      throw new BadRequestException({
        message: "Workflow failed validation",
        errors: validation.errors,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.workflow.updateMany({
        where: { workspaceId: workflow.workspaceId, slug: workflow.slug, isActive: true },
        data: { isActive: false },
      });

      return tx.workflow.update({
        where: { id },
        data: { status: WorkflowStatus.PUBLISHED, isActive: true },
      });
    });
  }

  async archive(workspaceId: string, id: string): Promise<Workflow> {
    const workflow = await this.getWorkflowById(workspaceId, id);

    if (workflow.status === WorkflowStatus.ARCHIVED) {
      throw new ConflictException("Workflow is already archived");
    }

    return this.prisma.workflow.update({
      where: { id },
      data: { status: WorkflowStatus.ARCHIVED, isActive: false },
    });
  }

  async createNewVersion(workspaceId: string, id: string): Promise<WorkflowWithNodes> {
    const source = await this.getWorkflowById(workspaceId, id);

    const latest = await this.prisma.workflow.findFirst({
      where: { workspaceId: source.workspaceId, slug: source.slug },
      orderBy: { version: "desc" },
    });
    const nextVersion = (latest?.version ?? source.version) + 1;

    return this.prisma.workflow.create({
      data: {
        workspaceId: source.workspaceId,
        aiAgentId: source.aiAgentId,
        slug: source.slug,
        name: source.name,
        description: source.description,
        version: nextVersion,
        status: WorkflowStatus.DRAFT,
        isActive: false,
        entryNodeKey: source.entryNodeKey,
        nodes: {
          create: source.nodes.map((node) => ({
            key: node.key,
            type: node.type,
            config: node.config as Prisma.InputJsonValue,
          })),
        },
      },
      include: WITH_NODES,
    });
  }

  async softDeleteWorkflow(workspaceId: string, id: string): Promise<void> {
    const workflow = await this.getWorkflowById(workspaceId, id);

    if (workflow.isActive) {
      throw new ConflictException(
        "Cannot delete the active version of a workflow -- archive or publish a replacement first",
      );
    }

    await this.prisma.workflow.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Resolves the graph the ConversationEngine should execute for this
   * turn: the agent's own active PUBLISHED workflow if it has one, else
   * the workspace-wide default (aiAgentId: null) if one is active, else
   * the built-in single-node DEFAULT_WORKFLOW_GRAPH (see workflow.types.ts)
   * so the engine always has a graph to run, never hardcoded logic.
   */
  async resolveActiveGraph(
    workspaceId: string,
    aiAgentId?: string,
  ): Promise<WorkflowGraph> {
    if (aiAgentId) {
      const agentWorkflow = await this.prisma.workflow.findFirst({
        where: { workspaceId, aiAgentId, isActive: true, deletedAt: null },
        include: WITH_NODES,
      });
      if (agentWorkflow) {
        return this.toGraph(agentWorkflow);
      }
    }

    const defaultWorkflow = await this.prisma.workflow.findFirst({
      where: { workspaceId, aiAgentId: null, isActive: true, deletedAt: null },
      include: WITH_NODES,
    });
    if (defaultWorkflow) {
      return this.toGraph(defaultWorkflow);
    }

    return DEFAULT_WORKFLOW_GRAPH;
  }

  private runValidation(workflow: WorkflowWithNodes): WorkflowValidationResult {
    const knownToolNames = this.toolRegistry.getAll().map((tool) => tool.name());
    const nodes = workflow.nodes.map((node) => this.toGraphNode(node));
    return this.validator.validate(nodes, workflow.entryNodeKey, knownToolNames);
  }

  private toGraph(workflow: WorkflowWithNodes): WorkflowGraph {
    return {
      entryNodeKey: workflow.entryNodeKey ?? "",
      nodes: workflow.nodes.map((node) => this.toGraphNode(node)),
    };
  }

  private toGraphNode(node: WorkflowNode): WorkflowGraphNode {
    return {
      key: node.key,
      type: node.type,
      config: node.config as Record<string, unknown>,
    };
  }

  private toNodeCreateInput(dto: CreateWorkflowNodeDto) {
    return {
      key: dto.key,
      type: dto.type,
      config: dto.config as Prisma.InputJsonValue,
    };
  }

  private assertMutable(workflow: Workflow): void {
    if (workflow.status !== WorkflowStatus.DRAFT) {
      throw new ConflictException(
        `Workflow is ${workflow.status.toLowerCase()} and can no longer be edited -- create a new version instead`,
      );
    }
  }

  private async assertAgentBelongsToWorkspace(
    workspaceId: string,
    aiAgentId: string,
  ): Promise<void> {
    const agent = await this.aiAgentService.getAiAgentById(aiAgentId);
    if (agent.workspaceId !== workspaceId) {
      this.throwIfNotFound(null, "AI Agent", aiAgentId);
    }
  }
}
