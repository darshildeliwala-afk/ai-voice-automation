import { Injectable } from "@nestjs/common";

import { BaseService } from "../common/base/base.service";
import type { PaginationDto } from "../common/pagination/pagination.dto";
import {
  buildPaginationMeta,
  type PaginationMeta,
} from "../common/pagination/pagination.util";
import { PrismaService } from "../common/prisma/prisma.service";
import { CustomerService } from "../customer/customer.service";
import type { CrmNote } from "../generated/prisma/client";
import { CreateCrmNoteDto } from "./dto/create-crm-note.dto";
import { UpdateCrmNoteDto } from "./dto/update-crm-note.dto";

export interface PaginatedCrmNotes {
  data: CrmNote[];
  meta: PaginationMeta;
}

/**
 * Free-form CRM notes (Sprint 19 create_crm_note tool + admin CRUD API),
 * attached to a customer and optionally the conversation they were
 * written during. listRecentForCustomer() is the lean internal method
 * the improved lookup_customer tool calls; listCrmNotes() is the full
 * paginated admin-API method.
 */
@Injectable()
export class CrmNoteService extends BaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customerService: CustomerService,
  ) {
    super();
  }

  async createNote(dto: CreateCrmNoteDto): Promise<CrmNote> {
    await this.customerService.getCustomerById(dto.workspaceId, dto.customerId);

    return this.prisma.crmNote.create({ data: dto });
  }

  async getNoteById(id: string): Promise<CrmNote> {
    return this.throwIfNotFound(
      await this.prisma.crmNote.findFirst({
        where: this.applySoftDelete({ id }),
      }),
      "CrmNote",
      id,
    );
  }

  /** Lean, unpaginated -- backs lookup_customer's "notes" field (Sprint 19). */
  async listRecentForCustomer(
    workspaceId: string,
    customerId: string,
    limit = 5,
  ): Promise<CrmNote[]> {
    return this.prisma.crmNote.findMany({
      where: this.applySoftDelete({ workspaceId, customerId }),
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  async listCrmNotes(
    workspaceId: string,
    pagination: PaginationDto,
    customerId?: string,
  ): Promise<PaginatedCrmNotes> {
    const { skip, take, orderBy } = this.buildPagination(pagination);

    const where = this.applySoftDelete({
      workspaceId,
      ...(customerId ? { customerId } : {}),
    });

    const [data, total] = await Promise.all([
      this.prisma.crmNote.findMany({ where, skip, take, orderBy }),
      this.prisma.crmNote.count({ where }),
    ]);

    return { data, meta: buildPaginationMeta(total, pagination) };
  }

  async updateNote(id: string, dto: UpdateCrmNoteDto): Promise<CrmNote> {
    await this.getNoteById(id);

    return this.prisma.crmNote.update({ where: { id }, data: dto });
  }

  async softDeleteNote(id: string): Promise<CrmNote> {
    await this.getNoteById(id);

    return this.prisma.crmNote.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
