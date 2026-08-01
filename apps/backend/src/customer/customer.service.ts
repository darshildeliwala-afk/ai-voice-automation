import { ConflictException, Injectable } from "@nestjs/common";

import { BaseService } from "../common/base/base.service";
import type { PaginationDto } from "../common/pagination/pagination.dto";
import {
  buildPaginationMeta,
  type PaginationMeta,
} from "../common/pagination/pagination.util";
import { PrismaService } from "../common/prisma/prisma.service";
import { Prisma, type Customer } from "../generated/prisma/client";
import { WorkspaceService } from "../workspace/workspace.service";
import { CreateCustomerDto } from "./dto/create-customer.dto";
import { UpdateCustomerDto } from "./dto/update-customer.dto";

export interface PaginatedCustomers {
  data: Customer[];
  meta: PaginationMeta;
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
