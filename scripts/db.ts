// Standalone DB client for the seed scripts. These run as plain Node
// processes (see docker-entrypoint.sh), outside Vite/SvelteKit, so they
// can't use the $env/$lib aliases the app itself uses in
// src/lib/server/db/index.ts -- this is the same setup, just wired to
// process.env directly instead.

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../src/lib/server/db/schema.ts';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

const client = postgres(process.env.DATABASE_URL);

export const db = drizzle(client, { schema });
