import 'dotenv/config';
import postgres from '@prisma/orm-postgres/runtime';
import type { Contract } from '../prisma/contract.d';
import contractJson from '../prisma/contract.json' with { type: 'json' };

// @ts-ignore
import service from '../../service.mjs';

function getDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const loaded = (service as any)?.load?.();
    if (loaded?.db?.url) return loaded.db.url;
  } catch {}
  for (const [key, value] of Object.entries(process.env)) {
    if (key.includes('DB_URL') && value) return value;
  }
  return 'postgresql://postgres:postgres@localhost:5432/ham';
}

const dbUrl = getDatabaseUrl();

export const db = postgres<Contract>({
  contractJson,
  url: dbUrl,
});


