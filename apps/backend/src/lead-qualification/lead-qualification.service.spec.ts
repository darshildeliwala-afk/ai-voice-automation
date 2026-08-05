import { LeadQualificationService } from "./lead-qualification.service";

const WORKSPACE_ID = "workspace-1";
const CUSTOMER_ID = "customer-1";
const CONVERSATION_ID = "conv-1";

function setup() {
  const leadQualification = {
    upsert: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  };
  const prisma = { leadQualification };

  const service = new LeadQualificationService(prisma as never);

  return { service, prisma, leadQualification };
}

describe("LeadQualificationService", () => {
  describe("upsertForConversation", () => {
    it("creates a new row with only the fields given", async () => {
      const { service, leadQualification } = setup();
      leadQualification.upsert.mockResolvedValue({
        id: "lq-1",
        name: "Raj",
        city: "Pune",
      });

      await service.upsertForConversation(
        WORKSPACE_ID,
        CUSTOMER_ID,
        CONVERSATION_ID,
        { name: "Raj", city: "Pune" },
      );

      expect(leadQualification.upsert).toHaveBeenCalledWith({
        where: { conversationId: CONVERSATION_ID },
        create: {
          workspaceId: WORKSPACE_ID,
          customerId: CUSTOMER_ID,
          conversationId: CONVERSATION_ID,
          name: "Raj",
          city: "Pune",
        },
        update: { name: "Raj", city: "Pune" },
      });
    });

    it("a second call with only new fields merges rather than overwrites (Prisma ignores undefined keys in update)", async () => {
      const { service, leadQualification } = setup();
      leadQualification.upsert.mockResolvedValue({
        id: "lq-1",
        name: "Raj",
        city: "Pune",
        budget: "50k",
      });

      await service.upsertForConversation(
        WORKSPACE_ID,
        CUSTOMER_ID,
        CONVERSATION_ID,
        { budget: "50k" },
      );

      // Only `budget` is passed to `update` -- `name`/`city` from the first
      // call are simply absent from this object, which Prisma treats as
      // "leave unchanged," not "set to null."
      expect(leadQualification.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: { budget: "50k" } }),
      );
    });
  });

  describe("getById", () => {
    it("throws NotFoundException when missing", async () => {
      const { service, leadQualification } = setup();
      leadQualification.findFirst.mockResolvedValue(null);

      await expect(service.getById("missing")).rejects.toThrow();
    });
  });

  describe("listLeadQualifications", () => {
    it("scopes to workspace and optional interestLevel", async () => {
      const { service, leadQualification } = setup();
      leadQualification.findMany.mockResolvedValue([]);
      leadQualification.count.mockResolvedValue(0);

      await service.listLeadQualifications(
        WORKSPACE_ID,
        { page: 1, limit: 20 },
        "HIGH" as never,
      );

      expect(leadQualification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            workspaceId: WORKSPACE_ID,
            interestLevel: "HIGH",
          }),
        }),
      );
    });
  });
});
