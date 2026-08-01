import { PlivoProvider } from "./plivo/plivo.provider";
import { createCallProvider } from "./provider.factory";

describe("createCallProvider", () => {
  it("returns a PlivoProvider for provider PLIVO", () => {
    const provider = createCallProvider("PLIVO", {
      provider: "PLIVO",
      authId: "AC_test",
      authToken: "token",
      phoneNumber: "+14155550000",
    });

    expect(provider).toBeInstanceOf(PlivoProvider);
  });
});
