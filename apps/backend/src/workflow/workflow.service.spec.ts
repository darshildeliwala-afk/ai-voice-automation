import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";

import { WorkflowNodeType, WorkflowStatus } from "../generated/prisma/client";
import { DEFAULT_WORKFLOW_GRAPH } from "./workflow.types";
import { WorkflowService } from "./workflow.service";

const WORKSPACE_ID = "workspace-1";

function setup() {
  const workflow = {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  };
  const workflowNode = { create: jest.fn(), update: jest.fn(), delete: jest.fn() };
  const prisma = {
    workflow,
    workflowNode,
    $transaction: jest.fn(async (callback: (tx: unknown) => unknown) =>
      callback({ workflow }),
    ),
  };

  const workspaceService = { getWorkspaceById: jest.fn().mockResolvedValue({ id: WORKSPACE_ID }) };
  const aiAgentService = {
    getAiAgentById: jest.fn().mockResolvedValue({ id: "agent-1", workspaceId: WORKSPACE_ID }),
  };
  const validator = { validate: jest.fn().mockReturnValue({ valid: true, errors: [] }) };
  const toolRegistry = {
    getAll: jest.fn().mockReturnValue([{ name: () => "lookup_order" }, { name: () => "end_call" }]),
  };

  const service = new WorkflowService(
    prisma as never,
    workspaceService as never,
    aiAgentService as never,
    validator as never,
    toolRegistry as never,
  );

  return { service, prisma, workflow, workflowNode, workspaceService, aiAgentService, validator, toolRegistry };
}

function draftWorkflow(overrides: Record<string, unknown> = {}) {
  return {
    id: "wf-1",
    workspaceId: WORKSPACE_ID,
    aiAgentId: null,
    slug: "order-support",
    name: "Order Support",
    description: null,
    version: 1,
    status: WorkflowStatus.DRAFT,
    isActive: false,
    entryNodeKey: "start",
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    nodes: [{ id: "node-1", workflowId: "wf-1", key: "start", type: WorkflowNodeType.END, config: {} }],
    ...overrides,
  };
}

describe("WorkflowService", () => {
  describe("createWorkflow", () => {
    it("creates a version-1 DRAFT workflow with nested nodes", async () => {
      const { service, prisma, workflow } = setup();
      workflow.findFirst.mockResolvedValue(null);
      workflow.create.mockResolvedValue(draftWorkflow());

      const result = await service.createWorkflow(WORKSPACE_ID, {
        slug: "order-support",
        name: "Order Support",
        entryNodeKey: "start",
        nodes: [{ key: "start", type: WorkflowNodeType.END, config: {} }],
      });

      expect(workflow.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          workspaceId: WORKSPACE_ID,
          slug: "order-support",
          version: 1,
          status: WorkflowStatus.DRAFT,
          isActive: false,
          nodes: { create: [{ key: "start", type: WorkflowNodeType.END, config: {} }] },
        }),
        include: { nodes: true },
      });
      expect(result.id).toBe("wf-1");
      void prisma;
    });

    it("rejects a slug that already has a version 1 in this workspace", async () => {
      const { service, workflow } = setup();
      workflow.findFirst.mockResolvedValue(draftWorkflow());

      await expect(
        service.createWorkflow(WORKSPACE_ID, { slug: "order-support", name: "Dup" }),
      ).rejects.toThrow(ConflictException);
    });

    it("rejects an aiAgentId belonging to a different workspace", async () => {
      const { service, workflow, aiAgentService } = setup();
      workflow.findFirst.mockResolvedValue(null);
      aiAgentService.getAiAgentById.mockResolvedValue({ id: "agent-1", workspaceId: "other-workspace" });

      await expect(
        service.createWorkflow(WORKSPACE_ID, { slug: "s", name: "n", aiAgentId: "agent-1" }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("getWorkflowById", () => {
    it("throws NotFoundException when missing", async () => {
      const { service, workflow } = setup();
      workflow.findFirst.mockResolvedValue(null);

      await expect(service.getWorkflowById("missing")).rejects.toThrow(NotFoundException);
    });
  });

  describe("listWorkflows", () => {
    it("returns only the latest version per slug", async () => {
      const { service, workflow } = setup();
      workflow.findMany.mockResolvedValue([
        draftWorkflow({ id: "wf-2", slug: "a", version: 2, updatedAt: new Date("2026-01-02") }),
        draftWorkflow({ id: "wf-1", slug: "a", version: 1, updatedAt: new Date("2026-01-01") }),
        draftWorkflow({ id: "wf-3", slug: "b", version: 1, updatedAt: new Date("2026-01-03") }),
      ]);

      const result = await service.listWorkflows(WORKSPACE_ID, { page: 1, limit: 20 });

      expect(result.data.map((w) => w.id).sort()).toEqual(["wf-2", "wf-3"].sort());
      expect(result.meta.total).toBe(2);
    });
  });

  describe("listVersions", () => {
    it("lists all versions of a slug ordered by version desc", async () => {
      const { service, workflow } = setup();
      workflow.findMany.mockResolvedValue([draftWorkflow({ version: 2 }), draftWorkflow({ version: 1 })]);

      await service.listVersions(WORKSPACE_ID, "order-support");

      expect(workflow.findMany).toHaveBeenCalledWith({
        where: { workspaceId: WORKSPACE_ID, slug: "order-support", deletedAt: null },
        orderBy: { version: "desc" },
      });
    });
  });

  describe("updateWorkflow", () => {
    it("updates a DRAFT workflow", async () => {
      const { service, workflow } = setup();
      workflow.findFirst.mockResolvedValue(draftWorkflow());
      workflow.update.mockResolvedValue(draftWorkflow({ name: "New name" }));

      const result = await service.updateWorkflow("wf-1", { name: "New name" });

      expect(result.name).toBe("New name");
    });

    it("rejects editing a PUBLISHED workflow", async () => {
      const { service, workflow } = setup();
      workflow.findFirst.mockResolvedValue(draftWorkflow({ status: WorkflowStatus.PUBLISHED }));

      await expect(service.updateWorkflow("wf-1", { name: "x" })).rejects.toThrow(ConflictException);
    });
  });

  describe("node CRUD", () => {
    it("addNode rejects a duplicate key", async () => {
      const { service, workflow } = setup();
      workflow.findFirst.mockResolvedValue(draftWorkflow());

      await expect(
        service.addNode("wf-1", { key: "start", type: WorkflowNodeType.END, config: {} }),
      ).rejects.toThrow(ConflictException);
    });

    it("addNode succeeds for a new key on a DRAFT workflow", async () => {
      const { service, workflow, workflowNode } = setup();
      workflow.findFirst.mockResolvedValue(draftWorkflow());
      workflowNode.create.mockResolvedValue({ id: "node-2", key: "second" });

      const result = await service.addNode("wf-1", {
        key: "second",
        type: WorkflowNodeType.END,
        config: {},
      });

      expect(result.id).toBe("node-2");
    });

    it("addNode rejects mutation of a non-DRAFT workflow", async () => {
      const { service, workflow } = setup();
      workflow.findFirst.mockResolvedValue(draftWorkflow({ status: WorkflowStatus.PUBLISHED }));

      await expect(
        service.addNode("wf-1", { key: "second", type: WorkflowNodeType.END, config: {} }),
      ).rejects.toThrow(ConflictException);
    });

    it("updateNode throws NotFoundException for an unknown nodeId", async () => {
      const { service, workflow } = setup();
      workflow.findFirst.mockResolvedValue(draftWorkflow());

      await expect(service.updateNode("wf-1", "nonexistent", { config: {} })).rejects.toThrow(
        NotFoundException,
      );
    });

    it("removeNode deletes an existing node on a DRAFT workflow", async () => {
      const { service, workflow, workflowNode } = setup();
      workflow.findFirst.mockResolvedValue(draftWorkflow());

      await service.removeNode("wf-1", "node-1");

      expect(workflowNode.delete).toHaveBeenCalledWith({ where: { id: "node-1" } });
    });
  });

  describe("validateWorkflow", () => {
    it("delegates to WorkflowValidatorService with the live tool names", async () => {
      const { service, workflow, validator } = setup();
      workflow.findFirst.mockResolvedValue(draftWorkflow());

      await service.validateWorkflow("wf-1");

      expect(validator.validate).toHaveBeenCalledWith(
        [{ key: "start", type: WorkflowNodeType.END, config: {} }],
        "start",
        ["lookup_order", "end_call"],
      );
    });
  });

  describe("publish", () => {
    it("throws BadRequestException with validator errors when invalid", async () => {
      const { service, workflow, validator } = setup();
      workflow.findFirst.mockResolvedValue(draftWorkflow());
      validator.validate.mockReturnValue({ valid: false, errors: ["bad graph"] });

      await expect(service.publish("wf-1")).rejects.toThrow(BadRequestException);
    });

    it("rejects publishing an ARCHIVED workflow", async () => {
      const { service, workflow } = setup();
      workflow.findFirst.mockResolvedValue(draftWorkflow({ status: WorkflowStatus.ARCHIVED }));

      await expect(service.publish("wf-1")).rejects.toThrow(ConflictException);
    });

    it("deactivates sibling active workflows and publishes this one in a transaction", async () => {
      const { service, workflow } = setup();
      workflow.findFirst.mockResolvedValue(draftWorkflow());
      workflow.update.mockResolvedValue(draftWorkflow({ status: WorkflowStatus.PUBLISHED, isActive: true }));

      const result = await service.publish("wf-1");

      expect(workflow.updateMany).toHaveBeenCalledWith({
        where: { workspaceId: WORKSPACE_ID, slug: "order-support", isActive: true },
        data: { isActive: false },
      });
      expect(workflow.update).toHaveBeenCalledWith({
        where: { id: "wf-1" },
        data: { status: WorkflowStatus.PUBLISHED, isActive: true },
      });
      expect(result.isActive).toBe(true);
    });
  });

  describe("archive", () => {
    it("archives a workflow and clears isActive", async () => {
      const { service, workflow } = setup();
      workflow.findFirst.mockResolvedValue(draftWorkflow({ status: WorkflowStatus.PUBLISHED, isActive: true }));
      workflow.update.mockResolvedValue(draftWorkflow({ status: WorkflowStatus.ARCHIVED, isActive: false }));

      const result = await service.archive("wf-1");

      expect(workflow.update).toHaveBeenCalledWith({
        where: { id: "wf-1" },
        data: { status: WorkflowStatus.ARCHIVED, isActive: false },
      });
      expect(result.status).toBe(WorkflowStatus.ARCHIVED);
    });

    it("rejects archiving an already-archived workflow", async () => {
      const { service, workflow } = setup();
      workflow.findFirst.mockResolvedValue(draftWorkflow({ status: WorkflowStatus.ARCHIVED }));

      await expect(service.archive("wf-1")).rejects.toThrow(ConflictException);
    });
  });

  describe("createNewVersion", () => {
    it("clones nodes into a new DRAFT row with version = max(existing)+1", async () => {
      const { service, workflow } = setup();
      const source = draftWorkflow({ status: WorkflowStatus.PUBLISHED, isActive: true });
      workflow.findFirst
        .mockResolvedValueOnce(source) // getWorkflowById
        .mockResolvedValueOnce(draftWorkflow({ version: 3 })); // latest version lookup
      workflow.create.mockResolvedValue(draftWorkflow({ id: "wf-4", version: 4, status: WorkflowStatus.DRAFT }));

      const result = await service.createNewVersion("wf-1");

      expect(workflow.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          version: 4,
          status: WorkflowStatus.DRAFT,
          isActive: false,
          slug: "order-support",
          nodes: { create: [{ key: "start", type: WorkflowNodeType.END, config: {} }] },
        }),
        include: { nodes: true },
      });
      expect(result.version).toBe(4);
    });
  });

  describe("softDeleteWorkflow", () => {
    it("rejects deleting the active version", async () => {
      const { service, workflow } = setup();
      workflow.findFirst.mockResolvedValue(draftWorkflow({ isActive: true }));

      await expect(service.softDeleteWorkflow("wf-1")).rejects.toThrow(ConflictException);
    });

    it("soft-deletes an inactive workflow", async () => {
      const { service, workflow } = setup();
      workflow.findFirst.mockResolvedValue(draftWorkflow({ isActive: false }));
      workflow.update.mockResolvedValue(draftWorkflow({ deletedAt: new Date() }));

      await service.softDeleteWorkflow("wf-1");

      expect(workflow.update).toHaveBeenCalledWith({
        where: { id: "wf-1" },
        data: { deletedAt: expect.any(Date) },
      });
    });
  });

  describe("resolveActiveGraph", () => {
    it("prefers the agent-specific active published workflow", async () => {
      const { service, workflow } = setup();
      workflow.findFirst.mockResolvedValueOnce(
        draftWorkflow({ aiAgentId: "agent-1", entryNodeKey: "start" }),
      );

      const graph = await service.resolveActiveGraph(WORKSPACE_ID, "agent-1");

      expect(graph.entryNodeKey).toBe("start");
      expect(workflow.findFirst).toHaveBeenCalledWith({
        where: { workspaceId: WORKSPACE_ID, aiAgentId: "agent-1", isActive: true, deletedAt: null },
        include: { nodes: true },
      });
    });

    it("falls back to the workspace-wide default when no agent-specific workflow is active", async () => {
      const { service, workflow } = setup();
      workflow.findFirst
        .mockResolvedValueOnce(null) // agent-specific
        .mockResolvedValueOnce(draftWorkflow({ aiAgentId: null, entryNodeKey: "ws-start" }));

      const graph = await service.resolveActiveGraph(WORKSPACE_ID, "agent-1");

      expect(graph.entryNodeKey).toBe("ws-start");
    });

    it("falls back to DEFAULT_WORKFLOW_GRAPH when nothing is configured", async () => {
      const { service, workflow } = setup();
      workflow.findFirst.mockResolvedValue(null);

      const graph = await service.resolveActiveGraph(WORKSPACE_ID);

      expect(graph).toEqual(DEFAULT_WORKFLOW_GRAPH);
    });
  });
});
