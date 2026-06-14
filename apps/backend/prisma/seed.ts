import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const hash = await bcrypt.hash("password123", 10);
  await prisma.recruiter.upsert({
    where: { email: "recruiter@gorilla.com" },
    update: { passwordHash: hash },
    create: {
      email: "recruiter@gorilla.com",
      passwordHash: hash,
      name: "Gorilla Recruiter",
    },
  });
  console.log("Seed complete: recruiter@gorilla.com upserted");
}

main().finally(() => prisma.$disconnect());
