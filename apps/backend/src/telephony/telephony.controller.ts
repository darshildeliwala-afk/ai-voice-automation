import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseFilters,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthenticatedUser } from "../auth/jwt.strategy";
import { CreateCallDto } from "./dto/create-call.dto";
import { EnqueueCallDto } from "./dto/enqueue-call.dto";
import { ListCallsQueryDto } from "./dto/list-calls-query.dto";
import { TelephonyExceptionFilter } from "./telephony-exception.filter";
import { TelephonyService } from "./telephony.service";

@ApiTags("telephony")
@Controller("telephony")
@UseGuards(JwtAuthGuard)
@UseFilters(TelephonyExceptionFilter)
export class TelephonyController {
  constructor(private readonly telephonyService: TelephonyService) {}

  @Post("queue")
  @HttpCode(HttpStatus.CREATED)
  enqueueCall(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: EnqueueCallDto,
  ) {
    return this.telephonyService.enqueueCall(user.workspaceId, dto);
  }

  @Post("call")
  @HttpCode(HttpStatus.CREATED)
  createCall(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCallDto,
  ) {
    return this.telephonyService.createCall(user.workspaceId, dto);
  }

  @Get("live-calls")
  @ApiOperation({ summary: "List currently active/live calls (Sprint 20)" })
  listLiveCalls(@CurrentUser() user: AuthenticatedUser) {
    return this.telephonyService.listLiveCalls(user.workspaceId);
  }

  @Get("calls")
  @ApiOperation({ summary: "Search/filter/paginate call history (Sprint 20)" })
  listCalls(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListCallsQueryDto,
  ) {
    const { status, direction, customerId, dateFrom, dateTo, search, ...pagination } = query;

    return this.telephonyService.listCalls(user.workspaceId, pagination, {
      status,
      direction,
      customerId,
      dateFrom,
      dateTo,
      search,
    });
  }

  @Get("calls/:id")
  getCall(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.telephonyService.getCallById(user.workspaceId, id);
  }

  @Post("calls/:id/hangup")
  hangupCall(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.telephonyService.hangupCall(user.workspaceId, id);
  }
}
