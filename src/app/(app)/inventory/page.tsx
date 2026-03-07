import { fetchConsumables } from "./actions";
import { InventoryClient } from "./InventoryClient";

export const metadata = {
  title: "Inventory — DriveSync",
  description: "Track bulk consumables and prevent profit leakage.",
};

export default async function InventoryPage() {
  const result = await fetchConsumables();

  const data = "data" in result ? result.data : [];
  const error = "error" in result ? result.error : undefined;

  return (
    <div className="flex flex-col min-h-full bg-gray-950">
      {/* Header */}
      <header className="px-4 pt-6 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-black text-white tracking-tight">Inventory</h1>
          <p className="text-base text-gray-500 mt-1">
            Bulk consumables · auto-deducted on job close
          </p>
        </div>
      </header>

      {/* Error banner */}
      {error && (
        <div
          role="alert"
          className="mx-4 mb-4 rounded-2xl bg-red-950 border border-red-700 px-4 py-3 text-sm text-red-400"
        >
          Could not load inventory: {error}
        </div>
      )}

      {/* Main content */}
      <div className="flex-1">
        <InventoryClient initial={data} />
      </div>
    </div>
  );
}
