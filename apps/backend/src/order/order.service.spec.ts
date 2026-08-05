import { OrderService } from "./order.service";

const WORKSPACE_ID = "workspace-1";

function setup() {
  const order = { findFirst: jest.fn() };
  const prisma = { order };
  const customerService = {};

  const service = new OrderService(prisma as never, customerService as never);

  return { service, prisma, order };
}

describe("OrderService", () => {
  describe("getMostRecentOrderForCustomer", () => {
    it("returns the customer's newest order, workspace+customer scoped", async () => {
      const { service, order } = setup();
      order.findFirst.mockResolvedValue({ id: "order-1", customerId: "cust-1" });

      const result = await service.getMostRecentOrderForCustomer(
        WORKSPACE_ID,
        "cust-1",
      );

      expect(result?.id).toBe("order-1");
      expect(order.findFirst).toHaveBeenCalledWith({
        where: { workspaceId: WORKSPACE_ID, customerId: "cust-1", deletedAt: null },
        orderBy: { createdAt: "desc" },
        include: { items: true },
      });
    });

    it("returns null when the customer has no orders", async () => {
      const { service, order } = setup();
      order.findFirst.mockResolvedValue(null);

      const result = await service.getMostRecentOrderForCustomer(
        WORKSPACE_ID,
        "cust-1",
      );

      expect(result).toBeNull();
    });
  });
});
