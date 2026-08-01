import { InjectQueue } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import { HealthIndicatorService } from "@nestjs/terminus";
import type { Queue } from "bullmq";

import { CALL_QUEUE_NAME } from "../../queue/queue.constants";

@Injectable()
export class RedisHealthIndicator {
  constructor(
    @InjectQueue(CALL_QUEUE_NAME) private readonly queue: Queue,
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  async isHealthy(key: string) {
    const indicator = this.healthIndicatorService.check(key);

    try {
      const client = await this.queue.client;
      // IRedisClient has no cross-adapter `ping`; `info` is a real
      // round-trip that every adapter implements.
      await client.info();

      return indicator.up();
    } catch (error) {
      return indicator.down({
        message: error instanceof Error ? error.message : "redis unreachable",
      });
    }
  }
}
