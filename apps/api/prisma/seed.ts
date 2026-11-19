import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

// Fixed demo IDs so fresh installs and database resets are reproducible.
const OUTLET_ID = '00000000-0000-0000-0000-000000000001';
const IDS = {
  stationBar: '00000000-0000-0000-0000-000000000101',
  stationKitchen: '00000000-0000-0000-0000-000000000102',
  stationPastry: '00000000-0000-0000-0000-000000000103',
  catMinuman: '00000000-0000-0000-0000-000000000201',
  catMakanan: '00000000-0000-0000-0000-000000000202',
  ingEspresso: '00000000-0000-0000-0000-000000000301',
  ingSusu: '00000000-0000-0000-0000-000000000302',
  ingGula: '00000000-0000-0000-0000-000000000303',
  ingMie: '00000000-0000-0000-0000-000000000304',
  ingTelur: '00000000-0000-0000-0000-000000000305',
  ingTepung: '00000000-0000-0000-0000-000000000306',
  menuKopiSusu: '00000000-0000-0000-0000-000000000401',
  menuAmericano: '00000000-0000-0000-0000-000000000402',
  menuLatte: '00000000-0000-0000-0000-000000000403',
  menuMieGoreng: '00000000-0000-0000-0000-000000000404',
  menuCroissant: '00000000-0000-0000-0000-000000000405',
  userAdi: '00000000-0000-0000-0000-000000000501',
  userBudi: '00000000-0000-0000-0000-000000000502',
  userSinta: '00000000-0000-0000-0000-000000000503',
};

async function main() {
  const pin = async (p: string) => argon2.hash(p, { type: argon2.argon2id, memoryCost: 2 ** 12, timeCost: 2, parallelism: 1 });
  const outlet = await prisma.outlet.upsert({
    where: { id: OUTLET_ID },
    update: {},
    create: { id: OUTLET_ID, name: 'Kopi Senja Demo', taxRate: 0.11, serviceRate: 0.05, lowStockThreshold: 5, varianceThreshold: 10000, partialReadyPolicy: 'WAIT_ALL' },
  });
  for (const [id, code, name, color, sla] of [
    [IDS.stationBar, 'BAR', 'Bar', '#2563EB', 10],
    [IDS.stationKitchen, 'KITCHEN', 'Dapur', '#EA580C', 20],
    [IDS.stationPastry, 'PASTRY', 'Pastry', '#9333EA', 15],
  ] as const) {
    await prisma.station.upsert({ where: { outletId_code: { outletId: outlet.id, code: code as never } }, update: {}, create: { id, outletId: outlet.id, code: code as never, name, color, slaMinutes: sla } });
  }
  const catMin = await prisma.category.upsert({ where: { outletId_name: { outletId: outlet.id, name: 'Minuman' } }, update: {}, create: { id: IDS.catMinuman, outletId: outlet.id, name: 'Minuman' } });
  const catMak = await prisma.category.upsert({ where: { outletId_name: { outletId: outlet.id, name: 'Makanan' } }, update: {}, create: { id: IDS.catMakanan, outletId: outlet.id, name: 'Makanan' } });
  const bar = await prisma.station.findFirstOrThrow({ where: { outletId: outlet.id, code: 'BAR' } });
  const kit = await prisma.station.findFirstOrThrow({ where: { outletId: outlet.id, code: 'KITCHEN' } });
  const pas = await prisma.station.findFirstOrThrow({ where: { outletId: outlet.id, code: 'PASTRY' } });
  const ing = async (id: string, name: string, unit: string, qty: number) => prisma.ingredient.upsert({ where: { outletId_name: { outletId: outlet.id, name } }, update: { currentQty: qty }, create: { id, outletId: outlet.id, name, unit, currentQty: qty, minThreshold: 5 } });
  const espresso = await ing(IDS.ingEspresso, 'Espresso bean', 'g', 2000);
  const susu = await ing(IDS.ingSusu, 'Susu UHT', 'ml', 10000);
  const gula = await ing(IDS.ingGula, 'Gula aren', 'ml', 5000);
  const mie = await ing(IDS.ingMie, 'Mie instan', 'pcs', 50);
  const telur = await ing(IDS.ingTelur, 'Telur', 'pcs', 60);
  const tepung = await ing(IDS.ingTepung, 'Tepung croissant', 'g', 5000);
  const mk = async (id: string, name: string, price: number, categoryId: string, stationId: string, secs: number, recipe: Array<[string, number]>) => {
    let menu = await prisma.menu.findFirst({ where: { outletId: outlet.id, name } });
    if (!menu) menu = await prisma.menu.create({ data: { id, outletId: outlet.id, categoryId, stationId, name, price, avgMakeSeconds: secs } });
    await prisma.recipeLine.deleteMany({ where: { menuId: menu.id } });
    for (const [iid, q] of recipe) await prisma.recipeLine.create({ data: { menuId: menu.id, ingredientId: iid, qtyPerPortion: q } });
  };
  await mk(IDS.menuKopiSusu, 'Kopi Susu', 18000, catMin.id, bar.id, 180, [[espresso.id, 18], [susu.id, 150], [gula.id, 20]]);
  await mk(IDS.menuAmericano, 'Americano', 15000, catMin.id, bar.id, 150, [[espresso.id, 18]]);
  await mk(IDS.menuLatte, 'Latte', 20000, catMin.id, bar.id, 200, [[espresso.id, 18], [susu.id, 200]]);
  await mk(IDS.menuMieGoreng, 'Mie Goreng', 17000, catMak.id, kit.id, 600, [[mie.id, 1], [telur.id, 1]]);
  await mk(IDS.menuCroissant, 'Croissant', 18000, catMak.id, pas.id, 300, [[tepung.id, 120]]);
  for (const [id, name, role] of [
    [IDS.userAdi, 'Adi', 'CASHIER'],
    [IDS.userBudi, 'Budi', 'MAKER'],
    [IDS.userSinta, 'Sinta', 'OWNER'],
  ] as const) {
    const h = await pin('123456');
    await prisma.user.upsert({ where: { outletId_name: { outletId: outlet.id, name } }, update: { pinHash: h }, create: { id, outletId: outlet.id, name, pinHash: h, role: role as never } });
  }
  console.log('Seed OK. Demo IDs fixed. PIN demo: 123456 (Adi/Budi/Sinta).');
}
main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
