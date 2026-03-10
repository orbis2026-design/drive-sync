import { getSupplementalPortalData } from "../../[token]/actions";
import { SupplementalChangeOrder } from "../../[token]/supplemental";

function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="min-h-[100dvh] bg-white flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mb-6">
        <span className="text-3xl" aria-hidden="true">⚠️</span>
      </div>
      <h1 className="text-xl font-bold text-gray-900 mb-2">Change order link unavailable</h1>
      <p className="text-sm text-gray-500 max-w-xs">{message}</p>
    </div>
  );
}

export default async function ChangeOrderPortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const result = await getSupplementalPortalData(token);

  if ("error" in result) {
    return <ErrorScreen message={result.error} />;
  }

  const { data } = result;

  return (
    <div className="min-h-[100dvh] bg-gray-50 py-8 px-4">
      <div className="max-w-lg mx-auto">
        <SupplementalChangeOrder
          workOrderId={data.workOrderId}
          approvalToken={data.approvalToken}
          originalContract={data.originalContract}
          deltaParts={data.deltaParts}
          deltaLaborCents={data.deltaLaborCents}
        />
      </div>
    </div>
  );
}
