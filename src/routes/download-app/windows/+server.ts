// Serves the Windows installer zip (Install Church Printer.bat +
// Install-ChurchPrinter.ps1 + README). Static, served as-is -- same
// approach as the macOS /download-app/file route.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RequestHandler } from './$types';

const ZIP_PATH =
	process.env.NODE_ENV === 'production'
		? join(process.cwd(), 'build/client/app-template/church-printer-windows.zip')
		: join(process.cwd(), 'static/app-template/church-printer-windows.zip');

export const GET: RequestHandler = async () => {
	const buffer = readFileSync(ZIP_PATH);
	return new Response(new Uint8Array(buffer), {
		headers: {
			'Content-Type': 'application/zip',
			'Content-Disposition': 'attachment; filename="Church Printer Setup (Windows).zip"'
		}
	});
};
