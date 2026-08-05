import { Module } from "@nestjs/common";

import { AiModule } from "../../ai/ai.module";
import { AppointmentModule } from "../../appointment/appointment.module";
import { CallQueueModule } from "../../call-queue/call-queue.module";
import { CrmNoteModule } from "../../crm-note/crm-note.module";
import { CustomerModule } from "../../customer/customer.module";
import { KnowledgeBaseModule } from "../../knowledge-base/knowledge-base.module";
import { LeadQualificationModule } from "../../lead-qualification/lead-qualification.module";
import { OrderModule } from "../../order/order.module";
import { CallSummaryService } from "../call-summary.service";
import { SentimentAnalysisService } from "../sentiment-analysis.service";
import { AIToolExecutor } from "./ai-tool-executor";
import { AI_TOOLS, AIToolRegistry } from "./ai-tool-registry";
import { BookAppointmentTool } from "./book-appointment.tool";
import { CreateCallbackTool } from "./create-callback.tool";
import { CreateCrmNoteTool } from "./create-crm-note.tool";
import { EndCallTool } from "./end-call.tool";
import { LookupCustomerTool } from "./lookup-customer.tool";
import { LookupOrderTool } from "./lookup-order.tool";
import { QualifyLeadTool } from "./qualify-lead.tool";
import { SearchKnowledgeBaseTool } from "./search-knowledge-base.tool";
import { TransferToHumanTool } from "./transfer-to-human.tool";
import { UpdateCustomerTagsTool } from "./update-customer-tags.tool";

/**
 * The Sprint 15 AI Tool Framework (IAITool/AIToolRegistry/AIToolExecutor),
 * extended in Sprint 19 with 4 new business-skill tools (qualify_lead,
 * book_appointment, create_crm_note, update_customer_tags) alongside the
 * original 6 -- extracted into its own module so both ConversationEngine
 * (a PROMPT node's dynamic tool-calling loop) and the workflow engine
 * (TOOL/END/HUMAN_TRANSFER/CALLBACK node handlers, which invoke a
 * specific named tool deterministically) can depend on it without a
 * circular import between the two. Registering a tool here is the entire
 * integration point for both call sites -- see AIToolRegistry's doc
 * comment.
 */
@Module({
  imports: [
    AiModule,
    CustomerModule,
    OrderModule,
    KnowledgeBaseModule,
    CallQueueModule,
    CrmNoteModule,
    AppointmentModule,
    LeadQualificationModule,
  ],
  providers: [
    AIToolRegistry,
    AIToolExecutor,
    SentimentAnalysisService,
    CallSummaryService,
    LookupCustomerTool,
    LookupOrderTool,
    SearchKnowledgeBaseTool,
    EndCallTool,
    TransferToHumanTool,
    CreateCallbackTool,
    QualifyLeadTool,
    BookAppointmentTool,
    CreateCrmNoteTool,
    UpdateCustomerTagsTool,
    {
      provide: AI_TOOLS,
      useFactory: (
        lookupCustomer: LookupCustomerTool,
        lookupOrder: LookupOrderTool,
        searchKnowledgeBase: SearchKnowledgeBaseTool,
        endCall: EndCallTool,
        transferToHuman: TransferToHumanTool,
        createCallback: CreateCallbackTool,
        qualifyLead: QualifyLeadTool,
        bookAppointment: BookAppointmentTool,
        createCrmNote: CreateCrmNoteTool,
        updateCustomerTags: UpdateCustomerTagsTool,
      ) => [
        lookupCustomer,
        lookupOrder,
        searchKnowledgeBase,
        endCall,
        transferToHuman,
        createCallback,
        qualifyLead,
        bookAppointment,
        createCrmNote,
        updateCustomerTags,
      ],
      inject: [
        LookupCustomerTool,
        LookupOrderTool,
        SearchKnowledgeBaseTool,
        EndCallTool,
        TransferToHumanTool,
        CreateCallbackTool,
        QualifyLeadTool,
        BookAppointmentTool,
        CreateCrmNoteTool,
        UpdateCustomerTagsTool,
      ],
    },
  ],
  exports: [AIToolRegistry, AIToolExecutor],
})
export class AiToolsModule {}
