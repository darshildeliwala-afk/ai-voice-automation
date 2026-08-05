import { CrmNoteService } from "./crm-note.service";

const WORKSPACE_ID = "workspace-1";
const CUSTOMER_ID = "customer-1";

function setup() {
  const crmNote = {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  };
  const prisma = { crmNote };
  const customerService = {
    getCustomerById: jest.fn().mockResolvedValue({ id: CUSTOMER_ID }),
  };

  const service = new CrmNoteService(prisma as never, customerService as never);

  return { service, prisma, crmNote, customerService };
}

describe("CrmNoteService", () => {
  describe("createNote", () => {
    it("validates the customer exists in the workspace before creating", async () => {
      const { service, crmNote, customerService } = setup();
      crmNote.create.mockResolvedValue({ id: "note-1" });

      await service.createNote({
        workspaceId: WORKSPACE_ID,
        customerId: CUSTOMER_ID,
        content: "Prefers evening calls",
      });

      expect(customerService.getCustomerById).toHaveBeenCalledWith(
        WORKSPACE_ID,
        CUSTOMER_ID,
      );
      expect(crmNote.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ content: "Prefers evening calls" }),
      });
    });
  });

  describe("listRecentForCustomer", () => {
    it("returns the most recent notes, workspace+customer scoped, unpaginated", async () => {
      const { service, crmNote } = setup();
      crmNote.findMany.mockResolvedValue([{ id: "note-1" }]);

      const result = await service.listRecentForCustomer(WORKSPACE_ID, CUSTOMER_ID);

      expect(result).toEqual([{ id: "note-1" }]);
      expect(crmNote.findMany).toHaveBeenCalledWith({
        where: { workspaceId: WORKSPACE_ID, customerId: CUSTOMER_ID, deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 5,
      });
    });
  });

  describe("listCrmNotes", () => {
    it("paginates and scopes to the workspace", async () => {
      const { service, crmNote } = setup();
      crmNote.findMany.mockResolvedValue([]);
      crmNote.count.mockResolvedValue(0);

      await service.listCrmNotes(WORKSPACE_ID, { page: 1, limit: 20 });

      expect(crmNote.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: WORKSPACE_ID, deletedAt: null },
        }),
      );
    });
  });

  describe("softDeleteNote", () => {
    it("sets deletedAt", async () => {
      const { service, crmNote } = setup();
      crmNote.findFirst.mockResolvedValue({ id: "note-1" });
      crmNote.update.mockResolvedValue({ id: "note-1", deletedAt: new Date() });

      await service.softDeleteNote("note-1");

      expect(crmNote.update).toHaveBeenCalledWith({
        where: { id: "note-1" },
        data: { deletedAt: expect.any(Date) },
      });
    });
  });
});
