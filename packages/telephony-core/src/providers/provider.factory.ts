import type { ICallProvider } from "../interfaces/call-provider.interface";
import type {
  SupportedTelephonyProvider,
  TelephonyCredentials,
} from "../interfaces/telephony-credentials.interface";
import { PlivoProvider } from "./plivo/plivo.provider";

/**
 * Provider-agnostic dispatch point. Adding Twilio/Exotel/Retell/Vapi later
 * means adding a new `case` here (plus the concrete class) -- no caller of
 * this factory needs to change.
 */
export function createCallProvider(
  provider: SupportedTelephonyProvider,
  credentials: TelephonyCredentials,
): ICallProvider {
  switch (provider) {
    case "PLIVO":
      return new PlivoProvider(credentials);
    default: {
      const exhaustiveCheck: never = provider;
      throw new Error(`Unsupported telephony provider: ${exhaustiveCheck}`);
    }
  }
}
