/**
 * src/lib/logger.ts
 *
 * Structured logging utility for DriveSync.
 *
 * Features:
 *   - Severity levels: info, warn, error, fatal
 *   - Structured JSON output to stdout/stderr
 *   - Automatic PII scrubbing (phone numbers, emails, card-like patterns)
 *   - Tenant context attachment
 *   - Drop-in ready for Sentry/Datadog (swap the transport layer)
 */

// ---------------------------------------------------------------------------
// PII Scrubber
// ---------------------------------------------------------------------------

/**
 * Scrubs PII from a string before it hits stdout.
 *
 * Patterns scrubbed:
 *   - Phone numbers in E.164 format: +15551234567 → +1***...4567
 *   - Email addresses: john@example.com → j***@***.com
 *   - Credit card-like patterns (13-19 digit sequences): 4111111111111111 → 4111***...1111
 *   - SSN-like patterns: 123-45-6789 → ***-**-6789
 */
export function scrubPII(input: string): string {
  let scrubbed = input;

  // E.164 phone numbers: +1XXXXXXXXXX or +44XXXXXXXXX etc.
  scrubbed = scrubbed.replace(
    /\+\d{1,3}\d{6,14}/g,
    (match) => {
      const last4 = match.slice(-4);
      const countryCode = match.slice(0, match.length - 10 > 0 ? match.length - 10 : 2);
      return `${countryCode}***...${last4}`;
    },
  );

  // US phone formats: (555) 123-4567, 555-123-4567, 555.123.4567
  scrubbed = scrubbed.replace(
    /\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/g,
    (match) => {
      const digits = match.replace(/\D/g, "");
      return `***-***-${digits.slice(-4)}`;
    },
  );

  // Email addresses
  scrubbed = scrubbed.replace(
    /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
    (match) => {
      const [local, domain] = match.split("@");
      const tld = domain.split(".").pop();
      return `${local[0]}***@***.${tld}`;
    },
  );

  // Credit card-like patterns (13-19 consecutive digits)
  scrubbed = scrubbed.replace(
    /\b\d{13,19}\b/g,
    (match) => `${match.slice(0, 4)}***...${match.slice(-4)}`,
  );

  // SSN-like patterns: 123-45-6789
  scrubbed = scrubbed.replace(
    /\b\d{3}-\d{2}-\d{4}\b/g,
    (match) => `***-**-${match.slice(-4)}`,
  );

  return scrubbed;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LogLevel = "info" | "warn" | "error" | "fatal";

interface LogContext {
  /** The external service or subsystem name, e.g. "stripe", "twilio", "carmd" */
  service?: string;
  /** The tenant ID for multi-tenant context */
  tenantId?: string;
  /** Any additional key-value pairs */
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  service?: string;
  tenantId?: string;
  context?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

function formatError(err: unknown): LogEntry["error"] | undefined {
  if (!err) return undefined;
  if (err instanceof Error) {
    return {
      name: err.name,
      message: scrubPII(err.message),
      stack: err.stack ? scrubPII(err.stack) : undefined,
    };
  }
  return {
    name: "UnknownError",
    message: scrubPII(String(err)),
  };
}

function buildEntry(
  level: LogLevel,
  message: string,
  context?: LogContext,
  error?: unknown,
): LogEntry {
  const { service, tenantId, ...rest } = context ?? {};

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message: scrubPII(message),
  };

  if (service) entry.service = service;
  if (tenantId) entry.tenantId = tenantId;

  // Scrub all context values that are strings
  if (Object.keys(rest).length > 0) {
    const scrubbed: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rest)) {
      scrubbed[k] = typeof v === "string" ? scrubPII(v) : v;
    }
    entry.context = scrubbed;
  }

  const formattedError = formatError(error);
  if (formattedError) entry.error = formattedError;

  return entry;
}

function emit(entry: LogEntry): void {
  const json = JSON.stringify(entry);

  // Future: replace this switch with a Sentry/Datadog transport.
  switch (entry.level) {
    case "info":
      console.info(json);
      break;
    case "warn":
      console.warn(json);
      break;
    case "error":
    case "fatal":
      console.error(json);
      break;
  }
}

export const logger = {
  info(message: string, context?: LogContext): void {
    emit(buildEntry("info", message, context));
  },

  warn(message: string, context?: LogContext, error?: unknown): void {
    emit(buildEntry("warn", message, context, error));
  },

  error(message: string, context?: LogContext, error?: unknown): void {
    emit(buildEntry("error", message, context, error));
  },

  fatal(message: string, context?: LogContext, error?: unknown): void {
    emit(buildEntry("fatal", message, context, error));
  },
};
