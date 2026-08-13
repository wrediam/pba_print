// Seeds the initial billing rate if the rate table is still empty.
// Rates are intentionally NOT overwritten -- if staff have since changed
// rates via the DB or UI, those should be preserved. Only inserts once.
//
// Initial rates (effective from the beginning of recorded time):
//   B/W copier:  $0.03 per page
//   Color copier: $0.09 per page
//   Paper/supplies: $0.02 per page (all copies, itemized separately)

import { db } from './db.ts';
import { rate } from '../src/lib/server/db/schema.ts';

async function main() {
	const existing = await db.select({ id: rate.id }).from(rate).limit(1);
	if (existing.length > 0) {
		console.log('[seed-rates] Rate table already has rows, skipping.');
		return;
	}

	await db.insert(rate).values({
		bwCostCents: 3,
		colorCostCents: 9,
		paperCostCents: 2,
		effectiveFrom: new Date('2000-01-01T00:00:00Z')
	});
	console.log('[seed-rates] Inserted initial rate: B/W $0.03, Color $0.09, Paper $0.02/page.');
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error('[seed-rates] Failed:', err);
		process.exit(1);
	});
