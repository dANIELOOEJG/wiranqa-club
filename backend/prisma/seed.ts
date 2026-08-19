import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seeding...');

  // Crear recompensas
  const rewards = [
    { name: 'Destapador Premium', description: 'Destapador de colección', starsCost: 30, type: 'DESTAPADOR', stock: 100 },
    { name: 'Vaso Cervecero', description: 'Vaso de vidrio grabado', starsCost: 40, type: 'VASO', stock: 80 },
    { name: 'Cerveza Artesanal', description: '1 botella de cerveza WIRANQA', starsCost: 60, type: 'CERVEZA', stock: 50 },
    { name: 'Polo WIRANQA', description: 'Polo exclusivo de la marca', starsCost: 80, type: 'POLO', stock: 30 },
    { name: 'Visita a Fábrica', description: 'Tour guiado por la fábrica', starsCost: 120, type: 'EXPERIENCIA', stock: 10 },
  ];

  for (const reward of rewards) {
    await prisma.reward.upsert({
      where: { name: reward.name },
      update: {},
      create: reward,
    });
  }

  // Crear botellas de prueba con QR
  for (let i = 1; i <= 10; i++) {
    await prisma.bottle.create({
      data: {
        qrCode: `WIRANQA-${String(i).padStart(4, '0')}`,
        qrCodeData: JSON.stringify({
          id: `bottle-${i}`,
          type: 'BOTTLE',
          batch: `BATCH-${String(i).padStart(3, '0')}`,
          timestamp: Date.now(),
        }),
        productName: 'Cerveza WIRANQA',
        batchNumber: `BATCH-${String(i).padStart(3, '0')}`,
      },
    });
  }

  console.log('✅ Seeding completado!');
  console.log(`📊 Creadas: ${rewards.length} recompensas y 10 botellas`);
}

main()
  .catch((e) => {
    console.error('❌ Error en seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
