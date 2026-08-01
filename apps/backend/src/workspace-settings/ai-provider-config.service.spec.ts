import { EncryptionService } from "../common/encryption/encryption.service";
import { MASKED_SECRET_VALUE } from "../common/masking/mask.util";
import type { WorkspaceService } from "../workspace/workspace.service";
import { AiProviderConfigService } from "./ai-provider-config.service";

function setup() {
  process.env.APP_ENCRYPTION_KEY = "test-encryption-key-do-not-use-in-prod";
  const encryptionService = new EncryptionService();

  const aiProviderConfig = {
    findFirst: jest.fn(),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    create: jest.fn(),
  };
  const prisma = {
    aiProviderConfig,
    $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
      callback({ aiProviderConfig }),
    ),
  };
  const workspaceService = {
    getWorkspaceById: jest.fn().mockResolvedValue({ id: "workspace-1" }),
  };

  const service = new AiProviderConfigService(
    prisma as never,
    workspaceService as unknown as WorkspaceService,
    encryptionService,
  );

  return { service, prisma, workspaceService, encryptionService };
}

describe("AiProviderConfigService", () => {
  it("getActiveConfig returns null when no active config exists", async () => {
    const { service, prisma } = setup();
    prisma.aiProviderConfig.findFirst.mockResolvedValue(null);

    const result = await service.getActiveConfig("workspace-1");

    expect(result).toBeNull();
  });

  it("getActiveConfig masks the apiKey", async () => {
    const { service, prisma, encryptionService } = setup();
    prisma.aiProviderConfig.findFirst.mockResolvedValue({
      id: "cfg-1",
      workspaceId: "workspace-1",
      provider: "OPENAI",
      apiKey: encryptionService.encrypt("sk-real-key"),
      isActive: true,
    });

    const result = await service.getActiveConfig("workspace-1");

    expect(result?.apiKey).toBe(MASKED_SECRET_VALUE);
    expect(result?.apiKey).not.toContain("sk-real-key");
  });

  it("upsertConfig encrypts the apiKey before persisting", async () => {
    const { service, prisma, encryptionService } = setup();
    prisma.aiProviderConfig.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: "cfg-1", ...data }),
    );

    await service.upsertConfig("workspace-1", {
      provider: "OPENAI" as never,
      apiKey: "sk-plain-key",
      temperature: 0.5,
    });

    const persisted = prisma.aiProviderConfig.create.mock.calls[0][0].data;
    expect(persisted.apiKey).not.toBe("sk-plain-key");
    expect(encryptionService.decrypt(persisted.apiKey)).toBe("sk-plain-key");
  });

  it("upsertConfig never returns the plaintext or encrypted apiKey", async () => {
    const { service, prisma } = setup();
    prisma.aiProviderConfig.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: "cfg-1", ...data }),
    );

    const result = await service.upsertConfig("workspace-1", {
      provider: "OPENAI" as never,
      apiKey: "sk-plain-key",
    });

    expect(result.apiKey).toBe(MASKED_SECRET_VALUE);
    expect(JSON.stringify(result)).not.toContain("sk-plain-key");
  });

  it("upsertConfig deactivates any previously active config when activating a new one", async () => {
    const { service, prisma } = setup();
    prisma.aiProviderConfig.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: "cfg-2", ...data }),
    );

    await service.upsertConfig("workspace-1", {
      provider: "ANTHROPIC" as never,
      apiKey: "sk-new-key",
    });

    expect(prisma.aiProviderConfig.updateMany).toHaveBeenCalledWith({
      where: { workspaceId: "workspace-1", isActive: true },
      data: { isActive: false },
    });
  });

  it("getDecryptedApiKey returns the real plaintext for internal use only", async () => {
    const { service, prisma, encryptionService } = setup();
    prisma.aiProviderConfig.findFirst.mockResolvedValue({
      id: "cfg-1",
      apiKey: encryptionService.encrypt("internal-only-key"),
    });

    const key = await service.getDecryptedApiKey("workspace-1");

    expect(key).toBe("internal-only-key");
  });
});
