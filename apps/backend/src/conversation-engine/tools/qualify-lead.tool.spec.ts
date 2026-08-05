import { QualifyLeadTool } from "./qualify-lead.tool";

const CONTEXT = {
  workspaceId: "workspace-1",
  customerId: "customer-1",
  conversationId: "conv-1",
};

function setup() {
  const leadQualificationService = {
    upsertForConversation: jest.fn(),
  };
  const tool = new QualifyLeadTool(leadQualificationService as never);

  return { tool, leadQualificationService };
}

describe("QualifyLeadTool", () => {
  it("exposes a stable name/parameters shape", () => {
    const { tool } = setup();

    expect(tool.name()).toBe("qualify_lead");
    expect(tool.parameters().required).toEqual([]);
  });

  it("passes only the fields given to upsertForConversation, filtering out empty/missing ones", async () => {
    const { tool, leadQualificationService } = setup();
    leadQualificationService.upsertForConversation.mockResolvedValue({
      name: "Raj",
      city: "Pune",
      company: null,
      budget: null,
      requirement: null,
      timeline: null,
      email: null,
      interestLevel: null,
    });

    await tool.execute({ name: "Raj", city: "Pune", company: "" }, CONTEXT);

    expect(leadQualificationService.upsertForConversation).toHaveBeenCalledWith(
      "workspace-1",
      "customer-1",
      "conv-1",
      {
        name: "Raj",
        city: "Pune",
        company: undefined,
        budget: undefined,
        requirement: undefined,
        timeline: undefined,
        email: undefined,
        interestLevel: undefined,
      },
    );
  });

  it("accumulates across multiple calls in the same conversation (verified via the upsert mock, matching LeadQualificationService's own merge test)", async () => {
    const { tool, leadQualificationService } = setup();
    leadQualificationService.upsertForConversation.mockResolvedValueOnce({
      name: "Raj",
      city: "Pune",
    });
    leadQualificationService.upsertForConversation.mockResolvedValueOnce({
      name: "Raj",
      city: "Pune",
      budget: "50k",
    });

    await tool.execute({ name: "Raj", city: "Pune" }, CONTEXT);
    const secondResult = await tool.execute({ budget: "50k" }, CONTEXT);

    expect(leadQualificationService.upsertForConversation).toHaveBeenNthCalledWith(
      2,
      "workspace-1",
      "customer-1",
      "conv-1",
      expect.objectContaining({ budget: "50k", name: undefined }),
    );
    expect(JSON.parse(secondResult.content).leadQualification).toMatchObject({
      name: "Raj",
      city: "Pune",
      budget: "50k",
    });
  });

  it("rejects an interestLevel outside the known enum", async () => {
    const { tool, leadQualificationService } = setup();
    leadQualificationService.upsertForConversation.mockResolvedValue({});

    await tool.execute({ interestLevel: "SUPER_HIGH" }, CONTEXT);

    expect(leadQualificationService.upsertForConversation).toHaveBeenCalledWith(
      "workspace-1",
      "customer-1",
      "conv-1",
      expect.objectContaining({ interestLevel: undefined }),
    );
  });
});
