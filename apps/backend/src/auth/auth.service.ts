import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";

import type { User } from "../generated/prisma/client";
import { UserService } from "../user/user.service";

export interface AuthResult {
  accessToken: string;
  user: Omit<User, "passwordHash">;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
  ) {}

  async login(email: string, password: string): Promise<AuthResult> {
    const user = await this.userService.findByEmail(email);

    if (!user || !user.isActive || !user.passwordHash) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const updatedUser = await this.userService.updateLastLogin(user.id);

    const accessToken = await this.jwtService.signAsync({
      sub: updatedUser.id,
      email: updatedUser.email,
      workspaceId: updatedUser.workspaceId,
      role: updatedUser.role,
    });

    const { passwordHash: _passwordHash, ...safeUser } = updatedUser;

    return { accessToken, user: safeUser };
  }
}
