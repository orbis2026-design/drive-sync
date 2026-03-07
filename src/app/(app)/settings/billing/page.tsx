import { getSubscriptionDetails } from "./actions";
import BillingClient from "./BillingClient";

export const metadata = {
  title: "Billing — DriveSync",
};

export default async function BillingPage() {
  const details = await getSubscriptionDetails();

  return (
    <div>
      <div className="max-w-xl mx-auto px-4 pt-6 pb-2">
        <h1 className="text-2xl font-black text-white tracking-tight">
          Billing
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Manage your DriveSync Pro subscription and invoices.
        </p>
      </div>

      <BillingClient initial={details} />
    </div>
  );
}
