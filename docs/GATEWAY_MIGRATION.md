# Migrating to the print gateway

Why, what changed on the dashboard side, and exactly what to change in
the `FixChurchPrinter` macOS app project (not in this repo -- you have
that on a separate Mac).

## Why

The old model embedded each person's account code as a **per-macOS-user
CUPS default** (`lpoptions`, written into that specific person's own
`~/.cups/lpoptions` by the installer, running elevated via `sudo -u`).
In practice this silently failed often enough to be a real problem: the
queue would get created fine, but the code wouldn't actually stick, and
with the copier's own user-code authentication enabled, that job would
just fail outright with no useful error on the Mac side.

The fix isn't "try harder to set the same kind of default" -- it's
moving that fragile piece off of individual staff Macs entirely. The
account code now lives on a **queue that the gateway itself owns and
manages**, set once by the gateway's own automation (`gateway/control-api.ts`),
verified by re-reading the actual compiled PPD file it just wrote, with
zero dependency on which macOS user is logged in or whether `sudo -u`
happened to resolve their home directory correctly that day.

## Auth stays ON (this reverses an earlier plan)

An earlier draft of this doc said the copier's own per-user-code
authentication should be switched **off**, making the gateway the sole
trusted source of jobs. **That is no longer the plan.** Auth stays
**on**, because the office still needs **walk-up codes** to work: people
who stand at the machine and punch a code to copy or scan authenticate
that same way, and turning auth off would break that.

Keeping auth on costs the gateway nothing: every gateway queue already
stamps a valid account code on its jobs (`JCLUserNumber`), so gateway
print jobs authenticate at the copier automatically, exactly like a
walk-up user's typed code. So both paths coexist:

- **Walk-up** (Copy/Scan/Fax at the machine) -- authenticated by the
  code the person types, gated by the copier's own auth.
- **Gateway** (network print from a staff Mac) -- authenticated by the
  code the gateway stamps.

Both land in the copier's own Job Log, each tagged with its code. Two
things follow, and they shape the rest of this migration:

1. **Billing stays on the copier's Job Log -- one source, no double
   counting.** With auth on, that log already contains every job (walk-up
   *and* gateway) with its code and the copier's authoritative
   B&W-vs-color counts. So the dashboard keeps billing from it unchanged;
   it does **not** also bill from the gateway's own logs (that would
   double-count gateway jobs, and the gateway's `page_log` has weaker
   color detail anyway). Each imported job is only *labelled* `walkup`
   vs `network` (`print_job.source`, from the Job Mode -- see
   `src/lib/server/printer/sync.ts`) so the office can see the split. The
   gateway's own job data feeds the operational **Gateway** dashboard
   page, not the invoice.
2. **All copier options must stay available to gateway users and pass
   through.** A gateway queue bakes in *defaults* (installed hardware,
   account code) but must not force per-job choices: duplex, staple,
   punch, tray, and paper size picked in the Mac print dialog flow
   through to the copier. Verifying that end-to-end is the main on-site
   test (see below).

   **Color is on for every department** (standing decision). Each gateway
   queue is provisioned `ARCMode=CMAuto`, so a job prints color only when
   the user picks it in the dialog and mono otherwise. **This depends on
   the copier itself:** the copier enforces a per-department *color
   authority*, and a `CMAuto` job that asks for color from a department
   *not* granted color there is rejected outright with **Sharp error
   0435** (this is exactly why the old macOS installer pinned `CMBW`; see
   its comment block). So defaulting to `CMAuto` assumes the office has
   granted color authority to **every** department on the copier. If any
   department is ever meant to stay mono-only, provision its queue with
   `colorMode: "CMBW"` (the control API accepts it per queue) so its color
   jobs don't 0435.

## What already works, unchanged

- `/api/departments` -- already public, already live, already what
  `fetch_departments.sh` calls. No changes needed there; a department
  code/label change already shows up on the next install run.
- The department-vs-person code scheme itself (personalCode + department
  code concatenated) is unchanged -- it's just where that code gets
  embedded that's different now.

## What's new on the dashboard side (already built, in this repo)

- A `gateway` service (`gateway/`, `compose.yaml`) -- a small CUPS
  instance this app controls, using Sharp's actual **Linux PostScript**
  CUPS driver (`gateway/driver/Sharp-BP-71C65-ps.ppd`, from
  `sharp-2.3-mx-c55-25-ps.tar.gz`) -- deliberately not the driver bundled
  in the macOS app, since that one's filter is a macOS binary that can't
  run in a Linux container. Confirmed to use the identical
  `Option1`-`Option9` hardware options and `ARCMode`/`JCLUserNumber` JCL
  options as the macOS PPD (same driver family), so the existing
  tray/finisher/punch config translates directly.
- `POST /api/gateway/provision` on this dashboard -- body
  `{ "personCode": "598", "departmentCode": "61" }` -- ensures a gateway
  queue exists for that combo and returns
  `{ "queueName": "church_598_61", "uri": "ipp://<GATEWAY_PUBLIC_HOST>/printers/church_598_61", "status": "ready" }`
  (or a `4xx`/`5xx` with an error message if something's wrong, e.g. an
  unknown/inactive code, or the combined code being outside the 5-8
  character range the printer's `JCLUserNumber` option accepts). The
  `uri` is built from the new `GATEWAY_PUBLIC_HOST` env var -- the
  gateway's LAN `host:631` **as a client Mac reaches it** -- not the
  Docker-internal `GATEWAY_URL` the dashboard's own server uses (a Mac
  can't resolve `gateway:8631`). Set `GATEWAY_PUBLIC_HOST` before running
  the installer against a real gateway.
- Changing a department's or person's code in the dashboard automatically
  re-provisions any already-created gateway queues under the new code.

## What changes in the FixChurchPrinter macOS app

The Mac project lives at `~/Desktop/FixChurchPrinter` (AppleScript
source + bundled shell scripts + `Fix Church Printer.app`). The built
app is what this repo ships as `static/app-template/template.zip`. Here's
what changes, script by script:

### 1. `add_profile_queue.sh` -- the big one

The old flow installed the Sharp driver locally and embedded the account
code as a per-user `lpoptions` default (the fragile bit this whole
migration fixes). The new flow makes the **gateway** own the code and
just points the Mac at it:

1. Call `POST http://<dashboard-host>:3000/api/gateway/provision` with
   the person's code and the department code, using the same `curl` +
   hand-rolled parsing style as `fetch_departments.sh` (the "don't trip
   the Xcode Command Line Tools dialog" constraint that script explains
   still applies -- no `python3`/`jq`).
2. Read the `uri` field back out of the response -- that's the
   `ipp://<gateway-lan-host>:631/printers/<queue>` a Mac can print to.
3. Create the local queue pointed at that URI **with the bundled Linux
   PPD** (`-P`), not `-m everywhere`:

   ```bash
   lpadmin -p "$QUEUE_NAME" -E -v "$GATEWAY_URI" -P "$BUNDLED_PS_PPD" -D "$DESCRIPTION"
   lpadmin -p "$QUEUE_NAME" -o printer-is-shared=false
   ```

   We bundle `Sharp-BP-71C65-ps.ppd` (the pure-PostScript Linux PPD, no
   vendor binary -- it loads fine on macOS) rather than relying on
   `-m everywhere`, so the finishing options (duplex/staple/punch/tray)
   are guaranteed to show up richly in the print dialog instead of
   depending on IPP-Everywhere auto-detection for this specific model.
   **No `ARUserNumber`, no `ARCMode`, no per-user `lpoptions` at all** --
   the code and color policy live on the gateway queue now.
4. The old driver-install steps (copying `SHARP BP-71C65.PPD.gz` and the
   `pstomx3061ps.app` macOS filter into `/Library/Printers/...`) are
   gone -- all Sharp-specific handling is on the gateway.
5. The whole `ARUserNumber`/`ARCMode` `lpoptions` block and its
   `QUEUE_READY`/`QUEUE_CODE_NOT_SAVED` verification are gone -- there's
   nothing to set or verify locally once the code isn't embedded here.
6. Keep emitting `QUEUE_READY` (and `DIAG_*` lines) the AppleScript
   wrapper already parses -- now it just means "provision call succeeded
   and `lpadmin` created the queue."

### 1b. `verify_person.sh` (new) + the AppleScript

Provisioning is strict -- `/api/gateway/provision` denies a code with no
active person (personal codes aren't published, so this is what stops
someone printing on another person's code). To make that a friendly
experience rather than a cryptic failure, the installer now verifies the
code the moment it's entered: a new bundled `verify_person.sh` calls
`GET /api/people/verify?code=<code>` (returns `{valid, name}` for that one
code -- never the whole roster), and the AppleScript wrapper
(`verifyPersonalCode` handler) shows "Setting up for <name>… Continue?"
on success, or "that code isn't recognized" and stops otherwise. The
AppleScript therefore *did* change this time (unlike the pure
script-swap), so `Scripts/main.scpt` was recompiled via `osacompile`.

### 2. `fetch_departments.sh`

No changes -- keep as-is.

### 3. `remove_church_queues.sh`

Queues now point at the gateway, not the printer's `192.168.1.222`.
Update the IP this greps `lpstat -v` for to the gateway's LAN host (the
`GATEWAY_PUBLIC_HOST` host), so a rebuild still finds and clears the old
queues.

### 4. `test_print.sh`

No changes -- it prints to a queue name and watches `lpstat`, agnostic
to what the queue points at.

### 5. Rebuild and re-copy `template.zip`

After the scripts + AppleScript are updated, rebuild `Fix Church
Printer.app` (recompile the AppleScript, re-zip) and replace
`static/app-template/template.zip` in this repo -- same process as any
other macOS-app-side change (see `docs/ARCHITECTURE.md`'s "macOS app
download" section). **Do this only after the gateway has been tested
against the real copier** -- shipping a rebuilt installer that points
every Mac at an unproven gateway would break printing for everyone at
once.

## Billing ingestion: unchanged on purpose

Billing stays on the Sharp's own Job Log scrape (`src/lib/server/printer/`),
and that is now a **deliberate final decision, not a stopgap.** An
earlier draft treated "move ingestion to the gateway's `page_log`" as
pending work. With auth staying on, that move is neither needed nor
wanted: the copier's Job Log already contains every job -- walk-up *and*
gateway -- with its code and the copier's authoritative B&W-vs-color
counts, so it's the single source of truth and there's no double-count
risk. The gateway's `page_log`/`/jobs`/`/active-jobs`/`/logs` feed the
operational **Gateway** dashboard page, not the invoice. Sync now also
labels each imported job `walkup` vs `network` (`print_job.source`, from
the Job Mode) so the split is visible; see `docs/ARCHITECTURE.md`.

## Still open

- **Copier-side: grant color authority to every department.** The gateway
  now provisions `ARCMode=CMAuto` on every queue (all departments get
  color). Each department must have color authority granted on the copier
  itself, or its color jobs 0435 -- see the color note above. This is
  admin-panel config on the Sharp, not something this repo can do.
- **On-site hardware verification** -- nothing in the gateway path has
  been run against the real copier yet. See `gateway/README.md`.
