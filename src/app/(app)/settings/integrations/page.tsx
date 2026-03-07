import { getIntegrationSettings } from "./actions";
import IntegrationsClient from "./IntegrationsClient";

export const metadata = {
  title: "Integrations — DriveSync",
};

export default async function IntegrationsPage() {
  const settings = await getIntegrationSettings();

  return (
    <div className="max-w-xl mx-auto px-4 pt-6 pb-20">
      <h1 className="text-2xl font-black text-white tracking-tight mb-1">
        Integrations
      </h1>
      <p className="text-gray-500 text-sm mb-6">
        Connect third-party services to automate your shop workflow.
      </p>

      <IntegrationsClient initialSettings={settings} />
    </div>
  );
}
