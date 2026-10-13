import fs from "node:fs";
import shutdown from "../../../../shutdown.cjs";
import initSqlJs from "sql.js";
import { PRAGMA_SQL } from "../schema.js";
import { atomicWriteFile } from "../atomicFile.js";

let SQL = null;

async function loadSql() {
  if (SQL) return SQL;
  SQL = await initSqlJs();
  return SQL;
}

export async function createSqlJsAdapter(filePath) {
  const SQLLib = await loadSql();
  // sql.js holds an entire in-memory image: concurrent processes cannot merge writes.
  const lockPath = `${filePath}.lock`;
  const acquire = () => fs.writeFileSync(lockPath, String(process.pid), { flag: "wx", mode: 0o600 });
  try { acquire(); } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const owner = Number(fs.readFileSync(lockPath, "utf8"));
    if (!Number.isSafeInteger(owner) || owner <= 0) throw new Error("Invalid SQL.js ownership lock; inspect it before recovery");
    if (owner === process.pid) throw new Error("SQL.js database already has an open adapter in this process");
    try { process.kill(owner, 0); } catch (probe) {
      if (probe.code !== "ESRCH") throw probe;
      fs.unlinkSync(lockPath);
      acquire();
    }
    if (Number(fs.readFileSync(lockPath, "utf8")) !== process.pid) {
      throw new Error("SQL.js database is already owned by another process");
    }
  }
  const releaseLock = () => {
    try {
      if (fs.readFileSync(lockPath, "utf8") === String(process.pid)) fs.unlinkSync(lockPath);
    } catch { /* already released */ }
  };
  let db;
  try {
    const buf = fs.existsSync(filePath) ? fs.readFileSync(filePath) : null;
    db = new SQLLib.Database(buf);
    const integrity = db.exec("PRAGMA quick_check");
    if (integrity[0]?.values?.some(([status]) => status !== "ok")) throw new Error("Database integrity check failed");
    db.exec(PRAGMA_SQL);
  } catch (error) {
    db?.close();
    releaseLock();
    // Fail closed: never replace customer state with an empty database.
    throw new Error(`Cannot open SQL.js database. Preserve the file and restore a verified backup: ${error.message}`);
  }
  // Schema is created/synced by migrate.js after adapter init

  let dirty = false;
  let saveTimer = null;
  const SAVE_DEBOUNCE_MS = 100;

  function persist() {
    const data = db.export();
    atomicWriteFile(filePath, Buffer.from(data));
    dirty = false;
  }

  function scheduleSave() {
    dirty = true;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      if (dirty) {
        try { persist(); } catch (e) { console.error("[sqljs] save failed:", e); }
      }
    }, SAVE_DEBOUNCE_MS);
  }

  function paramsObj(params) {
    if (!params || (Array.isArray(params) && params.length === 0)) return undefined;
    return params;
  }

  function run(sql, params = []) {
    const stmt = db.prepare(sql);
    try {
      stmt.bind(paramsObj(params));
      stmt.step();
      const changes = db.getRowsModified();
      const lastInsertRowid = db.exec("SELECT last_insert_rowid() as id")[0]?.values?.[0]?.[0] ?? null;
      scheduleSave();
      return { changes, lastInsertRowid };
    } finally {
      stmt.free();
    }
  }

  function get(sql, params = []) {
    const stmt = db.prepare(sql);
    try {
      stmt.bind(paramsObj(params));
      if (stmt.step()) return stmt.getAsObject();
      return undefined;
    } finally {
      stmt.free();
    }
  }

  function all(sql, params = []) {
    const stmt = db.prepare(sql);
    try {
      stmt.bind(paramsObj(params));
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      return rows;
    } finally {
      stmt.free();
    }
  }

  function exec(sql) {
    db.exec(sql);
    scheduleSave();
  }

  function transaction(fn) {
    const sp = `sp_${Math.random().toString(36).slice(2)}`;
    db.exec(`SAVEPOINT ${sp}`);
    try {
      const result = fn();
      db.exec(`RELEASE ${sp}`);
      scheduleSave();
      return result;
    } catch (e) {
      try { db.exec(`ROLLBACK TO ${sp}`); db.exec(`RELEASE ${sp}`); } catch {}
      throw e;
    }
  }

  function close() {
    if (saveTimer) clearTimeout(saveTimer);
    if (dirty) persist();
    db.close();
    process.off("beforeExit", flush);
    unregisterShutdown();
    process.off("exit", releaseLock);
    releaseLock();
  }

  // Flush on shutdown
  const flush = () => { if (dirty) try { persist(); } catch {} };
  process.on("beforeExit", flush);
  const unregisterShutdown = shutdown.registerShutdown(db, close, 100);
  process.on("exit", releaseLock);

  return { driver: "sql.js", run, get, all, exec, transaction, close, raw: db };
}
