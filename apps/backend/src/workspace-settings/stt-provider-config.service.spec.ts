import { EncryptionService } from "../common/encryption/encryption.service";
import { MASKED_SECRET_VALUE } from "../common/masking/mask.util";
import type { WorkspaceService } from "../workspace/workspace.service";
import { SttProviderConfigService } from "./stt-provider-config.service";

function setup() {
  process.env.APP_ENCRYPTION_KEY = "test-encryption-key-do-not-use-in-prod";
  const encryptionService = new EncryptionService();

  const sttProviderConfig = {
    findFirst: jest.fn(),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    create: jest.fn(),
  };
  const prisma = {
    sttProviderConfig,
    $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
      callback({ sttProviderConfig }),
    ),
  };
  const workspaceService = {
    getWorkspaceById: jest.fn().mockResolvedValue({ id: "workspace-1" }),
  };

  const service = new SttProviderConfigService(
    prisma as never,
    workspaceService as unknown as WorkspaceService,
    encryptionService,
  );

  return { service, prisma, workspaceService, encryptionService };
}

describe("SttProviderConfigService", () => {
  it("getActiveConfig returns null when no active config exists", async () => {
    const { service, prisma } = setup();
    prisma.sttProviderConfig.findFirst.mockResolvedValue(null);

    const result = await service.getActiveConfig("workspace-1");

    expect(result).toBeNull();
  });

  it("getActiveConfig masks the apiKey", async () => {
    const { service, prisma, encryptionService } = setup();
    prisma.sttProviderConfig.findFirst.mockResolvedValue({
      id: "cfg-1",
      workspaceId: "workspace-1",
      provider: "DEEPGRAM",
      apiKey: encryptionService.encrypt("dg-real-key"),
      isActive: true,
    });

    const result = await service.getActiveConfig("workspace-1");

    expect(result?.apiKey).toBe(MASKED_SECRET_VALUE);
    expect(result?.apiKey).not.toContain("dg-real-key");
  });

  it("upsertConfig encrypts the apiKey before persisting", async () => {
    const { service, prisma, encryptionService } = setup();
    prisma.sttProviderConfig.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: "cfg-1", ...data }),
    );

    await service.upsertConfig("workspace-1", {
      provider: "DEEPGRAM" as never,
      apiKey: "dg-plain-key",
    });

    const persisted = prisma.sttProviderConfig.create.mock.calls[0][0].data;
    expect(persisted.apiKey).not.toBe("dg-plain-key");
    expect(encryptionService.decrypt(persisted.apiKey)).toBe("dg-plain-key");
  });

  it("upsertConfig never returns the plaintext or encrypted apiKey", async () => {
    const { service, prisma } = setup();
    prisma.sttProviderConfig.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: "cfg-1", ...data }),
    );

    const result = await service.upsertConfig("workspace-1", {
      provider: "DEEPGRAM" as never,
      apiKey: "dg-plain-key",
    });

    expect(result.apiKey).toBe(MASKED_SECRET_VALUE);
    expect(JSON.stringify(result)).not.toContain("dg-plain-key");
  });

  it("upsertConfig deactivates any previously active config when activating a new one", async () => {
    const { service, prisma } = setup();
    prisma.sttProviderConfig.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: "cfg-2", ...data }),
    );

    await service.upsertConfig("workspace-1", {
      provider: "WHISPER" as never,
      apiKey: "wh-new-key",
    });

    expect(prisma.sttProviderConfig.updateMany).toHaveBeenCalledWith({
      where: { workspaceId: "workspace-1", isActive: true },
      data: { isActive: false },
    });
  });

  it("getDecryptedApiKey returns the real plaintext for internal use only", async () => {
    const { service, prisma, encryptionService } = setup();
    prisma.sttProviderConfig.findFirst.mockResolvedValue({
      id: "cfg-1",
      apiKey: encryptionService.encrypt("internal-only-key"),
    });

    const key = await service.getDecryptedApiKey("workspace-1");

    expect(key).toBe("internal-only-key");
  });
});
