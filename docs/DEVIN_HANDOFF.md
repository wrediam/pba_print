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

1. **⚠️ Verify the Job Log column mapping before trusting a real bill.**
   This is the single most important thing to check first. See the big
   comment at the top of `src/lib/server/printer/jobLog.ts` and the
   "Needs verification" section in `docs/ARCHITECTURE.md`. The B&W/
   Color counts are a best inference from a handful of real jobs, not
   confirmed against deliberately-known content.
2. **No `person` rows are seeded.** Only `598 = Will Reeves` is known
   from the original conversation; there's no master roster anywhere.
   Add everyone else via the People page once deployed, or find/build
   a real roster to seed from.
3. **Never actually deployed to Coolify or a TrueNAS VM.** The Docker
   image and compose file are verified locally; the target-specific
   setup (Coolify resource config, TrueNAS VM networking/storage) is
   real work still to do -- see `docs/DEPLOYMENT.md`.
4. **No tests written.** Given the scope of this session, priority went
   to building a real, running scaffold over test coverage. Worth adding
   at minimum: a unit test for `matchCode()` (the code-splitting logic
   in `sync.ts`) since it's easy to get subtly wrong and directly
   affects billing accuracy, and one for `rateAt()` in `reporting.ts`
   (the versioned-rate lookup).
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

Item 1 above, then item 2 -- both are blocking for the dashboard to
produce a trustworthy real invoice. Everything else is polish or new
scope.
