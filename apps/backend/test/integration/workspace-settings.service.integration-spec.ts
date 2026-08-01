import { randomUUID } from "node:crypto";

import { PrismaService } from "../../src/common/prisma/prisma.service";
import { WorkspaceService } from "../../src/workspace/workspace.service";
import { WorkspaceSettingsService } from "../../src/workspace-settings/workspace-settings.service";

describe("WorkspaceSettingsService (integration, real Postgres)", () => {
  let prisma: PrismaService;
  let workspaceService: WorkspaceService;
  let service: WorkspaceSettingsService;
  let workspaceId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    workspaceService = new WorkspaceService(prisma);
    service = new WorkspaceSettingsService(prisma, workspaceService);

    workspaceId = randomUUID();
    const slug = `settings-it-${Date.now()}`;
    await prisma.$executeRaw`
      INSERT INTO "Workspace" (id, name, slug, "createdAt", "updatedAt")
      VALUES (${workspaceId}::uuid, 'Settings IT Workspace', ${slug}, now(), now())
    `;
  });

  afterAll(async () => {
    await prisma.workspaceSettings.deleteMany({ where: { workspaceId } });
    await prisma.$executeRaw`DELETE FROM "Workspace" WHERE id = ${workspaceId}::uuid`;
    await prisma.$disconnect();
  });

  it("getSettings() auto-provisions a default row on first access", async () => {
    const settings = await service.getSettings(workspaceId);

    expect(settings.workspaceId).toBe(workspaceId);
    expect(settings.businessName).toBeNull();

    const rows = await prisma.workspaceSettings.findMany({
      where: { workspaceId },
    });
    expect(rows).toHaveLength(1);
  });

  it("getSettings() returns the same row on subsequent calls (no duplicates)", async () => {
    const first = await service.getSettings(workspaceId);
    const second = await service.getSettings(workspaceId);

    expect(second.id).toBe(first.id);

    const rows = await prisma.workspaceSettings.findMany({
      where: { workspaceId },
    });
    expect(rows).toHaveLength(1);
  });

  it("updateSettings() persists changes and upserts rather than duplicating", async () => {
    await service.getSettings(workspaceId);

    const updated = await service.updateSettings(workspaceId, {
      businessName: "Acme Voice Co",
      businessEmail: "hello@acme.test",
      timezone: "Asia/Kolkata",
      currency: "INR",
      businessHours: { mon: "9-18" },
    });

    expect(updated.businessName).toBe("Acme Voice Co");
    expect(updated.businessEmail).toBe("hello@acme.test");
    expect(updated.timezone).toBe("Asia/Kolkata");
    expect(updated.businessHours).toEqual({ mon: "9-18" });

    const rows = await prisma.workspaceSettings.findMany({
      where: { workspaceId },
    });
    expect(rows).toHaveLength(1);

    const persisted = await prisma.workspaceSettings.findUniqueOrThrow({
      where: { workspaceId },
    });
    expect(persisted.businessName).toBe("Acme Voice Co");
  });

  it("getSettings() throws for a workspace that does not exist", async () => {
    await expect(service.getSettings(randomUUID())).rejects.toThrow();
  });
});
