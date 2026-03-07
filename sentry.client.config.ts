import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Capture 10% of all transactions for performance tracing.
  tracesSampleRate: 0.1,

  // Set up session replay (records anonymized replays of errors).
  replaysSessionSampleRate: 0.05,
  replaysOnErrorSampleRate: 1.0,

  integrations: [
    Sentry.replayIntegration({
      // Mask all text and block all media to protect customer PII.
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],

  // Only send errors in production.
  enabled: process.env.NODE_ENV === "production",

  // Attach WorkOrderId and TenantId to every error event so you can trace
  // exactly what the mechanic was doing when the app crashed.
  beforeSend(event) {
    if (typeof window !== "undefined") {
      const workOrderId =
        (window as unknown as Record<string, string>).__DRIVESYNC_WORK_ORDER_ID;
      const tenantId =
        (window as unknown as Record<string, string>).__DRIVESYNC_TENANT_ID;
      if (workOrderId || tenantId) {
        event.contexts = {
          ...event.contexts,
          drivesync: { workOrderId, tenantId },
        };
      }
    }
    return event;
  },
});
