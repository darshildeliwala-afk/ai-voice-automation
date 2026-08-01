import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseFilters,
  UseGuards,
} from "@nestjs/common";

import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthenticatedUser } from "../auth/jwt.strategy";
import { CreateCallDto } from "./dto/create-call.dto";
import { EnqueueCallDto } from "./dto/enqueue-call.dto";
import { TelephonyExceptionFilter } from "./telephony-exception.filter";
import { TelephonyService } from "./telephony.service";

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
