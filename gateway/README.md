# Print Gateway

A small always-on CUPS instance this app controls, sitting between client
Macs and the physical Sharp BP-71C65. Exists to fix a specific reliability
problem with the old model (see `docs/GATEWAY_MIGRATION.md` for the full
story): embedding the person+department account code used to require
setting a **per-macOS-user CUPS default** on every individual staff Mac,
which silently failed often enough to be worth redesigning around.

Here, the account code instead lives on a **queue that this container
owns**, set once by this container's own provisioning API -- never on a
random staff member's laptop, never dependent on which macOS user is
logged in.

## How it fits together

```
Mac (generic IPP queue, no Sharp driver needed locally)
   │  lpadmin -v ipp://<gateway>:631/printers/church_<personcode>_<deptcode>
   │  set ONCE by the installer, never touched again
   ▼
gateway container (this directory)
   cupsd, one real queue per person+department combo
   queue's own PPD default carries the account code (JCLUserNumber)
   and the copier's hardware config (trays/finisher/punch) -- all
   provisioned by control-api.ts, not by hand
   ▼  socket://<PRINTER_HOST>:9100 (raw PostScript+JCL, direct)
Sharp BP-71C65 (its own per-user auth should be OFF -- this gateway is
the sole trusted source of jobs)
```

## What's in here

- `driver/Sharp-BP-71C65-ps.ppd` -- Sharp's own **Linux/PostScript** CUPS
  driver for this exact model (from `sharp-2.3-mx-c55-25-ps.tar.gz`,
  also kept in this directory). Deliberately **not** the driver bundled
  in the macOS app (`static/app-template/template.zip`'s
  `SHARP BP-71C65.PPD.gz`) -- that one's `cupsFilter` points at a macOS
  application bundle (Mach-O binary) that cannot run in a Linux
  container. This one is a genuine PostScript PPD with no vendor filter
  binary at all -- CUPS's own standard `pstops`/Ghostscript pipeline
  handles it, which is exactly what makes it possible to run this in a
  plain Linux container. Confirmed to use the identical `Option1`-`Option9`
  hardware-config scheme and `ARCMode`/`JCLUserNumber` JCL options as the
  macOS PPD (same driver family), so the tray/finisher/punch config and
  account-code mechanism both carry over directly.
- `control-api.ts` -- small HTTP API (plain Node, no framework) this
  dashboard's server calls to provision/inspect queues and pull job
  history. Shells out to `lpadmin`/`lpstat` against the `cupsd` running
  in the same container.
- `Dockerfile` / `entrypoint.sh` -- runs `cupsd` and the control API
  side by side in one container.

## Not yet verified against real hardware

Everything here is built and internally consistent (PPD option names
confirmed by inspection, `lpadmin` commands follow standard CUPS syntax),
but **none of it has been run against the actual copier yet** -- that
needs doing on-site:

1. Whether `socket://<PRINTER_HOST>:9100/` accepts jobs from this queue
   the way the old direct-from-Mac queue did (should -- same PPD family,
   same transport the printer already listens on -- but not yet tested).
2. Whether `JCLUserNumber` reliably lands on every job once set via
   `lpadmin -o` in this container (expected to be far more reliable than
   the old per-user `lpoptions` approach, since there's no "which human's
   home directory" ambiguity here -- but "expected" isn't "confirmed").
3. Whatever setting on the Sharp itself disables per-user-code
   enforcement for jobs coming from this gateway's IP -- copier-side,
   not something this repo can do for you.
