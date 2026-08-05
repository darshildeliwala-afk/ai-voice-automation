import { BookAppointmentTool } from "./book-appointment.tool";

const CONTEXT = {
  workspaceId: "workspace-1",
  customerId: "customer-1",
  conversationId: "conv-1",
};

function setup() {
  const appointmentService = { createAppointment: jest.fn() };
  const tool = new BookAppointmentTool(appointmentService as never);

  return { tool, appointmentService };
}

describe("BookAppointmentTool", () => {
  it("books an appointment scoped to the current customer/conversation", async () => {
    const { tool, appointmentService } = setup();
    appointmentService.createAppointment.mockResolvedValue({
      id: "appt-1",
      date: new Date("2026-08-10"),
      time: "15:00",
      timezone: "Asia/Kolkata",
      status: "SCHEDULED",
    });

    const result = await tool.execute(
      { date: "2026-08-10", time: "15:00", timezone: "Asia/Kolkata", notes: "Follow up" },
      CONTEXT,
    );

    expect(appointmentService.createAppointment).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      customerId: "customer-1",
      conversationId: "conv-1",
      date: "2026-08-10",
      time: "15:00",
      timezone: "Asia/Kolkata",
      notes: "Follow up",
    });
    expect(JSON.parse(result.content)).toMatchObject({
      booked: true,
      appointment: { id: "appt-1", time: "15:00", status: "SCHEDULED" },
    });
  });

  it("returns a graceful error for an invalid date", async () => {
    const { tool, appointmentService } = setup();

    const result = await tool.execute(
      { date: "not-a-date", time: "15:00", timezone: "Asia/Kolkata" },
      CONTEXT,
    );

    expect(JSON.parse(result.content).error).toBeDefined();
    expect(appointmentService.createAppointment).not.toHaveBeenCalled();
  });

  it("returns a graceful error for an invalid time format", async () => {
    const { tool, appointmentService } = setup();

    const result = await tool.execute(
      { date: "2026-08-10", time: "3pm", timezone: "Asia/Kolkata" },
      CONTEXT,
    );

    expect(JSON.parse(result.content).error).toBeDefined();
    expect(appointmentService.createAppointment).not.toHaveBeenCalled();
  });

  it("returns a graceful error when timezone is missing", async () => {
    const { tool, appointmentService } = setup();

    const result = await tool.execute(
      { date: "2026-08-10", time: "15:00", timezone: "" },
      CONTEXT,
    );

    expect(JSON.parse(result.content).error).toBeDefined();
    expect(appointmentService.createAppointment).not.toHaveBeenCalled();
  });
});
