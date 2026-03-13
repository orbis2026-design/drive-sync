import { getOpsContext } from "./actions";
import { OpsClient } from "./OpsClient";

export const metadata = {
  title: "Operator Panel — DriveSync",
  description: "Development operator tools for DriveSync.",
};

export default async function OpsPage() {
  const result = await getOpsContext();

  if ("error" in result) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-2xl border border-gray-800 bg-gray-900 px-6 py-6 space-y-3 text-center">
          <h1 className="text-xl font-black text-white">Operator Panel</h1>
          <p className="text-sm text-danger-400">{result.error}</p>
        </div>
      </div>
    );
  }

  return <OpsClient context={result.context} tenants={result.tenants} />;
}

