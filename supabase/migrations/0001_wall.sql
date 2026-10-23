-- Zenon Wall: messages written into NoM send blocks whose data starts with "ZW".
--
-- Two roles touch this schema and they never overlap:
--   anon          the SPA on GitHub Pages. Read-only, enforced by RLS below — the
--                 anon key is public by construction, so the policy is the boundary.
--   service_role  the indexer. Bypasses RLS; its key never leaves the indexer host.

create table public.messages (
  -- The send block's hash. A block is written once, so this is also what makes
  -- re-indexing a range idempotent.
  hash               text primary key check (hash ~ '^[0-9a-f]{64}$'),
  momentum_height    bigint      not null,
  momentum_hash      text        not null,
  momentum_timestamp timestamptz not null,
  -- Position of the block inside its momentum, so messages confirmed together
  -- keep chain order.
  block_index        integer     not null,
  address            text        not null,
  to_address         text        not null,
  -- Base units, as a string on the wire: amounts exceed JS number precision.
  amount             numeric(78, 0) not null,
  token_standard     text        not null,
  -- Null for zero-amount sends, where the node returns no token.
  token_symbol       text,
  token_decimals     smallint,
  -- Decoded UTF-8 with the "ZW" prefix removed. Untrusted: people post markup
  -- and script tags on chain. Render as text, never as HTML.
  message            text        not null,
  indexed_at         timestamptz not null default now()
);

create index messages_latest_idx on public.messages (momentum_height desc, block_index desc);

-- How far the indexer has scanned. Public so the wall can say "indexed through
-- momentum N" — the height is on chain anyway.
create table public.indexer_state (
  id         text primary key,
  height     bigint      not null,
  updated_at timestamptz not null default now()
);

alter table public.messages      enable row level security;
alter table public.indexer_state enable row level security;

create policy "messages are public" on public.messages
  for select to anon, authenticated using (true);

create policy "indexer state is public" on public.indexer_state
  for select to anon, authenticated using (true);

-- Explicit grants: newer Supabase projects do not expose new tables to the Data
-- API automatically. No insert/update/delete for anon — only service_role writes.
grant select on public.messages, public.indexer_state to anon, authenticated;
grant all    on public.messages, public.indexer_state to service_role;
