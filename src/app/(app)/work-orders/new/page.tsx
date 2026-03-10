import { redirect } from "next/navigation";
import { NewWorkOrderClient } from "./NewWorkOrderClient";

export const metadata = {
  title: "New Work Order — DriveSync",
  description: "Create a new work order for this vehicle.",
};

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Renders a client component that creates the work order after mount so
 * revalidateTag runs outside of server render (Next.js requirement).
 */
export default async function NewWorkOrderPage({ searchParams }: Props) {
  const params = await searchParams;
  const vehicleId =
    typeof params.vehicleId === "string" ? params.vehicleId.trim() : null;

  if (!vehicleId) {
    redirect("/clients");
  }

  return <NewWorkOrderClient vehicleId={vehicleId} />;
}
