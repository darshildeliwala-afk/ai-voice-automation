import { Global, Module } from "@nestjs/common";

import { TelephonyEncryptionProvider } from "./telephony-encryption.provider";

@Global()
@Module({
  providers: [TelephonyEncryptionProvider],
  exports: [TelephonyEncryptionProvider],
})
export class EncryptionModule {}
