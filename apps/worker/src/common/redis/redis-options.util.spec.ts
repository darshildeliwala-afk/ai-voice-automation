import { parseRedisUrl } from "./redis-options.util";

describe("parseRedisUrl", () => {
  it("parses host/port from a plain redis:// URL", () => {
    const options = parseRedisUrl("redis://localhost:6379");
    expect(options.host).toBe("localhost");
    expect(options.port).toBe(6379);
    expect(options.maxRetriesPerRequest).toBeNull();
  });

  it("parses username/password when present", () => {
    const options = parseRedisUrl("redis://user:pass@redis-host:6380");
    expect(options.host).toBe("redis-host");
    expect(options.port).toBe(6380);
    expect(options.username).toBe("user");
    expect(options.password).toBe("pass");
  });

  it("defaults to port 6379 when omitted", () => {
    const options = parseRedisUrl("redis://redis-host");
    expect(options.port).toBe(6379);
  });
});
