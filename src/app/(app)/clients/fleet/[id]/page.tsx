import { fetchFleetData } from "./actions";
import { FleetClient } from "./FleetClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await fetchFleetData(id);
  const name = "data" in result ? result.data.clientName : "Fleet";
  return {
    title: `${name} Fleet — DriveSync`,
  };
}

export default async function FleetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await fetchFleetData(id);

  if ("error" in result) {
    return (
      <div className="flex flex-col min-h-full bg-gray-950 px-4 pt-6">
        <div
          role="alert"
          className="rounded-2xl bg-red-950 border border-red-700 px-4 py-3 text-sm text-red-400"
        >
          {result.error}
        </div>
      </div>
    );
  }

  const { data } = result;

  return (
    <div className="flex flex-col min-h-full bg-gray-950">
      {/* Header */}
      <header className="px-4 pt-6 pb-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-bold text-yellow-400 bg-yellow-400/10 border border-yellow-400/30 px-2 py-0.5 rounded-full uppercase tracking-wide">
            Commercial Fleet
          </span>
        </div>
        <h1 className="text-4xl font-black text-white tracking-tight">
          {data.clientName}
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          {data.phone}
          {data.email ? ` · ${data.email}` : ""}
        </p>
      </header>

      {/* Content */}
      <div className="flex-1">
        <FleetClient data={data} />
      </div>
    </div>
  );
}
