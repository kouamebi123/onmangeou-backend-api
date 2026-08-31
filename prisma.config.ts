import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// La base fantome n'est necessaire que lorsque l'utilisateur applicatif ne peut pas
// creer de base temporaire (hebergement manage). En local, Prisma la cree seul.
const shadowDatabaseUrl = process.env['SHADOW_DATABASE_URL']
  ? { shadowDatabaseUrl: env('SHADOW_DATABASE_URL') }
  : {};

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
    ...shadowDatabaseUrl,
  },
});
