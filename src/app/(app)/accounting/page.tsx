import { AccountingClient } from "./AccountingClient";

export const metadata = {
  title: "Accounting — DriveSync",
  description: "Month-end financial export for QuickBooks and your accountant.",
};

export default function AccountingPage() {
  const now = new Date();

  return (
    <div className="flex flex-col min-h-full bg-gray-950">
      {/* Header */}
      <header className="px-4 pt-6 pb-4">
        <h1 className="text-4xl font-black text-white tracking-tight font-mono">
          Accounting
        </h1>
        <p className="text-base text-gray-500 mt-1 font-mono">
          Month-end ledger export · QuickBooks format
        </p>
      </header>

      <div className="flex-1">
        <AccountingClient
          initialYear={now.getFullYear()}
          initialMonth={now.getMonth() + 1}
        />
      </div>
    </div>
  );
}
