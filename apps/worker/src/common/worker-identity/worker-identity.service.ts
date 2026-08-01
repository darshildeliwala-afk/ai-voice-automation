import { randomUUID } from "node:crypto";
import { hostname } from "node:os";

import { Injectable } from "@nestjs/common";

@Injectable()
export class WorkerIdentityService {
  readonly workerId: string;

  constructor() {
    this.workerId = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;
  }
}
