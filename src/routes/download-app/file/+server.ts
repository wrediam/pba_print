// Serves the Fix Church Printer.app zip for download.
//
// Previously this repacked the zip on every request to inject the current
// department_codes.txt from the DB. That approach broke the app's code
// signature (modifying a signed bundle's contents invalidates it), causing
// macOS to show "damaged and can't be opened".
//
// Department codes are now available via GET /api/departments (no auth),
// so the Mac app can fetch them at runtime instead. This route just
// serves the static zip as-is.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RequestHandler } from './$types';

// In development: static/ is served from the project root (process.cwd() = repo root).
// In production (Node adapter): static files are copied into build/client/ and the
// server runs with WORKDIR=/app, so process.cwd() = /app.
const TEMPLATE_PATH =
	process.env.NODE_ENV === 'production'
		? join(process.cwd(), 'build/client/app-template/template.zip')
		: join(process.cwd(), 'static/app-template/template.zip');

export const GET: RequestHandler = async () => {
	const buffer = readFileSync(TEMPLATE_PATH);

	return new Response(new Uint8Array(buffer), {
		headers: {
			'Content-Type': 'application/zip',
			'Content-Disposition': 'attachment; filename="Fix Church Printer.zip"'
		}
	});
};
