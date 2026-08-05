import { ConflictException } from "@nestjs/common";

import { CustomerService } from "./customer.service";

const WORKSPACE_ID = "workspace-1";

function setup() {
  const customer = {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  };
  const order = { findMany: jest.fn().mockResolvedValue([]) };
  const crmNote = { findMany: jest.fn().mockResolvedValue([]) };
  const appointment = { findMany: jest.fn().mockResolvedValue([]) };
  const callQueue = { findMany: jest.fn().mockResolvedValue([]) };
  const conversation = { findMany: jest.fn().mockResolvedValue([]) };
  const prisma = { customer, order, crmNote, appointment, callQueue, conversation };
  const workspaceService = {
    getWorkspaceById: jest.fn().mockResolvedValue({ id: WORKSPACE_ID }),
  };

  const service = new CustomerService(
    prisma as never,
    workspaceService as never,
  );

  return {
    service,
    prisma,
    customer,
    order,
    crmNote,
    appointment,
    callQueue,
    conversation,
    workspaceService,
  };
}

describe("CustomerService", () => {
  describe("createCustomer", () => {
    it("creates a customer scoped to the workspace", async () => {
      const { service, customer } = setup();
      customer.findFirst.mockResolvedValue(null); // no phone conflict
      customer.create.mockResolvedValue({
        id: "cust-1",
        workspaceId: WORKSPACE_ID,
        name: "Jane",
        phone: "+14155551234",
      });

      const result = await service.createCustomer(WORKSPACE_ID, {
        name: "Jane",
        phone: "+14155551234",
      });

      expect(result.id).toBe("cust-1");
      expect(customer.create).toHaveBeenCalledWith({
        data: {
          name: "Jane",
          phone: "+14155551234",
          workspaceId: WORKSPACE_ID,
        },
      });
    });

    it("throws ConflictException when the phone is already used in the workspace", async () => {
      const { service, customer } = setup();
      customer.findFirst.mockResolvedValue({ id: "existing-cust" });

      await expect(
        service.createCustomer(WORKSPACE_ID, {
          name: "Jane",
          phone: "+14155551234",
        }),
      ).rejects.toThrow(ConflictException);
      expect(customer.create).not.toHaveBeenCalled();
    });

    it("allows the same phone number across different workspaces", async () => {
      const { service, customer } = setup();
      // assertPhoneNotTaken filters by workspaceId, so a duplicate phone in
      // a DIFFERENT workspace is invisible to the query -- simulate that.
      customer.findFirst.mockResolvedValue(null);
      customer.create.mockResolvedValue({ id: "cust-2" });

      await expect(
        service.createCustomer(WORKSPACE_ID, {
          name: "Jane",
          phone: "+14155551234",
        }),
      ).resolves.toBeDefined();
      expect(customer.findFirst).toHaveBeenCalledWith({
        where: { workspaceId: WORKSPACE_ID, phone: "+14155551234", deletedAt: null },
      });
    });
  });

  describe("getCustomerById", () => {
    it("returns the customer when found in the workspace", async () => {
      const { service, customer } = setup();
      customer.findFirst.mockResolvedValue({ id: "cust-1", workspaceId: WORKSPACE_ID });

      const result = await service.getCustomerById(WORKSPACE_ID, "cust-1");

      expect(result.id).toBe("cust-1");
      expect(customer.findFirst).toHaveBeenCalledWith({
        where: { id: "cust-1", workspaceId: WORKSPACE_ID, deletedAt: null },
      });
    });

    it("throws NotFoundException when the customer belongs to a different workspace", async () => {
      const { service, customer } = setup();
      // Scoped query never matches a row in another workspace.
      customer.findFirst.mockResolvedValue(null);

      await expect(
        service.getCustomerById(WORKSPACE_ID, "cust-in-other-workspace"),
      ).rejects.toThrow();
    });

    it("throws NotFoundException when the customer is soft-deleted", async () => {
      const { service, customer } = setup();
      customer.findFirst.mockResolvedValue(null); // deletedAt filter excludes it

      await expect(
        service.getCustomerById(WORKSPACE_ID, "deleted-cust"),
      ).rejects.toThrow();
    });
  });

  describe("getCustomerProfile", () => {
    it("aggregates orders, notes, appointments, callbacks, and conversations for the customer", async () => {
      const { service, customer, order, crmNote, appointment, callQueue, conversation } = setup();
      customer.findFirst.mockResolvedValue({ id: "cust-1", workspaceId: WORKSPACE_ID });
      order.findMany.mockResolvedValue([{ id: "order-1" }, { id: "order-2" }]);
      crmNote.findMany.mockResolvedValue([{ id: "note-1" }]);
      appointment.findMany.mockResolvedValue([{ id: "appt-1" }]);
      callQueue.findMany.mockResolvedValue([{ id: "cq-1", orderId: "order-1", reason: "wants a discount" }]);
      conversation.findMany.mockResolvedValue([{ id: "conv-1", summary: null }]);

      const result = await service.getCustomerProfile(WORKSPACE_ID, "cust-1");

      expect(result.orders).toHaveLength(2);
      expect(result.crmNotes).toEqual([{ id: "note-1" }]);
      expect(result.appointments).toEqual([{ id: "appt-1" }]);
      expect(result.callbacks).toEqual([
        { id: "cq-1", orderId: "order-1", reason: "wants a discount" },
      ]);
      expect(result.conversations).toEqual([{ id: "conv-1", summary: null }]);
    });

    it("joins callbacks (CallQueue) through the customer's own orderIds, never a customerId column that doesn't exist on CallQueue", async () => {
      const { service, customer, order, callQueue } = setup();
      customer.findFirst.mockResolvedValue({ id: "cust-1", workspaceId: WORKSPACE_ID });
      order.findMany.mockResolvedValue([{ id: "order-1" }, { id: "order-2" }]);

      await service.getCustomerProfile(WORKSPACE_ID, "cust-1");

      expect(callQueue.findMany).toHaveBeenCalledWith({
        where: { orderId: { in: ["order-1", "order-2"] }, reason: { not: null } },
      });
    });

    it("never leaks a callback that belongs to a different customer's order", async () => {
      // Customer A has order-1; Customer B (a different customer) has
      // order-2 with its own callback. Fetching A's profile must only
      // ever query CallQueue scoped to A's own orderIds.
      const { service, customer, order, callQueue } = setup();
      customer.findFirst.mockResolvedValue({ id: "cust-A", workspaceId: WORKSPACE_ID });
      order.findMany.mockResolvedValue([{ id: "order-1" }]); // only A's order

      await service.getCustomerProfile(WORKSPACE_ID, "cust-A");

      expect(callQueue.findMany).toHaveBeenCalledWith({
        where: { orderId: { in: ["order-1"] }, reason: { not: null } },
      });
      // order-2 (belonging to customer B) is never part of the `in` filter.
    });

    it("scopes callbacks to CallQueue rows with a non-null reason -- excludes ordinary dial-queue rows", async () => {
      const { service, customer, order, callQueue } = setup();
      customer.findFirst.mockResolvedValue({ id: "cust-1", workspaceId: WORKSPACE_ID });
      order.findMany.mockResolvedValue([{ id: "order-1" }]);

      await service.getCustomerProfile(WORKSPACE_ID, "cust-1");

      expect(callQueue.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ reason: { not: null } }) }),
      );
    });

    it("throws NotFoundException when the customer does not exist in the workspace", async () => {
      const { service, customer } = setup();
      customer.findFirst.mockResolvedValue(null);

      await expect(
        service.getCustomerProfile(WORKSPACE_ID, "missing"),
      ).rejects.toThrow();
    });
  });

  describe("findByIdentifier", () => {
    it("returns null when no identifier is given", async () => {
      const { service } = setup();

      const result = await service.findByIdentifier(WORKSPACE_ID, {});

      expect(result).toBeNull();
    });

    it("prioritizes customerId over phone/email", async () => {
      const { service, customer } = setup();
      customer.findFirst.mockResolvedValue({ id: "cust-1" });

      await service.findByIdentifier(WORKSPACE_ID, {
        customerId: "cust-1",
        phone: "+14155551234",
        email: "jane@example.com",
      });

      expect(customer.findFirst).toHaveBeenCalledWith({
        where: { id: "cust-1", workspaceId: WORKSPACE_ID, deletedAt: null },
      });
    });

    it("falls back to phone when no customerId is given", async () => {
      const { service, customer } = setup();
      customer.findFirst.mockResolvedValue({ id: "cust-1" });

      await service.findByIdentifier(WORKSPACE_ID, { phone: "+14155551234" });

      expect(customer.findFirst).toHaveBeenCalledWith({
        where: { phone: "+14155551234", workspaceId: WORKSPACE_ID, deletedAt: null },
      });
    });

    it("falls back to email when only email is given", async () => {
      const { service, customer } = setup();
      customer.findFirst.mockResolvedValue({ id: "cust-1" });

      await service.findByIdentifier(WORKSPACE_ID, { email: "jane@example.com" });

      expect(customer.findFirst).toHaveBeenCalledWith({
        where: { email: "jane@example.com", workspaceId: WORKSPACE_ID, deletedAt: null },
      });
    });

    it("returns null (never throws) when nothing matches", async () => {
      const { service, customer } = setup();
      customer.findFirst.mockResolvedValue(null);

      const result = await service.findByIdentifier(WORKSPACE_ID, {
        phone: "+10000000000",
      });

      expect(result).toBeNull();
    });
  });

  describe("listCustomers", () => {
    it("paginates and scopes to the workspace", async () => {
      const { service, customer } = setup();
      customer.findMany.mockResolvedValue([{ id: "cust-1" }]);
      customer.count.mockResolvedValue(1);

      const result = await service.listCustomers(WORKSPACE_ID, {
        page: 1,
        limit: 20,
      });

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(customer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: WORKSPACE_ID, deletedAt: null },
        }),
      );
    });

    it("applies a case-insensitive search across name/phone/email", async () => {
      const { service, customer } = setup();
      customer.findMany.mockResolvedValue([]);
      customer.count.mockResolvedValue(0);

      await service.listCustomers(WORKSPACE_ID, { page: 1, limit: 20 }, "jane");

      expect(customer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            workspaceId: WORKSPACE_ID,
            OR: expect.arrayContaining([
              expect.objectContaining({ name: expect.anything() }),
            ]),
          }),
        }),
      );
    });
  });

  describe("updateCustomer", () => {
    it("updates fields when found in the workspace", async () => {
      const { service, customer } = setup();
      customer.findFirst.mockResolvedValue({
        id: "cust-1",
        workspaceId: WORKSPACE_ID,
        phone: "+14155551234",
      });
      customer.update.mockResolvedValue({ id: "cust-1", name: "Updated" });

      const result = await service.updateCustomer(WORKSPACE_ID, "cust-1", {
        name: "Updated",
      });

      expect(result.name).toBe("Updated");
    });

    it("checks phone uniqueness only when the phone actually changes", async () => {
      const { service, customer } = setup();
      customer.findFirst
        .mockResolvedValueOnce({
          id: "cust-1",
          workspaceId: WORKSPACE_ID,
          phone: "+14155551234",
        }) // getCustomerById
        .mockResolvedValueOnce({ id: "other-cust" }); // assertPhoneNotTaken conflict
      customer.update.mockResolvedValue({});

      await expect(
        service.updateCustomer(WORKSPACE_ID, "cust-1", {
          phone: "+14155559999",
        }),
      ).rejects.toThrow(ConflictException);
    });

    it("throws NotFoundException when updating a customer outside the workspace", async () => {
      const { service, customer } = setup();
      customer.findFirst.mockResolvedValue(null);

      await expect(
        service.updateCustomer(WORKSPACE_ID, "cust-in-other-workspace", {
          name: "X",
        }),
      ).rejects.toThrow();
    });
  });

  describe("softDeleteCustomer", () => {
    it("sets deletedAt", async () => {
      const { service, customer } = setup();
      customer.findFirst.mockResolvedValue({ id: "cust-1", workspaceId: WORKSPACE_ID });
      customer.update.mockResolvedValue({ id: "cust-1", deletedAt: new Date() });

      await service.softDeleteCustomer(WORKSPACE_ID, "cust-1");

      expect(customer.update).toHaveBeenCalledWith({
        where: { id: "cust-1" },
        data: { deletedAt: expect.any(Date) },
      });
    });

    it("throws NotFoundException when deleting a customer outside the workspace", async () => {
      const { service, customer } = setup();
      customer.findFirst.mockResolvedValue(null);

      await expect(
        service.softDeleteCustomer(WORKSPACE_ID, "cust-in-other-workspace"),
      ).rejects.toThrow();
    });
  });
});
