import { getQboStatus } from "./actions";
import QboClient from "./QboClient";

export const metadata = {
  title: "QuickBooks Online — DriveSync",
};

export default async function QboPage() {
  const status = await getQboStatus();

  return (
    <div>
      <div className="max-w-xl mx-auto px-4 pt-6 pb-2">
        <h1 className="text-2xl font-black text-white tracking-tight">
          QuickBooks Online
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Sync closed work orders directly into your QuickBooks account — no
          manual re-entry.
        </p>
      </div>

      <QboClient initialStatus={status} />
    </div>
  );
}
