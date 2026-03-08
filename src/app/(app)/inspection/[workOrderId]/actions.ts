"use server";

import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InspectionStatus = "PASS" | "MONITOR" | "FAIL";

export interface InspectionPoint {
  status: InspectionStatus | null;
  note: string;
}

export interface InspectionPayload {
  fluids: InspectionPoint;
  tires: InspectionPoint;
  brakes: InspectionPoint;
  belts: InspectionPoint;
}

/** Shared return type for all write Server Actions in this file. */
export interface ActionResult {
  error?: string;
}

// ---------------------------------------------------------------------------
// Types — Voice Note
// ---------------------------------------------------------------------------

/**
 * Parsed repair-order fields produced by the VoiceLoggerFab component.
 * Mirrors `ParsedVoiceNote` in `@/components/voice-logger-fab` so that
 * the Server Action can be typed without importing from a client module.
 */
export interface VoiceNotePayload {
  complaint: string;
  cause: string;
  correction: string;
  rawTranscript: string;
}

// ---------------------------------------------------------------------------
// Server Action — syncInspection
// Persists the inspection JSON payload to the matching work_orders row.
// ---------------------------------------------------------------------------

export async function syncInspection(
  workOrderId: string,
  payload: InspectionPayload,
): Promise<ActionResult> {
  if (!workOrderId) {
    return { error: "Cannot sync inspection: work order ID is missing." };
  }

  const adminDb = createAdminClient();

  const { error } = await adminDb
    .from("work_orders")
    .update({ inspection_json: payload })
    .eq("id", workOrderId);

  if (error) {
    return { error: `Failed to sync inspection: ${error.message}` };
  }

  return {};
}

// ---------------------------------------------------------------------------
// Server Action — saveVoiceNote
// Persists the voice-to-text parsed note to the matching work_orders row.
// ---------------------------------------------------------------------------

export async function saveVoiceNote(
  workOrderId: string,
  note: VoiceNotePayload,
): Promise<ActionResult> {
  if (!workOrderId) {
    return { error: "Cannot save voice note: work order ID is missing." };
  }

  const adminDb = createAdminClient();

  const { error } = await adminDb
    .from("work_orders")
    .update({ voice_note_json: note })
    .eq("id", workOrderId);

  if (error) {
    return { error: `Failed to save voice note: ${error.message}` };
  }

  return {};
}

// ---------------------------------------------------------------------------
// Types — Checklist (Issue #86)
// ---------------------------------------------------------------------------

export interface ChecklistItemData {
  id: string;
  category: string;
  label: string;
  status: "PASS" | "CAUTION" | "FAIL" | null;
  note: string;
  photoUrl: string;
}

// ---------------------------------------------------------------------------
// Server Action — saveChecklist
// Persists the 40-point inspection checklist to work_orders.checklists_json.
// ---------------------------------------------------------------------------

export async function saveChecklist(
  workOrderId: string,
  items: ChecklistItemData[],
): Promise<ActionResult> {
  if (!workOrderId) {
    return { error: "Cannot save checklist: work order ID is missing." };
  }
  const adminDb = createAdminClient();
  const { error } = await adminDb
    .from("work_orders")
    .update({ checklists_json: items })
    .eq("id", workOrderId);
  if (error) {
    return { error: `Failed to save checklist: ${error.message}` };
  }
  return {};
}
