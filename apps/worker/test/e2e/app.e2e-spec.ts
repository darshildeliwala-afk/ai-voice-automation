import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";

import { AppModule } from "../../src/app.module";

describe("Worker app (e2e)", () => {
  let app: INestApplication;
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  it("GET /health returns 200 with database and redis both up", async () => {
    const response = await request(app.getHttpServer()).get("/health");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
    expect(response.body.info.database.status).toBe("up");
    expect(response.body.info.redis.status).toBe("up");
  });

  it("GET /queue/metrics returns bullmq and database job counts", async () => {
    const response = await request(app.getHttpServer()).get("/queue/metrics");

    expect(response.status).toBe(200);
    expect(response.body.queue).toBe("call-queue");
    expect(typeof response.body.bullmq.waiting).toBe("number");
    expect(typeof response.body.bullmq.active).toBe("number");
    expect(typeof response.body.database).toBe("object");
  });
});
