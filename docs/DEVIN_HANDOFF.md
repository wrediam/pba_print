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
