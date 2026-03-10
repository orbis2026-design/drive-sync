// Prisma CLI config. Loads .env then .env.local so DATABASE_URL from .env.local is used when set.
import path from "node:path";
import { config } from "dotenv";

config(); // .env
config({ path: path.resolve(process.cwd(), ".env.local") }); // .env.local overrides (Next.js convention)

import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
