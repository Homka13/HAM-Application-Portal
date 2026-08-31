import type { ComputeService } from '@prisma/composer-prisma-cloud';

declare const service: {
  load(): { db?: { url?: string } };
  port(): number;
  origin(): string;
};

export default service;
