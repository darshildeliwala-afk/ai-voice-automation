import { CreateCrmNoteTool } from "./create-crm-note.tool";

const CONTEXT = {
  workspaceId: "workspace-1",
  customerId: "customer-1",
  conversationId: "conv-1",
};

function setup() {
  const crmNoteService = { createNote: jest.fn() };
  const tool = new CreateCrmNoteTool(crmNoteService as never);

  return { tool, crmNoteService };
}

describe("CreateCrmNoteTool", () => {
  it("saves a note scoped to the current customer/conversation", async () => {
    const { tool, crmNoteService } = setup();
    crmNoteService.createNote.mockResolvedValue({ id: "note-1" });

    const result = await tool.execute(
      { content: "Prefers evening calls" },
      CONTEXT,
    );

    expect(crmNoteService.createNote).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      customerId: "customer-1",
      conversationId: "conv-1",
      content: "Prefers evening calls",
    });
    expect(JSON.parse(result.content)).toEqual({
      noteCreated: true,
      noteId: "note-1",
    });
  });

  it("returns a graceful error when content is missing or blank", async () => {
    const { tool, crmNoteService } = setup();

    const result = await tool.execute({ content: "   " }, CONTEXT);

    expect(JSON.parse(result.content).error).toBeDefined();
    expect(crmNoteService.createNote).not.toHaveBeenCalled();
  });
});
