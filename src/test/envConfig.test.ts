import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEnvConfig } from "../../server/lib/envConfig.ts";

describe("envConfig", () => {
  let dir: string;
  let envPath: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "automazing-env-"));
    envPath = path.join(dir, ".env.local");
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    delete process.env.GOOD_KEY;
  });

  it("upserts valid keys without corrupting existing lines", () => {
    fs.writeFileSync(envPath, "GOOD_KEY=old\nOTHER=value\n", "utf8");
    const envConfig = createEnvConfig({ envPath });

    envConfig.upsertEnvEntries({ GOOD_KEY: "new value" });

    expect(fs.readFileSync(envPath, "utf8")).toBe('GOOD_KEY="new value"\nOTHER=value\n');
    expect(process.env.GOOD_KEY).toBe("new value");
  });

  it("rejects invalid keys before writing the env file", () => {
    fs.writeFileSync(envPath, "GOOD_KEY=old\n", "utf8");
    const envConfig = createEnvConfig({ envPath });

    expect(() => envConfig.upsertEnvEntries({ "BAD\nKEY": "value" })).toThrow("Invalid env key");
    expect(fs.readFileSync(envPath, "utf8")).toBe("GOOD_KEY=old\n");
  });
});
