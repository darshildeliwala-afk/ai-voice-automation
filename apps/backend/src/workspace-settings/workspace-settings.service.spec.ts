import type { WorkspaceService } from "../workspace/workspace.service";
import { WorkspaceSettingsService } from "./workspace-settings.service";

function setup() {
  const prisma = {
    workspaceSettings: {
      findUnique: jest.fn(),
      create: jest.fn(),
      upsert: jest.fn(),
    },
  };
  const workspaceService = {
    getWorkspaceById: jest.fn().mockResolvedValue({ id: "workspace-1" }),
  };

  const service = new WorkspaceSettingsService(
    prisma as never,
    workspaceService as unknown as WorkspaceService,
  );

  return { service, prisma, workspaceService };
}

describe("WorkspaceSettingsService", () => {
  it("getSettings validates the workspace exists first", async () => {
    const { service, prisma, workspaceService } = setup();
    prisma.workspaceSettings.findUnique.mockResolvedValue({
      id: "settings-1",
      workspaceId: "workspace-1",
    });

    await service.getSettings("workspace-1");

    expect(workspaceService.getWorkspaceById).toHaveBeenCalledWith(
      "workspace-1",
    );
  });

  it("getSettings returns the existing row when present", async () => {
    const { service, prisma } = setup();
    const existing = { id: "settings-1", workspaceId: "workspace-1" };
    prisma.workspaceSettings.findUnique.mockResolvedValue(existing);

    const result = await service.getSettings("workspace-1");

    expect(result).toBe(existing);
    expect(prisma.workspaceSettings.create).not.toHaveBeenCalled();
  });

  it("getSettings auto-provisions defaults on first access", async () => {
    const { service, prisma } = setup();
    prisma.workspaceSettings.findUnique.mockResolvedValue(null);
    const created = { id: "settings-1", workspaceId: "workspace-1" };
    prisma.workspaceSettings.create.mockResolvedValue(created);

    const result = await service.getSettings("workspace-1");

    expect(prisma.workspaceSettings.create).toHaveBeenCalledWith({
      data: { workspaceId: "workspace-1" },
    });
    expect(result).toBe(created);
  });

  it("updateSettings validates workspace and upserts", async () => {
    const { service, prisma, workspaceService } = setup();
    const updated = { id: "settings-1", timezone: "Asia/Kolkata" };
    prisma.workspaceSettings.upsert.mockResolvedValue(updated);

    const result = await service.updateSettings("workspace-1", {
      timezone: "Asia/Kolkata",
    });

    expect(workspaceService.getWorkspaceById).toHaveBeenCalledWith(
      "workspace-1",
    );
    expect(prisma.workspaceSettings.upsert).toHaveBeenCalledWith({
      where: { workspaceId: "workspace-1" },
      create: { workspaceId: "workspace-1", timezone: "Asia/Kolkata" },
      update: { timezone: "Asia/Kolkata" },
    });
    expect(result).toBe(updated);
  });
});
