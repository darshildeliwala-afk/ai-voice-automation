import { randomUUID } from "node:crypto";

import { ValidationPipe } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../../src/app.module";
import { PrismaService } from "../../src/common/prisma/prisma.service";

describe("Customer (e2e, real HTTP + auth)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let workspaceId: string;
  let otherWorkspaceId: string;
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
    otherWorkspaceId = randomUUID();
    userId = randomUUID();

    await prisma.$executeRaw`
      INSERT INTO "Workspace" (id, name, slug, "createdAt", "updatedAt")
      VALUES (${workspaceId}::uuid, 'Customer E2E Workspace', ${`customer-e2e-${Date.now()}`}, now(), now())
    `;
    await prisma.$executeRaw`
      INSERT INTO "Workspace" (id, name, slug, "createdAt", "updatedAt")
      VALUES (${otherWorkspaceId}::uuid, 'Customer E2E Other Workspace', ${`customer-e2e-other-${Date.now()}`}, now(), now())
    `;
    await prisma.$executeRaw`
      INSERT INTO "User" (id, "workspaceId", name, email, "passwordHash", role, "createdAt", "updatedAt")
      VALUES (${userId}::uuid, ${workspaceId}::uuid, 'Customer E2E User', ${`customer-e2e-${Date.now()}@example.com`}, 'irrelevant-hash', 'ADMIN', now(), now())
    `;

    token = await jwtService.signAsync({
      sub: userId,
      email: "customer-e2e@example.com",
      workspaceId,
      role: "ADMIN",
    });
  });

  afterAll(async () => {
    await prisma.customer.deleteMany({
      where: { workspaceId: { in: [workspaceId, otherWorkspaceId] } },
    });
    await prisma.$executeRaw`DELETE FROM "User" WHERE id = ${userId}::uuid`;
    await prisma.$executeRaw`DELETE FROM "Workspace" WHERE id IN (${workspaceId}::uuid, ${otherWorkspaceId}::uuid)`;
    await app.close();
  });

  it("rejects unauthenticated requests with 401", async () => {
    await request(app.getHttpServer())
      .post("/customers")
      .send({ name: "X", phone: "+14155580000" })
      .expect(401);
  });

  it("400s when the body fails DTO validation", async () => {
    await request(app.getHttpServer())
      .post("/customers")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "" })
      .expect(400);
  });

  it("400s (whitelist rejection) when a client tries to pass workspaceId in the body", async () => {
    await request(app.getHttpServer())
      .post("/customers")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Sneaky",
        phone: "+14155580001",
        workspaceId: randomUUID(),
      })
      .expect(400);
  });

  let createdId: string;

  it("POST /customers creates a customer scoped to the caller's workspace", async () => {
    const res = await request(app.getHttpServer())
      .post("/customers")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "E2E Customer", phone: "+14155580002" })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.workspaceId).toBe(workspaceId);
    createdId = res.body.id;
  });

  it("POST /customers 409s on a duplicate phone within the same workspace", async () => {
    await request(app.getHttpServer())
      .post("/customers")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Duplicate Phone", phone: "+14155580002" })
      .expect(409);
  });

  it("GET /customers/:id returns the customer", async () => {
    const res = await request(app.getHttpServer())
      .get(`/customers/${createdId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(res.body.id).toBe(createdId);
  });

  it("GET /customers/:id 404s when requested from a different workspace", async () => {
    const otherToken = await jwtService.signAsync({
      sub: randomUUID(),
      email: "irrelevant@example.com",
      workspaceId: otherWorkspaceId,
      role: "ADMIN",
    });

    await request(app.getHttpServer())
      .get(`/customers/${createdId}`)
      .set("Authorization", `Bearer ${otherToken}`)
      .expect(404);
  });

  it("PATCH /customers/:id updates the customer", async () => {
    const res = await request(app.getHttpServer())
      .patch(`/customers/${createdId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Renamed E2E Customer" })
      .expect(200);

    expect(res.body.name).toBe("Renamed E2E Customer");
  });

  it("GET /customers lists with pagination and search", async () => {
    const res = await request(app.getHttpServer())
      .get("/customers?search=Renamed&page=1&limit=10")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.some((c: { id: string }) => c.id === createdId)).toBe(
      true,
    );
    expect(res.body.meta.page).toBe(1);
  });

  it("DELETE /customers/:id soft-deletes the customer", async () => {
    await request(app.getHttpServer())
      .delete(`/customers/${createdId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(204);

    await request(app.getHttpServer())
      .get(`/customers/${createdId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(404);
  });
});
