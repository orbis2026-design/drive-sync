"use client";

import { useState } from "react";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Template definitions
// ---------------------------------------------------------------------------

type TemplateField = { key: string; label: string; placeholder: string };

type TemplateDefinition = {
  id: string;
  title: string;
  description: string;
  fields: TemplateField[];
  legalText: (values: Record<string, string>) => string;
};

const TEMPLATES: TemplateDefinition[] = [
  {
    id: "california-bar-compliant-invoice",
    title: "California BAR Compliant Invoice",
    description:
      "Auto repair invoice meeting all California Bureau of Automotive Repair requirements.",
    fields: [
      { key: "shopName", label: "Shop Name", placeholder: "Mike's Mobile Mechanics" },
      { key: "shopAddress", label: "Shop Address", placeholder: "123 Main St, Los Angeles, CA 90001" },
      { key: "shopPhone", label: "Shop Phone", placeholder: "(213) 555-0100" },
      { key: "clientName", label: "Customer Name", placeholder: "Jane Smith" },
      { key: "clientAddress", label: "Customer Address", placeholder: "456 Oak Ave, Los Angeles, CA 90002" },
      { key: "date", label: "Invoice Date", placeholder: "2026-03-08" },
      { key: "invoiceNumber", label: "Invoice #", placeholder: "INV-1001" },
      { key: "vehicleYear", label: "Vehicle Year", placeholder: "2019" },
      { key: "vehicleMake", label: "Vehicle Make", placeholder: "Toyota" },
      { key: "vehicleModel", label: "Vehicle Model", placeholder: "Camry" },
      { key: "vin", label: "VIN", placeholder: "4T1BF1FK3EU000000" },
      { key: "odometer", label: "Odometer (miles)", placeholder: "87,452" },
      { key: "laborDescription", label: "Labor Description", placeholder: "Oil change, 5W-30 synthetic (5 qts) + filter replacement" },
      { key: "laborAmount", label: "Labor Amount ($)", placeholder: "75.00" },
      { key: "partsDescription", label: "Parts Description", placeholder: "5W-30 Synthetic Oil (5 qt), OEM oil filter" },
      { key: "partsAmount", label: "Parts Amount ($)", placeholder: "42.00" },
      { key: "taxRate", label: "Tax Rate (%)", placeholder: "10.25" },
      { key: "authorizationName", label: "Authorized By", placeholder: "Jane Smith" },
    ],
    legalText: (v) => {
      const labor = parseFloat(v.laborAmount || "0");
      const parts = parseFloat(v.partsAmount || "0");
      const taxRate = parseFloat(v.taxRate || "0") / 100;
      const tax = (labor + parts) * taxRate;
      const envFee = 3.0;
      const total = labor + parts + tax + envFee;

      return `AUTOMOTIVE REPAIR INVOICE
California Bureau of Automotive Repair Compliant
──────────────────────────────────────────────────

SHOP INFORMATION
Shop Name:    ${v.shopName || ""}
Address:      ${v.shopAddress || ""}
Phone:        ${v.shopPhone || ""}
BAR License:  [Your BAR Registration Number]

INVOICE DETAILS
Invoice #:    ${v.invoiceNumber || ""}
Date:         ${v.date || ""}

CUSTOMER INFORMATION
Name:         ${v.clientName || ""}
Address:      ${v.clientAddress || ""}

VEHICLE INFORMATION
Year/Make/Model: ${v.vehicleYear || ""} ${v.vehicleMake || ""} ${v.vehicleModel || ""}
VIN:          ${v.vin || ""}
Odometer In:  ${v.odometer || ""} miles

──────────────────────────────────────────────────
LABOR
${v.laborDescription || ""}
                                  $${labor.toFixed(2)}

PARTS & MATERIALS
${v.partsDescription || ""}
                                  $${parts.toFixed(2)}

──────────────────────────────────────────────────
Subtotal:                         $${(labor + parts).toFixed(2)}
Tax (${v.taxRate || "0"}%):                       $${tax.toFixed(2)}
Environmental Fee:                $${envFee.toFixed(2)}
──────────────────────────────────────────────────
TOTAL DUE:                        $${total.toFixed(2)}

──────────────────────────────────────────────────
AUTHORIZATION

By signing below, the customer authorizes the above-described
repair work and acknowledges receipt of a copy of this invoice.
All parts replaced are available for inspection for three (3)
days following completion of repair (California Business &
Professions Code § 9884.9).

Customer Signature: _________________________ Date: _________

Authorized By: ${v.authorizationName || ""}

This invoice complies with the California Automotive Repair Act
(Business & Professions Code §§ 9880–9884.9).`;
    },
  },
  {
    id: "diagnostic-authorization-waiver",
    title: "Diagnostic Authorization Waiver",
    description:
      "Authorize diagnostic fees before any work begins. Protects your shop legally.",
    fields: [
      { key: "shopName", label: "Shop Name", placeholder: "Mike's Mobile Mechanics" },
      { key: "shopPhone", label: "Shop Phone", placeholder: "(213) 555-0100" },
      { key: "clientName", label: "Customer Name", placeholder: "Jane Smith" },
      { key: "date", label: "Date", placeholder: "2026-03-08" },
      { key: "vehicleYear", label: "Vehicle Year", placeholder: "2019" },
      { key: "vehicleMake", label: "Vehicle Make", placeholder: "Toyota" },
      { key: "vehicleModel", label: "Vehicle Model", placeholder: "Camry" },
      { key: "vin", label: "VIN", placeholder: "4T1BF1FK3EU000000" },
      { key: "diagnosticFee", label: "Diagnostic Fee ($)", placeholder: "95.00" },
      { key: "symptomDescription", label: "Symptom / Concern", placeholder: "Check engine light on, rough idle" },
    ],
    legalText: (v) => `DIAGNOSTIC AUTHORIZATION WAIVER
──────────────────────────────────────────────────

${v.shopName || ""}  |  ${v.shopPhone || ""}
Date: ${v.date || ""}

VEHICLE
${v.vehicleYear || ""} ${v.vehicleMake || ""} ${v.vehicleModel || ""}
VIN: ${v.vin || ""}

CUSTOMER
${v.clientName || ""}

AUTHORIZATION

I, ${v.clientName || "_________________________"}, hereby authorize
${v.shopName || "_________________________"} to perform a vehicle
diagnostic inspection to identify the cause of the following concern:

Symptom / Concern: ${v.symptomDescription || ""}

I understand and agree to the following terms:

1. DIAGNOSTIC FEE: A non-refundable diagnostic fee of
   $${v.diagnosticFee || "_______"} will be charged regardless of
   whether I authorize the subsequent repair work.

2. ESTIMATE REQUIRED: Before any repair work is performed,
   the shop will provide a written estimate for my approval.

3. NO REPAIR WITHOUT APPROVAL: No repair work will be started
   without my express written or verbal authorization.

4. INSPECTION ACCESS: I authorize the shop to inspect, test
   drive, and operate the vehicle as needed for diagnosis.

5. SHOP'S RIGHT TO REFUSE: The shop may decline to perform any
   work it deems unsafe or impractical.

Customer Signature: _________________________ Date: _________

Printed Name: ${v.clientName || ""}

Technician: _________________________ Date: _________`,
  },
  {
    id: "pre-existing-damage-waiver",
    title: "Pre-Existing Damage Waiver",
    description:
      "Document vehicle condition before service. Protects against spurious damage claims.",
    fields: [
      { key: "shopName", label: "Shop Name", placeholder: "Mike's Mobile Mechanics" },
      { key: "shopPhone", label: "Shop Phone", placeholder: "(213) 555-0100" },
      { key: "clientName", label: "Customer Name", placeholder: "Jane Smith" },
      { key: "date", label: "Date", placeholder: "2026-03-08" },
      { key: "vehicleYear", label: "Vehicle Year", placeholder: "2019" },
      { key: "vehicleMake", label: "Vehicle Make", placeholder: "Toyota" },
      { key: "vehicleModel", label: "Vehicle Model", placeholder: "Camry" },
      { key: "vin", label: "VIN", placeholder: "4T1BF1FK3EU000000" },
      { key: "odometer", label: "Odometer (miles)", placeholder: "87,452" },
      { key: "damageDescription", label: "Pre-Existing Damage Description", placeholder: "Scratch on driver front door, cracked rear bumper, small dent on hood" },
    ],
    legalText: (v) => `PRE-EXISTING DAMAGE WAIVER
──────────────────────────────────────────────────

${v.shopName || ""}  |  ${v.shopPhone || ""}
Date: ${v.date || ""}

VEHICLE
${v.vehicleYear || ""} ${v.vehicleMake || ""} ${v.vehicleModel || ""}
VIN: ${v.vin || ""}
Odometer: ${v.odometer || ""} miles

CUSTOMER
${v.clientName || ""}

PRE-EXISTING DAMAGE DOCUMENTATION

The following pre-existing damage was noted on the vehicle at the
time of service drop-off. This documentation protects both the
customer and the shop from disputes regarding vehicle condition.

Pre-Existing Damage:
${v.damageDescription || "(None noted)"}

CUSTOMER ACKNOWLEDGMENT

I, ${v.clientName || "_________________________"}, acknowledge that:

1. The above-described damage existed on my vehicle PRIOR to
   bringing it to ${v.shopName || "the shop"} for service.

2. ${v.shopName || "The shop"} is not responsible for any of the
   above-listed pre-existing damage.

3. A photographic record of this damage has been created and
   associated with this work order.

4. Any NEW damage occurring during service will be the
   responsibility of ${v.shopName || "the shop"} to repair at
   no charge.

Customer Signature: _________________________ Date: _________

Printed Name: ${v.clientName || ""}

Technician Signature: ______________________ Date: _________

Witness: ____________________________________ Date: _________`,
  },
];

// ---------------------------------------------------------------------------
// Client component
// ---------------------------------------------------------------------------

export function TemplatePageClient({ templateId }: { templateId: string }) {
  const template = TEMPLATES.find((t) => t.id === templateId);
  const [values, setValues] = useState<Record<string, string>>({});
  const [showModal, setShowModal] = useState(false);

  if (!template) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950 text-white">
        <p className="text-lg">Template not found.</p>
      </div>
    );
  }

  function handleChange(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function generatePdf() {
    const docContent = template!.legalText(values);
    const escapedContent = docContent
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${template!.title}</title>
  <style>
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 13px;
      line-height: 1.6;
      color: #111;
      background: #fff;
      padding: 40px;
      position: relative;
    }
    .watermark {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-30deg);
      font-size: 18px;
      color: rgba(200,200,200,0.18);
      font-weight: bold;
      white-space: nowrap;
      pointer-events: none;
      z-index: 0;
      letter-spacing: 2px;
    }
    pre {
      white-space: pre-wrap;
      word-break: break-word;
      position: relative;
      z-index: 1;
    }
    @media print {
      body { padding: 20px; }
    }
  </style>
</head>
<body>
  <div class="watermark">GENERATED BY DRIVESYNC — drivesync.app</div>
  <pre>${escapedContent}</pre>
  <script>window.print();<\/script>
</body>
</html>`;

    const win = window.open("", "_blank");
    if (win) {
      win.document.write(html);
      win.document.close();
    }
    setShowModal(true);
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="border-b border-gray-800 px-4 py-6">
        <div className="mx-auto max-w-2xl">
          <Link
            href="/tools/templates"
            className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-300"
          >
            ← All Templates
          </Link>
          <h1 className="text-2xl font-black text-white">{template.title}</h1>
          <p className="mt-1 text-sm text-gray-400">{template.description}</p>
        </div>
      </div>

      {/* Form */}
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {template.fields.map((field) => (
              <div key={field.key}>
                <label
                  htmlFor={field.key}
                  className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-400"
                >
                  {field.label}
                </label>
                <input
                  id={field.key}
                  type="text"
                  placeholder={field.placeholder}
                  value={values[field.key] ?? ""}
                  onChange={(e) => handleChange(field.key, e.target.value)}
                  className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:border-red-500 focus:outline-none"
                />
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={generatePdf}
            className="mt-6 w-full rounded-xl bg-red-600 py-3 text-sm font-black text-white transition-colors hover:bg-red-500"
          >
            Generate PDF
          </button>
        </div>

        {/* Upsell */}
        <div className="mt-6 rounded-2xl border border-gray-800 bg-gray-900/50 p-5 text-center">
          <p className="text-sm font-semibold text-white">
            DriveSync generates these automatically.
          </p>
          <p className="mt-1 text-sm text-gray-400">
            2-way SMS signature capture, digital records, and instant payment
            links — all in one app.
          </p>
          <Link
            href="/auth/register"
            className="mt-4 inline-flex items-center justify-center rounded-xl bg-red-600 px-6 py-2.5 text-sm font-black text-white hover:bg-red-500"
          >
            Start Free Trial
          </Link>
        </div>
      </div>

      {/* Post-download modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 p-8 text-center shadow-2xl">
            <p className="text-xl font-black text-white">
              Stop doing paperwork.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-gray-400">
              DriveSync generates these automatically with 2-way SMS signature
              capture. Your customers sign on their phone — you get paid faster.
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <Link
                href="/auth/register"
                className="inline-flex items-center justify-center rounded-xl bg-red-600 px-6 py-3 text-sm font-black text-white hover:bg-red-500"
              >
                Start Free Trial
              </Link>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-sm text-gray-500 hover:text-gray-300"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="border-t border-gray-800 bg-gray-950 px-4 py-8 text-center text-xs text-gray-600">
        <p className="mb-1 font-bold text-gray-500">
          Drive<span className="text-red-500">Sync</span>
        </p>
        <p>© {new Date().getFullYear()} DriveSync · All rights reserved</p>
      </footer>
    </div>
  );
}
