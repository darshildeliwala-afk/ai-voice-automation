import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { UpdateWorkspaceSettingsDto } from "./update-workspace-settings.dto";

async function validateDto(payload: Record<string, unknown>) {
  const instance = plainToInstance(UpdateWorkspaceSettingsDto, payload);
  return validate(instance);
}

describe("UpdateWorkspaceSettingsDto validation", () => {
  it("accepts an empty payload (all fields optional)", async () => {
    expect(await validateDto({})).toHaveLength(0);
  });

  it("business email: accepts a valid email, rejects an invalid one", async () => {
    expect(
      await validateDto({ businessEmail: "hello@example.com" }),
    ).toHaveLength(0);

    const errors = await validateDto({ businessEmail: "not-an-email" });
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe("businessEmail");
  });

  it("phone: accepts a valid E.164 number, rejects garbage", async () => {
    expect(
      await validateDto({ businessPhone: "+14155552671" }),
    ).toHaveLength(0);

    const errors = await validateDto({ businessPhone: "not-a-phone" });
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe("businessPhone");
  });

  it("website: accepts a valid URL, rejects a non-URL string", async () => {
    expect(
      await validateDto({ website: "https://example.com" }),
    ).toHaveLength(0);

    const errors = await validateDto({ website: "not a url" });
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe("website");
  });

  it("timezone: accepts a valid IANA timezone, rejects an invalid one", async () => {
    expect(await validateDto({ timezone: "Asia/Kolkata" })).toHaveLength(0);

    const errors = await validateDto({ timezone: "Not/AZone" });
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe("timezone");
  });

  it("currency: must be exactly 3 characters", async () => {
    expect(await validateDto({ currency: "INR" })).toHaveLength(0);

    const errors = await validateDto({ currency: "US" });
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe("currency");
  });
});
