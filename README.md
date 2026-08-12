# PBA Print — Church Copier Billing Dashboard

Tracks copies across departments on the church's Sharp BP-71C65 copier,
lets the secretary set cost-per-copy rates (black & white / color),
and produces printable and CSV billing reports. Also serves the
companion macOS setup app ("Fix Church Printer.app") with its bundled
department codes kept in sync with what's in this dashboard.

See also: the **FixChurchPrinter** macOS app project (a separate repo/
folder) that this dashboard's "Mac App" page distributes -- that's the
tool individual staff run on their own Macs to get printing working
with the correct driver and a User Number.

## Stack

- **SvelteKit** (Node adapter) + TypeScript
- **Tailwind CSS v4** + **shadcn-svelte** components, **Poppins** font
- **PostgreSQL** via **Drizzle ORM**
- **Docker Compose** for deployment (app + Postgres, one `docker compose up`)

## Quick Start (local development)

```bash
npm install
npm run db:start          # starts a local Postgres via compose.dev.yaml
cp .env.example .env      # then edit values, particularly DATABASE_URL
                           # for local dev: postgres://root:mysecretpassword@localhost:5432/local
npm run db:migrate
ADMIN_USERNAME=secretary ADMIN_PASSWORD=changeme node scripts/seed.ts
node scripts/seed-departments.ts
npm run dev
```

Then visit http://localhost:5173, log in with the admin credentials you
seeded above.

## Production Deployment

See **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** -- covers Coolify, a
generic Docker host, and a TrueNAS VM, plus the full environment
variable reference.

```bash
cp .env.example .env      # fill in real values
docker compose up -d --build
```

`compose.yaml` is the full production stack (app + its own Postgres) --
that's the canonical file `docker compose up` picks by default and what
Coolify should be pointed at. `compose.dev.yaml` is a separate,
bare-Postgres convenience file for local development only (`npm run
db:start`), not used in production.

Migrations and the (non-destructive, idempotent) data seeds run
automatically on every container start via `docker-entrypoint.sh` --
verified end-to-end, including a full build + fresh-database first-run
and a simulated redeploy against existing data, during development. See
`docs/ARCHITECTURE.md` for details on exactly what those seeds do.

## Project Docs

- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** -- data model, the
  printer-code scheme, how printer usage gets imported, and a couple of
  things flagged as needing verification before this is trusted for a
  real invoice.
- **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** -- Coolify / TrueNAS /
  generic Docker instructions, full env var reference.
- **[docs/DEVIN_HANDOFF.md](docs/DEVIN_HANDOFF.md)** -- what's built,
  what's verified, and what's left to do next.
