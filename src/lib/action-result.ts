/** Standardised discriminated union for Server Action returns. */
export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };
