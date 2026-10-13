const http = require("http");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const net = require("net");
const { registerShutdown } = require("./shutdown.cjs");
const { pathToFileURL } = require("url");

const origCreate = http.createServer.bind(http);
function boundedEnv(name, fallback, ceiling) {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? Math.min(value, ceiling) : fallback;
}
const MAX_BODY_BYTES = boundedEnv("MAX_REQUEST_BODY_BYTES", 128 * 1024 * 1024, 128 * 1024 * 1024);
const H2C_BODY_TIMEOUT_MS = boundedEnv("H2C_BODY_TIMEOUT_MS", 60_000, 60_000);
const MAX_INFLIGHT_REQUESTS = boundedEnv("MAX_INFLIGHT_REQUESTS", 64, 1024);

// Per-process secret proving x-vr-real-ip was stamped below rather than sent by the client.
// A bare `next start` / `next dev` never loads this file, so it cannot produce a matching
// header even though the env var is inherited by child processes. Named like x-vr-cli-token
// so the request-detail header sanitizer redacts it too.
const PEER_TOKEN = crypto.randomBytes(24).toString("hex");
process.env.VITONLINEROUTER_PEER_TOKEN = PEER_TOKEN;

let backgroundRefreshStarted = false;
let activeRequests = 0;
let pendingUpgrades = 0;
let pendingUpgradeBytes = 0;

function startBackgroundTokenRefreshFromCustomServer() {
  if (backgroundRefreshStarted) return;
  backgroundRefreshStarted = true;
  // Prefer source path (repo / standalone that still has src). Fail-open if missing
  // — initializeApp also starts the same scheduler when the Next app boots.
  const modPath = path.join(__dirname, "src", "sse", "services", "backgroundTokenRefresh.js");
  import(pathToFileURL(modPath).href)
    .then((m) => {
      try {
        m.startBackgroundTokenRefresh();
      } catch (e) {
        console.error("[BackgroundTokenRefresh] start failed:", e && e.message ? e.message : e);
      }
      const stop = () => {
        try {
          m.stopBackgroundTokenRefresh();
        } catch {
          /* ignore */
        }
      };
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
    })
    .catch((e) => {
      // Expected in published CLI standalone (src/ not on disk). App bootstrap covers it.
      if (process.env.DEBUG_BACKGROUND_TOKEN_REFRESH) {
        console.error("[BackgroundTokenRefresh] import failed:", e && e.message ? e.message : e);
      }
    });
}

// Wrap Next standalone HTTP server: derive client IP from the TCP socket
// (unspoofable) and strip client-supplied forwarding headers so downstream
// rate-limiting keys on the real peer address instead of attacker-controlled XFF.
http.createServer = (...args) => {
  const handler = args.find((a) => typeof a === "function");
  const rest = args.filter((a) => typeof a !== "function");
  if (!handler) return origCreate(...args);
  const wrapped = (req, res) => {
    if (activeRequests >= MAX_INFLIGHT_REQUESTS || Number(req.headers["content-length"] || 0) > MAX_BODY_BYTES) {
      res.writeHead(activeRequests >= MAX_INFLIGHT_REQUESTS ? 503 : 413, { "Connection": "close" });
      res.end("Request capacity or body size limit exceeded");
      return;
    }
    activeRequests++;
    let released = false;
    const release = () => { if (!released) { released = true; activeRequests--; } };
    res.once("finish", release);
    res.once("close", release);
    const socketIp = req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : "";
    const xff = req.headers["x-forwarded-for"];
    const xRealIp = req.headers["x-real-ip"];
    const viaProxy = !!(xff || xRealIp);
    const isLoopbackProxy = socketIp === "127.0.0.1" || socketIp === "::1" || socketIp === "::ffff:127.0.0.1";
    // Trust forwarding headers only when the TCP peer is a local reverse proxy.
    // Direct/public sockets remain keyed by the unspoofable peer address.
    // A single local proxy must append its observed peer or overwrite X-Real-IP.
    // Never trust a client-supplied prefix in an appended forwarding chain.
    const candidate = xff ? String(xff).split(",").at(-1).trim() : xRealIp;
    const proxyIp = net.isIP(candidate || "") ? candidate : "";
    const ip = isLoopbackProxy && proxyIp ? proxyIp : socketIp;
    delete req.headers["x-vr-real-ip"];
    delete req.headers["x-forwarded-for"];
    delete req.headers["x-vr-via-proxy"];
    delete req.headers["x-vr-peer-token"];
    req.headers["x-vr-real-ip"] = ip;
    req.headers["x-vr-peer-token"] = PEER_TOKEN;
    if (viaProxy) req.headers["x-vr-via-proxy"] = "1";
    return handler(req, res);
  };
  const server = origCreate(...rest, wrapped);
  registerShutdown(server, () => new Promise(resolve => {
    server.close(resolve);
    server.closeIdleConnections?.();
    const timer = setTimeout(() => { server.closeAllConnections?.(); resolve(); }, 3000);
    timer.unref();
    server.once("close", () => clearTimeout(timer));
  }), -100);
  server.once("listening", () => {
    startBackgroundTokenRefreshFromCustomServer();
  });
  const origEmit = server.emit;
  // JBR 25 sends h2c upgrades that the HTTP/1.1 server would otherwise close.
  server.emit = function (event, ...eventArgs) {
    const [req, socket, head] = eventArgs;
    if (event !== "upgrade" || String(req.headers.upgrade || "").toLowerCase() !== "h2c") {
      return origEmit.call(this, event, ...eventArgs);
    }

    const contentLength = Number(req.headers["content-length"] || 0);
    const maxBodyBytes = MAX_BODY_BYTES;
    if (!Number.isSafeInteger(contentLength) || contentLength < 0 || contentLength > maxBodyBytes || pendingUpgrades >= MAX_INFLIGHT_REQUESTS || pendingUpgradeBytes + contentLength > 256 * 1024 * 1024) {
      socket.destroy();
      return true;
    }
    pendingUpgrades++;
    pendingUpgradeBytes += contentLength;
    let reserved = true;
    const releaseUpgrade = () => { if (reserved) { reserved = false; pendingUpgrades--; pendingUpgradeBytes -= contentLength; } };
    socket.once("close", releaseUpgrade);
    const chunks = [head];
    let received = head.length;
    const destroy = () => socket.destroy();
    socket.on("error", destroy);
    socket.on("end", destroy);
    // Absolute deadline also stops slow-drip clients from resetting an idle timer.
    const bodyDeadline = setTimeout(destroy, H2C_BODY_TIMEOUT_MS);
    bodyDeadline.unref();
    socket.once("close", () => clearTimeout(bodyDeadline));
    const serve = () => {
      releaseUpgrade();
      clearTimeout(bodyDeadline);
      socket.off("end", destroy);
      // Replay the upgraded request through the existing HTTP/1.1 handler.
      const replay = new http.IncomingMessage(socket);
      Object.assign(replay, { method: req.method, url: req.url, headers: req.headers, complete: true });
      if (received) replay.push(Buffer.concat(chunks, received).subarray(0, contentLength));
      replay.push(null);
      const res = new http.ServerResponse(replay);
      res.on("error", destroy);
      res.shouldKeepAlive = false;
      res.assignSocket(socket);
      res.once("finish", () => socket.end());
      Promise.resolve().then(() => wrapped(replay, res)).catch((error) => {
        console.error("Failed to downgrade h2c request", error);
        socket.destroy();
      });
    };
    if (received >= contentLength) serve();
    else {
      socket.on("data", function readBody(chunk) {
        if (received + chunk.length > maxBodyBytes) return destroy();
        chunks.push(chunk);
        received += chunk.length;
        if (received < contentLength) return;
        socket.off("data", readBody);
        serve();
      });
      socket.resume();
    }
    delete req.headers.upgrade;
    delete req.headers["http2-settings"];
    req.headers.connection = "close";
    return true;
  };
  return server;
};

if (require.main === module) {
  const standalone = path.join(__dirname, "server.js");
  if (fs.existsSync(standalone)) {
    require(standalone);
  } else {
    // Repo checkout has no standalone build next to us. `next start` builds its HTTP
    // server in-process, so the wrapper above still sanitizes every request.
    const nextBin = require.resolve("next/dist/bin/next");
    process.argv = [process.argv[0], nextBin, "start", ...process.argv.slice(2)];
    require(nextBin);
  }
}
