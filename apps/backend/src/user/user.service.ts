import { Injectable, NotFoundException } from "@nestjs/common";

import { PrismaService } from "../common/prisma/prisma.service";
import type { User } from "../generated/prisma/client";
import { WorkspaceService } from "../workspace/workspace.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
  ) {}

  async createUser(dto: CreateUserDto): Promise<User> {
    await this.workspaceService.getWorkspaceById(dto.workspaceId);

    return this.prisma.user.create({
      data: dto,
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { email, deletedAt: null },
    });
  }

  async updateLastLogin(id: string): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: { lastLoginAt: new Date() },
    });
  }

  async getUserById(id: string): Promise<User> {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }

    return user;
  }

  async listUsers(workspaceId: string): Promise<User[]> {
    await this.workspaceService.getWorkspaceById(workspaceId);

    return this.prisma.user.findMany({
      where: { workspaceId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
  }

  async updateUser(id: string, dto: UpdateUserDto): Promise<User> {
    await this.getUserById(id);

    return this.prisma.user.update({
      where: { id },
      data: dto,
    });
  }

  async softDeleteUser(id: string): Promise<User> {
    await this.getUserById(id);

    return this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
