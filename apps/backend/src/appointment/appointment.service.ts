import { Injectable } from "@nestjs/common";

import { BaseService } from "../common/base/base.service";
import type { PaginationDto } from "../common/pagination/pagination.dto";
import {
  buildPaginationMeta,
  type PaginationMeta,
} from "../common/pagination/pagination.util";
import { PrismaService } from "../common/prisma/prisma.service";
import { CustomerService } from "../customer/customer.service";
import { type Appointment, AppointmentStatus } from "../generated/prisma/client";
import { CreateAppointmentDto } from "./dto/create-appointment.dto";
import { UpdateAppointmentDto } from "./dto/update-appointment.dto";

export interface PaginatedAppointments {
  data: Appointment[];
  meta: PaginationMeta;
}

/**
 * Generic appointment booking (Sprint 19 book_appointment tool + admin
 * CRUD API). No external calendar integration -- pure DB record. Used
 * both by the admin CRUD controller and directly by BookAppointmentTool
 * (workspaceId/customerId/conversationId already trusted from
 * AIToolExecutionContext in that path).
 */
@Injectable()
export class AppointmentService extends BaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customerService: CustomerService,
  ) {
    super();
  }

  async createAppointment(dto: CreateAppointmentDto): Promise<Appointment> {
    await this.customerService.getCustomerById(dto.workspaceId, dto.customerId);

    return this.prisma.appointment.create({
      data: {
        workspaceId: dto.workspaceId,
        customerId: dto.customerId,
        conversationId: dto.conversationId,
        date: new Date(dto.date),
        time: dto.time,
        timezone: dto.timezone,
        notes: dto.notes,
      },
    });
  }

  async getAppointmentById(id: string): Promise<Appointment> {
    return this.throwIfNotFound(
      await this.prisma.appointment.findFirst({
        where: this.applySoftDelete({ id }),
      }),
      "Appointment",
      id,
    );
  }

  async listAppointments(
    workspaceId: string,
    pagination: PaginationDto,
    customerId?: string,
    status?: AppointmentStatus,
  ): Promise<PaginatedAppointments> {
    const { skip, take, orderBy } = this.buildPagination(pagination);

    const where = this.applySoftDelete({
      workspaceId,
      ...(customerId ? { customerId } : {}),
      ...(status ? { status } : {}),
    });

    const [data, total] = await Promise.all([
      this.prisma.appointment.findMany({ where, skip, take, orderBy }),
      this.prisma.appointment.count({ where }),
    ]);

    return { data, meta: buildPaginationMeta(total, pagination) };
  }

  async updateAppointment(
    id: string,
    dto: UpdateAppointmentDto,
  ): Promise<Appointment> {
    await this.getAppointmentById(id);

    return this.prisma.appointment.update({
      where: { id },
      data: { ...dto, date: dto.date ? new Date(dto.date) : undefined },
    });
  }

  async softDeleteAppointment(id: string): Promise<Appointment> {
    await this.getAppointmentById(id);

    return this.prisma.appointment.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
