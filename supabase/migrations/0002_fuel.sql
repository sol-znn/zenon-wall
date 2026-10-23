-- Fuelled posts: a post whose data is `ZW!<hash> <message>` names a donation to
-- Accelerator-Z (ignite) or a burn of ZNN (burn) from the same account. The
-- indexer fills these only when that block checks out (indexer/src/fuel.ts);
-- otherwise the post is stored as a plain one and all three stay null.

alter table public.messages
  add column fuel_kind   text check (fuel_kind in ('ignite', 'burn')),
  -- ZNN in base units, as with amount.
  add column fuel_amount numeric(78, 0),
  -- Unique: one donation or burn backs one post, the first to name it.
  add column fuel_block  text unique check (fuel_block ~ '^[0-9a-f]{64}$'),
  add constraint messages_fuel_whole check (
    (fuel_kind is null) = (fuel_amount is null) and (fuel_kind is null) = (fuel_block is null)
  );
