# Setup

Three parts, set up in this order: the Supabase database, the indexer that
fills it, and the page that reads it. Each part only needs the keys listed for
it.

| Part | Runs on | Needs |
|---|---|---|
| Supabase | supabase.com | the migrations in `supabase/migrations/` |
| Indexer | a Linux host with Docker | Supabase URL, **service role** key, a Zenon node |
| Page | GitHub Pages, or Docker locally | Supabase URL, **anon** key |

## 1. Supabase

1. Create a project.
2. Run the files in [`supabase/migrations/`](../supabase/migrations/) in order,
   in the SQL editor or with `supabase db push`. `0001_wall.sql` creates
   `messages` and `indexer_state`, with row-level security that lets anyone
   read and nobody else write. `0002_fuel.sql` adds the columns for Boost and
   Torch; the indexer and the page both need it.
3. From **Project settings → API**, note:
   - the project URL, the base one, without `/rest/v1/`
   - the **anon** key, for the page; public by design, RLS makes it read-only
   - the **service role** key, for the indexer only; it bypasses RLS

## 2. Indexer

The indexer scans momentums for wall posts and writes them to Supabase. For a
post that names a donation or burn (`ZW!<hash>`), it fetches that block and
checks it before showing the fuel. Run exactly one copy. A second copy writes
the same rows, harmlessly, but walks the cursor backwards.

On the host, from a clone of this repository:

```sh
cd indexer
cp .env.example .env          # SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
docker compose up -d --build  # restarts after a crash or a reboot
docker compose logs -f
```

| Task | Command, in `indexer/` |
|---|---|
| Follow the logs | `docker compose logs -f` |
| Stop, keeping the container | `docker compose stop` |
| Restart | `docker compose restart` |
| Remove | `docker compose down` |
| Update | `git pull && docker compose up -d --build` |

The cursor lives in Supabase and advances only after a window's messages are
written, and writes are idempotent on the block hash. So the indexer can be
killed at any point and restarted anywhere. It stays `CONFIRMATIONS` momentums
behind the frontier, then checks every `POLL_SECONDS`.

On an empty database it starts at `START_HEIGHT`, just before the first post on
mainnet (momentum 1,341,650), and backfills from there. Against a public node at
the default `CONCURRENCY` that takes about an hour. To start from the current
height instead, set the cursor in `indexer_state` before the first run.

| Variable | Default | |
|---|---|---|
| `SUPABASE_URL` | | required, base URL |
| `SUPABASE_SERVICE_ROLE_KEY` | | required; never in the page |
| `ZNN_RPC_URL` | `https://node.zenonhub.io:35997` | HTTP JSON-RPC (35997), not the WebSocket port |
| `START_HEIGHT` | `1341000` | first momentum scanned on an empty database |
| `CONFIRMATIONS` | `6` | |
| `BATCH_SIZE` | `1024` | momentums per RPC call, the node's maximum |
| `CONCURRENCY` | `4` | RPC calls in flight per window |
| `POLL_SECONDS` | `30` | |

Without Docker (Node 24, no build step), from `indexer/`:

```sh
npm ci
npm test
npm start                          # catch up, then poll
npm run once                       # catch up to the frontier and exit, for cron
npm run scan -- 1341000 1345000    # dry run over a range, no Supabase needed
```

## 3. Page

### Locally

A Vite dev server in Docker, reading the Supabase project in the root `.env`:

```sh
cp .env.example .env    # SUPABASE_URL, SUPABASE_ANON_KEY
docker compose up       # http://127.0.0.1:5174
```

Edits under `web/` reload in the browser. Add `?preview=ignite` to the URL on
the dev server to put made-up fuelled entries on top of the list; they never
appear in a build. The form is the real one there too: Tag, Boost and Torch
send whatever Syrius is asked to approve.

### On GitHub Pages

[`.github/workflows/pages.yml`](../.github/workflows/pages.yml) builds `web/` and
deploys it on every push to `master`. Once per repository:

1. **Settings → Pages → Source:** GitHub Actions.
2. **Settings → Secrets and variables → Actions → Variables:** add
   `SUPABASE_URL` and `SUPABASE_ANON_KEY` as repository *variables*, and
   optionally `PAGE_SIZE`. They are variables, not secrets, because both end up
   in the page anyway.

The build uses relative paths and hash routing (`#/?page=2`), so it works at
`user.github.io/zenon-wall/` or on a custom domain without changes.

| Variable | Default | |
|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | | required |
| `VITE_PAGE_SIZE` | `10` | messages per page, newest first |
| `VITE_ZNN_CHAIN_ID` | `1` | the chain the wall reads; the page refuses to post from any other |
| `VITE_EXPLORER` | by chain | `zenonhub` (mainnet's default) or `none` |

The root `.env` names them without the `VITE_` prefix; `docker-compose.yml`
passes them through.

## 4. Check it

- The page shows a message count and **Indexed through** a recent momentum. The
  height moves within a minute while the indexer runs.
- Tag from the page with the Syrius extension, or run
  `znn-cli send <your address> 1 ZNN "ZW Hello"`. The post appears as
  **Confirming**, then as a normal entry once the indexer has it.
- To see fuelled entries without spending ZNN, insert a row with `fuel_kind`,
  `fuel_amount` and `fuel_block` set (a made-up 64-hex hash), look, and delete
  it. The page reads whatever the table holds.
