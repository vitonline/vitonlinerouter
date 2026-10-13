import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createSqlJsAdapter } from "../../src/lib/db/adapters/sqlJsAdapter";
const state = vi.hoisted(() => ({ db: null }));
vi.mock("../../src/lib/db/driver.js", () => ({ getAdapter: async () => state.db }));
vi.mock("open-sse/providers/policy.js", () => ({ ALLOWED_REGISTRY: [{ id: "example", alias: "ex" }] }));
vi.mock("open-sse/config/providerModels.js", () => ({ PROVIDER_MODELS: { ex: [{ id: "one" }, { id: "image", kind: "image" }] } }));
import { enableDefaultProviderCombo, rememberDefaultComboCatalog } from "../../src/lib/db/repos/defaultProviderCombo";
import { getCombos, getComboByName } from "../../src/lib/db/repos/combosRepo";
import { collectDefaultProviderModels } from "../../src/shared/utils/defaultProviderCombo";
let directory;
afterEach(() => { state.db?.close(); state.db = null; if (directory) fs.rmSync(directory, { recursive: true, force: true }); });
async function setup() {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "auto-combo-"));
  state.db = await createSqlJsAdapter(path.join(directory, "test.sqlite"));
  state.db.exec(`CREATE TABLE settings(id INTEGER PRIMARY KEY, data TEXT);
    CREATE TABLE combos(id TEXT PRIMARY KEY, name TEXT UNIQUE, kind TEXT, models TEXT, createdAt TEXT, updatedAt TEXT);
    CREATE TABLE kv(scope TEXT, key TEXT, value TEXT, PRIMARY KEY(scope,key));
    CREATE TABLE providerConnections(provider TEXT, isActive INTEGER);
    CREATE TABLE providerNodes(id TEXT, type TEXT, data TEXT);`);
  state.db.run("INSERT INTO providerConnections VALUES(?, ?)", ["example", 1]);
}
describe("MyDefaultProvider automatic membership", () => {
  it("creates one Round Robin combo and includes new custom/discovered models automatically", async () => {
    await setup();
    await enableDefaultProviderCombo(); await enableDefaultProviderCombo();
    expect(await getCombos()).toHaveLength(1);
    expect((await getComboByName("MyDefaultProvider")).models).toEqual(["ex/one"]);
    state.db.run("INSERT INTO kv VALUES(?, ?, ?)", ["customModels", "new", JSON.stringify({ providerAlias: "ex", id: "new", type: "llm" })]);
    await rememberDefaultComboCatalog([{ providerId: "example", modelId: "live", kind: "llm" }]);
    expect((await getComboByName("MyDefaultProvider")).models).toEqual(["ex/live", "ex/new", "ex/one"]);
    const settings = JSON.parse(state.db.get("SELECT data FROM settings WHERE id=1").data);
    expect(settings.comboStrategies.MyDefaultProvider.fallbackStrategy).toBe("round-robin");
    state.db.run("INSERT INTO kv VALUES(?, ?, ?)", ["disabledModels", "ex", '["new"]']);
    expect((await getComboByName("MyDefaultProvider")).models).not.toContain("ex/new");
    state.db.run("UPDATE providerConnections SET isActive=0");
    expect((await getComboByName("MyDefaultProvider")).models).toEqual([]);
  });
  it("does not create or modify other combos unless enabled", async () => {
    await setup(); expect(await getCombos()).toEqual([]);
    state.db.run("INSERT INTO combos VALUES(?, ?, ?, ?, ?, ?)", ["existing", "Other", "llm", '["ex/one"]', "today", "today"]);
    await enableDefaultProviderCombo();
    expect((await getComboByName("Other")).models).toEqual(["ex/one"]);
  });
  it("handles renamed custom prefixes, deduplicates and excludes media and unconnected providers", () => {
    const models = collectDefaultProviderModels({ registry: [{ id: "off", alias: "off" }], registered: { off: [{ id: "bad" }] }, connections: [{ provider: "node", isActive: true }], nodes: [{ id: "node", type: "openai-compatible", prefix: "new-prefix" }], discovered: [{ providerId: "node", modelId: "model" }], custom: [{ providerAlias: "new-prefix", id: "model" }, { providerAlias: "new-prefix", id: "speech", type: "tts" }] });
    expect(models).toEqual(["new-prefix/model"]);
  });
});
