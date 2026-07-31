import { BadRequestException, Injectable } from "@nestjs/common";

import { BaseService } from "../common/base/base.service";
import type { PaginationDto } from "../common/pagination/pagination.dto";
import {
  buildPaginationMeta,
  type PaginationMeta,
} from "../common/pagination/pagination.util";
import { PrismaService } from "../common/prisma/prisma.service";
import { CustomerService } from "../customer/customer.service";
import { Prisma, type Order, type OrderItem } from "../generated/prisma/client";
import { CreateOrderDto } from "./dto/create-order.dto";
import { UpdateOrderDto } from "./dto/update-order.dto";

export type OrderWithItems = Order & { items: OrderItem[] };

export interface PaginatedOrders {
  data: OrderWithItems[];
  meta: PaginationMeta;
}

@Injectable()
export class OrderService extends BaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customerService: CustomerService,
  ) {
    super();
  }

  async createOrder(dto: CreateOrderDto): Promise<OrderWithItems> {
    const customer = await this.customerService.getCustomerById(
      dto.customerId,
    );

    if (customer.workspaceId !== dto.workspaceId) {
      throw new BadRequestException(
        "Customer does not belong to the specified workspace",
      );
    }

    const { items, ...orderData } = dto;

    return this.prisma.$transaction((tx) =>
      tx.order.create({
        data: {
          ...orderData,
          items: items?.length ? { create: items } : undefined,
        },
        include: { items: true },
      }),
    );
  }

  async getOrderById(id: string): Promise<OrderWithItems> {
    return this.throwIfNotFound(
      await this.prisma.order.findFirst({
        where: this.applySoftDelete({ id }),
        include: { items: true },
      }),
      "Order",
      id,
    );
  }

  async listOrders(
    workspaceId: string,
    pagination: PaginationDto,
  ): Promise<PaginatedOrders> {
    const { skip, take, orderBy } = this.buildPagination(pagination);
    const where = this.applySoftDelete({ workspaceId });

    const [data, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip,
        take,
        orderBy,
        include: { items: true },
      }),
      this.prisma.order.count({ where }),
    ]);

    return { data, meta: buildPaginationMeta(total, pagination) };
  }

  async searchOrders(
    workspaceId: string,
    query: string,
  ): Promise<OrderWithItems[]> {
    const where: Prisma.OrderWhereInput = {
      workspaceId,
      deletedAt: null,
      OR: [
        {
          marketplaceOrderId: {
            contains: query,
            mode: Prisma.QueryMode.insensitive,
          },
        },
        {
          customer: {
            name: { contains: query, mode: Prisma.QueryMode.insensitive },
          },
        },
        {
          customer: {
            phone: { contains: query, mode: Prisma.QueryMode.insensitive },
          },
        },
      ],
    };

    return this.prisma.order.findMany({ where, include: { items: true } });
  }

  async updateOrder(
    id: string,
    dto: UpdateOrderDto,
  ): Promise<OrderWithItems> {
    await this.getOrderById(id);

    const { items, ...orderData } = dto;

    if (items) {
      return this.prisma.$transaction(async (tx) => {
        await tx.orderItem.deleteMany({ where: { orderId: id } });

        return tx.order.update({
          where: { id },
          data: {
            ...orderData,
            items: items.length ? { create: items } : undefined,
          },
          include: { items: true },
        });
      });
    }

    return this.prisma.order.update({
      where: { id },
      data: orderData,
      include: { items: true },
    });
  }

  async softDeleteOrder(id: string): Promise<Order> {
    await this.getOrderById(id);

    return this.prisma.order.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
