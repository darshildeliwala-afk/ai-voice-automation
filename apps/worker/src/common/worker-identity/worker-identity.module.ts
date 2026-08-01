import { Global, Module } from "@nestjs/common";

import { WorkerIdentityService } from "./worker-identity.service";

@Global()
@Module({
  providers: [WorkerIdentityService],
  exports: [WorkerIdentityService],
})
export class WorkerIdentityModule {}
