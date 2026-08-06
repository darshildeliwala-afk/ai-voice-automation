import { NotFoundException } from "@nestjs/common";

import { AiAgentController } from "./ai-agent.controller";

const WORKSPACE_ID = "workspace-1";
const AGENT_ID = "agent-1";

function setup() {
  const aiAgentService = {
    getAiAgentById: jest.fn(),
    updateAiAgent: jest.fn(),
    softDeleteAiAgent: jest.fn(),
  };
  const voicePersonaConfigService = {
    getAgentOverride: jest.fn(),
    updateAgentOverride: jest.fn(),
  };
  const controller = new AiAgentController(
    aiAgentService as never,
    voicePersonaConfigService as never,
  );

  return { controller, aiAgentService, voicePersonaConfigService };
}

describe("AiAgentController tenant isolation (Sprint 21)", () => {
  it("findOne returns the agent when it belongs to the caller's workspace", async () => {
    const { controller, aiAgentService } = setup();
    aiAgentService.getAiAgentById.mockResolvedValue({ id: AGENT_ID, workspaceId: WORKSPACE_ID });

    const result = await controller.findOne(WORKSPACE_ID, AGENT_ID);

    expect(result).toMatchObject({ id: AGENT_ID });
  });

  it("findOne 404s when the agent belongs to a different workspace", async () => {
    const { controller, aiAgentService } = setup();
    aiAgentService.getAiAgentById.mockResolvedValue({ id: AGENT_ID, workspaceId: "other-workspace" });

    await expect(controller.findOne(WORKSPACE_ID, AGENT_ID)).rejects.toThrow(NotFoundException);
  });

  it("update 404s (and never calls updateAiAgent) for a cross-workspace agent", async () => {
    const { controller, aiAgentService } = setup();
    aiAgentService.getAiAgentById.mockResolvedValue({ id: AGENT_ID, workspaceId: "other-workspace" });

    await expect(
      controller.update(WORKSPACE_ID, AGENT_ID, { name: "Hijacked" }),
    ).rejects.toThrow(NotFoundException);
    expect(aiAgentService.updateAiAgent).not.toHaveBeenCalled();
  });

  it("remove 404s (and never calls softDeleteAiAgent) for a cross-workspace agent", async () => {
    const { controller, aiAgentService } = setup();
    aiAgentService.getAiAgentById.mockResolvedValue({ id: AGENT_ID, workspaceId: "other-workspace" });

    await expect(controller.remove(WORKSPACE_ID, AGENT_ID)).rejects.toThrow(NotFoundException);
    expect(aiAgentService.softDeleteAiAgent).not.toHaveBeenCalled();
  });

  it("getVoicePersonaOverride 404s for a cross-workspace agent", async () => {
    const { controller, aiAgentService, voicePersonaConfigService } = setup();
    aiAgentService.getAiAgentById.mockResolvedValue({ id: AGENT_ID, workspaceId: "other-workspace" });

    await expect(
      controller.getVoicePersonaOverride(WORKSPACE_ID, AGENT_ID),
    ).rejects.toThrow(NotFoundException);
    expect(voicePersonaConfigService.getAgentOverride).not.toHaveBeenCalled();
  });
});
