import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const services = [
  // Networking
  { name: 'VPN',              category: 'Networking',   description: 'Віддалений доступ, VPN-клієнти, тунелі' },
  { name: 'Wi-Fi',            category: 'Networking',   description: 'Бездротова мережа, точки доступу, покриття' },
  { name: 'Доступи',           category: 'Networking',   description: 'Облікові записи, права доступу, паролі' },
  // Infrastructure
  { name: 'Сервери',           category: 'Infrastructure', description: 'Фізичні та віртуальні сервери, хостинг' },
  { name: 'Бази даних',        category: 'Infrastructure', description: 'Резервне копіювання, міграції, продуктивність' },
  { name: 'Хмарні ресурси',    category: 'Infrastructure', description: 'Хмарні сервіси, масштабування, білінг' },
  // End-user Support
  { name: 'Обладнання',        category: 'End-user Support', description: 'Ноутбуки, периферія, ремонт, заміна' },
  { name: 'Програмне забезпечення', category: 'End-user Support', description: 'Встановлення ПЗ, ліцензії, оновлення' },
  { name: 'Облікові записи',   category: 'End-user Support', description: 'Створення, блокування, відновлення облікових записів' },
];

async function main() {
  for (const svc of services) {
    await prisma.serviceCatalog.upsert({
      where: { name: svc.name },
      update: { category: svc.category, description: svc.description },
      create: svc,
    });
  }
  console.log(`Seeded ${services.length} ITIL-aligned service catalog entries`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
