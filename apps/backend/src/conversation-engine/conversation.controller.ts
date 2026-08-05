import { Controller, Get, Param, ParseUUIDPipe, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { ConversationService } from "./conversation.service";
import { ListConversationsQueryDto } from "./dto/list-conversations-query.dto";

/**
 * Read-only admin API (Sprint 20) over Conversation/ConversationMessage/
 * AIUsage -- unguarded, matching the ai-agent/knowledge-base convention
 * (workspace validated internally via WorkspaceService, not @CurrentUser).
 */
@ApiTags("conversations")
@Controller("conversations")
export class ConversationController {
  constructor(private readonly conversationService: ConversationService) {}

  @Get()
  @ApiOperation({ summary: "List conversations for a workspace" })
  list(@Query() query: ListConversationsQueryDto) {
    const { workspaceId, customerId, ...pagination } = query;

    return this.conversationService.listConversations(
      workspaceId,
      pagination,
      customerId,
    );
  }

  @Get(":id")
  @ApiOperation({
    summary: "Conversation detail -- messages, tool calls, token usage/cost/latency, sentiment, summary",
  })
  getDetail(@Param("id", ParseUUIDPipe) id: string) {
    return this.conversationService.getConversationDetail(id);
  }
}
