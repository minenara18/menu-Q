import { PrismaClient } from '@prisma/client';
import { seedDatabase } from './seed-core';

/** Seed must never run against production data. */
export function assertNotProduction(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Seed dinonaktifkan ketika NODE_ENV=production.');
  }
}

async function main() {
  assertNotProduction();
  const prisma = new PrismaClient();
  try {
    await seedDatabase(prisma);
    console.log('Seed OK. Demo IDs fixed. PIN demo: 123456 (Adi/Budi/Sinta).');
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch(async (error) => {
    console.error(error);
    process.exit(1);
  });
}
