import { randomUUID } from "node:crypto";

import { ValidationPipe } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../../src/app.module";
import { PrismaService } from "../../src/common/prisma/prisma.service";

describe("Dashboard (e2e, real HTTP + auth)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let workspaceId: string;
  let userId: string;
  let token: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    jwtService = app.get(JwtService);

    workspaceId = randomUUID();
    userId = randomUUID();

    await prisma.$executeRaw`
      INSERT INTO "Workspace" (id, name, slug, "createdAt", "updatedAt")
      VALUES (${workspaceId}::uuid, 'Dashboard E2E Workspace', ${`dashboard-e2e-${Date.now()}`}, now(), now())
    `;
    await prisma.$executeRaw`
      INSERT INTO "User" (id, "workspaceId", name, email, "passwordHash", role, "createdAt", "updatedAt")
      VALUES (${userId}::uuid, ${workspaceId}::uuid, 'Dashboard E2E User', ${`dashboard-e2e-${Date.now()}@example.com`}, 'irrelevant-hash', 'ADMIN', now(), now())
    `;

    token = await jwtService.signAsync({
      sub: userId,
      email: "dashboard-e2e@example.com",
      workspaceId,
      role: "ADMIN",
    });
  });

  afterAll(async () => {
    await prisma.$executeRaw`DELETE FROM "User" WHERE id = ${userId}::uuid`;
    await prisma.$executeRaw`DELETE FROM "Workspace" WHERE id = ${workspaceId}::uuid`;
    await app.close();
  });

  it("rejects unauthenticated requests with 401", async () => {
    await request(app.getHttpServer()).get("/dashboard/summary").expect(401);
  });

  it("GET /dashboard/summary returns zeroed counters for a fresh workspace", async () => {
    const res = await request(app.getHttpServer())
      .get("/dashboard/summary")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(res.body).toMatchObject({
      todayCalls: 0,
      todayAnswered: 0,
      todayMissed: 0,
      todayTransferred: 0,
      todayAppointments: 0,
      todayCallbacks: 0,
      avgCallDurationSeconds: null,
      avgResponseTimeMs: null,
      totalCustomers: 0,
      totalConversations: 0,
      activeAiAgents: 0,
      kbDocuments: 0,
    });
  });

  it("GET /dashboard/summary never leaks another workspace's data", async () => {
    const otherWorkspaceId = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO "Workspace" (id, name, slug, "createdAt", "updatedAt")
      VALUES (${otherWorkspaceId}::uuid, 'Dashboard E2E Other Workspace', ${`dashboard-e2e-other-${Date.now()}`}, now(), now())
    `;
    await prisma.customer.create({
      data: { workspaceId: otherWorkspaceId, name: "Other WS Customer", phone: "+14155590300" },
    });

    const res = await request(app.getHttpServer())
      .get("/dashboard/summary")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(res.body.totalCustomers).toBe(0);

    await prisma.customer.deleteMany({ where: { workspaceId: otherWorkspaceId } });
    await prisma.$executeRaw`DELETE FROM "Workspace" WHERE id = ${otherWorkspaceId}::uuid`;
  });
});
