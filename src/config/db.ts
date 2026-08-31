import 'dotenv/config';
import postgres from '@prisma/orm-postgres/runtime';
import type { Contract } from '../prisma/contract.d';
import contractJson from '../prisma/contract.json' with { type: 'json' };

const dbUrl =
  process.env.DATABASE_URL ||
  process.env.COMPOSER_HAMAPPLICATIONPORTAL_DB_URL ||
  Object.entries(process.env).find(([k]) => k.endsWith('_DB_URL'))?.[1] ||
  '';

export const db = postgres<Contract>({
  contractJson,
  url: dbUrl,
});


