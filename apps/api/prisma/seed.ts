import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const pin = async (p: string) => argon2.hash(p, { type: argon2.argon2id, memoryCost: 2 ** 12, timeCost: 2, parallelism: 1 });
  const outlet = await prisma.outlet.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: { id: '00000000-0000-0000-0000-000000000001', name: 'Kopi Senja Demo', taxRate: 0.11, serviceRate: 0.05, lowStockThreshold: 5, varianceThreshold: 10000, partialReadyPolicy: 'WAIT_ALL' },
  });
  for (const [code, name, color, sla] of [['BAR', 'Bar', '#2563EB', 10], ['KITCHEN', 'Dapur', '#EA580C', 20], ['PASTRY', 'Pastry', '#9333EA', 15]] as const) {
    await prisma.station.upsert({ where: { outletId_code: { outletId: outlet.id, code: code as any } }, update: {}, create: { outletId: outlet.id, code: code as any, name, color, slaMinutes: sla } });
  }
  const catMin = await prisma.category.upsert({ where: { outletId_name: { outletId: outlet.id, name: 'Minuman' } }, update: {}, create: { outletId: outlet.id, name: 'Minuman' } });
  const catMak = await prisma.category.upsert({ where: { outletId_name: { outletId: outlet.id, name: 'Makanan' } }, update: {}, create: { outletId: outlet.id, name: 'Makanan' } });
  const bar = await prisma.station.findFirstOrThrow({ where: { outletId: outlet.id, code: 'BAR' } });
  const kit = await prisma.station.findFirstOrThrow({ where: { outletId: outlet.id, code: 'KITCHEN' } });
  const pas = await prisma.station.findFirstOrThrow({ where: { outletId: outlet.id, code: 'PASTRY' } });
  const ing = async (name: string, unit: string, qty: number) => prisma.ingredient.upsert({ where: { outletId_name: { outletId: outlet.id, name } }, update: { currentQty: qty }, create: { outletId: outlet.id, name, unit, currentQty: qty, minThreshold: 5 } });
  const espresso = await ing('Espresso bean', 'g', 2000); const susu = await ing('Susu UHT', 'ml', 10000); const gula = await ing('Gula aren', 'ml', 5000);
  const mie = await ing('Mie instan', 'pcs', 50); const telur = await ing('Telur', 'pcs', 60); const tepung = await ing('Tepung croissant', 'g', 5000);
  const mk = async (name: string, price: number, categoryId: string, stationId: string, secs: number, recipe: Array<[string, number]>) => {
    let menu = await prisma.menu.findFirst({ where: { outletId: outlet.id, name } });
    if (!menu) menu = await prisma.menu.create({ data: { outletId: outlet.id, categoryId, stationId, name, price, avgMakeSeconds: secs } });
    await prisma.recipeLine.deleteMany({ where: { menuId: menu.id } });
    for (const [iid, q] of recipe) await prisma.recipeLine.create({ data: { menuId: menu.id, ingredientId: iid, qtyPerPortion: q } });
  };
  await mk('Kopi Susu', 18000, catMin.id, bar.id, 180, [[espresso.id, 18], [susu.id, 150], [gula.id, 20]]);
  await mk('Americano', 15000, catMin.id, bar.id, 150, [[espresso.id, 18]]);
  await mk('Latte', 20000, catMin.id, bar.id, 200, [[espresso.id, 18], [susu.id, 200]]);
  await mk('Mie Goreng', 17000, catMak.id, kit.id, 600, [[mie.id, 1], [telur.id, 1]]);
  await mk('Croissant', 18000, catMak.id, pas.id, 300, [[tepung.id, 120]]);
  for (const [name, role] of [['Adi', 'CASHIER'], ['Budi', 'MAKER'], ['Sinta', 'OWNER']] as const) {
    const h = await pin('123456');
    await prisma.user.upsert({ where: { outletId_name: { outletId: outlet.id, name } }, update: { pinHash: h }, create: { outletId: outlet.id, name, pinHash: h, role: role as any } });
  }
  console.log('Seed OK. PIN demo: 123456 (Adi/Budi/Sinta).');
}
main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
