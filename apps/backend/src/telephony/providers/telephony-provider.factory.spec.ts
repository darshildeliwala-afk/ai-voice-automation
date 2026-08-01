import {
  PlivoProvider,
  TelephonyConfigMissingError,
  TelephonyProviderInactiveError,
} from "@ai-voice-automation/telephony-core";

import type { TelephonyConfigService } from "../../workspace-settings/telephony-config.service";
import { TelephonyProviderFactory } from "./telephony-provider.factory";

function setup() {
  const telephonyConfigService = {
    getActiveConfig: jest.fn(),
    getDecryptedAuthToken: jest.fn(),
  };

  const factory = new TelephonyProviderFactory(
    telephonyConfigService as unknown as TelephonyConfigService,
  );

  return { factory, telephonyConfigService };
}

describe("TelephonyProviderFactory", () => {
  it("throws TelephonyConfigMissingError when no config exists", async () => {
    const { factory, telephonyConfigService } = setup();
    telephonyConfigService.getActiveConfig.mockResolvedValue(null);

    await expect(factory.createForWorkspace("workspace-1")).rejects.toThrow(
      TelephonyConfigMissingError,
    );
  });

  it("throws TelephonyProviderInactiveError when the config is not active", async () => {
    const { factory, telephonyConfigService } = setup();
    telephonyConfigService.getActiveConfig.mockResolvedValue({
      provider: "PLIVO",
      authId: "AC123",
      phoneNumber: "+14155550000",
      isActive: false,
    });

    await expect(factory.createForWorkspace("workspace-1")).rejects.toThrow(
      TelephonyProviderInactiveError,
    );
  });

  it("throws TelephonyConfigMissingError when authId/phoneNumber are absent", async () => {
    const { factory, telephonyConfigService } = setup();
    telephonyConfigService.getActiveConfig.mockResolvedValue({
      provider: "PLIVO",
      authId: null,
      phoneNumber: null,
      isActive: true,
    });

    await expect(factory.createForWorkspace("workspace-1")).rejects.toThrow(
      TelephonyConfigMissingError,
    );
  });

  it("throws TelephonyConfigMissingError when the decrypted token is unavailable", async () => {
    const { factory, telephonyConfigService } = setup();
    telephonyConfigService.getActiveConfig.mockResolvedValue({
      provider: "PLIVO",
      authId: "AC123",
      phoneNumber: "+14155550000",
      isActive: true,
    });
    telephonyConfigService.getDecryptedAuthToken.mockResolvedValue(null);

    await expect(factory.createForWorkspace("workspace-1")).rejects.toThrow(
      TelephonyConfigMissingError,
    );
  });

  it("returns a PlivoProvider for an active PLIVO config", async () => {
    const { factory, telephonyConfigService } = setup();
    telephonyConfigService.getActiveConfig.mockResolvedValue({
      provider: "PLIVO",
      authId: "AC123",
      phoneNumber: "+14155550000",
      isActive: true,
    });
    telephonyConfigService.getDecryptedAuthToken.mockResolvedValue(
      "decrypted-token",
    );

    const provider = await factory.createForWorkspace("workspace-1");

    expect(provider).toBeInstanceOf(PlivoProvider);
  });
});
