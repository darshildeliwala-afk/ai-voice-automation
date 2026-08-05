import { ConflictException } from "@nestjs/common";

import { AiAgentService } from "./ai-agent.service";

const WORKSPACE_ID = "workspace-1";

function setup() {
  const aiAgent = {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  };
  const prisma = { aiAgent };
  const workspaceService = {
    getWorkspaceById: jest.fn().mockResolvedValue({ id: WORKSPACE_ID }),
  };

  const service = new AiAgentService(prisma as never, workspaceService as never);

  return { service, prisma, aiAgent, workspaceService };
}

describe("AiAgentService", () => {
  describe("createAiAgent", () => {
    it("passes description/knowledgeBaseId/status/maxTokens/businessGoal through to the create call (Sprint 20)", async () => {
      const { service, aiAgent } = setup();
      aiAgent.findFirst.mockResolvedValue(null); // no active-name conflict
      aiAgent.create.mockResolvedValue({ id: "agent-1" });

      const dto = {
        workspaceId: WORKSPACE_ID,
        name: "Support Bot",
        description: "Handles support calls",
        knowledgeBaseId: "kb-1",
        provider: "OPENAI",
        model: "gpt-4o-mini",
        voice: "voice-a",
        language: "hi-en",
        status: "PAUSED" as never,
        maxTokens: 500,
        businessGoal: "Reduce support ticket volume",
      };

      await service.createAiAgent(dto);

      expect(aiAgent.create).toHaveBeenCalledWith({ data: dto });
    });
  });

  describe("getAiAgentById", () => {
    it("includes the voice persona override and non-deleted workflows, active+newest first", async () => {
      const { service, aiAgent } = setup();
      aiAgent.findFirst.mockResolvedValue({
        id: "agent-1",
        workspaceId: WORKSPACE_ID,
        voicePersonaOverride: { tone: "BANKING" },
        workflows: [{ id: "wf-1", isActive: true, version: 2 }],
      });

      const result = await service.getAiAgentById("agent-1");

      expect(aiAgent.findFirst).toHaveBeenCalledWith({
        where: { id: "agent-1", deletedAt: null },
        include: {
          voicePersonaOverride: true,
          workflows: {
            where: { deletedAt: null },
            orderBy: [{ isActive: "desc" }, { version: "desc" }],
          },
        },
      });
      expect(result.voicePersonaOverride).toEqual({ tone: "BANKING" });
      expect(result.workflows).toHaveLength(1);
    });

    it("throws NotFoundException when missing", async () => {
      const { service, aiAgent } = setup();
      aiAgent.findFirst.mockResolvedValue(null);

      await expect(service.getAiAgentById("missing")).rejects.toThrow();
    });
  });

  describe("updateAiAgent", () => {
    it("updates the new status/maxTokens/businessGoal fields", async () => {
      const { service, aiAgent } = setup();
      aiAgent.findFirst
        .mockResolvedValueOnce({
          id: "agent-1",
          workspaceId: WORKSPACE_ID,
          name: "Support Bot",
          isActive: true,
        }) // getAiAgentById
        .mockResolvedValueOnce(null); // assertNameNotTakenByActiveAgent: no conflict
      aiAgent.update.mockResolvedValue({
        id: "agent-1",
        status: "ARCHIVED",
        maxTokens: 1000,
      });

      const result = await service.updateAiAgent("agent-1", {
        status: "ARCHIVED" as never,
        maxTokens: 1000,
      });

      expect(aiAgent.update).toHaveBeenCalledWith({
        where: { id: "agent-1" },
        data: { status: "ARCHIVED", maxTokens: 1000 },
      });
      expect(result.status).toBe("ARCHIVED");
    });

    it("still enforces the isActive-scoped name-uniqueness check, unaffected by the new status field", async () => {
      const { service, aiAgent } = setup();
      aiAgent.findFirst
        .mockResolvedValueOnce({
          id: "agent-1",
          workspaceId: WORKSPACE_ID,
          name: "Support Bot",
          isActive: true,
        }) // getAiAgentById
        .mockResolvedValueOnce({ id: "other-agent" }); // assertNameNotTakenByActiveAgent conflict

      await expect(
        service.updateAiAgent("agent-1", {
          name: "Support Bot",
          status: "PAUSED" as never,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });
});
