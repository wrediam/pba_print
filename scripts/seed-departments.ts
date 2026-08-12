// Seeds the department table from the real copier-codes sheet, the same
// data department_codes.txt in the FixChurchPrinter macOS app project
// carries. Idempotent -- uses ON CONFLICT DO NOTHING on the unique code
// column, so it's safe to run on every deploy and never touches a code
// someone has since edited or a new one that's been added since.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { db } from './db.ts';
import { department } from '../src/lib/server/db/schema.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
	const text = readFileSync(join(__dirname, 'department_codes_seed.txt'), 'utf-8');
	const rows = text
		.split('\n')
		.map((l) => l.trim())
		.filter(Boolean)
		.map((line) => {
			const [code, ...rest] = line.split('\t');
			return { code, label: rest.join('\t') };
		});

	if (rows.length === 0) {
		console.log('[seed-departments] No rows to seed.');
		return;
	}

	const result = await db
		.insert(department)
		.values(rows)
		.onConflictDoNothing({ target: department.code })
		.returning({ code: department.code });

	console.log(
		`[seed-departments] Inserted ${result.length} new department(s) (${rows.length} total in seed file).`
	);
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error('[seed-departments] Failed:', err);
		process.exit(1);
	});
