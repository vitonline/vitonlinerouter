import { enableDefaultProviderCombo } from "@/lib/db/repos/defaultProviderCombo";
import { getComboByName } from "@/lib/localDb";
import { resetComboRotation } from "open-sse/services/combo.js";
export async function POST() {
  await enableDefaultProviderCombo();
  resetComboRotation("MyDefaultProvider");
  return Response.json(await getComboByName("MyDefaultProvider"));
}
