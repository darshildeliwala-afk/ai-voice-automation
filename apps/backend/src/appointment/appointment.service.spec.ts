import { AppointmentService } from "./appointment.service";

const WORKSPACE_ID = "workspace-1";
const CUSTOMER_ID = "customer-1";

function setup() {
  const appointment = {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  };
  const prisma = { appointment };
  const customerService = {
    getCustomerById: jest.fn().mockResolvedValue({ id: CUSTOMER_ID }),
  };

  const service = new AppointmentService(
    prisma as never,
    customerService as never,
  );

  return { service, prisma, appointment, customerService };
}

describe("AppointmentService", () => {
  describe("createAppointment", () => {
    it("validates the customer exists in the workspace before creating", async () => {
      const { service, appointment, customerService } = setup();
      appointment.create.mockResolvedValue({ id: "appt-1" });

      await service.createAppointment({
        workspaceId: WORKSPACE_ID,
        customerId: CUSTOMER_ID,
        date: "2026-08-10",
        time: "15:00",
        timezone: "Asia/Kolkata",
      });

      expect(customerService.getCustomerById).toHaveBeenCalledWith(
        WORKSPACE_ID,
        CUSTOMER_ID,
      );
      expect(appointment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          workspaceId: WORKSPACE_ID,
          customerId: CUSTOMER_ID,
          time: "15:00",
          timezone: "Asia/Kolkata",
        }),
      });
    });
  });

  describe("getAppointmentById", () => {
    it("throws NotFoundException when missing", async () => {
      const { service, appointment } = setup();
      appointment.findFirst.mockResolvedValue(null);

      await expect(service.getAppointmentById("missing")).rejects.toThrow();
    });
  });

  describe("listAppointments", () => {
    it("scopes to workspace and optionally customerId/status", async () => {
      const { service, appointment } = setup();
      appointment.findMany.mockResolvedValue([]);
      appointment.count.mockResolvedValue(0);

      await service.listAppointments(
        WORKSPACE_ID,
        { page: 1, limit: 20 },
        CUSTOMER_ID,
        "SCHEDULED" as never,
      );

      expect(appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            workspaceId: WORKSPACE_ID,
            customerId: CUSTOMER_ID,
            status: "SCHEDULED",
          }),
        }),
      );
    });
  });

  describe("updateAppointment", () => {
    it("updates fields when the appointment exists", async () => {
      const { service, appointment } = setup();
      appointment.findFirst.mockResolvedValue({ id: "appt-1" });
      appointment.update.mockResolvedValue({ id: "appt-1", status: "CANCELLED" });

      const result = await service.updateAppointment("appt-1", {
        status: "CANCELLED" as never,
      });

      expect(result.status).toBe("CANCELLED");
    });
  });

  describe("softDeleteAppointment", () => {
    it("sets deletedAt", async () => {
      const { service, appointment } = setup();
      appointment.findFirst.mockResolvedValue({ id: "appt-1" });
      appointment.update.mockResolvedValue({ id: "appt-1", deletedAt: new Date() });

      await service.softDeleteAppointment("appt-1");

      expect(appointment.update).toHaveBeenCalledWith({
        where: { id: "appt-1" },
        data: { deletedAt: expect.any(Date) },
      });
    });
  });
});
