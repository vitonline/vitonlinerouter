import { readFile } from "node:fs/promises";
import path from "node:path";

export async function readProbeAsset(name) {
  if (!["transcription-probe.wav", "vision-probe.png"].includes(name)) throw new Error("Unknown test sample");
  for (const root of [process.cwd(), path.join(process.cwd(), ".."), path.join(process.cwd(), "cli/app")]) {
    try { return await readFile(path.join(root, "public/test-assets", name)); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  throw new Error("Bundled model test sample is missing");
}
