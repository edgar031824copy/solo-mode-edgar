import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Singleton pattern — one connection pool shared across the process
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
export const prisma = new PrismaClient({ adapter });
