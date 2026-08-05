import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import { CreateOrderDto } from "../order/dto/create-order.dto";
import { UpdateOrderDto } from "../order/dto/update-order.dto";
import { OrderService } from "../order/order.service";
import { ListOrdersQueryDto } from "./dto/list-orders-query.dto";
import { SearchOrdersQueryDto } from "./dto/search-orders-query.dto";

@ApiTags("orders")
@Controller("orders")
export class OrdersController {
  constructor(private readonly orderService: OrderService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateOrderDto) {
    return this.orderService.createOrder(dto);
  }

  @Get("search")
  search(@Query() query: SearchOrdersQueryDto) {
    return this.orderService.searchOrders(query.workspaceId, query.q);
  }

  @Get()
  list(@Query() query: ListOrdersQueryDto) {
    const { workspaceId, ...pagination } = query;

    return this.orderService.listOrders(workspaceId, pagination);
  }

  @Get(":id")
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.orderService.getOrderById(id);
  }

  @Patch(":id")
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderDto,
  ) {
    return this.orderService.updateOrder(id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param("id", ParseUUIDPipe) id: string): Promise<void> {
    await this.orderService.softDeleteOrder(id);
  }
}
