"use client";

import { useState } from "react";

// ---------------------------------------------------------------------------
// Legal text constants
// ---------------------------------------------------------------------------

const SHOP_NAME = "DriveSync Auto Service";

const LEGAL_CLAUSES = [
  {
    heading: "Authorization to Operate Vehicle",
    body: `The undersigned owner/authorized agent hereby grants ${SHOP_NAME} and its 
employees, agents, and contractors the irrevocable right and authority to operate 
the described vehicle for the purpose of testing, diagnosing, inspecting, and/or 
road-testing before, during, and after repairs, including test drives on public 
roads. Such operation is solely for the benefit of the owner and is a necessary 
part of the service requested.`,
  },
  {
    heading: "Mechanic's Lien — Non-Payment Notice",
    body: `Pursuant to applicable state mechanic's lien laws, ${SHOP_NAME} hereby 
asserts its right to retain possession of the vehicle until all charges for labor, 
parts, materials, storage, and services rendered have been paid in full. If the 
vehicle is not claimed and charges are not paid within thirty (30) days of 
completion notice, the shop may proceed to enforce the lien in accordance with 
applicable law, which may include sale of the vehicle to satisfy the outstanding 
balance. The customer acknowledges receipt of this notice and agrees to its terms.`,
  },
  {
    heading: "Storage Fees",
    body: `In the event the vehicle is not retrieved within forty-eight (48) hours 
of notification that repairs are complete, ${SHOP_NAME} reserves the right to 
charge a daily storage fee at the then-current shop rate. The customer authorizes 
the assessment of such fees, which will be added to the outstanding balance and 
subject to the mechanic's lien described above.`,
  },
  {
    heading: "Estimate Authorization",
    body: `The customer authorizes ${SHOP_NAME} to perform the services detailed 
in the accompanying Work Order and/or Quote at the agreed-upon price. The shop 
will make reasonable efforts to notify the customer before exceeding the authorized 
estimate by more than 10% or $100, whichever is less. Authorization for additional 
work may be provided verbally, electronically, or via signature on a Change Order.`,
  },
  {
    heading: "Customer-Supplied Parts Disclaimer",
    body: `Where the customer supplies parts for installation, ${SHOP_NAME} expressly 
disclaims all warranties of any kind, express or implied, with respect to such parts. 
The shop is not responsible for any labor or consequential costs arising from the 
failure, defect, or incompatibility of customer-supplied components. Labor charges 
will apply regardless of whether the installed customer-supplied part performs as 
intended.`,
  },
  {
    heading: "Limitation of Liability",
    body: `${SHOP_NAME}'s liability for any claim arising out of services performed 
shall not exceed the total amount paid by the customer for those specific services. 
The shop is not liable for incidental, consequential, or punitive damages of any 
kind, including but not limited to loss of use, loss of income, or towing costs, 
except as required by applicable law.`,
  },
  {
    heading: "Unclaimed Vehicles",
    body: `Vehicles not claimed within sixty (60) days of completion notice will 
be treated as abandoned and may be reported to the appropriate governmental 
authority and/or disposed of in accordance with applicable law. All costs associated 
with disposal, including towing, storage, and administrative fees, will be charged 
to the customer's account.`,
  },
  {
    heading: "Governing Law & Dispute Resolution",
    body: `This Agreement shall be governed by the laws of the state in which the 
repairs are performed. Any dispute not resolved amicably shall be submitted to 
binding arbitration under the rules of the American Arbitration Association before 
resort to litigation. The prevailing party shall be entitled to recover reasonable 
attorneys' fees and costs.`,
  },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IntakeContractProps {
  /** Client's name for personalization */
  clientName: string;
  /** Work Order or Quote reference number */
  workOrderId: string;
  /** Timestamp of portal access (ISO string) — logged for legal record */
  accessedAt: string;
  /** Requester's IP address — logged for legal record */
  clientIp?: string;
  /** Called when the customer clicks "I Agree — Proceed to Signature" */
  onAccept: () => void;
}

// ---------------------------------------------------------------------------
// IntakeContract component
// ---------------------------------------------------------------------------

/**
 * Renders a dense but readable legal Terms of Service scroll box that the
 * customer must scroll through before they can proceed to the signature pad.
 * Records access timestamp and IP address for legal evidentiary purposes.
 */
export function IntakeContract({
  clientName,
  workOrderId,
  accessedAt,
  clientIp,
  onAccept,
}: IntakeContractProps) {
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const [agreed, setAgreed] = useState(false);

  const formattedDate = new Date(accessedAt).toLocaleString("en-US", {
    dateStyle: "full",
    timeStyle: "long",
  });

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    // Consider "scrolled to bottom" when within 40 px of the bottom
    const nearBottom =
      el.scrollTop + el.clientHeight >= el.scrollHeight - 40;
    if (nearBottom) setHasScrolledToBottom(true);
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="text-center space-y-1">
        <h2 className="text-lg font-black text-gray-900">
          Authorization &amp; Terms of Service
        </h2>
        <p className="text-xs text-gray-500">
          Please read the complete agreement below before signing.
        </p>
      </div>

      {/* Timestamp & IP record — legally material */}
      <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 space-y-1">
        <p className="text-[10px] font-bold uppercase tracking-widest text-blue-600">
          Electronic Record
        </p>
        <p className="text-xs text-blue-800">
          <strong>Client:</strong> {clientName}
        </p>
        <p className="text-xs text-blue-800">
          <strong>Work Order:</strong> {workOrderId}
        </p>
        <p className="text-xs text-blue-800">
          <strong>Agreement Presented:</strong> {formattedDate}
        </p>
        {clientIp && (
          <p className="text-xs text-blue-800">
            <strong>IP Address:</strong> {clientIp}
          </p>
        )}
        <p className="text-[10px] text-blue-600 mt-1">
          This record will be embedded in the signed PDF for legal compliance.
        </p>
      </div>

      {/* Scrollable legal text */}
      <div
        onScroll={handleScroll}
        className={[
          "h-72 overflow-y-auto rounded-xl border-2 bg-white p-5",
          "text-xs text-gray-700 leading-relaxed space-y-5",
          hasScrolledToBottom
            ? "border-green-400"
            : "border-gray-200",
          "scroll-smooth",
        ].join(" ")}
        tabIndex={0}
        aria-label="Terms of Service — scroll to read"
        role="document"
      >
        {/* Preamble */}
        <p className="font-semibold text-gray-900">
          VEHICLE REPAIR AUTHORIZATION &amp; SERVICE AGREEMENT
        </p>
        <p>
          This Agreement is entered into between{" "}
          <strong>{SHOP_NAME}</strong> ("Shop") and{" "}
          <strong>{clientName}</strong> ("Customer") with respect to
          vehicle repair services described in Work Order{" "}
          <strong>{workOrderId}</strong>.
        </p>

        {/* Numbered clauses */}
        {LEGAL_CLAUSES.map((clause, idx) => (
          <div key={clause.heading}>
            <p className="font-bold text-gray-900">
              {idx + 1}. {clause.heading}
            </p>
            <p className="mt-1 whitespace-pre-line">{clause.body}</p>
          </div>
        ))}

        {/* Acknowledgment footer */}
        <div className="border-t border-gray-200 pt-4 mt-4">
          <p className="font-semibold text-gray-900">Acknowledgment</p>
          <p className="mt-1">
            By proceeding to the electronic signature below, the Customer
            acknowledges that they have read, understood, and agreed to all
            terms and conditions set forth in this Agreement; that the
            electronic signature is legally binding to the same extent as a
            handwritten signature; and that this Agreement, together with the
            accompanying Quote and any executed Change Orders, constitutes the
            entire agreement between the parties with respect to the services
            described herein.
          </p>
        </div>
      </div>

      {/* Scroll nudge — disappears once scrolled */}
      {!hasScrolledToBottom && (
        <p className="text-center text-xs text-gray-400 animate-bounce">
          ↓ Scroll to read the full agreement
        </p>
      )}

      {/* Checkbox agreement */}
      <label
        className={[
          "flex items-start gap-3 rounded-xl border-2 px-4 py-3",
          "cursor-pointer transition-colors duration-150",
          hasScrolledToBottom
            ? agreed
              ? "border-green-400 bg-green-50"
              : "border-gray-300 bg-gray-50 hover:border-green-300"
            : "border-gray-200 bg-gray-100 opacity-50 cursor-not-allowed",
        ].join(" ")}
      >
        <input
          type="checkbox"
          checked={agreed}
          disabled={!hasScrolledToBottom}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500 flex-shrink-0"
        />
        <span className="text-xs text-gray-700 leading-relaxed">
          I, <strong>{clientName}</strong>, have read and agree to all terms
          above. I understand this is a legally binding electronic agreement,
          and my electronic signature below constitutes my acceptance.
        </span>
      </label>

      {/* Proceed to signature button */}
      <button
        type="button"
        onClick={onAccept}
        disabled={!agreed}
        className={[
          "w-full rounded-xl py-3 px-4",
          "text-sm font-black uppercase tracking-widest",
          "transition-all duration-150 active:scale-[0.98]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500",
          agreed
            ? "bg-green-500 text-white shadow-[0_0_20px_4px_rgba(34,197,94,0.3)] hover:bg-green-400"
            : "bg-gray-200 text-gray-400 cursor-not-allowed",
        ].join(" ")}
      >
        I Agree — Proceed to Signature →
      </button>
    </div>
  );
}
