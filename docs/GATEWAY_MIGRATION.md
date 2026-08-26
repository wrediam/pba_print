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

Concretely: the printer's own per-user-code authentication should be
switched **off** at the copier (you said you'd handle this in the admin
panel), and this gateway becomes the sole trusted source of print jobs,
same as any dashboard/reporting page believing what the gateway tells it
instead of scraping the copier's own Job Log page.

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
  `{ "queueName": "church_598_61", "uri": "ipp://<gateway>:631/printers/church_598_61", "status": "ready" }`
  (or a `4xx`/`5xx` with an error message if something's wrong, e.g. an
  unknown/inactive code, or the combined code being outside the 5-8
  character range the printer's `JCLUserNumber` option accepts).
- Changing a department's or person's code in the dashboard automatically
  re-provisions any already-created gateway queues under the new code.

## What needs to change in the FixChurchPrinter macOS app

This is real work on the Mac project, not something I can do from here
-- I don't have the app's AppleScript source, only the built `.app`
bundled in this repo's `static/app-template/template.zip`. Here's
exactly what to change, script by script:

### 1. `add_profile_queue.sh` -- the big one

Replace the entire "install the Sharp driver locally + set ARUserNumber/
ARCMode via lpoptions" approach with a much smaller script:

1. Call `POST http://<dashboard-host>:3000/api/gateway/provision` with
   the person's code and the department code, same as
   `fetch_departments.sh` already calls `/api/departments` today (same
   `curl` + hand-rolled JSON parsing style, since this is the same
   "don't trip the Xcode Command Line Tools dialog" constraint that
   script's own comments explain).
2. Read the `uri` field back out of the response.
3. Create the local queue pointed at that URI, using CUPS's built-in
   driverless "IPP Everywhere" support instead of the bundled Sharp PPD
   -- **no PPD, no filter, no `ARUserNumber`, no `ARCMode` to set
   locally at all**:

   ```bash
   lpadmin -p "$QUEUE_NAME" -E -v "$GATEWAY_URI" -m everywhere -D "$DESCRIPTION"
   ```

4. Delete the old driver-install steps (the `lpinfo -m` check, copying
   `SHARP BP-71C65.PPD.gz` and `pstomx3061ps.app` into
   `/Library/Printers/...`) -- none of that is needed anymore, since all
   Sharp-specific handling now happens on the gateway, not the Mac.
5. Delete the whole `ARUserNumber`/`ARCMode` lpoptions block (the
   `run_as_real_user lpoptions ...` calls and the `QUEUE_READY` /
   `QUEUE_CODE_NOT_SAVED` verification around it) -- that verification
   existed specifically because of the bug this migration fixes, and
   there's nothing left to verify locally once the code isn't set here
   at all.
6. Keep the `QUEUE_READY` / error diagnostic output convention the
   AppleScript wrapper already parses, just with much less to report on
   now (basically: did `/api/gateway/provision` succeed, did `lpadmin`
   succeed).

**Open question to verify on-site, not something I can confirm from
here:** whether macOS's driverless "IPP Everywhere" auto-detection
(`-m everywhere`) picks up the finishing options (staple, punch,
duplex) from the gateway's shared queue the same way the old
Mac-side Sharp PPD exposed them in the print dialog. It should --
CUPS auto-generates IPP-Everywhere-compatible capability
advertisements from any locally shared, PPD-backed queue -- but
"should" isn't "confirmed for this exact model." If the finishing
options don't show up richly enough once you test this for real, the
fallback is bundling `gateway/driver/Sharp-BP-71C65-ps.ppd` (the new
Linux PPD file, which -- being pure PostScript with no vendor binary --
should work fine on macOS too) into the Mac app instead of using
`-m everywhere`, and passing `-P` to that PPD file in the `lpadmin`
call above.

### 2. `fetch_departments.sh`

No changes needed -- keep exactly as-is.

### 3. `remove_church_queues.sh`

No changes needed in spirit, but since queues now point at the
gateway's IP instead of the printer's IP, update `PRINTER_IP` (or
introduce a separate `GATEWAY_HOST` constant) to match whatever this
script greps `lpstat -v` for.

### 4. `test_print.sh`

No changes needed -- it already just prints to a queue name and watches
`lpstat`, agnostic to what that queue points at.

### 5. Rebuild and re-copy `template.zip`

Once the AppleScript wrapper and shell scripts are updated and tested
on a real Mac against the real gateway, rebuild `Fix Church Printer.app`
and replace `static/app-template/template.zip` in this repo -- same
process as any other macOS-app-side change (see
`docs/ARCHITECTURE.md`'s "macOS app download" section).

## What's NOT done yet on the dashboard side

Switching the actual **usage/billing ingestion** away from scraping the
Sharp's own admin-panel Job Log (`src/lib/server/printer/`) over to
reading the gateway's own CUPS job history instead. The gateway already
exposes a `GET /jobs` endpoint reading CUPS's structured `page_log`
(see `gateway/control-api.ts`), but turning that into the same
per-department/per-person billing rows `print_job` currently holds --
including whether `page_log` alone gives good enough B&W-vs-color
detail, given every gateway queue currently defaults to `ARCMode=CMBW`
-- needs real testing against real print jobs before it's trustworthy
for an actual invoice. Until that's done, the existing Sharp Job Log
sync keeps running unchanged and is still what billing reports are
based on.
