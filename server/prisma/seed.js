import bcrypt from "bcryptjs";
import { PrismaClient, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

const username = process.env.SEED_ADMIN_USERNAME;
const password = process.env.SEED_ADMIN_PASSWORD;

async function main() {
  if (!username || !password) {
    console.log("Skipping admin seed. Set SEED_ADMIN_USERNAME and SEED_ADMIN_PASSWORD to create the first admin.");
    return;
  }

  const existing = await prisma.user.findUnique({
    where: { username }
  });

  if (existing) {
    console.log(`Admin user \"${username}\" already exists.`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.create({
    data: {
      username,
      passwordHash,
      role: UserRole.admin,
      isApproved: true
    }
  });

  console.log(`Created admin user \"${username}\".`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

