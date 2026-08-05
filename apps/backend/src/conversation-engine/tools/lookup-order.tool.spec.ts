import { LookupOrderTool } from "./lookup-order.tool";

const CONTEXT = {
  workspaceId: "workspace-1",
  customerId: "customer-1",
  conversationId: "conv-1",
  orderId: "order-1",
};

function setup() {
  const orderService = {
    getOrderById: jest.fn(),
    getMostRecentOrderForCustomer: jest.fn(),
  };
  const customerService = { findByIdentifier: jest.fn() };
  const tool = new LookupOrderTool(
    orderService as never,
    customerService as never,
  );
  return { tool, orderService, customerService };
}

const BASE_ORDER = {
  workspaceId: "workspace-1",
  customerId: "customer-1",
  marketplace: "MANUAL",
  status: "PENDING",
  paymentType: "COD",
  totalAmount: 100,
  currency: "INR",
  courier: null,
  trackingId: null,
  estimatedDeliveryAt: null,
  items: [],
};

describe("LookupOrderTool", () => {
  it("defaults to the conversation's bound order when no orderId is given", async () => {
    const { tool, orderService } = setup();
    orderService.getOrderById.mockResolvedValue({
      id: "order-1",
      workspaceId: "workspace-1",
      customerId: "customer-1",
      marketplace: "MANUAL",
      status: "PENDING",
      paymentType: "COD",
      totalAmount: 100,
      currency: "INR",
      items: [],
    });

    const result = await tool.execute({}, CONTEXT);

    expect(orderService.getOrderById).toHaveBeenCalledWith("order-1");
    expect(JSON.parse(result.content).id).toBe("order-1");
  });

  it("returns a graceful error when no orderId is available anywhere", async () => {
    const { tool, orderService } = setup();

    const result = await tool.execute({}, { ...CONTEXT, orderId: undefined });

    expect(JSON.parse(result.content).error).toBeDefined();
    expect(orderService.getOrderById).not.toHaveBeenCalled();
  });

  it("uses a model-supplied orderId when given, after validating it", async () => {
    const { tool, orderService } = setup();
    orderService.getOrderById.mockResolvedValue({
      id: "order-2",
      workspaceId: "workspace-1",
      customerId: "customer-1",
      marketplace: "MANUAL",
      status: "SHIPPED",
      paymentType: "PREPAID",
      totalAmount: 50,
      currency: "INR",
      items: [{ name: "Widget", quantity: 1, unitPrice: 50 }],
    });

    const result = await tool.execute({ orderId: "order-2" }, CONTEXT);

    expect(JSON.parse(result.content)).toMatchObject({
      id: "order-2",
      status: "SHIPPED",
      items: [{ name: "Widget", quantity: 1, unitPrice: 50 }],
    });
  });

  it("throws (workspace-scoped) when the model-supplied order belongs to a different workspace", async () => {
    const { tool, orderService } = setup();
    orderService.getOrderById.mockResolvedValue({
      id: "order-3",
      workspaceId: "other-workspace",
      customerId: "customer-1",
      items: [],
    });

    await expect(
      tool.execute({ orderId: "order-3" }, CONTEXT),
    ).rejects.toThrow();
  });

  it("throws (workspace-scoped) when the model-supplied order belongs to a different customer", async () => {
    const { tool, orderService } = setup();
    orderService.getOrderById.mockResolvedValue({
      id: "order-4",
      workspaceId: "workspace-1",
      customerId: "a-different-customer",
      items: [],
    });

    await expect(
      tool.execute({ orderId: "order-4" }, CONTEXT),
    ).rejects.toThrow();
  });

  describe("phone lookup (Sprint 19) -- a different customer's most recent order", () => {
    it("resolves the customer by phone (workspace-scoped) then their most recent order", async () => {
      const { tool, orderService, customerService } = setup();
      customerService.findByIdentifier.mockResolvedValue({ id: "customer-2" });
      orderService.getMostRecentOrderForCustomer.mockResolvedValue({
        id: "order-5",
        ...BASE_ORDER,
        customerId: "customer-2",
        courier: "BlueDart",
        trackingId: "BD123",
      });

      const result = await tool.execute({ phone: "+919876543210" }, CONTEXT);

      expect(customerService.findByIdentifier).toHaveBeenCalledWith("workspace-1", {
        phone: "+919876543210",
      });
      expect(orderService.getMostRecentOrderForCustomer).toHaveBeenCalledWith(
        "workspace-1",
        "customer-2",
      );
      expect(JSON.parse(result.content)).toMatchObject({
        id: "order-5",
        courier: "BlueDart",
        trackingId: "BD123",
      });
    });

    it("returns a graceful error when no customer matches the phone", async () => {
      const { tool, customerService, orderService } = setup();
      customerService.findByIdentifier.mockResolvedValue(null);

      const result = await tool.execute({ phone: "+10000000000" }, CONTEXT);

      expect(JSON.parse(result.content).error).toBeDefined();
      expect(orderService.getMostRecentOrderForCustomer).not.toHaveBeenCalled();
    });

    it("returns a graceful error when the customer matches but has no orders", async () => {
      const { tool, customerService, orderService } = setup();
      customerService.findByIdentifier.mockResolvedValue({ id: "customer-2" });
      orderService.getMostRecentOrderForCustomer.mockResolvedValue(null);

      const result = await tool.execute({ phone: "+919876543210" }, CONTEXT);

      expect(JSON.parse(result.content).error).toBeDefined();
    });
  });
});
