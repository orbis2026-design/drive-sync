/**
 * Built-in waiver templates for Boltbook oil-change flow.
 * Stored as constants; body supports {{clientName}}, {{vehicle}}, {{date}} placeholders.
 */

export type WaiverTemplateId =
  | "OIL_CHANGE_LIABILITY"
  | "BRAKE_INSPECTION_DECLINED"
  | "DECLINED_SERVICES";

export interface WaiverTemplate {
  id: WaiverTemplateId;
  name: string;
  body: string;
}

export const WAIVER_TEMPLATES: WaiverTemplate[] = [
  {
    id: "OIL_CHANGE_LIABILITY",
    name: "Oil change & service authorization",
    body:
      "I authorize the service provider to perform the oil change and related services described on this work order. " +
      "I understand that failure to maintain my vehicle per manufacturer recommendations may void warranty coverage. " +
      "I have been advised of any additional recommended services and have chosen to proceed as indicated. " +
      "Customer: {{clientName}} · Vehicle: {{vehicle}} · Date: {{date}}.",
  },
  {
    id: "BRAKE_INSPECTION_DECLINED",
    name: "Brake inspection / declined repair",
    body:
      "A brake inspection was performed. Recommended brake work has been declined by the customer at this time. " +
      "I understand that delaying recommended brake service may result in increased repair cost or safety risk. " +
      "Customer: {{clientName}} · Vehicle: {{vehicle}} · Date: {{date}}.",
  },
  {
    id: "DECLINED_SERVICES",
    name: "Declined services acknowledgment",
    body:
      "I acknowledge that the following recommended services were declined: {{services}}. " +
      "I understand that postponing recommended maintenance may affect vehicle reliability or warranty. " +
      "Customer: {{clientName}} · Vehicle: {{vehicle}} · Date: {{date}}.",
  },
];

export function fillWaiverBody(
  template: WaiverTemplate,
  vars: { clientName: string; vehicle: string; date: string; services?: string }
): string {
  return template.body
    .replace(/\{\{clientName\}\}/g, vars.clientName)
    .replace(/\{\{vehicle\}\}/g, vars.vehicle)
    .replace(/\{\{date\}\}/g, vars.date)
    .replace(/\{\{services\}\}/g, vars.services ?? "See work order");
}
