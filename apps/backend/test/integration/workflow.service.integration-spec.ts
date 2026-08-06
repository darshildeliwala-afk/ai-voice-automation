import { randomUUID } from "node:crypto";

import { AiAgentService } from "../../src/ai-agent/ai-agent.service";
import { PrismaService } from "../../src/common/prisma/prisma.service";
import { WorkflowNodeType } from "../../src/generated/prisma/client";
import { DEFAULT_WORKFLOW_GRAPH } from "../../src/workflow/workflow.types";
import { WorkflowService } from "../../src/workflow/workflow.service";
import { buildConversationEngineTestChain } from "./helpers/build-conversation-engine";

describe("WorkflowService (integration, real Postgres)", () => {
  let prisma: PrismaService;
  let workflowService: WorkflowService;
  let aiAgentService: AiAgentService;
  let workspaceId: string;
  let aiAgentId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const chain = buildConversationEngineTestChain(prisma);
    workflowService = chain.workflowService;
    aiAgentService = chain.aiAgentService;

    workspaceId = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO "Workspace" (id, name, slug, "createdAt", "updatedAt")
      VALUES (${workspaceId}::uuid, 'Workflow Service IT Workspace', ${`wf-svc-it-${Date.now()}`}, now(), now())
    `;

    const agent = await aiAgentService.createAiAgent({
      workspaceId,
      name: "IT Workflow Agent",
      provider: "openai",
      model: "gpt-4o-mini",
      voice: "alloy",
      language: "en",
    } as never);
    aiAgentId = agent.id;
  });

  afterAll(async () => {
    await prisma.workflowNode.deleteMany({ where: { workflow: { workspaceId } } });
    await prisma.workflow.deleteMany({ where: { workspaceId } });
    await prisma.aiAgent.deleteMany({ where: { workspaceId } });
    await prisma.customer.deleteMany({ where: { workspaceId } });
    await prisma.$executeRaw`DELETE FROM "Workspace" WHERE id = ${workspaceId}::uuid`;
    await prisma.$disconnect();
  });

  it("never lets a workflow be read or mutated through another workspace's id (Sprint 21 tenant isolation)", async () => {
    const workflow = await workflowService.createWorkflow(workspaceId, {
      slug: `tenant-isolation-flow-${randomUUID()}`,
      name: "Tenant isolation flow",
      entryNodeKey: "end",
      nodes: [{ key: "end", type: WorkflowNodeType.END, config: {} }],
    });

    const otherWorkspaceId = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO "Workspace" (id, name, slug, "createdAt", "updatedAt")
      VALUES (${otherWorkspaceId}::uuid, 'Other Workflow IT Workspace', ${`wf-svc-it-other-${Date.now()}`}, now(), now())
    `;

    await expect(
      workflowService.getWorkflowById(otherWorkspaceId, workflow.id),
    ).rejects.toThrow();
    await expect(
      workflowService.updateWorkflow(otherWorkspaceId, workflow.id, { name: "Hijacked" }),
    ).rejects.toThrow();
    await expect(
      workflowService.publish(otherWorkspaceId, workflow.id),
    ).rejects.toThrow();
    await expect(
      workflowService.softDeleteWorkflow(otherWorkspaceId, workflow.id),
    ).rejects.toThrow();

    // Still fully accessible from its own workspace.
    const reloaded = await workflowService.getWorkflowById(workspaceId, workflow.id);
    expect(reloaded.id).toBe(workflow.id);

    await prisma.$executeRaw`DELETE FROM "Workspace" WHERE id = ${otherWorkspaceId}::uuid`;
  });

  it("creates a workflow with nested nodes and reads it back", async () => {
    const workflow = await workflowService.createWorkflow(workspaceId, {
      slug: `crud-flow-${randomUUID()}`,
      name: "CRUD flow",
      entryNodeKey: "end",
      nodes: [{ key: "end", type: WorkflowNodeType.END, config: {} }],
    });

    expect(workflow.version).toBe(1);
    expect(workflow.status).toBe("DRAFT");
    expect(workflow.nodes).toHaveLength(1);

    const reloaded = await workflowService.getWorkflowById(workspaceId, workflow.id);
    expect(reloaded.nodes[0]).toMatchObject({ key: "end", type: "END" });
  });

  it("rejects creating a second workflow with the same slug in the same workspace", async () => {
    const slug = `dup-flow-${randomUUID()}`;
    await workflowService.createWorkflow(workspaceId, { slug, name: "First" });

    await expect(
      workflowService.createWorkflow(workspaceId, { slug, name: "Second" }),
    ).rejects.toThrow();
  });

  it("supports incremental node CRUD on a DRAFT workflow", async () => {
    const workflow = await workflowService.createWorkflow(workspaceId, {
      slug: `node-crud-flow-${randomUUID()}`,
      name: "Node CRUD flow",
    });

    const node = await workflowService.addNode(workspaceId, workflow.id, {
      key: "end",
      type: WorkflowNodeType.END,
      config: { reason: "initial" },
    });

    const updated = await workflowService.updateNode(workspaceId, workflow.id, node.id, {
      config: { reason: "updated" },
    });
    expect(updated.config).toEqual({ reason: "updated" });

    await workflowService.removeNode(workspaceId, workflow.id, node.id);
    const reloaded = await workflowService.getWorkflowById(workspaceId, workflow.id);
    expect(reloaded.nodes).toHaveLength(0);
  });

  it("rejects publishing a workflow that references an unknown tool", async () => {
    const workflow = await workflowService.createWorkflow(workspaceId, {
      slug: `bad-tool-flow-${randomUUID()}`,
      name: "Bad tool flow",
      entryNodeKey: "t",
      nodes: [{ key: "t", type: WorkflowNodeType.TOOL, config: { toolName: "not_a_real_tool" } }],
    });

    await expect(workflowService.publish(workspaceId, workflow.id)).rejects.toThrow();
  });

  it("publishing a new version deactivates the previously active version (real DB transaction)", async () => {
    const slug = `real-versioning-flow-${randomUUID()}`;
    const v1 = await workflowService.createWorkflow(workspaceId, {
      slug,
      name: "Versioned",
      entryNodeKey: "end",
      nodes: [{ key: "end", type: WorkflowNodeType.END, config: {} }],
    });
    const publishedV1 = await workflowService.publish(workspaceId, v1.id);
    expect(publishedV1.isActive).toBe(true);

    const v2 = await workflowService.createNewVersion(workspaceId, v1.id);
    expect(v2.version).toBe(2);
    expect(v2.nodes).toHaveLength(1);
    await workflowService.publish(workspaceId, v2.id);

    const v1Reloaded = await workflowService.getWorkflowById(workspaceId, v1.id);
    const v2Reloaded = await workflowService.getWorkflowById(workspaceId, v2.id);
    expect(v1Reloaded.isActive).toBe(false);
    expect(v1Reloaded.status).toBe("PUBLISHED");
    expect(v2Reloaded.isActive).toBe(true);

    const versions = await workflowService.listVersions(workspaceId, slug);
    expect(versions.map((v) => v.version)).toEqual([2, 1]);
  });

  it("archive clears isActive without deleting the row", async () => {
    const workflow = await workflowService.createWorkflow(workspaceId, {
      slug: `archive-flow-${randomUUID()}`,
      name: "Archive flow",
      entryNodeKey: "end",
      nodes: [{ key: "end", type: WorkflowNodeType.END, config: {} }],
    });
    await workflowService.publish(workspaceId, workflow.id);

    const archived = await workflowService.archive(workspaceId, workflow.id);
    expect(archived.status).toBe("ARCHIVED");
    expect(archived.isActive).toBe(false);
  });

  it("blocks deleting the active version, allows deleting an inactive one", async () => {
    const workflow = await workflowService.createWorkflow(workspaceId, {
      slug: `delete-flow-${randomUUID()}`,
      name: "Delete flow",
      entryNodeKey: "end",
      nodes: [{ key: "end", type: WorkflowNodeType.END, config: {} }],
    });
    await workflowService.publish(workspaceId, workflow.id);

    await expect(workflowService.softDeleteWorkflow(workspaceId, workflow.id)).rejects.toThrow();

    await workflowService.archive(workspaceId, workflow.id);
    await workflowService.softDeleteWorkflow(workspaceId, workflow.id);

    await expect(workflowService.getWorkflowById(workspaceId, workflow.id)).rejects.toThrow();
  });

  it("listWorkflows returns only the latest version per slug", async () => {
    const slug = `list-latest-flow-${randomUUID()}`;
    const v1 = await workflowService.createWorkflow(workspaceId, {
      slug,
      name: "List latest",
      entryNodeKey: "end",
      nodes: [{ key: "end", type: WorkflowNodeType.END, config: {} }],
    });
    await workflowService.publish(workspaceId, v1.id);
    const v2 = await workflowService.createNewVersion(workspaceId, v1.id);

    const result = await workflowService.listWorkflows(workspaceId, { page: 1, limit: 100 });
    const matching = result.data.filter((w) => w.slug === slug);
    expect(matching).toHaveLength(1);
    expect(matching[0].id).toBe(v2.id);

    // v1 is still PUBLISHED+isActive (never superseded, since v2 was never
    // published) -- archive it so it doesn't leak into later
    // resolveActiveGraph fallback tests as a workspace-default workflow.
    await workflowService.archive(workspaceId, v1.id);
  });

  describe("resolveActiveGraph", () => {
    // A workspace-default (aiAgentId: null) workflow, once PUBLISHED, has
    // no natural sibling to deactivate it -- so this describe block runs
    // against its own dedicated workspace, fully isolated from the CRUD/
    // versioning tests above and from other tests in this block.
    let resolveWorkspaceId: string;

    beforeAll(async () => {
      resolveWorkspaceId = randomUUID();
      await prisma.$executeRaw`
        INSERT INTO "Workspace" (id, name, slug, "createdAt", "updatedAt")
        VALUES (${resolveWorkspaceId}::uuid, 'Resolve Graph IT Workspace', ${`wf-resolve-it-${Date.now()}`}, now(), now())
      `;
    });

    afterAll(async () => {
      await prisma.workflowNode.deleteMany({ where: { workflow: { workspaceId: resolveWorkspaceId } } });
      await prisma.workflow.deleteMany({ where: { workspaceId: resolveWorkspaceId } });
      await prisma.aiAgent.deleteMany({ where: { workspaceId: resolveWorkspaceId } });
      await prisma.$executeRaw`DELETE FROM "Workspace" WHERE id = ${resolveWorkspaceId}::uuid`;
    });

    it("falls back to DEFAULT_WORKFLOW_GRAPH when nothing is configured for a fresh agent", async () => {
      const freshAgent = await aiAgentService.createAiAgent({
        workspaceId: resolveWorkspaceId,
        name: `Fresh Agent ${randomUUID()}`,
        provider: "openai",
        model: "gpt-4o-mini",
        voice: "alloy",
        language: "en",
      } as never);

      const graph = await workflowService.resolveActiveGraph(resolveWorkspaceId, freshAgent.id);
      expect(graph).toEqual(DEFAULT_WORKFLOW_GRAPH);
    });

    it("prefers the agent-specific active published workflow over the workspace default", async () => {
      const agent = await aiAgentService.createAiAgent({
        workspaceId: resolveWorkspaceId,
        name: `Prefer Agent-Specific Agent ${randomUUID()}`,
        provider: "openai",
        model: "gpt-4o-mini",
        voice: "alloy",
        language: "en",
      } as never);

      const workspaceDefault = await workflowService.createWorkflow(resolveWorkspaceId, {
        slug: `ws-default-flow-${randomUUID()}`,
        name: "Workspace default",
        entryNodeKey: "ws-end",
        nodes: [{ key: "ws-end", type: WorkflowNodeType.END, config: {} }],
      });
      await workflowService.publish(resolveWorkspaceId, workspaceDefault.id);

      const agentFlow = await workflowService.createWorkflow(resolveWorkspaceId, {
        aiAgentId: agent.id,
        slug: `agent-flow-${randomUUID()}`,
        name: "Agent flow",
        entryNodeKey: "agent-end",
        nodes: [{ key: "agent-end", type: WorkflowNodeType.END, config: {} }],
      });
      await workflowService.publish(resolveWorkspaceId, agentFlow.id);

      const graph = await workflowService.resolveActiveGraph(resolveWorkspaceId, agent.id);
      expect(graph.entryNodeKey).toBe("agent-end");

      await workflowService.archive(resolveWorkspaceId, workspaceDefault.id);
    });

    it("falls back to the workspace default when the agent has no workflow of its own", async () => {
      const otherAgent = await aiAgentService.createAiAgent({
        workspaceId: resolveWorkspaceId,
        name: `Other Agent ${randomUUID()}`,
        provider: "openai",
        model: "gpt-4o-mini",
        voice: "alloy",
        language: "en",
      } as never);

      const workspaceDefault = await workflowService.createWorkflow(resolveWorkspaceId, {
        slug: `ws-default-flow-2-${randomUUID()}`,
        name: "Workspace default 2",
        entryNodeKey: "ws2-end",
        nodes: [{ key: "ws2-end", type: WorkflowNodeType.END, config: {} }],
      });
      await workflowService.publish(resolveWorkspaceId, workspaceDefault.id);

      const graph = await workflowService.resolveActiveGraph(resolveWorkspaceId, otherAgent.id);
      expect(graph.entryNodeKey).toBe("ws2-end");
    });
  });
});
