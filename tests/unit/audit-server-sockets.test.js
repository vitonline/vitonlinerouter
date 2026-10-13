import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const wrapper = fileURLToPath(new URL("../../custom-server.js", import.meta.url));
function probe(mode) {
  const script = `
    process.env.H2C_BODY_TIMEOUT_MS='100';
    require(${JSON.stringify(wrapper)});
    const http=require('http'), net=require('net');
    let handled=0, closed=false;
    const server=http.createServer(()=>handled++);
    server.on('upgrade',()=>{});
    server.listen(0,'127.0.0.1',()=>{
      const client=net.connect(server.address().port,'127.0.0.1',()=>{
        client.write('POST / HTTP/1.1\\r\\nHost: localhost\\r\\nConnection: Upgrade\\r\\nUpgrade: h2c\\r\\nContent-Length: 10\\r\\n\\r\\naa');
        ${mode === "reset" ? "setTimeout(()=>client.resetAndDestroy(),30);" : ""}
      });
      client.on('error',()=>{});
      client.on('close',()=>closed=true);
      setTimeout(()=>{console.log(JSON.stringify({handled,closed}));client.destroy();server.close();process.exit(0)},300);
    });`;
  return spawnSync(process.execPath, ["-e", script], { encoding: "utf8", timeout: 3000, windowsHide: true });
}
describe("h2c socket safety", () => {
  it("survives a real partial-body TCP reset", () => {
    const result = probe("reset");
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout.trim())).toEqual({handled:0,closed:true});
  });
  it("closes an idle upgraded socket at its absolute body deadline", () => {
    const result = probe("stall");
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout.trim())).toEqual({handled:0,closed:true});
  });
});
