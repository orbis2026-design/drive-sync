import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// ---------------------------------------------------------------------------
// Prisma client singleton — prevents exhausting the connection pool in dev
// due to hot-module replacement creating a new instance on every reload.
//
// Prisma 7: database connection is provided via a driver adapter. The
// DATABASE_URL environment variable must be set at runtime.
// ---------------------------------------------------------------------------
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createPrismaClient() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  });
  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["error", "warn"]
        : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

