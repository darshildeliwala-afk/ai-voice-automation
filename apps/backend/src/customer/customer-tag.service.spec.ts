import { CustomerTagService } from "./customer-tag.service";
import type { CustomerService } from "./customer.service";

function setup(customerTags: string[] = []) {
  const customer = {
    workspaceTagStat: {
      upsert: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    customer: { update: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(customer)),
    workspaceTagStat: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  const customerService = {
    getCustomerById: jest.fn().mockResolvedValue({
      id: "customer-1",
      workspaceId: "workspace-1",
      tags: customerTags,
    }),
  };

  const service = new CustomerTagService(
    prisma as never,
    customerService as unknown as CustomerService,
  );

  return { service, prisma, tx: customer, customerService };
}

describe("CustomerTagService", () => {
  describe("updateTags", () => {
    it("normalizes and dedupes tags regardless of input casing", async () => {
      const { service, tx } = setup([]);

      const result = await service.updateTags("workspace-1", "customer-1", {
        add: ["HOT LEAD", "hot lead"],
      });

      expect(result).toEqual(["Hot Lead"]);
      expect(tx.customer.update).toHaveBeenCalledWith({
        where: { id: "customer-1" },
        data: { tags: ["Hot Lead"] },
      });
    });

    it("increments the workspace tag stat once per newly-added tag", async () => {
      const { service, tx } = setup([]);

      await service.updateTags("workspace-1", "customer-1", { add: ["VIP"] });

      expect(tx.workspaceTagStat.upsert).toHaveBeenCalledWith({
        where: { workspaceId_tag: { workspaceId: "workspace-1", tag: "Vip" } },
        create: { workspaceId: "workspace-1", tag: "Vip", usageCount: 1 },
        update: { usageCount: { increment: 1 } },
      });
    });

    it("does not re-increment the stat for a tag the customer already has", async () => {
      const { service, tx } = setup(["Vip"]);

      await service.updateTags("workspace-1", "customer-1", { add: ["vip"] });

      expect(tx.workspaceTagStat.upsert).not.toHaveBeenCalled();
    });

    it("removes a tag and decrements its usage stat", async () => {
      const { service, tx } = setup(["Hot Lead", "Vip"]);
      tx.workspaceTagStat.findUnique.mockResolvedValue({
        workspaceId: "workspace-1",
        tag: "Hot Lead",
        usageCount: 3,
      });

      const result = await service.updateTags("workspace-1", "customer-1", {
        remove: ["hot lead"],
      });

      expect(result).toEqual(["Vip"]);
      expect(tx.workspaceTagStat.update).toHaveBeenCalledWith({
        where: { workspaceId_tag: { workspaceId: "workspace-1", tag: "Hot Lead" } },
        data: { usageCount: 2 },
      });
    });

    it("never lets the usage stat go below zero", async () => {
      const { service, tx } = setup(["Hot Lead"]);
      tx.workspaceTagStat.findUnique.mockResolvedValue({
        workspaceId: "workspace-1",
        tag: "Hot Lead",
        usageCount: 0,
      });

      await service.updateTags("workspace-1", "customer-1", { remove: ["Hot Lead"] });

      expect(tx.workspaceTagStat.update).not.toHaveBeenCalled();
    });

    it("preserves a manually-added tag that the remove list never mentions", async () => {
      // Stored tags are always already-normalized (they only ever get
      // there via this same service), so the initial state here uses the
      // normalized form directly rather than a raw un-normalized input.
      const { service, tx } = setup(["Vip Customer", "Cold Lead"]);

      const result = await service.updateTags("workspace-1", "customer-1", {
        remove: ["Cold Lead"],
      });

      expect(result).toEqual(["Vip Customer"]);
      expect(tx.customer.update).toHaveBeenCalledWith({
        where: { id: "customer-1" },
        data: { tags: ["Vip Customer"] },
      });
    });

    it("validates the customer exists (workspace-scoped) before mutating anything", async () => {
      const { service, customerService } = setup([]);

      await service.updateTags("workspace-1", "customer-1", { add: ["VIP"] });

      expect(customerService.getCustomerById).toHaveBeenCalledWith(
        "workspace-1",
        "customer-1",
      );
    });
  });

  describe("getTopTags", () => {
    it("returns tags sorted by usage count descending", async () => {
      const { service, prisma } = setup();
      prisma.workspaceTagStat.findMany.mockResolvedValue([
        { tag: "Hot Lead", usageCount: 10 },
        { tag: "VIP", usageCount: 5 },
      ]);

      const result = await service.getTopTags("workspace-1");

      expect(prisma.workspaceTagStat.findMany).toHaveBeenCalledWith({
        where: { workspaceId: "workspace-1" },
        orderBy: { usageCount: "desc" },
        take: 20,
      });
      expect(result).toEqual([
        { tag: "Hot Lead", usageCount: 10 },
        { tag: "VIP", usageCount: 5 },
      ]);
    });
  });
});
