import type { RedisOptions } from "ioredis";

/**
 * Parses a redis:// URL into a plain options object so BullMQ creates and
 * manages its own internal connections (and closes them cleanly on
 * shutdown) rather than us owning a shared connection's lifecycle.
 */
export function parseRedisUrl(url: string): RedisOptions {
  const parsed = new URL(url);

  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    username: parsed.username || undefined,
    password: parsed.password || undefined,
    // Required by BullMQ for its blocking connections.
    maxRetriesPerRequest: null,
  };
}
