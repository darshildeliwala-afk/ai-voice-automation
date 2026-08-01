import { randomUUID } from "node:crypto";

import { EncryptionService } from "../../src/common/encryption/encryption.service";
import { MASKED_SECRET_VALUE } from "../../src/common/masking/mask.util";
import { PrismaService } from "../../src/common/prisma/prisma.service";
import { WorkspaceService } from "../../src/workspace/workspace.service";
import { AiProviderConfigService } from "../../src/workspace-settings/ai-provider-config.service";

describe("AiProviderConfigService (integration, real Postgres)", () => {
  let prisma: PrismaService;
  let workspaceService: WorkspaceService;
  let encryptionService: EncryptionService;
  let service: AiProviderConfigService;
  let workspaceId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    workspaceService = new WorkspaceService(prisma);
    encryptionService = new EncryptionService();
    service = new AiProviderConfigService(
      prisma,
      workspaceService,
      encryptionService,
    );

    workspaceId = randomUUID();
    const slug = `ai-provider-it-${Date.now()}`;
    await prisma.$executeRaw`
      INSERT INTO "Workspace" (id, name, slug, "createdAt", "updatedAt")
      VALUES (${workspaceId}::uuid, 'AI Provider IT Workspace', ${slug}, now(), now())
    `;
  });

  afterAll(async () => {
    await prisma.aiProviderConfig.deleteMany({ where: { workspaceId } });
    await prisma.$executeRaw`DELETE FROM "Workspace" WHERE id = ${workspaceId}::uuid`;
    await prisma.$disconnect();
  });

  it("getActiveConfig() returns null when none exists", async () => {
    const result = await service.getActiveConfig(workspaceId);
    expect(result).toBeNull();
  });

  it("upsertConfig() stores the apiKey encrypted at rest and returns it masked", async () => {
    const result = await service.upsertConfig(workspaceId, {
      provider: "OPENAI" as never,
      apiKey: "sk-super-secret-plaintext-key",
      defaultModel: "gpt-4o",
      temperature: 0.7,
    });

    expect(result.apiKey).toBe(MASKED_SECRET_VALUE);

    const raw = await prisma.aiProviderConfig.findUniqueOrThrow({
      where: { id: result.id },
    });
    expect(raw.apiKey).not.toBe("sk-super-secret-plaintext-key");
    expect(raw.apiKey).not.toContain("sk-super-secret-plaintext-key");
    expect(encryptionService.decrypt(raw.apiKey)).toBe(
      "sk-super-secret-plaintext-key",
    );
  });

  it("getActiveConfig() returns the masked active config", async () => {
    const result = await service.getActiveConfig(workspaceId);

    expect(result).not.toBeNull();
    expect(result?.apiKey).toBe(MASKED_SECRET_VALUE);
    expect(result?.provider).toBe("OPENAI");
  });

  it("upsertConfig() enforces one active config per workspace by deactivating the previous one", async () => {
    const second = await service.upsertConfig(workspaceId, {
      provider: "ANTHROPIC" as never,
      apiKey: "sk-second-secret-key",
    });

    expect(second.isActive).toBe(true);

    const rows = await prisma.aiProviderConfig.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "asc" },
    });
    expect(rows).toHaveLength(2);
    expect(rows[0].isActive).toBe(false);
    expect(rows[1].isActive).toBe(true);
    expect(rows[1].id).toBe(second.id);
  });

  it("getDecryptedApiKey() returns the real plaintext for internal use", async () => {
    const key = await service.getDecryptedApiKey(workspaceId);
    expect(key).toBe("sk-second-secret-key");
  });
});
