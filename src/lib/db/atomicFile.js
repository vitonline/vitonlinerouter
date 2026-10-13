import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

// Write a complete, flushed image before replacing the last durable database.
export function atomicWriteFile(filePath, data) {
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  let fd;
  try {
    fd = fs.openSync(temporary, "wx", 0o600);
    fs.writeFileSync(fd, data);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(temporary, filePath);
    if (process.platform !== "win32") {
      const directory = fs.openSync(path.dirname(filePath), "r");
      try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
    }
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    fs.rmSync(temporary, { force: true });
  }
}
