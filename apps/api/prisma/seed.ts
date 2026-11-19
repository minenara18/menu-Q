import { PrismaClient } from '@prisma/client';
import { seedDatabase } from './seed-core';

const prisma = new PrismaClient();

async function main() {
  await seedDatabase(prisma);
  console.log('Seed OK. Demo IDs fixed. PIN demo: 123456 (Adi/Budi/Sinta).');
}
main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
