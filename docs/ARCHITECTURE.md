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

## Print gateway (`gateway/`, `src/lib/server/gateway/`)

New, being migrated to -- see `docs/GATEWAY_MIGRATION.md` for the full
story and exact instructions for updating the macOS installer. Short
version: the old model (see "Printer integration" below) embedded the
account code as a **per-macOS-user CUPS default**, which was fragile
enough in practice (silently failing on some Macs) to be worth
redesigning around. The gateway is a small always-on CUPS instance this
app controls (`gateway/`, a new `gateway` service in `compose.yaml`)
that sits between client Macs and the physical copier.

**The copier's own per-user-code authentication stays ON.** An earlier
draft of this migration planned to switch it off and make the gateway
the sole trusted source of jobs -- that plan is abandoned. Auth stays on
so that **walk-up codes keep working**: people who stand at the machine
and enter a code to copy/scan still authenticate the same way they
always have. Because auth is on, network print jobs must also carry a
valid code -- which the gateway does automatically (`JCLUserNumber`, the
account code baked into each queue). So both paths -- walk-up and
gateway -- authenticate at the copier, and both end up in the copier's
own Job Log tagged with their code. That has two consequences worth
holding onto:

- **All printer options must remain available to gateway users and pass
  through to the copier.** The gateway queue bakes in *defaults* (the
  installed hardware config, and the account code) but does not force
  per-job choices: color, duplex, staple, punch, tray, and paper size
  selected in a staff Mac's print dialog flow through the gateway to the
  copier. The one setting that previously broke this was `ARCMode`,
  which was pinned to `CMBW` (forcing every job to mono); it now
  defaults to `CMAuto` (the PPD's own default) so a job prints color
  only when the user explicitly picks it. See `gateway/control-api.ts`.
- **Billing has a single source of truth: the copier's own Job Log**
  (the "Printer integration" section below), unchanged. With auth on,
  every job -- walk-up *and* gateway -- is already in that log with its
  code and the copier's authoritative B&W-vs-color counts, so there's no
  need (and no benefit) to also bill from the gateway's own logs, and no
  risk of counting a gateway job twice. Each imported job is *labelled*
  `walkup` vs `network` (see `print_job.source`, set from the Job Mode in
  `src/lib/server/printer/sync.ts`) purely so the office can see the
  split; the gateway's own job data (`/jobs`, `/active-jobs`, `/logs`)
  drives the operational **Gateway** dashboard page, not billing.

The queue mechanics themselves:

- One real CUPS queue per person+department combo lives on the gateway,
  not on individual staff Macs. The account code is the queue's own
  compiled-in PPD default (`JCLUserNumber`), set once by the gateway's
  own control API (`gateway/control-api.ts`) -- never touched by a
  human, never dependent on which macOS user happens to be logged in.
- Client Macs get a much simpler local queue: just a static pointer at
  `ipp://<gateway>:631/printers/church_<personcode>_<deptcode>`, set
  once by the installer and never touched again.
- `gateway_queue` (`src/lib/server/db/schema.ts`) tracks which queues
  have been provisioned, for which person+department combo, and their
  last known status -- populated by `ensureQueue()`
  (`src/lib/server/gateway/provisioning.ts`), which the installer
  triggers via `POST /api/gateway/provision`.
- Changing a person's or department's code re-provisions any
  already-provisioned gateway queues automatically (see the `update`
  actions in `src/routes/departments/+page.server.ts` and
  `src/routes/people/+page.server.ts`) -- the gateway's queue names are
  derived from those codes, so a code change would otherwise orphan the
  old queue and leave the new code unprovisioned until someone happened
  to re-run the installer.
- `GATEWAY_URL` is optional -- if unset, gateway provisioning is simply
  unavailable (`503` from the API) and everything else keeps working
  unaffected, including the Sharp-Job-Log-based sync below.
- The **Gateway** dashboard page (`src/routes/gateway/`) shows the office
  what the gateway is doing without anyone shelling into the container:
  liveness, the provisioned queues (from `gateway_queue`, cross-checked
  against the gateway's live enabled/accepting state and the account code
  read back out of each queue's compiled PPD), the **live queue** of jobs
  accepted-but-not-yet-printed, and the tail of the gateway's CUPS log.
  These read three read-only control-API endpoints -- `GET /queues`,
  `GET /active-jobs`, `GET /logs` -- alongside the existing `GET /jobs`
  (see `gateway/control-api.ts` and `src/lib/server/gateway/client.ts`).

**Deliberately *not* doing:** switching the usage-ingestion path (the
"Printer integration" section below) over to the gateway's own CUPS job
history. That was on the table only under the abandoned auth-off plan
(where the copier's Job Log would no longer attribute network jobs). With
auth staying on, the copier's Job Log remains complete and authoritative,
so it stays the single billing source and the gateway's job history is
used only for the operational Gateway page -- see `docs/GATEWAY_MIGRATION.md`.

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

### Column mapping (confirmed against the real printer)

`jobLog.ts`'s column mapping was originally inferred from a handful of
sample jobs and turned out to be wrong (there is no separate "total
pages" cell, and the "computer name" column doesn't exist -- it's
actually two separate columns, "User Name" and "Login Name"). It's now
confirmed directly against the printer's own `<th>` headers on the Job
Log page: `Job ID | Job Mode | User Name | Login Name | Date [Start,
Complete] | Total Count [Black & White, Full Color, 2 Color, Single
Color] | Result | Error Cause | Image Send Related Item [Direct
Address] | Common Functionality [Color Setting] | Paper Select [Size]
| Duplex Setup` -- 16 `<td>` cells per row in that order. "Total Count"
is only a group heading over the 4 count columns; `printJob.totalCount`
is just their sum.

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
`Fix Church Printer.app`) **as-is** -- no on-the-fly repacking. An
earlier version injected a fresh `department_codes.txt` on every
download, but modifying a signed bundle's contents made macOS report it
"damaged"; instead the app now fetches department codes at runtime from
`GET /api/departments`, so the static zip never needs touching to stay
current (see `src/routes/download-app/file/+server.ts`).

The app is ad-hoc signed, which never satisfied Gatekeeper anyway --
users right-click → Open the first time regardless, and that instruction
is on the download page.

The bundle now follows the **gateway model** (see
`docs/GATEWAY_MIGRATION.md`): its `add_profile_queue.sh` asks the
dashboard's `/api/gateway/provision` for a queue and points a local
queue at the returned gateway URI using the bundled Linux PostScript PPD
(`Sharp-BP-71C65-ps.ppd`) -- the old macOS Sharp driver + `pstomx3061ps`
filter are gone from it. If the app's logic changes again, rebuild it
from the `FixChurchPrinter` project (on the Desktop) -- recompile the
AppleScript if that changed, re-zip `Fix Church Printer.app`, and copy
the zip over `static/app-template/template.zip`. The `2026-08-26` rebuild
that introduced the gateway model rewrote `add_profile_queue.sh` and
`remove_church_queues.sh`, bundled the Linux PPD, and added
`verify_person.sh` -- and, because the AppleScript wrapper gained a
personal-code verification step, recompiled `Scripts/main.scpt` via
`osacompile` (the loose source is `Fix Church Printer.applescript` in the
Desktop project).
