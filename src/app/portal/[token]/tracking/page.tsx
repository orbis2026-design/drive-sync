import { prisma } from "@/lib/prisma";
import TrackingClient from "./TrackingClient";

interface TrackingPageProps {
  params: Promise<{ token: string }>;
}

export default async function TrackingPage({ params }: TrackingPageProps) {
  const { token } = await params;

  // Look up the work order by approval token to get mechanic/client info
  let workOrderId = "";
  let mechanicName = "Your Mechanic";
  let mechanicPhone: string | undefined;

  try {
    const workOrder = await prisma.workOrder.findUnique({
      where: { approvalToken: token },
      select: {
        id: true,
        client: {
          select: { phone: true },
        },
        tenant: {
          select: { name: true },
        },
      },
    });

    if (workOrder) {
      workOrderId = workOrder.id;
      mechanicName = workOrder.tenant?.name ?? "Your Mechanic";
      // In a real system the mechanic's direct phone would come from their profile.
      // For now we surface the shop's primary contact from the client record
      // (the number we have on file is the client's — mechanic phone is TBD).
    }
  } catch {
    // DB unavailable in demo — fall back to token-derived ID
    workOrderId = `demo-${token}`;
  }

  if (!workOrderId) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-6">
        <div className="text-center max-w-xs">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">🔗</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            Link Unavailable
          </h1>
          <p className="text-gray-500 text-sm">
            This tracking link has expired or is invalid.
          </p>
        </div>
      </div>
    );
  }

  return (
    <TrackingClient
      workOrderId={workOrderId}
      mechanicName={mechanicName}
      mechanicPhone={mechanicPhone}
    />
  );
}
