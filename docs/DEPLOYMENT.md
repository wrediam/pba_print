# Deployment

This is built to be deployment-target-agnostic: `Dockerfile` +
`compose.yaml` (the production stack, app + its own Postgres) is the
whole story. Any Docker host can run it; the sections below cover the
three environments mentioned during planning.

Verified during development: a full `docker build`, first-run against a
completely fresh Postgres (migrations + both seed scripts + server
start), and a simulated redeploy against existing data (confirms
migrations/seeds are correctly idempotent, no data loss). Not yet
deployed to an actual Coolify instance or TrueNAS VM -- that's real
environment-specific setup left for whoever picks this up next (see
`docs/DEVIN_HANDOFF.md`).

## Environment variables

Copy `.env.example` to `.env` and fill in real values before deploying.
The compose file will refuse to start (loudly, not silently) if a
required one (marked below) is missing.

| Variable                                              | Required                     | Notes                                                                                                                                                                                |
| ----------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | password required            | Postgres credentials. Compose wires `DATABASE_URL` for the app automatically from these.                                                                                             |
| `ORIGIN`                                              | **yes**                      | How this app will actually be reached, e.g. `http://printer-dash.local:3000`. SvelteKit needs this for CSRF-safe form submissions -- get this wrong and every form action will fail. |
| `APP_PORT`                                            | no (default `3000`)          | Host port the app is published on.                                                                                                                                                   |
| `PRINTER_HOST`                                        | no (default `192.168.1.222`) | The copier's LAN IP.                                                                                                                                                                 |
| `PRINTER_ADMIN_PASSWORD`                              | **yes**                      | The copier's admin panel password.                                                                                                                                                   |
| `PRINTER_TIMEZONE`                                    | no (default `America/Chicago`) | IANA timezone the printer's own clock is set to. Its Job Log timestamps have no timezone info, so this tells the app how to convert them to UTC correctly -- get this wrong and every job's time will be off by your UTC offset. Only needs changing if the printer isn't in Central time. |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD`                   | **yes**                      | The one dashboard login, created once on first boot. Changing these later does **not** reset an existing account -- see `docs/ARCHITECTURE.md`.                                      |
| `SYNC_INTERVAL_SECONDS`                               | no (default `30`)            | How often the background sync pulls new usage from the printer. Incremental syncs are fast (stop as soon as they hit already-imported jobs), so a short interval is fine.            |

## Option A: Coolify

Coolify natively supports arbitrary `docker-compose`-based projects, so
this repo doesn't need anything Coolify-specific added to it:

1. In Coolify, create a new **Docker Compose** resource pointed at this
   repo (Git-based deployment).
2. Coolify will find `compose.yaml` automatically (it's the canonical
   filename -- don't point it at `compose.dev.yaml`, that's local-dev
   only and has no `app` service).
3. Set the environment variables from the table above in Coolify's
   environment panel rather than committing a `.env` file.
4. **LAN domain**: whether Coolify can give this a friendly LAN
   hostname (vs. just an IP:port) depends entirely on how that specific
   Coolify instance's proxy/DNS is configured -- that's local
   infrastructure this project can't know in advance. Whatever hostname
   ends up used, set it as `ORIGIN`.
5. Deploy. Coolify handles the build; the container's own
   `docker-entrypoint.sh` handles migrations/seeding automatically on
   every start, so redeploys are safe.

## Option B: Generic Docker host

```bash
git clone <repo> && cd pba_print
cp .env.example .env   # fill in real values
docker compose up -d --build
```

That's the whole thing. To update after a code change:

```bash
git pull
docker compose up -d --build
```

## Option C: TrueNAS VM

TrueNAS SCALE can run a small Debian/Ubuntu VM with Docker installed,
then follow Option B inside that VM. Two things worth deciding when
setting that VM up (not this project's call to make):

- Give the VM a static LAN IP/hostname so `ORIGIN` and whatever staff
  bookmark stays stable across reboots.
- Point `pgdata` at a dataset TrueNAS actually snapshots/backs up if
  billing data matters long-term -- the named Docker volume in
  `compose.yaml` works fine functionally, but doesn't get TrueNAS's own
  snapshot protection unless it's backed by a bind-mounted dataset
  instead. If that matters, swap the `pgdata` volume definition for a
  bind mount to a TrueNAS dataset path.

## Redeploying / updating

Every deploy re-runs `docker-entrypoint.sh`: `drizzle-kit migrate`
(only applies new migrations, no-ops otherwise), then both seed scripts
(both `INSERT`-only, idempotent -- see `docs/ARCHITECTURE.md`). No
manual migration step is ever needed; just rebuild and restart the
container.
