import { randomUUID } from "node:crypto";

import { EncryptionService } from "../../src/common/encryption/encryption.service";
import { MASKED_SECRET_VALUE } from "../../src/common/masking/mask.util";
import { PrismaService } from "../../src/common/prisma/prisma.service";
import { WorkspaceService } from "../../src/workspace/workspace.service";
import { TelephonyConfigService } from "../../src/workspace-settings/telephony-config.service";

describe("TelephonyConfigService (integration, real Postgres)", () => {
  let prisma: PrismaService;
  let workspaceService: WorkspaceService;
  let encryptionService: EncryptionService;
  let service: TelephonyConfigService;
  let workspaceId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    workspaceService = new WorkspaceService(prisma);
    encryptionService = new EncryptionService();
    service = new TelephonyConfigService(
      prisma,
      workspaceService,
      encryptionService,
    );

    workspaceId = randomUUID();
    const slug = `telephony-it-${Date.now()}`;
    await prisma.$executeRaw`
      INSERT INTO "Workspace" (id, name, slug, "createdAt", "updatedAt")
      VALUES (${workspaceId}::uuid, 'Telephony IT Workspace', ${slug}, now(), now())
    `;
  });

  afterAll(async () => {
    await prisma.telephonyConfig.deleteMany({ where: { workspaceId } });
    await prisma.$executeRaw`DELETE FROM "Workspace" WHERE id = ${workspaceId}::uuid`;
    await prisma.$disconnect();
  });

  it("getActiveConfig() returns null when none exists", async () => {
    const result = await service.getActiveConfig(workspaceId);
    expect(result).toBeNull();
  });

  it("upsertConfig() stores the authToken encrypted at rest and returns it masked", async () => {
    const result = await service.upsertConfig(workspaceId, {
      provider: "TWILIO" as never,
      authId: "AC_real_id",
      authToken: "super-secret-plaintext-token",
      phoneNumber: "+14155552671",
    });

    expect(result.authToken).toBe(MASKED_SECRET_VALUE);

    const raw = await prisma.telephonyConfig.findUniqueOrThrow({
      where: { id: result.id },
    });
    expect(raw.authToken).not.toBe("super-secret-plaintext-token");
    expect(raw.authToken).not.toContain("super-secret-plaintext-token");
    expect(encryptionService.decrypt(raw.authToken)).toBe(
      "super-secret-plaintext-token",
    );
  });

  it("getActiveConfig() returns the masked active config", async () => {
    const result = await service.getActiveConfig(workspaceId);

    expect(result).not.toBeNull();
    expect(result?.authToken).toBe(MASKED_SECRET_VALUE);
    expect(result?.provider).toBe("TWILIO");
  });

  it("upsertConfig() enforces one active config per workspace by deactivating the previous one", async () => {
    const second = await service.upsertConfig(workspaceId, {
      provider: "EXOTEL" as never,
      authToken: "second-secret-token",
    });

    expect(second.isActive).toBe(true);

    const rows = await prisma.telephonyConfig.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "asc" },
    });
    expect(rows).toHaveLength(2);
    expect(rows[0].isActive).toBe(false);
    expect(rows[1].isActive).toBe(true);
    expect(rows[1].id).toBe(second.id);
  });

  it("getDecryptedAuthToken() returns the real plaintext for internal use", async () => {
    const token = await service.getDecryptedAuthToken(workspaceId);
    expect(token).toBe("second-secret-token");
  });
});
