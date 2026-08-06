import { WorkflowNodeType } from "../../../generated/prisma/client";
import type { WorkflowExecutionContext } from "../workflow-node-handler.interface";
import { PromptNodeHandler } from "./prompt-node.handler";

function setup() {
  const conversationMessage = { create: jest.fn().mockResolvedValue({}) };
  const aIUsage = { create: jest.fn().mockResolvedValue({}) };
  const prisma = { conversationMessage, aIUsage };
  const toolExecutor = { execute: jest.fn() };
  const toolRegistry = {
    getToolDefinitions: jest
      .fn()
      .mockReturnValue([{ name: "lookup_order", description: "...", parameters: {} }]),
  };
  const handler = new PromptNodeHandler(
    prisma as never,
    toolExecutor as never,
    toolRegistry as never,
  );

  const chat = jest.fn();
  const context: WorkflowExecutionContext = {
    workspaceId: "workspace-1",
    customerId: "customer-1",
    conversationId: "conv-1",
    orderId: "order-1",
    provider: { chat } as never,
    providerName: "OPENAI" as never,
    messages: [{ role: "system", content: "sys" }, { role: "user", content: "hi" }],
    state: {},
  };

  return { handler, prisma, conversationMessage, aIUsage, toolExecutor, toolRegistry, chat, context };
}

describe("PromptNodeHandler", () => {
  it("returns plain content and transitions to config.next when no tool calls are made", async () => {
    const { handler, chat, context, conversationMessage, aIUsage } = setup();
    chat.mockResolvedValue({
      content: "Hello!",
      model: "gpt-4o-mini",
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
      rawResponse: {},
    });

    const node = { key: "start", type: WorkflowNodeType.PROMPT, config: { next: "end" } };
    const result = await handler.execute(node, context);

    expect(chat).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: [{ name: "lookup_order", description: "...", parameters: {} }],
      }),
    );
    expect(result).toMatchObject({ next: "end", terminal: false, content: "Hello!" });
    expect(result.usage).toEqual([
      { model: "gpt-4o-mini", promptTokens: 10, completionTokens: 5, totalTokens: 15, estimatedCost: expect.any(Number) },
    ]);
    expect(conversationMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ role: "ASSISTANT", content: "Hello!" }),
    });
    expect(aIUsage.create).toHaveBeenCalledTimes(1);
    expect(aIUsage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: "workspace-1",
        conversationId: "conv-1",
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
        latencyMs: expect.any(Number),
      }),
    });
  });

  it("has no next (terminal-by-absence) when config.next is not set", async () => {
    const { handler, chat, context } = setup();
    chat.mockResolvedValue({
      content: "Hello!",
      model: "gpt-4o-mini",
      promptTokens: 1,
      completionTokens: 1,
      totalTokens: 2,
      rawResponse: {},
    });

    const node = { key: "start", type: WorkflowNodeType.PROMPT, config: {} };
    const result = await handler.execute(node, context);

    expect(result.next).toBeUndefined();
    expect(result.terminal).toBe(false);
  });

  it("runs a dynamic tool-calling round-trip, persisting TOOL_CALL/TOOL_RESULT messages", async () => {
    const { handler, chat, context, toolExecutor, conversationMessage, aIUsage } = setup();
    toolExecutor.execute.mockResolvedValue({ content: '{"status":"SHIPPED"}' });
    chat
      .mockResolvedValueOnce({
        content: "",
        model: "gpt-4o-mini",
        promptTokens: 5,
        completionTokens: 2,
        totalTokens: 7,
        rawResponse: {},
        toolCalls: [{ id: "call_1", name: "lookup_order", arguments: {} }],
      })
      .mockResolvedValueOnce({
        content: "Your order shipped.",
        model: "gpt-4o-mini",
        promptTokens: 8,
        completionTokens: 4,
        totalTokens: 12,
        rawResponse: {},
      });

    const node = { key: "start", type: WorkflowNodeType.PROMPT, config: { next: "end" } };
    const result = await handler.execute(node, context);

    expect(chat).toHaveBeenCalledTimes(2);
    expect(toolExecutor.execute).toHaveBeenCalledWith(
      { id: "call_1", name: "lookup_order", arguments: {} },
      { workspaceId: "workspace-1", customerId: "customer-1", conversationId: "conv-1", orderId: "order-1", aiAgentId: undefined },
    );
    expect(result).toMatchObject({ next: "end", content: "Your order shipped.", toolCallsExecuted: ["lookup_order"] });
    expect(result.usage).toHaveLength(2);
    expect(aIUsage.create).toHaveBeenCalledTimes(2);
    expect(conversationMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ role: "TOOL_CALL" }),
    });
    expect(conversationMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ role: "TOOL_RESULT", content: '{"status":"SHIPPED"}' }),
    });
  });

  it("terminates the whole workflow immediately on a terminal tool result, ignoring config.next", async () => {
    const { handler, chat, context, toolExecutor } = setup();
    toolExecutor.execute.mockResolvedValue({ content: '{"ended":true}', terminal: true });
    chat.mockResolvedValue({
      content: "Goodbye!",
      model: "gpt-4o-mini",
      promptTokens: 1,
      completionTokens: 1,
      totalTokens: 2,
      rawResponse: {},
      toolCalls: [{ id: "call_1", name: "end_call", arguments: {} }],
    });

    const node = { key: "start", type: WorkflowNodeType.PROMPT, config: { next: "end" } };
    const result = await handler.execute(node, context);

    expect(chat).toHaveBeenCalledTimes(1);
    expect(result.terminal).toBe(true);
    expect(result.next).toBeUndefined();
    expect(result.content).toBe("Goodbye!");
  });

  it("does not expose tools when allowTools is false", async () => {
    const { handler, chat, context } = setup();
    chat.mockResolvedValue({
      content: "Hi",
      model: "gpt-4o-mini",
      promptTokens: 1,
      completionTokens: 1,
      totalTokens: 2,
      rawResponse: {},
    });

    const node = { key: "start", type: WorkflowNodeType.PROMPT, config: { allowTools: false } };
    await handler.execute(node, context);

    expect(chat).toHaveBeenCalledWith(expect.objectContaining({ tools: [] }));
  });

  it("injects promptOverride as an additional system message before calling the provider", async () => {
    const { handler, chat, context } = setup();
    chat.mockResolvedValue({
      content: "Hi",
      model: "gpt-4o-mini",
      promptTokens: 1,
      completionTokens: 1,
      totalTokens: 2,
      rawResponse: {},
    });

    const node = {
      key: "start",
      type: WorkflowNodeType.PROMPT,
      config: { promptOverride: "Focus on shipping." },
    };
    await handler.execute(node, context);

    expect(context.messages).toEqual(
      expect.arrayContaining([{ role: "system", content: "Focus on shipping." }]),
    );
  });

  it("stops after MAX_TOOL_ITERATIONS (5) even if the model keeps requesting tools", async () => {
    const { handler, chat, context, toolExecutor } = setup();
    toolExecutor.execute.mockResolvedValue({ content: "{}" });
    chat.mockResolvedValue({
      content: "",
      model: "gpt-4o-mini",
      promptTokens: 1,
      completionTokens: 1,
      totalTokens: 2,
      rawResponse: {},
      toolCalls: [{ id: "call_x", name: "lookup_order", arguments: {} }],
    });

    const node = { key: "start", type: WorkflowNodeType.PROMPT, config: { next: "end" } };
    await handler.execute(node, context);

    expect(chat).toHaveBeenCalledTimes(5);
  });

  it("falls back to a spoken message instead of silent empty content when the tool loop is exhausted (Sprint 21)", async () => {
    const { handler, chat, context, toolExecutor, conversationMessage } = setup();
    toolExecutor.execute.mockResolvedValue({ content: "{}" });
    chat.mockResolvedValue({
      content: "",
      model: "gpt-4o-mini",
      promptTokens: 1,
      completionTokens: 1,
      totalTokens: 2,
      rawResponse: {},
      toolCalls: [{ id: "call_x", name: "lookup_order", arguments: {} }],
    });

    const node = { key: "start", type: WorkflowNodeType.PROMPT, config: { next: "end" } };
    const result = await handler.execute(node, context);

    expect(result.content).not.toBe("");
    expect(result.terminal).toBe(false);
    expect(result.next).toBe("end");
    expect(conversationMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: "ASSISTANT", content: result.content }),
      }),
    );
  });

  it("forwards context.abortSignal into provider.chat() as signal (barge-in cancellation)", async () => {
    const { handler, chat, context } = setup();
    const controller = new AbortController();
    context.abortSignal = controller.signal;
    chat.mockResolvedValue({
      content: "Hello!",
      model: "gpt-4o-mini",
      promptTokens: 1,
      completionTokens: 1,
      totalTokens: 2,
      rawResponse: {},
    });

    const node = { key: "start", type: WorkflowNodeType.PROMPT, config: { next: "end" } };
    await handler.execute(node, context);

    expect(chat).toHaveBeenCalledWith(
      expect.objectContaining({ signal: controller.signal }),
    );
  });
});
