import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma 7.x: datasource URL is configured here for migrate/introspect commands.
// Runtime connections use the PrismaPg adapter in src/lib/prisma.ts.
export default defineConfig({
  earlyAccess: true,
  schema: "./prisma/schema.prisma",
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL!,
  },
});
