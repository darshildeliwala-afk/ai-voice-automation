import type { WorkspaceService } from "../workspace/workspace.service";
import { VoicePersonaConfigService } from "./voice-persona-config.service";

const BASE_CONFIG = {
  id: "persona-1",
  workspaceId: "workspace-1",
  tone: "FRIENDLY",
  language: "hi-en",
  voiceGender: null,
  voiceName: null,
  indianAccent: true,
  speakingRate: 1.0,
  pitch: 0.0,
  warmth: 0.5,
  professionalism: 0.5,
  pauseShortMs: 300,
  pauseMediumMs: 500,
  pauseLongMs: 700,
  fillerWordsEnabled: true,
  bargeInEnabled: true,
  maxResponseLength: 60,
  silenceThresholdMs: 2000,
  greetingStyle: null,
  closingStyle: null,
};

function setup() {
  const prisma = {
    voicePersonaConfig: {
      findUnique: jest.fn(),
      create: jest.fn(),
      upsert: jest.fn(),
    },
    aiAgentVoicePersonaOverride: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  };
  const workspaceService = {
    getWorkspaceById: jest.fn().mockResolvedValue({ id: "workspace-1" }),
  };

  const service = new VoicePersonaConfigService(
    prisma as never,
    workspaceService as unknown as WorkspaceService,
  );

  return { service, prisma, workspaceService };
}

describe("VoicePersonaConfigService", () => {
  it("getWorkspaceConfig returns the existing row when present", async () => {
    const { service, prisma } = setup();
    prisma.voicePersonaConfig.findUnique.mockResolvedValue(BASE_CONFIG);

    const result = await service.getWorkspaceConfig("workspace-1");

    expect(result).toBe(BASE_CONFIG);
    expect(prisma.voicePersonaConfig.create).not.toHaveBeenCalled();
  });

  it("getWorkspaceConfig auto-provisions defaults on first access", async () => {
    const { service, prisma } = setup();
    prisma.voicePersonaConfig.findUnique.mockResolvedValue(null);
    prisma.voicePersonaConfig.create.mockResolvedValue(BASE_CONFIG);

    const result = await service.getWorkspaceConfig("workspace-1");

    expect(prisma.voicePersonaConfig.create).toHaveBeenCalledWith({
      data: { workspaceId: "workspace-1" },
    });
    expect(result).toBe(BASE_CONFIG);
  });

  it("updateWorkspaceConfig validates workspace and upserts", async () => {
    const { service, prisma, workspaceService } = setup();
    const updated = { ...BASE_CONFIG, tone: "BANKING" };
    prisma.voicePersonaConfig.upsert.mockResolvedValue(updated);

    const result = await service.updateWorkspaceConfig("workspace-1", {
      tone: "BANKING" as never,
    });

    expect(workspaceService.getWorkspaceById).toHaveBeenCalledWith(
      "workspace-1",
    );
    expect(prisma.voicePersonaConfig.upsert).toHaveBeenCalledWith({
      where: { workspaceId: "workspace-1" },
      create: { workspaceId: "workspace-1", tone: "BANKING" },
      update: { tone: "BANKING" },
    });
    expect(result).toBe(updated);
  });

  it("getAgentOverride returns null when the agent has never customized anything", async () => {
    const { service, prisma } = setup();
    prisma.aiAgentVoicePersonaOverride.findUnique.mockResolvedValue(null);

    const result = await service.getAgentOverride("agent-1");

    expect(result).toBeNull();
  });

  describe("resolveEffectiveConfig", () => {
    it("returns the workspace row's values when no aiAgentId is given", async () => {
      const { service, prisma } = setup();
      prisma.voicePersonaConfig.findUnique.mockResolvedValue(BASE_CONFIG);

      const result = await service.resolveEffectiveConfig("workspace-1");

      expect(result.tone).toBe("FRIENDLY");
      expect(result.language).toBe("hi-en");
      expect(result.speakingRate).toBe(1.0);
      expect(prisma.aiAgentVoicePersonaOverride.findUnique).not.toHaveBeenCalled();
    });

    it("returns the workspace row's values when the agent has no override row", async () => {
      const { service, prisma } = setup();
      prisma.voicePersonaConfig.findUnique.mockResolvedValue(BASE_CONFIG);
      prisma.aiAgentVoicePersonaOverride.findUnique.mockResolvedValue(null);

      const result = await service.resolveEffectiveConfig(
        "workspace-1",
        "agent-1",
      );

      expect(result.tone).toBe("FRIENDLY");
      expect(result.warmth).toBe(0.5);
    });

    it("merges field-by-field -- an override setting only tone leaves every other field inherited from the workspace default", async () => {
      const { service, prisma } = setup();
      prisma.voicePersonaConfig.findUnique.mockResolvedValue(BASE_CONFIG);
      prisma.aiAgentVoicePersonaOverride.findUnique.mockResolvedValue({
        id: "override-1",
        aiAgentId: "agent-1",
        tone: "BANKING",
        language: null,
        voiceGender: null,
        voiceName: null,
        indianAccent: null,
        speakingRate: null,
        pitch: null,
        warmth: null,
        professionalism: null,
        pauseShortMs: null,
        pauseMediumMs: null,
        pauseLongMs: null,
        fillerWordsEnabled: null,
        bargeInEnabled: null,
        maxResponseLength: null,
        silenceThresholdMs: null,
        greetingStyle: null,
        closingStyle: null,
      });

      const result = await service.resolveEffectiveConfig(
        "workspace-1",
        "agent-1",
      );

      expect(result.tone).toBe("BANKING");
      expect(result.language).toBe("hi-en");
      expect(result.speakingRate).toBe(1.0);
      expect(result.pauseShortMs).toBe(300);
      expect(result.fillerWordsEnabled).toBe(true);
    });

    it("prefers every override field that is explicitly set over the workspace default", async () => {
      const { service, prisma } = setup();
      prisma.voicePersonaConfig.findUnique.mockResolvedValue(BASE_CONFIG);
      prisma.aiAgentVoicePersonaOverride.findUnique.mockResolvedValue({
        id: "override-1",
        aiAgentId: "agent-1",
        tone: "SALES",
        language: "en",
        voiceGender: "FEMALE",
        voiceName: "custom-voice",
        indianAccent: false,
        speakingRate: 1.2,
        pitch: 0.3,
        warmth: 0.9,
        professionalism: 0.1,
        pauseShortMs: 100,
        pauseMediumMs: 200,
        pauseLongMs: 300,
        fillerWordsEnabled: false,
        bargeInEnabled: false,
        maxResponseLength: 30,
        silenceThresholdMs: 1000,
        greetingStyle: "energetic",
        closingStyle: "brief",
      });

      const result = await service.resolveEffectiveConfig(
        "workspace-1",
        "agent-1",
      );

      expect(result).toEqual({
        tone: "SALES",
        language: "en",
        voiceGender: "FEMALE",
        voiceName: "custom-voice",
        indianAccent: false,
        speakingRate: 1.2,
        pitch: 0.3,
        warmth: 0.9,
        professionalism: 0.1,
        pauseShortMs: 100,
        pauseMediumMs: 200,
        pauseLongMs: 300,
        fillerWordsEnabled: false,
        bargeInEnabled: false,
        maxResponseLength: 30,
        silenceThresholdMs: 1000,
        greetingStyle: "energetic",
        closingStyle: "brief",
      });
    });
  });
});
