import { ConflictException, Injectable } from "@nestjs/common";

import { BaseService } from "../common/base/base.service";
import type { PaginationDto } from "../common/pagination/pagination.dto";
import {
  buildPaginationMeta,
  type PaginationMeta,
} from "../common/pagination/pagination.util";
import { PrismaService } from "../common/prisma/prisma.service";
import {
  Prisma,
  type Appointment,
  type CallQueue,
  type Conversation,
  type ConversationSummary,
  type CrmNote,
  type Customer,
  type Order,
} from "../generated/prisma/client";
import { WorkspaceService } from "../workspace/workspace.service";
import { CreateCustomerDto } from "./dto/create-customer.dto";
import { UpdateCustomerDto } from "./dto/update-customer.dto";

export interface PaginatedCustomers {
  data: Customer[];
  meta: PaginationMeta;
}

export interface CustomerProfile {
  customer: Customer;
  orders: Order[];
  crmNotes: CrmNote[];
  appointments: Appointment[];
  /** CallQueue rows with a non-null `reason` -- Sprint 19's create_callback tool is what sets `reason`, so this is exactly "requested callbacks," scoped through the customer's own orders (CallQueue has no customerId column). */
  callbacks: CallQueue[];
  conversations: (Conversation & { summary: ConversationSummary | null })[];
}

@Injectable()
export class CustomerService extends BaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
  ) {
    super();
  }

  async createCustomer(
    workspaceId: string,
    dto: CreateCustomerDto,
  ): Promise<Customer> {
    await this.workspaceService.getWorkspaceById(workspaceId);
    await this.assertPhoneNotTaken(workspaceId, dto.phone);

    return this.prisma.customer.create({
      data: { ...dto, workspaceId },
    });
  }

  /** Scoped to workspaceId -- a customer belonging to another workspace is treated as not found. */
  async getCustomerById(workspaceId: string, id: string): Promise<Customer> {
    return this.throwIfNotFound(
      await this.prisma.customer.findFirst({
        where: this.applySoftDelete({ id, workspaceId }),
      }),
      "Customer",
      id,
    );
  }

  /**
   * Admin Customer Profile API (Sprint 20) -- aggregates everything the
   * dashboard needs about one customer in a single response: orders,
   * CRM notes, appointments, requested callbacks, and conversation
   * history (with each conversation's Sprint 19 summary attached).
   * CallQueue has no `customerId` column (only `orderId`), so callbacks
   * are correctly joined through the customer's own orders, never a
   * nonexistent `customerId` filter.
   */
  async getCustomerProfile(
    workspaceId: string,
    customerId: string,
  ): Promise<CustomerProfile> {
    const customer = await this.getCustomerById(workspaceId, customerId);

    const orders = await this.prisma.order.findMany({
      where: { workspaceId, customerId },
    });
    const orderIds = orders.map((order) => order.id);

    const [crmNotes, appointments, callbacks, conversations] = await Promise.all([
      this.prisma.crmNote.findMany({
        where: { workspaceId, customerId, deletedAt: null },
      }),
      this.prisma.appointment.findMany({
        where: { workspaceId, customerId, deletedAt: null },
      }),
      this.prisma.callQueue.findMany({
        where: { orderId: { in: orderIds }, reason: { not: null } },
      }),
      this.prisma.conversation.findMany({
        where: { workspaceId, customerId },
        include: { summary: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return { customer, orders, crmNotes, appointments, callbacks, conversations };
  }

  /**
   * Precise (non-fuzzy) exact match, workspace-scoped, priority
   * customerId > phone > email -- unlike listCustomers()'s fuzzy `contains`
   * search, this is for tools (Sprint 19 lookup_customer/lookup_order)
   * that need one definite match, not a results list. Returns null
   * (never throws) when no identifier is given or nothing matches.
   */
  async findByIdentifier(
    workspaceId: string,
    identifier: { customerId?: string; phone?: string; email?: string },
  ): Promise<Customer | null> {
    if (identifier.customerId) {
      return this.prisma.customer.findFirst({
        where: this.applySoftDelete({ id: identifier.customerId, workspaceId }),
      });
    }
    if (identifier.phone) {
      return this.prisma.customer.findFirst({
        where: this.applySoftDelete({ phone: identifier.phone, workspaceId }),
      });
    }
    if (identifier.email) {
      return this.prisma.customer.findFirst({
        where: this.applySoftDelete({ email: identifier.email, workspaceId }),
      });
    }
    return null;
  }

  async listCustomers(
    workspaceId: string,
    pagination: PaginationDto,
    search?: string,
  ): Promise<PaginatedCustomers> {
    const { skip, take, orderBy } = this.buildPagination(pagination);

    const where: Prisma.CustomerWhereInput = this.applySoftDelete({
      workspaceId,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: Prisma.QueryMode.insensitive } },
              { phone: { contains: search, mode: Prisma.QueryMode.insensitive } },
              { email: { contains: search, mode: Prisma.QueryMode.insensitive } },
            ],
          }
        : {}),
    });

    const [data, total] = await Promise.all([
      this.prisma.customer.findMany({ where, skip, take, orderBy }),
      this.prisma.customer.count({ where }),
    ]);

    return { data, meta: buildPaginationMeta(total, pagination) };
  }

  async updateCustomer(
    workspaceId: string,
    id: string,
    dto: UpdateCustomerDto,
  ): Promise<Customer> {
    const customer = await this.getCustomerById(workspaceId, id);

    if (dto.phone && dto.phone !== customer.phone) {
      await this.assertPhoneNotTaken(workspaceId, dto.phone, id);
    }

    return this.prisma.customer.update({
      where: { id },
      data: dto,
    });
  }

  async softDeleteCustomer(workspaceId: string, id: string): Promise<Customer> {
    await this.getCustomerById(workspaceId, id);

    return this.prisma.customer.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  private async assertPhoneNotTaken(
    workspaceId: string,
    phone: string,
    excludeId?: string,
  ): Promise<void> {
    const where: Prisma.CustomerWhereInput = {
      workspaceId,
      phone,
      deletedAt: null,
    };

    if (excludeId) {
      where.id = { not: excludeId };
    }

    const duplicate = await this.prisma.customer.findFirst({ where });

    if (duplicate) {
      throw new ConflictException(
        `Customer with phone ${phone} already exists in this workspace`,
      );
    }
  }
}
