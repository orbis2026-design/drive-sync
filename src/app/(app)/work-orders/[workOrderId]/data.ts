import { cache } from "react";
import {
  getWorkOrderForHub,
  getFieldTechsForTenant,
  getWorkOrderTimeline,
} from "./actions";

/** Request-deduped work order hub data. Offline queue and sync use Dexie (see lib/offline-db). */
export const getWorkOrderForHubCached = cache(getWorkOrderForHub);
export const getFieldTechsForTenantCached = cache(getFieldTechsForTenant);
export const getWorkOrderTimelineCached = cache(getWorkOrderTimeline);

