# Architecture

## The code scheme

Every print job on the copier is tagged with an account number that's
just two codes concatenated: a **person's own code** (e.g. Will Reeves =
`598`) plus a **department code** from the copier-codes sheet (e.g.
Youth Dept. = `61`), giving `59861`. This is the same scheme the
`FixChurchPrinter` macOS app embeds via PJL (`ACCOUNTNUMBER`) when it
sets up a Mac's print queue -- this dashboard and that app are meant to
agree on the same `person` / `department` codes.

This is **not** the same system as the copier's own built-in 809-entry
walk-up "User List" (things like `Church Office KP`) -- that's a
separate, older system for people who walk up to the machine and pick a
name from a list. This dashboard doesn't touch that list at all; the two
systems coexist independently. Confirmed during development that the
copier accepts and logs any account number embedded this way without
checking it against that walk-up list.

### Splitting a code back apart

When the printer logs a job under `59861`, `matchCode()` in
`src/lib/server/printer/sync.ts` figures out who that was: it tries
every known person's code as a possible prefix, and checks whether
what's left over is a known department code. E.g. `598` (Will) + `61`
(Youth Dept.) matches; `59` (nobody, presumably) + `861` (no such
department) doesn't. This is why it matters that codes stay
prefix-free in practice -- if two people's codes were prefixes of each
other, this could misattribute jobs. Not enforced in the schema, just a
convention to keep in mind when adding people.

## Data model (`src/lib/server/db/schema.ts`)

- `admin_user` / `session` -- the one secretary login. Single row by
  design; seeded once from `ADMIN_USERNAME`/`ADMIN_PASSWORD` env vars
  the first time the table is empty, never touched again automatically.
- `department` / `person` -- editable via the Departments and People
  pages. `department` is pre-seeded from the real copier-codes sheet
  (`scripts/department_codes_seed.txt`, same data the macOS app carries).
  `person` is **not** pre-seeded -- there's no master roster of
  personal codes anywhere that was found; add people manually.
- `rate` -- **versioned**, not edited in place. Setting a new rate
  inserts a new row rather than updating the old one, so a report run
  for last month still uses last month's rate even after this month's
  rate changes. `buildUsageReport()` in `src/lib/server/reporting.ts`
  picks whichever rate was effective on each job's date.
- `print_job` -- one row per job pulled from the printer's Job Log.
  `printerJobId` (the printer's own log entry number) is unique, so
  re-running sync never double-imports a job.
- `sync_run` -- history of each sync attempt, surfaced on the dashboard
  as "last synced X ago" / error status.

## Printer integration (`src/lib/server/printer/`)

There is no real API here. Looked at three alternatives before settling
on this (see conversation history / commit context for the fuller
reasoning):

1. **Sharp OSA "External Accounting Application"** -- an actual SOAP
   API, but requires registering in Sharp's developer program to get
   the spec. Not pursued.
2. **SNMP** -- available on the printer, but only gives aggregate
   device-level counters, not per-department breakdowns.
3. **The admin web panel's Job Log view** -- what's actually used.
   `PrinterClient` (`client.ts`) logs in exactly like a browser would
   (session cookie, rotating CSRF tokens on every page) and
   `fetchJobLog()` (`jobLog.ts`) parses the "Quick Job Log View" table.

**Everything talks to the printer through `PrinterClient`** specifically
so that if Sharp OSA access is ever obtained later, only the printer/
module needs to change -- `sync.ts` and everything above it just needs
`fetchJobLog()` to keep returning the same shape.

### ⚠️ Needs verification before trusting this for a real invoice

`jobLog.ts` has a detailed comment on this, but the short version: the
Quick Job Log View returns 4 numeric columns without letting the column
picker be used explicitly, and their exact meaning was inferred from a
handful of real jobs observed during development (a B&W-heavy Copy job
had its count in the 2nd position; total pages showed in the 1st for a
Print job) rather than confirmed with a job of deliberately known B&W
vs. color content. Before trusting a real bill on this: either print
one deliberately-B&W and one deliberately-color test page and confirm
which column moves, or switch to the full "Select Item" column picker
on that page and request `Black & White Total Count` / `Full Color
Total Count` by name.

### Sync

`syncPrinterUsage()` in `sync.ts` fetches the log, skips jobs already in
`print_job` (by `printerJobId`), matches each new job's account code to
a person/department, and inserts. Runs two ways:

- **Automatically**, every `SYNC_INTERVAL_MINUTES` (default 15), via
  `src/lib/server/scheduler.ts`, started once from `hooks.server.ts`.
- **Manually**, via the "Sync Now" button on the dashboard.

Jobs whose code doesn't match a known person+department combo (e.g. the
printer logged `N/A`, or a not-yet-added person's code) still get
imported, just with `personId`/`departmentId` left null -- they show up
grouped under "Unassigned / unmatched code" on reports rather than
silently vanishing, so unmatched usage is visible instead of hidden.

## Auth

Single account, session cookie (`pba_session`), password hashed with
Node's built-in `scrypt` (`src/lib/server/crypto.ts` -- deliberately has
zero SvelteKit imports so both the running app _and_ the standalone
seed scripts, which run as plain Node outside SvelteKit's `$env`/`$lib`
resolution, can use it). No self-serve signup, no password reset flow --
this is intentional per the "just one login for the secretary"
requirement; if the password is lost, reset it directly in the database.

## macOS app download (`src/routes/download-app/`)

Serves `static/app-template/template.zip` (a pre-built copy of
`Fix Church Printer.app`) with its bundled `department_codes.txt`
replaced on the fly from the live `department` table, so downloads
always reflect current codes without needing a Mac to rebuild the app.

This repacking happens in Node on Linux, which invalidates the app's ad-
hoc code signature -- not a regression, since ad-hoc signing was never
enough to satisfy Gatekeeper anyway (users already need to right-click →
Open the first time regardless, and that instruction is on the download
page).

If the macOS app's own logic ever changes (new driver, new hardware
options, etc.), `static/app-template/template.zip` needs to be rebuilt
on an actual Mac from the `FixChurchPrinter` project and re-copied in --
this dashboard only ever touches the one text file inside it.
