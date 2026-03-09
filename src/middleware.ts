// src/middleware.ts
//
// Next.js App Router requires the middleware entry-point to live at
// `src/middleware.ts` (or `middleware.ts` at the project root).  The actual
// auth/session logic lives in `src/proxy.ts` so it can be unit-tested
// independently; we simply re-export it here.
export { proxy as middleware, config } from "./proxy";
