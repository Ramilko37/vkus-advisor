alter table public.profiles
  add column if not exists lenta_store_id text,
  add column if not exists lenta_store_name text,
  add column if not exists lenta_store_address text;
