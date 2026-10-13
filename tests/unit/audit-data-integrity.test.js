import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import initSqlJs from "sql.js";
import { createSqlJsAdapter } from "../../src/lib/db/adapters/sqljsAdapter.js";
import { backupDbLite } from "../../src/lib/db/backup.js";
import { atomicWriteFile } from "../../src/lib/db/atomicFile.js";
import { decodeMessage, decodeVarint } from "../../open-sse/utils/cursorProtobuf.js";
import { dedupRefresh } from "../../open-sse/services/tokenRefresh/dedup.js";
import { withCredentialRefreshLock } from "../../open-sse/services/oauthCredentialManager.js";

describe("audit data integrity regressions", () => {
  it("rejects overflowing and truncated protobuf lengths without spinning", () => {
    expect(decodeVarint(Buffer.from([128,128,128,128,8]), 0)[0]).toBe(2147483648);
    for (const bytes of [[10,128,128,128,128,8], [10,128], [9,1], [13,1], [11], [0], [10,5,1]]) {
      expect(() => decodeMessage(Buffer.from(bytes))).toThrow();
    }
    expect(decodeMessage(Buffer.from([10,1,65])).get(1)[0].value.toString()).toBe("A");
  });
  it("does not replay failed refresh results", async () => {
    let calls = 0;
    const token = `fixture-${Math.random()}`;
    expect(await dedupRefresh("audit", token, async () => { calls++; return null; })).toBeNull();
    expect(await dedupRefresh("audit", token, async () => { calls++; return { accessToken: "fixture" }; })).toEqual({ accessToken: "fixture" });
    expect(calls).toBe(2);
  });
  it("deduplicates concurrent refreshes and permits nested executor locking", async () => {
    let calls = 0;
    const credentials = {connectionId: "audit-fixture"};
    const run = () => withCredentialRefreshLock("audit", credentials, () => withCredentialRefreshLock("audit", credentials, async () => {
      calls++;
      await new Promise(resolve => setTimeout(resolve, 10));
      return { accessToken: "fixture" };
    }));
    expect(await Promise.all([run(), run(), run()])).toHaveLength(3);
    expect(calls).toBe(1);
  });
  it("writes a real readable SQL.js backup and excludes request content", async () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "fr-audit-backup-"));
    const source = path.join(temp, "source.sqlite");
    const adapter = await createSqlJsAdapter(source);
    try {
      adapter.exec("CREATE TABLE fixtures (id INTEGER PRIMARY KEY, value TEXT); INSERT INTO fixtures VALUES (1, 'preserved'); CREATE TABLE requestDetails (content TEXT); INSERT INTO requestDetails VALUES ('private');");
      await expect(createSqlJsAdapter(source)).rejects.toThrow(/already/);
      const dest = backupDbLite(adapter, temp, "backup.sqlite");
      const SQL = await initSqlJs();
      const backup = new SQL.Database(fs.readFileSync(dest));
      expect(backup.exec("SELECT value FROM fixtures")[0].values).toEqual([["preserved"]]);
      expect(backup.exec("SELECT name FROM sqlite_master WHERE name = 'requestDetails'")).toEqual([]);
      backup.close();
    } finally { adapter.close(); }
    expect(fs.existsSync(`${source}.lock`)).toBe(false);
  });
  it("replaces a durable image and leaves no temporary files", () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "fr-audit-atomic-"));
    const file = path.join(temp, "image");
    atomicWriteFile(file, Buffer.from("old"));
    atomicWriteFile(file, Buffer.from("new"));
    expect(fs.readFileSync(file, "utf8")).toBe("new");
    expect(fs.readdirSync(temp)).toEqual(["image"]);
  });
});
