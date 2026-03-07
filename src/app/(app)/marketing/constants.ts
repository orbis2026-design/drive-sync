/**
 * Marketing campaign constants — not a server action file.
 *
 * Exported from here (rather than from actions.ts) so that the "use server"
 * file is not forced to export non-async values, which violates the Next.js
 * "use server" module contract.
 */

export type BlastAudience = {
  label: string;
  value: string;
  description: string;
};

export const BLAST_AUDIENCES: BlastAudience[] = [
  {
    label: "Inactive 6+ Months",
    value: "INACTIVE_6M",
    description: "Clients without a visit in the last 6 months",
  },
  {
    label: "Inactive 3+ Months",
    value: "INACTIVE_3M",
    description: "Clients without a visit in the last 3 months",
  },
  {
    label: "Oil Change Due",
    value: "OIL_DUE",
    description: "Clients whose vehicle is likely due for an oil change",
  },
  {
    label: "All Clients",
    value: "ALL",
    description: "Send to every client on file",
  },
];
