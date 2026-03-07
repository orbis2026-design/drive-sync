import { getSendPageData } from "../actions";
import { QuoteSendClient } from "./QuoteSendClient";

function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center px-5 py-12">
      <div className="w-full max-w-md rounded-2xl border-2 border-danger-500/40 bg-danger-500/10 px-6 py-8 text-center space-y-3">
        <p className="text-4xl" aria-hidden="true">
          ⚠️
        </p>
        <h1 className="text-xl font-black text-white">Unable to Send Quote</h1>
        <p className="text-sm text-danger-400">{message}</p>
      </div>
    </div>
  );
}

export default async function SendQuotePage({
  params,
}: {
  params: Promise<{ workOrderId: string }>;
}) {
  const { workOrderId } = await params;

  const result = await getSendPageData(workOrderId);

  if ("error" in result) {
    return <ErrorScreen message={result.error} />;
  }

  return <QuoteSendClient data={result.data} />;
}
