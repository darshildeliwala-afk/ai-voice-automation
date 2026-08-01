import { TelephonyEncryption } from "../encryption/telephony-encryption";
import {
  TelephonyConfigMissingError,
  TelephonyProviderInactiveError,
} from "../errors/telephony.errors";
import { loadTelephonyCredentials } from "./load-telephony-credentials";

describe("loadTelephonyCredentials", () => {
  const encryption = new TelephonyEncryption("test-key-do-not-use-in-prod");

  it("throws TelephonyConfigMissingError when no row was found", () => {
    expect(() =>
      loadTelephonyCredentials("workspace-1", null, encryption),
    ).toThrow(TelephonyConfigMissingError);
  });

  it("throws TelephonyProviderInactiveError when the row is not active", () => {
    expect(() =>
      loadTelephonyCredentials(
        "workspace-1",
        {
          provider: "PLIVO",
          authId: "AC123",
          authToken: encryption.encrypt("secret"),
          phoneNumber: "+14155552671",
          isActive: false,
        },
        encryption,
      ),
    ).toThrow(TelephonyProviderInactiveError);
  });

  it("throws TelephonyConfigMissingError when required fields are absent", () => {
    expect(() =>
      loadTelephonyCredentials(
        "workspace-1",
        {
          provider: "PLIVO",
          authId: null,
          authToken: encryption.encrypt("secret"),
          phoneNumber: "+14155552671",
          isActive: true,
        },
        encryption,
      ),
    ).toThrow(TelephonyConfigMissingError);
  });

  it("returns decrypted credentials for a valid, active config", () => {
    const credentials = loadTelephonyCredentials(
      "workspace-1",
      {
        provider: "PLIVO",
        authId: "AC123",
        authToken: encryption.encrypt("plain-auth-token"),
        phoneNumber: "+14155552671",
        isActive: true,
      },
      encryption,
    );

    expect(credentials).toEqual({
      provider: "PLIVO",
      authId: "AC123",
      authToken: "plain-auth-token",
      phoneNumber: "+14155552671",
    });
  });
});
