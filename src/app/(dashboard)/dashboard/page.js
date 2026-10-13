import { getMachineId } from "@/shared/utils/machine";
import EndpointPageClient from "./endpoint/EndpointPageClient";
import ProviderIssues from "@/shared/components/ProviderIssues";

export default async function DashboardPage() {
  const machineId = await getMachineId();
  return <div className="flex flex-col gap-6"><ProviderIssues /><EndpointPageClient machineId={machineId} /></div>;
}
