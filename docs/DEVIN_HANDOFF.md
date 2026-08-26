# Continuing this project

Context for whoever (Devin / Claude Code) picks this up next. Written by
Claude after an initial build-and-verify pass -- everything marked
"done, verified" below was actually run and checked, not just written
and assumed to work.

## Done, verified

- **Stack scaffolded**: SvelteKit (Node adapter) + TypeScript + Tailwind
  v4 + shadcn-svelte (style: `nova` -- their v1 CLI renamed `new-york`ish
  styles, worth knowing if you add more components) + Poppins
  (self-hosted via `@fontsource/poppins`, not Google Fonts CDN, since
  this runs on a LAN with no guaranteed internet).
- **Full data model** in `src/lib/server/db/schema.ts`, migrated.
- **Printer login + Job Log scraping**, ported from a manually-validated
  curl/Python session into `src/lib/server/printer/`.
- **Auth**: single account, sessions, scrypt hashing.
- **All CRUD pages**: Departments, People, Rates (versioned).
- **Dashboard** with sync status + current-month summary, manual "Sync
  Now".
- **Reports page**: printable (browser print/save-as-PDF) _and_ CSV
  export (`/reports/export.csv`).
- **macOS app download**, repacking the real `Fix Church Printer.zip`
  template with live department data.
- **Docker**: `Dockerfile`, `compose.yaml` (production stack),
  `compose.dev.yaml` (local dev Postgres only), `docker-entrypoint.sh`.
- **End-to-end verified, for real**: built the actual Docker image, ran
  it against a fresh Postgres container (migrations → seed admin →
  seed 147 departments → server boot, all in the real container), hit
  every page over HTTP, exercised the create-department/create-person/
  create-rate form actions, confirmed CSV export produces correct
  output, and **restarted the container against the already-migrated
  database to confirm redeploys don't touch existing data** (admin seed
  skips, department seed inserts 0 new). All of that actually happened
  during this build, not just "should work."

## Print gateway migration (in progress, see `docs/GATEWAY_MIGRATION.md`)

The old account-code mechanism (a per-macOS-user CUPS default, set by
the `FixChurchPrinter` installer) turned out to be fragile enough in
real use (silently failing on some Macs, and with the copier's own
user-code auth on, causing outright failed print jobs) to be worth
replacing. Built and verified so far, this session:

- **`gateway/`** -- a new CUPS-based print gateway service, using
  Sharp's real Linux PostScript driver (not the macOS one bundled in
  `static/app-template/template.zip`, which depends on a macOS-only
  binary filter and can't run in a container). **Built and exercised
  end-to-end locally** with `docker build`/`docker run`: queue
  provisioning, PPD hardware options, and the `JCLUserNumber` account
  code all confirmed landing correctly in the compiled PPD
  (`*DefaultJCLUserNumber: Custom.59861`), verification logic, queue
  deletion, and the `/jobs` endpoint all actually run, not just written
  and assumed to work. **Not yet tested against the real copier** --
  nothing here has been proven to actually print to real hardware yet.
- **`gateway_queue` table + `src/lib/server/gateway/`** -- tracks
  provisioned queues, `POST /api/gateway/provision` (what the future
  installer will call), and automatic re-provisioning when a
  person's/department's code changes. `npm run check` and `npm run
  build` both pass with these changes.
- **`compose.yaml`** -- new `gateway` service, wired to the app via
  `GATEWAY_URL`/`GATEWAY_SHARED_SECRET` (optional -- app works fine
  without them set, gateway provisioning just returns 503).

**Not done yet, and real work, not just polish:**

1. **The macOS installer app itself hasn't been touched** -- I don't
   have its AppleScript source, only the built `.app`. `docs/GATEWAY_MIGRATION.md`
   has exact, script-by-script instructions for what to change in
   `add_profile_queue.sh` (the account-code embedding moves off of it
   entirely) and why. This needs doing on the separate Mac project,
   then rebuilding and replacing `template.zip` in this repo.
2. **Nothing has been tested against the real Sharp BP-71C65.** The
   gateway container's mechanics are solid (verified locally), but
   whether `socket://<printer>:9100/` actually accepts jobs from it,
   whether `JCLUserNumber` really lands on a real printed page, and
   whether IPP-Everywhere finishing options (staple/punch) come through
   richly enough on the Mac side, are all open questions -- see the
   "Not yet verified against real hardware" section of `gateway/README.md`.
3. **The copier's own per-user-code authentication needs disabling**
   copier-side (the whole point of this migration is that the gateway
   becomes the sole authority) -- not something this repo can do, and
   not done yet.
4. **Usage/billing ingestion still comes from the old Sharp Job Log
   scrape, unchanged.** The gateway exposes a `/jobs` endpoint reading
   CUPS's own `page_log`, but wiring that into `print_job`/billing
   reports, and figuring out whether it gives good enough B&W-vs-color
   detail, is real follow-up work requiring a real printed job to test
   against -- not started.

## Not done yet / needs your attention

1. ~~Verify the Job Log column mapping before trusting a real bill.~~
   **Done** -- the mapping was actually wrong (there's no "Computer
   Name"/total-count column; the real columns are "User Name" +
   "Login Name" separately, and 4 independent counts: Black & White,
   Full Color, 2 Color, Single Color), confirmed directly against the
   printer's own `<th>` headers. Schema and parser (`jobLog.ts`,
   `schema.ts`, `sync.ts`) updated accordingly -- see
   `docs/ARCHITECTURE.md`. **The `print_job` table should be truncated
   (or the whole DB reset) before the next deploy/sync** so old rows
   imported under the previous, incorrect mapping don't linger with
   wrong B&W/color counts -- this is a one-time thing for this
   migration, not a general practice.
2. **No `person` rows are seeded**, and department-vs-person code
   matching now has a fallback for this: `resolveCode()` in `sync.ts`
   first tries a full person+department match, and if the specific
   person isn't in the roster yet, falls back to identifying just the
   department from the tail of the code (department codes are seeded
   up front from the church's codes sheet, so this works before any
   person is added). Per-department billing is accurate as soon as
   codes sync; per-person assignment still needs the People page filled
   in over time. Only `598 = Will Reeves` is known from the original
   conversation as a real person row.
3. **Never actually deployed to Coolify or a TrueNAS VM.** The Docker
   image and compose file are verified locally; the target-specific
   setup (Coolify resource config, TrueNAS VM networking/storage) is
   real work still to do -- see `docs/DEPLOYMENT.md`.
4. **No tests written.** Given the scope of this session, priority went
   to building a real, running scaffold over test coverage. Worth adding
   at minimum: a unit test for `matchCode()`/`resolveCode()` (the
   code-splitting logic in `sync.ts`) since it's easy to get subtly
   wrong and directly affects billing accuracy, and one for `rateAt()`
   in `reporting.ts` (the versioned-rate lookup).
5. **UI is functional, not polished.** Tables/forms work but haven't
   had a design pass -- empty states, loading states, mobile layout,
   etc. are all bare-minimum.
6. **No CSRF/shared-secret hardening beyond SvelteKit's built-in Origin
   check.** Fine for a LAN-only tool behind the church's own network,
   worth reconsidering if this is ever exposed more broadly.
7. **`static/app-template/template.zip`** is a snapshot of the macOS app
   as of this session. If that app's own code changes (new driver
   version, new hardware options, etc.), rebuild it on an actual Mac and
   replace this file -- there's no automation connecting the two repos.
8. **Rate input precision**: the Rates form takes dollars with 3 decimal
   places (e.g. `0.010`) but displays with `Intl.NumberFormat`'s
   standard 2-decimal currency formatting. Cents are stored as integers
   so nothing's actually lost, but worth a look if fractional-cent
   accuracy in the _display_ (not just storage) ever matters.

## Where to start

Item 1's DB reset, then item 2 (adding real people over time) -- both
matter for the dashboard to produce a trustworthy real invoice.
Everything else is polish or new scope.
