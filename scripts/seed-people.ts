// Seeds the person table from the church's copier user list. Idempotent
// -- uses ON CONFLICT DO NOTHING so re-running on every deploy is safe and
// never overwrites edits made through the admin UI.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { db } from './db.ts';
import { person } from '../src/lib/server/db/schema.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
	const text = readFileSync(join(__dirname, 'people_seed.txt'), 'utf-8');
	const rows = text
		.split('\n')
		.map((l) => l.trim())
		.filter(Boolean)
		.map((line) => {
			const [personalCode, ...rest] = line.split('\t');
			return { personalCode, name: rest.join('\t') };
		});

	if (rows.length === 0) {
		console.log('[seed-people] No rows to seed.');
		return;
	}

	const result = await db
		.insert(person)
		.values(rows)
		.onConflictDoNothing({ target: person.personalCode })
		.returning({ personalCode: person.personalCode });

	console.log(
		`[seed-people] Inserted ${result.length} new person(s) (${rows.length} total in seed file).`
	);
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error('[seed-people] Failed:', err);
		process.exit(1);
	});
