import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";

it("redacts credentials in files written by the enabled request logger", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "request-log-boundary-"));
  const original = process.env.ENABLE_REQUEST_LOGS;
  const cwd = vi.spyOn(process, "cwd").mockReturnValue(directory);
  try {
    process.env.ENABLE_REQUEST_LOGS = "true";
    vi.resetModules();
    const { createRequestLogger } = await import("../../open-sse/utils/requestLogger.js");
    const logger = await createRequestLogger("openai", "openai", "test-model");
    logger.logTargetRequest("https://example.test?key=url-secret", { Authorization: "Bearer header-secret" }, { apiKey: "body-secret" });
    logger.logProviderResponse(401, "Unauthorized", { "set-cookie": "session=cookie-secret" }, { error: "Incorrect API key sk-upstream-secret" });
    logger.logError(new Error("Incorrect API key sk-error-secret"));
    const files = fs.readdirSync(logger.sessionPath).map((file) => fs.readFileSync(path.join(logger.sessionPath, file), "utf8")).join("\n");
    for (const secret of ["url-secret", "header-secret", "body-secret", "cookie-secret", "sk-upstream-secret", "sk-error-secret"]) expect(files).not.toContain(secret);
    expect(files).toContain("[REDACTED]");
    expect(files).toContain("Unauthorized");
  } finally {
    cwd.mockRestore();
    if (original === undefined) delete process.env.ENABLE_REQUEST_LOGS; else process.env.ENABLE_REQUEST_LOGS = original;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
