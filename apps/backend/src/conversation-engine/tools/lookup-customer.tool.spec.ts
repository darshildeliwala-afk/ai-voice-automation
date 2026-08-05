import { LookupCustomerTool } from "./lookup-customer.tool";

const CONTEXT = {
  workspaceId: "workspace-1",
  customerId: "customer-1",
  conversationId: "conv-1",
};

function setup() {
  const customerService = {
    getCustomerById: jest.fn(),
    findByIdentifier: jest.fn(),
  };
  const prisma = {
    conversation: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const orderService = {
    getMostRecentOrderForCustomer: jest.fn().mockResolvedValue(null),
  };
  const crmNoteService = {
    listRecentForCustomer: jest.fn().mockResolvedValue([]),
  };

  const tool = new LookupCustomerTool(
    customerService as never,
    prisma as never,
    orderService as never,
    crmNoteService as never,
  );

  return { tool, customerService, prisma, orderService, crmNoteService };
}

describe("LookupCustomerTool", () => {
  it("exposes a stable name/description/parameters shape", () => {
    const { tool } = setup();

    expect(tool.name()).toBe("lookup_customer");
    expect(tool.description()).toEqual(expect.any(String));
    expect(tool.parameters()).toEqual({
      type: "object",
      properties: {
        phone: expect.objectContaining({ type: "string" }),
        customerId: expect.objectContaining({ type: "string" }),
        email: expect.objectContaining({ type: "string" }),
      },
      required: [],
    });
  });

  describe("default path (no arguments) -- unchanged from Sprint 15", () => {
    it("resolves the current conversation's customer and returns the compact shape", async () => {
      const { tool, customerService } = setup();
      customerService.getCustomerById.mockResolvedValue({
        name: "Jane Doe",
        phone: "+14155551234",
        email: "jane@example.com",
        language: "en",
      });

      const result = await tool.execute({}, CONTEXT);

      expect(customerService.getCustomerById).toHaveBeenCalledWith(
        "workspace-1",
        "customer-1",
      );
      expect(JSON.parse(result.content)).toEqual({
        name: "Jane Doe",
        phone: "+14155551234",
        email: "jane@example.com",
        language: "en",
      });
      expect(customerService.findByIdentifier).not.toHaveBeenCalled();
    });
  });

  describe("enriched path (Sprint 19) -- explicit phone/customerId/email identifies a different customer", () => {
    it("looks up the given customerId within the workspace and returns an enriched profile", async () => {
      const { tool, customerService, orderService, crmNoteService } = setup();
      customerService.findByIdentifier.mockResolvedValue({
        id: "customer-2",
        name: "Raj",
        phone: "+919876543210",
        email: "raj@example.com",
        language: "hi-en",
        tags: ["Hot Lead"],
      });
      orderService.getMostRecentOrderForCustomer.mockResolvedValue({
        id: "order-1",
        marketplace: "MANUAL",
        status: "SHIPPED",
        totalAmount: 500,
        currency: "INR",
        createdAt: new Date("2026-08-01"),
      });
      crmNoteService.listRecentForCustomer.mockResolvedValue([
        { id: "note-1", content: "Prefers evening calls", createdAt: new Date("2026-08-01") },
      ]);

      const result = await tool.execute(
        { customerId: "customer-2" },
        CONTEXT,
      );

      expect(customerService.findByIdentifier).toHaveBeenCalledWith("workspace-1", {
        customerId: "customer-2",
        phone: undefined,
        email: undefined,
      });
      const parsed = JSON.parse(result.content);
      expect(parsed.found).toBe(true);
      expect(parsed.customer).toEqual(
        expect.objectContaining({ id: "customer-2", tags: ["Hot Lead"] }),
      );
      expect(parsed.lastOrder).toEqual(
        expect.objectContaining({ id: "order-1" }),
      );
      expect(parsed.notes).toEqual([
        expect.objectContaining({ content: "Prefers evening calls" }),
      ]);
    });

    it("looks up by phone", async () => {
      const { tool, customerService } = setup();
      customerService.findByIdentifier.mockResolvedValue({
        id: "customer-2",
        name: "Raj",
        phone: "+919876543210",
        email: null,
        language: null,
        tags: [],
      });

      await tool.execute({ phone: "+919876543210" }, CONTEXT);

      expect(customerService.findByIdentifier).toHaveBeenCalledWith("workspace-1", {
        customerId: undefined,
        phone: "+919876543210",
        email: undefined,
      });
    });

    it("returns { found: false } when nothing matches -- proves this can never leak a cross-tenant record, only report absence", async () => {
      const { tool, customerService } = setup();
      customerService.findByIdentifier.mockResolvedValue(null);

      const result = await tool.execute(
        { customerId: "customer-in-another-workspace" },
        CONTEXT,
      );

      expect(JSON.parse(result.content)).toEqual({ found: false });
    });

    it("stays workspace-scoped -- findByIdentifier is always called with context.workspaceId, never a model-supplied one", async () => {
      const { tool, customerService } = setup();
      customerService.findByIdentifier.mockResolvedValue(null);

      await tool.execute({ email: "someone@example.com" }, CONTEXT);

      expect(customerService.findByIdentifier).toHaveBeenCalledWith(
        "workspace-1",
        expect.anything(),
      );
    });
  });
});
