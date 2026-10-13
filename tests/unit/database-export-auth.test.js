import { expect, it, vi } from "vitest";
vi.mock("@/lib/localDb", () => ({ exportDb: async () => ({ configurationOnly: true }), getSettings: async () => ({}), importDb: vi.fn() }));
vi.mock("@/lib/auth/dashboardSession", () => ({ verifyDashboardPassword: async () => false }));
vi.mock("@/shared/utils/machineId", () => ({ getConsistentMachineId: async () => "valid-local-token" }));
import { GET } from "../../src/app/api/settings/database/route";
it("does not bypass password re-auth with a forged CLI header", async () => {
  const response = await GET(new Request("http://localhost/api/settings/database", { headers: { "x-vr-cli-token": "forged" } }));
  expect(response.status).toBe(401);
});
it("accepts the authenticated machine token", async () => {
  const response = await GET(new Request("http://localhost/api/settings/database", { headers: { "x-vr-cli-token": "valid-local-token" } }));
  expect(response.status).toBe(200);
});
