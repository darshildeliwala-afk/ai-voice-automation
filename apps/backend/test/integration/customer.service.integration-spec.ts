import { randomUUID } from "node:crypto";

import { ConflictException } from "@nestjs/common";

import { CallQueueService } from "../../src/call-queue/call-queue.service";
import { CustomerService } from "../../src/customer/customer.service";
import { PrismaService } from "../../src/common/prisma/prisma.service";
import { OrderService } from "../../src/order/order.service";
import { WorkspaceService } from "../../src/workspace/workspace.service";

describe("CustomerService (integration, real Postgres)", () => {
  let prisma: PrismaService;
  let service: CustomerService;
  let orderService: OrderService;
  let callQueueService: CallQueueService;
  let workspaceId: string;
  let otherWorkspaceId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const workspaceService = new WorkspaceService(prisma);
    service = new CustomerService(prisma, workspaceService);
    orderService = new OrderService(prisma, service);
    callQueueService = new CallQueueService(prisma);

    workspaceId = randomUUID();
    otherWorkspaceId = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO "Workspace" (id, name, slug, "createdAt", "updatedAt")
      VALUES (${workspaceId}::uuid, 'Customer IT Workspace', ${`customer-it-${Date.now()}`}, now(), now())
    `;
    await prisma.$executeRaw`
      INSERT INTO "Workspace" (id, name, slug, "createdAt", "updatedAt")
      VALUES (${otherWorkspaceId}::uuid, 'Customer IT Other Workspace', ${`customer-it-other-${Date.now()}`}, now(), now())
    `;
  });

  afterAll(async () => {
    await prisma.callQueue.deleteMany({
      where: { order: { workspaceId: { in: [workspaceId, otherWorkspaceId] } } },
    });
    await prisma.orderItem.deleteMany({
      where: { order: { workspaceId: { in: [workspaceId, otherWorkspaceId] } } },
    });
    await prisma.order.deleteMany({
      where: { workspaceId: { in: [workspaceId, otherWorkspaceId] } },
    });
    await prisma.customer.deleteMany({
      where: { workspaceId: { in: [workspaceId, otherWorkspaceId] } },
    });
    await prisma.$executeRaw`DELETE FROM "Workspace" WHERE id IN (${workspaceId}::uuid, ${otherWorkspaceId}::uuid)`;
    await prisma.$disconnect();
  });

  it("creates a customer scoped to the workspace", async () => {
    const customer = await service.createCustomer(workspaceId, {
      name: "IT Customer One",
      phone: "+14155570001",
    });

    expect(customer.workspaceId).toBe(workspaceId);

    const fetched = await service.getCustomerById(workspaceId, customer.id);
    expect(fetched.id).toBe(customer.id);
  });

  it("enforces phone uniqueness per workspace (real DB query, not just app logic)", async () => {
    await service.createCustomer(workspaceId, {
      name: "Dup Test",
      phone: "+14155570002",
    });

    await expect(
      service.createCustomer(workspaceId, {
        name: "Dup Test Two",
        phone: "+14155570002",
      }),
    ).rejects.toThrow(ConflictException);
  });

  it("allows the same phone number to be reused across different workspaces", async () => {
    await service.createCustomer(workspaceId, {
      name: "Shared Phone A",
      phone: "+14155570003",
    });

    await expect(
      service.createCustomer(otherWorkspaceId, {
        name: "Shared Phone B",
        phone: "+14155570003",
      }),
    ).resolves.toBeDefined();
  });

  it("getCustomerById 404s for a customer that exists but is in a different workspace", async () => {
    const customer = await service.createCustomer(otherWorkspaceId, {
      name: "Cross Workspace",
      phone: "+14155570004",
    });

    await expect(
      service.getCustomerById(workspaceId, customer.id),
    ).rejects.toThrow();
  });

  it("softDeleteCustomer excludes the row from getCustomerById/listCustomers afterward", async () => {
    const customer = await service.createCustomer(workspaceId, {
      name: "To Delete",
      phone: "+14155570005",
    });

    await service.softDeleteCustomer(workspaceId, customer.id);

    await expect(
      service.getCustomerById(workspaceId, customer.id),
    ).rejects.toThrow();

    const listed = await service.listCustomers(workspaceId, {
      page: 1,
      limit: 100,
    });
    expect(listed.data.find((c) => c.id === customer.id)).toBeUndefined();
  });

  it("listCustomers search matches by name, phone, or email (case-insensitive)", async () => {
    await service.createCustomer(workspaceId, {
      name: "Searchable Person",
      phone: "+14155570006",
      email: "searchable@example.com",
    });

    const byName = await service.listCustomers(
      workspaceId,
      { page: 1, limit: 20 },
      "searchable person",
    );
    expect(byName.data.length).toBeGreaterThanOrEqual(1);

    const byEmail = await service.listCustomers(
      workspaceId,
      { page: 1, limit: 20 },
      "SEARCHABLE@EXAMPLE",
    );
    expect(byEmail.data.length).toBeGreaterThanOrEqual(1);
  });

  it("updateCustomer allows re-saving the same phone without a false-positive conflict", async () => {
    const customer = await service.createCustomer(workspaceId, {
      name: "Self Update",
      phone: "+14155570007",
    });

    const updated = await service.updateCustomer(workspaceId, customer.id, {
      phone: "+14155570007",
      name: "Self Update Renamed",
    });

    expect(updated.name).toBe("Self Update Renamed");
  });

  describe("getCustomerProfile (Sprint 20)", () => {
    it("joins callbacks through the customer's own orders and never leaks another customer's callback", async () => {
      const customerA = await service.createCustomer(workspaceId, {
        name: "Profile Customer A",
        phone: "+14155570008",
      });
      const customerB = await service.createCustomer(workspaceId, {
        name: "Profile Customer B",
        phone: "+14155570009",
      });

      const orderA = await orderService.createOrder({
        workspaceId,
        customerId: customerA.id,
        marketplace: "MANUAL" as never,
        paymentType: "COD" as never,
        totalAmount: 100,
      });
      const orderB = await orderService.createOrder({
        workspaceId,
        customerId: customerB.id,
        marketplace: "MANUAL" as never,
        paymentType: "COD" as never,
        totalAmount: 200,
      });

      await callQueueService.enqueue(orderA.id, new Date(), "Customer A requested a callback");
      await callQueueService.enqueue(orderB.id, new Date(), "Customer B requested a callback");
      // Ordinary dial-queue row (no reason) -- must never surface as a "callback".
      await callQueueService.enqueue(orderA.id, new Date());

      const profile = await service.getCustomerProfile(workspaceId, customerA.id);

      expect(profile.customer.id).toBe(customerA.id);
      expect(profile.orders.map((o) => o.id)).toEqual([orderA.id]);
      expect(profile.callbacks).toHaveLength(1);
      expect(profile.callbacks[0].reason).toBe("Customer A requested a callback");
      expect(profile.callbacks.every((c) => c.orderId === orderA.id)).toBe(true);
    });
  });
});
