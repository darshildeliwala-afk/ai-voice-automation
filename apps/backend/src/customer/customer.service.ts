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

  async createCustomer(dto: CreateCustomerDto): Promise<Customer> {
    await this.workspaceService.getWorkspaceById(dto.workspaceId);
    await this.assertPhoneNotTaken(dto.workspaceId, dto.phone);

    return this.prisma.customer.create({
      data: dto,
    });
  }

  async getCustomerById(id: string): Promise<Customer> {
    const customer = this.throwIfNotFound(
      await this.prisma.customer.findFirst({
        where: this.applySoftDelete({ id }),
      }),
      "Customer",
      id,
    );

    await this.workspaceService.getWorkspaceById(customer.workspaceId);

    return customer;
  }

  async listCustomers(
    workspaceId: string,
    pagination: PaginationDto,
  ): Promise<PaginatedCustomers> {
    await this.workspaceService.getWorkspaceById(workspaceId);

    const { skip, take, orderBy } = this.buildPagination(pagination);
    const where = this.applySoftDelete({ workspaceId });

    const [data, total] = await Promise.all([
      this.prisma.customer.findMany({ where, skip, take, orderBy }),
      this.prisma.customer.count({ where }),
    ]);

    return { data, meta: buildPaginationMeta(total, pagination) };
  }

  async searchCustomers(workspaceId: string, query: string): Promise<Customer[]> {
    await this.workspaceService.getWorkspaceById(workspaceId);

    const where: Prisma.CustomerWhereInput = {
      workspaceId,
      deletedAt: null,
      OR: [
        { name: { contains: query, mode: Prisma.QueryMode.insensitive } },
        { phone: { contains: query, mode: Prisma.QueryMode.insensitive } },
        { email: { contains: query, mode: Prisma.QueryMode.insensitive } },
      ],
    };

    return this.prisma.customer.findMany({ where });
  }

  async updateCustomer(
    id: string,
    dto: UpdateCustomerDto,
  ): Promise<Customer> {
    const customer = await this.getCustomerById(id);

    if (dto.phone && dto.phone !== customer.phone) {
      await this.assertPhoneNotTaken(customer.workspaceId, dto.phone, id);
    }

    return this.prisma.customer.update({
      where: { id },
      data: dto,
    });
  }

  async softDeleteCustomer(id: string): Promise<Customer> {
    await this.getCustomerById(id);

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
