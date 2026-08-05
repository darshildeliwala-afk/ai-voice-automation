import { Injectable } from "@nestjs/common";

import { BaseService } from "../common/base/base.service";
import type { PaginationDto } from "../common/pagination/pagination.dto";
import {
  buildPaginationMeta,
  type PaginationMeta,
} from "../common/pagination/pagination.util";
import { PrismaService } from "../common/prisma/prisma.service";
import {
  type LeadInterestLevel,
  type LeadQualification,
} from "../generated/prisma/client";
import { UpdateLeadQualificationDto } from "./dto/update-lead-qualification.dto";

export interface LeadQualificationFields {
  name?: string;
  company?: string;
  budget?: string;
  requirement?: string;
  timeline?: string;
  city?: string;
  email?: string;
  interestLevel?: LeadInterestLevel;
}

export interface PaginatedLeadQualifications {
  data: LeadQualification[];
  meta: PaginationMeta;
}

/**
 * One row per conversation, upsert-merged as the qualify_lead tool learns
 * more fields across multiple calls within that conversation (Sprint 19).
 * Prisma's update ignores keys whose value is `undefined`, so passing
 * only the fields a given call actually knows never nulls out fields
 * learned earlier -- no manual read-modify-write needed.
 */
@Injectable()
export class LeadQualificationService extends BaseService {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async upsertForConversation(
    workspaceId: string,
    customerId: string,
    conversationId: string,
    fields: LeadQualificationFields,
  ): Promise<LeadQualification> {
    return this.prisma.leadQualification.upsert({
      where: { conversationId },
      create: { workspaceId, customerId, conversationId, ...fields },
      update: fields,
    });
  }

  async getById(id: string): Promise<LeadQualification> {
    return this.throwIfNotFound(
      await this.prisma.leadQualification.findFirst({
        where: this.applySoftDelete({ id }),
      }),
      "LeadQualification",
      id,
    );
  }

  async listLeadQualifications(
    workspaceId: string,
    pagination: PaginationDto,
    interestLevel?: LeadInterestLevel,
  ): Promise<PaginatedLeadQualifications> {
    const { skip, take, orderBy } = this.buildPagination(pagination);

    const where = this.applySoftDelete({
      workspaceId,
      ...(interestLevel ? { interestLevel } : {}),
    });

    const [data, total] = await Promise.all([
      this.prisma.leadQualification.findMany({ where, skip, take, orderBy }),
      this.prisma.leadQualification.count({ where }),
    ]);

    return { data, meta: buildPaginationMeta(total, pagination) };
  }

  async update(
    id: string,
    dto: UpdateLeadQualificationDto,
  ): Promise<LeadQualification> {
    await this.getById(id);

    return this.prisma.leadQualification.update({ where: { id }, data: dto });
  }

  async softDelete(id: string): Promise<LeadQualification> {
    await this.getById(id);

    return this.prisma.leadQualification.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
