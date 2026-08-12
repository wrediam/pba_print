// Sharp BP-71C65 admin-panel client.
//
// There is no real API here -- the printer only exposes the same HTML
// admin panel a human uses in a browser (confirmed during development:
// Sharp OSA's "External Accounting Application" would be a proper API,
// but it requires registering in Sharp's developer program for the SOAP
// spec, which we don't have). This logs in exactly the way a browser
// does (session cookie + rotating CSRF tokens on every page) and reads
// the same HTML a person would see. It's fragile in the sense that a
// firmware update could change the markup, but it's been reliable
// throughout development.
//
// Everything else in src/lib/server/printer/ should go through
// PrinterClient rather than talking to the printer directly, so if a
// better integration (Sharp OSA, if ever pursued) becomes available
// later, only this file needs to change.

import { env } from '$env/dynamic/private';

const PRINTER_HOST = env.PRINTER_HOST ?? '192.168.1.222';
const PRINTER_ADMIN_PASSWORD = env.PRINTER_ADMIN_PASSWORD ?? 'admin';
const BASE_URL = `http://${PRINTER_HOST}`;

function extractToken2(html: string): string {
	const m = html.match(/name="token2" value="([^"]*)"/);
	if (!m) throw new Error('token2 not found in printer response -- page layout may have changed');
	return m[1];
}

export class PrinterClient {
	private cookie = '';

	/** Merges any Set-Cookie headers from a response into our single cookie string. */
	private captureCookies(res: Response) {
		// Node's fetch exposes multiple Set-Cookie headers via getSetCookie().
		const setCookies =
			(res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
		for (const sc of setCookies) {
			const pair = sc.split(';')[0];
			const [name] = pair.split('=');
			// Replace any existing cookie with the same name, keep the rest.
			const others = this.cookie.split('; ').filter((c) => c && !c.startsWith(`${name}=`));
			this.cookie = [...others, pair].join('; ');
		}
	}

	private async request(
		path: string,
		init: RequestInit = {}
	): Promise<{ res: Response; text: string }> {
		const res = await fetch(`${BASE_URL}${path}`, {
			...init,
			redirect: 'follow',
			headers: {
				...(init.headers ?? {}),
				...(this.cookie ? { cookie: this.cookie } : {})
			}
		});
		this.captureCookies(res);
		const text = await res.text();
		return { res, text };
	}

	private async post(path: string, form: Record<string, string>): Promise<string> {
		const body = new URLSearchParams(form);
		const { text } = await this.request(path, { method: 'POST', body });
		return text;
	}

	/** Logs in as admin. Throws on failure. Safe to call again to refresh the session. */
	async login(): Promise<void> {
		this.cookie = '';
		const { text: loginPage } = await this.request('/');
		let token2 = extractToken2(loginPage);

		const adminPage = await this.post('/login.html', {
			loginbtn: '',
			adminloginbtn: '',
			'ggt_textbox(10007)': '',
			action: 'adminloginbtn',
			token2,
			ordinate: '',
			'ggt_hidden(10008)': '2'
		});
		token2 = extractToken2(adminPage);

		const result = await this.post('/login.html', {
			'ggt_textbox(10006)': PRINTER_ADMIN_PASSWORD,
			action: 'loginbtn',
			token2,
			ordinate: '',
			'ggt_hidden(10008)': '3'
		});

		if (!result.includes('Machine Identification') && !/<title>[^<]*<\/title>/.test(result)) {
			throw new Error('Printer admin login failed -- check PRINTER_ADMIN_PASSWORD');
		}
	}

	/** GET a page, re-logging in once if the session has expired. */
	async get(path: string): Promise<string> {
		let { text } = await this.request(path);
		if (text.includes('Login - BP-71C65') || text.includes('id="loginForm"')) {
			await this.login();
			({ text } = await this.request(path));
		}
		return text;
	}

	/** POST a form, extracting current token1/token2 from a freshly-fetched page first. */
	async submitForm(path: string, form: Record<string, string>): Promise<string> {
		const current = await this.get(path);
		const token1 = current.match(/name="token1" value="([^"]*)"/)?.[1] ?? '';
		const token2 = extractToken2(current);
		return this.post(path, { ...form, token1, token2 });
	}
}
