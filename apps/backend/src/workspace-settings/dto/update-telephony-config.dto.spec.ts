import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { UpdateTelephonyConfigDto } from "./update-telephony-config.dto";

async function validateDto(payload: Record<string, unknown>) {
  const instance = plainToInstance(UpdateTelephonyConfigDto, payload);
  return validate(instance);
}

describe("UpdateTelephonyConfigDto validation", () => {
  it("accepts a valid minimal payload", async () => {
    const errors = await validateDto({
      provider: "TWILIO",
      authToken: "some-token",
    });
    expect(errors).toHaveLength(0);
  });

  it("provider: rejects a value outside the TelephonyProvider enum", async () => {
    const errors = await validateDto({
      provider: "NOT_A_PROVIDER",
      authToken: "some-token",
    });
    expect(errors.some((e) => e.property === "provider")).toBe(true);
  });

  it("authToken: is required", async () => {
    const errors = await validateDto({ provider: "TWILIO" });
    expect(errors.some((e) => e.property === "authToken")).toBe(true);
  });

  it("phoneNumber: rejects an invalid phone format when provided", async () => {
    const errors = await validateDto({
      provider: "TWILIO",
      authToken: "some-token",
      phoneNumber: "not-a-phone",
    });
    expect(errors.some((e) => e.property === "phoneNumber")).toBe(true);
  });
});
