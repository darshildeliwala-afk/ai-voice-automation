import { UpdateCustomerTagsTool } from "./update-customer-tags.tool";

const CONTEXT = {
  workspaceId: "workspace-1",
  customerId: "customer-1",
  conversationId: "conv-1",
};

function setup() {
  const customerTagService = { updateTags: jest.fn() };
  const tool = new UpdateCustomerTagsTool(customerTagService as never);

  return { tool, customerTagService };
}

describe("UpdateCustomerTagsTool", () => {
  it("adds and removes tags on the current customer, always workspace/customer-scoped from context", async () => {
    const { tool, customerTagService } = setup();
    customerTagService.updateTags.mockResolvedValue(["Hot Lead", "VIP"]);

    const result = await tool.execute(
      { add: ["Hot Lead", "VIP"], remove: ["Cold Lead"] },
      CONTEXT,
    );

    expect(customerTagService.updateTags).toHaveBeenCalledWith(
      "workspace-1",
      "customer-1",
      { add: ["Hot Lead", "VIP"], remove: ["Cold Lead"] },
    );
    expect(JSON.parse(result.content)).toEqual({ tags: ["Hot Lead", "VIP"] });
  });

  it("ignores an attempt to target a different customer -- context always wins", async () => {
    const { tool, customerTagService } = setup();
    customerTagService.updateTags.mockResolvedValue([]);

    await tool.execute(
      { add: ["VIP"], customerId: "some-other-customer" },
      CONTEXT,
    );

    expect(customerTagService.updateTags).toHaveBeenCalledWith(
      "workspace-1",
      "customer-1",
      expect.anything(),
    );
  });

  it("filters out non-string entries from add/remove arrays", async () => {
    const { tool, customerTagService } = setup();
    customerTagService.updateTags.mockResolvedValue([]);

    await tool.execute({ add: ["VIP", 42, null] }, CONTEXT);

    expect(customerTagService.updateTags).toHaveBeenCalledWith(
      "workspace-1",
      "customer-1",
      { add: ["VIP"], remove: undefined },
    );
  });
});
