import { EncryptionService } from "../common/encryption/encryption.service";
import { MASKED_SECRET_VALUE } from "../common/masking/mask.util";
import type { WorkspaceService } from "../workspace/workspace.service";
import { TelephonyConfigService } from "./telephony-config.service";

function setup() {
  process.env.APP_ENCRYPTION_KEY = "test-encryption-key-do-not-use-in-prod";
  const encryptionService = new EncryptionService();

  const telephonyConfig = {
    findFirst: jest.fn(),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    create: jest.fn(),
  };
  const prisma = {
    telephonyConfig,
    $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
      callback({ telephonyConfig }),
    ),
  };
  const workspaceService = {
    getWorkspaceById: jest.fn().mockResolvedValue({ id: "workspace-1" }),
  };

  const service = new TelephonyConfigService(
    prisma as never,
    workspaceService as unknown as WorkspaceService,
    encryptionService,
  );

  return { service, prisma, workspaceService, encryptionService };
}

describe("TelephonyConfigService", () => {
  it("getActiveConfig returns null when no active config exists", async () => {
    const { service, prisma } = setup();
    prisma.telephonyConfig.findFirst.mockResolvedValue(null);

    const result = await service.getActiveConfig("workspace-1");

    expect(result).toBeNull();
  });

  it("getActiveConfig masks the authToken", async () => {
    const { service, prisma, encryptionService } = setup();
    prisma.telephonyConfig.findFirst.mockResolvedValue({
      id: "cfg-1",
      workspaceId: "workspace-1",
      provider: "TWILIO",
      authToken: encryptionService.encrypt("real-token"),
      isActive: true,
    });

    const result = await service.getActiveConfig("workspace-1");

    expect(result?.authToken).toBe(MASKED_SECRET_VALUE);
    expect(result?.authToken).not.toContain("real-token");
  });

  it("upsertConfig encrypts the authToken before persisting", async () => {
    const { service, prisma, encryptionService } = setup();
    prisma.telephonyConfig.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: "cfg-1", ...data }),
    );

    await service.upsertConfig("workspace-1", {
      provider: "TWILIO" as never,
      authId: "AC123",
      authToken: "plain-secret-token",
    });

    const persisted = prisma.telephonyConfig.create.mock.calls[0][0].data;
    expect(persisted.authToken).not.toBe("plain-secret-token");
    expect(encryptionService.decrypt(persisted.authToken)).toBe(
      "plain-secret-token",
    );
  });

  it("upsertConfig never returns the plaintext or encrypted authToken", async () => {
    const { service, prisma } = setup();
    prisma.telephonyConfig.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: "cfg-1", ...data }),
    );

    const result = await service.upsertConfig("workspace-1", {
      provider: "TWILIO" as never,
      authToken: "plain-secret-token",
    });

    expect(result.authToken).toBe(MASKED_SECRET_VALUE);
    expect(JSON.stringify(result)).not.toContain("plain-secret-token");
  });

  it("upsertConfig deactivates any previously active config when activating a new one", async () => {
    const { service, prisma } = setup();
    prisma.telephonyConfig.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: "cfg-2", ...data }),
    );

    await service.upsertConfig("workspace-1", {
      provider: "EXOTEL" as never,
      authToken: "new-token",
    });

    expect(prisma.telephonyConfig.updateMany).toHaveBeenCalledWith({
      where: { workspaceId: "workspace-1", isActive: true },
      data: { isActive: false },
    });
  });

  it("upsertConfig skips deactivating siblings when isActive is explicitly false", async () => {
    const { service, prisma } = setup();
    prisma.telephonyConfig.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: "cfg-3", ...data }),
    );

    await service.upsertConfig("workspace-1", {
      provider: "EXOTEL" as never,
      authToken: "inactive-token",
      isActive: false,
    });

    expect(prisma.telephonyConfig.updateMany).not.toHaveBeenCalled();
  });

  it("getDecryptedAuthToken returns the real plaintext for internal use only", async () => {
    const { service, prisma, encryptionService } = setup();
    prisma.telephonyConfig.findFirst.mockResolvedValue({
      id: "cfg-1",
      authToken: encryptionService.encrypt("internal-only-secret"),
    });

    const token = await service.getDecryptedAuthToken("workspace-1");

    expect(token).toBe("internal-only-secret");
  });
});
