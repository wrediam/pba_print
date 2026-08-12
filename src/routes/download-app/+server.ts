// Serves "Fix Church Printer.app" (the macOS setup app -- see the
// separate FixChurchPrinter project) zipped up, with its bundled
// department_codes.txt replaced by whatever's currently in the
// department table, so downloads always reflect the latest codes
// without needing a Mac to rebuild the app itself.
//
// Note: this repacking is done in Node on Linux, not on a Mac, so the
// app's ad-hoc code signature is invalidated by the time someone
// downloads it (editing a signed bundle's contents breaks its
// signature). That's not a regression -- ad-hoc signing was never
// enough to satisfy Gatekeeper anyway, so users already need to
// right-click → Open the first time regardless. See the FixChurchPrinter
// project's own docs for that instruction to give end users.

import AdmZip from 'adm-zip';
import { readFileSync } from 'node:fs';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { department } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

const TEMPLATE_PATH = 'static/app-template/template.zip';
const RESOURCE_PATH = 'Fix Church Printer.app/Contents/Resources/department_codes.txt';

export const GET: RequestHandler = async () => {
	const departments = await db
		.select({ code: department.code, label: department.label })
		.from(department)
		.where(eq(department.active, true))
		.orderBy(department.code);

	const codesText = departments.map((d) => `${d.code}\t${d.label}`).join('\n') + '\n';

	const zip = new AdmZip(readFileSync(TEMPLATE_PATH));
	zip.updateFile(RESOURCE_PATH, Buffer.from(codesText, 'utf-8'));
	const buffer = zip.toBuffer();

	return new Response(new Uint8Array(buffer), {
		headers: {
			'Content-Type': 'application/zip',
			'Content-Disposition': 'attachment; filename="Fix Church Printer.zip"'
		}
	});
};
