import { LookupCustomerTool } from "./lookup-customer.tool";

const CONTEXT = {
  workspaceId: "workspace-1",
  customerId: "customer-1",
  conversationId: "conv-1",
};

describe("LookupCustomerTool", () => {
  it("exposes a stable name/description/parameters shape", () => {
    const customerService = { getCustomerById: jest.fn() };
    const tool = new LookupCustomerTool(customerService as never);

    expect(tool.name()).toBe("lookup_customer");
    expect(tool.description()).toEqual(expect.any(String));
    expect(tool.parameters()).toEqual({
      type: "object",
      properties: {},
      required: [],
    });
  });

  it("always resolves the current conversation's customer, ignoring any model-supplied id", async () => {
    const customerService = {
      getCustomerById: jest.fn().mockResolvedValue({
        name: "Jane Doe",
        phone: "+14155551234",
        email: "jane@example.com",
        language: "en",
      }),
    };
    const tool = new LookupCustomerTool(customerService as never);

    const result = await tool.execute(
      { customerId: "some-other-customer" },
      CONTEXT,
    );

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
  });
});
