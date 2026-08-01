import { randomUUID } from "node:crypto";

import { ValidationPipe } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../../src/app.module";
import { EncryptionService } from "../../src/common/encryption/encryption.service";
import { MASKED_SECRET_VALUE } from "../../src/common/masking/mask.util";
import { PrismaService } from "../../src/common/prisma/prisma.service";

describe("Workspace Settings (e2e, real HTTP + auth)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let encryptionService: EncryptionService;
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
    encryptionService = app.get(EncryptionService);
    jwtService = app.get(JwtService);

    workspaceId = randomUUID();
    userId = randomUUID();
    const slug = `settings-e2e-${Date.now()}`;

    await prisma.$executeRaw`
      INSERT INTO "Workspace" (id, name, slug, "createdAt", "updatedAt")
      VALUES (${workspaceId}::uuid, 'Settings E2E Workspace', ${slug}, now(), now())
    `;
    await prisma.$executeRaw`
      INSERT INTO "User" (id, "workspaceId", name, email, "passwordHash", role, "createdAt", "updatedAt")
      VALUES (${userId}::uuid, ${workspaceId}::uuid, 'Settings E2E User', ${`settings-e2e-${Date.now()}@example.com`}, 'irrelevant-hash', 'ADMIN', now(), now())
    `;

    token = await jwtService.signAsync({
      sub: userId,
      email: "settings-e2e@example.com",
      workspaceId,
      role: "ADMIN",
    });
  });

  afterAll(async () => {
    await prisma.aiProviderConfig.deleteMany({ where: { workspaceId } });
    await prisma.telephonyConfig.deleteMany({ where: { workspaceId } });
    await prisma.workspaceSettings.deleteMany({ where: { workspaceId } });
    await prisma.$executeRaw`DELETE FROM "User" WHERE id = ${userId}::uuid`;
    await prisma.$executeRaw`DELETE FROM "Workspace" WHERE id = ${workspaceId}::uuid`;
    await app.close();
  });

  it("rejects unauthenticated requests with 401", async () => {
    await request(app.getHttpServer())
      .get("/workspace-settings")
      .expect(401);
  });

  it("GET /workspace-settings auto-provisions and returns settings for the caller's workspace", async () => {
    const res = await request(app.getHttpServer())
      .get("/workspace-settings")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(res.body.workspaceId).toBe(workspaceId);
  });

  it("PUT /workspace-settings updates settings scoped to the caller's workspace, no manual workspaceId needed", async () => {
    const res = await request(app.getHttpServer())
      .put("/workspace-settings")
      .set("Authorization", `Bearer ${token}`)
      .send({
        businessName: "E2E Voice Co",
        businessEmail: "e2e@example.com",
        timezone: "Asia/Kolkata",
      })
      .expect(200);

    expect(res.body.businessName).toBe("E2E Voice Co");
    expect(res.body.workspaceId).toBe(workspaceId);
  });

  it("PUT /workspace-settings rejects an invalid email", async () => {
    await request(app.getHttpServer())
      .put("/workspace-settings")
      .set("Authorization", `Bearer ${token}`)
      .send({ businessEmail: "not-an-email" })
      .expect(400);
  });

  it("GET /workspace-settings/telephony responds with an empty body when unconfigured", async () => {
    // NestJS's Express adapter treats a `null` controller return the same as
    // `undefined` and sends an empty body rather than the JSON literal
    // `null` (see @nestjs/platform-express reply(): `isNil(body) =>
    // response.send()`). Consumers must treat "200 + empty body" as "no
    // active config", not `res.json()`, which would throw on empty input.
    const res = await request(app.getHttpServer())
      .get("/workspace-settings/telephony")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(res.text).toBe("");
  });

  it("PUT /workspace-settings/telephony masks the authToken in the response and encrypts it at rest", async () => {
    const res = await request(app.getHttpServer())
      .put("/workspace-settings/telephony")
      .set("Authorization", `Bearer ${token}`)
      .send({
        provider: "TWILIO",
        authId: "AC_e2e",
        authToken: "e2e-plaintext-secret-token",
        phoneNumber: "+14155552671",
      })
      .expect(200);

    expect(res.body.authToken).toBe(MASKED_SECRET_VALUE);
    expect(JSON.stringify(res.body)).not.toContain(
      "e2e-plaintext-secret-token",
    );

    const raw = await prisma.telephonyConfig.findUniqueOrThrow({
      where: { id: res.body.id },
    });
    expect(raw.authToken).not.toBe("e2e-plaintext-secret-token");
    expect(encryptionService.decrypt(raw.authToken)).toBe(
      "e2e-plaintext-secret-token",
    );
  });

  it("GET /workspace-settings/telephony returns the masked active config", async () => {
    const res = await request(app.getHttpServer())
      .get("/workspace-settings/telephony")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(res.body.authToken).toBe(MASKED_SECRET_VALUE);
    expect(res.body.provider).toBe("TWILIO");
  });

  it("PUT /workspace-settings/telephony requires authToken", async () => {
    await request(app.getHttpServer())
      .put("/workspace-settings/telephony")
      .set("Authorization", `Bearer ${token}`)
      .send({ provider: "TWILIO" })
      .expect(400);
  });

  it("GET /workspace-settings/ai-provider responds with an empty body when unconfigured", async () => {
    const res = await request(app.getHttpServer())
      .get("/workspace-settings/ai-provider")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(res.text).toBe("");
  });

  it("PUT /workspace-settings/ai-provider masks the apiKey in the response and encrypts it at rest", async () => {
    const res = await request(app.getHttpServer())
      .put("/workspace-settings/ai-provider")
      .set("Authorization", `Bearer ${token}`)
      .send({
        provider: "OPENAI",
        apiKey: "sk-e2e-plaintext-secret-key",
        defaultModel: "gpt-4o",
        temperature: 0.5,
      })
      .expect(200);

    expect(res.body.apiKey).toBe(MASKED_SECRET_VALUE);
    expect(JSON.stringify(res.body)).not.toContain(
      "sk-e2e-plaintext-secret-key",
    );

    const raw = await prisma.aiProviderConfig.findUniqueOrThrow({
      where: { id: res.body.id },
    });
    expect(raw.apiKey).not.toBe("sk-e2e-plaintext-secret-key");
    expect(encryptionService.decrypt(raw.apiKey)).toBe(
      "sk-e2e-plaintext-secret-key",
    );
  });

  it("GET /workspace-settings/ai-provider returns the masked active config", async () => {
    const res = await request(app.getHttpServer())
      .get("/workspace-settings/ai-provider")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(res.body.apiKey).toBe(MASKED_SECRET_VALUE);
    expect(res.body.provider).toBe("OPENAI");
  });

  it("PUT /workspace-settings/ai-provider rejects an out-of-range temperature", async () => {
    await request(app.getHttpServer())
      .put("/workspace-settings/ai-provider")
      .set("Authorization", `Bearer ${token}`)
      .send({ provider: "OPENAI", apiKey: "sk-another-key", temperature: 5 })
      .expect(400);
  });
});
