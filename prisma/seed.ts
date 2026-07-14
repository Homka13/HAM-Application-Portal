import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const services = [
  { name: 'Бази даних', description: 'Управління базами даних, резервне копіювання, міграції' },
  { name: 'Доступи', description: 'Запити на доступ до систем, VPN, облікові записи' },
  { name: 'Мережа', description: 'Мережева інфраструктура, маршрутизація, Wi-Fi' },
  { name: 'Робочі місця', description: 'Налаштування комп\'ютерів, периферії, ПЗ' },
  { name: 'Обладнання', description: 'Сервери, сховища, фізичне обладнання' },
  { name: 'Інформаційна безпека', description: 'Інциденти безпеки, вразливості, антивірус' },
];

async function main() {
  for (const svc of services) {
    await prisma.serviceCatalog.upsert({
      where: { name: svc.name },
      update: {},
      create: svc,
    });
  }
  console.log(`Seeded ${services.length} service catalog entries`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
