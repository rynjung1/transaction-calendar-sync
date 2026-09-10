-- Transaction Calendar Sync — initial schema

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

-- Mirrors new Supabase Auth users into public.users.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create table public.plaid_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  item_id text not null unique,
  access_token_encrypted text not null,
  institution_id text,
  institution_name text,
  cursor text,
  status text not null default 'active' check (status in ('active', 'login_required', 'error')),
  created_at timestamptz not null default now()
);

create index plaid_items_user_id_idx on public.plaid_items (user_id);

create table public.synced_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  plaid_item_id uuid not null references public.plaid_items (id) on delete cascade,
  plaid_transaction_id text not null,
  merchant_name text not null,
  amount numeric not null,
  iso_currency_code text,
  category text,
  date date not null,
  datetime timestamptz,
  calendar_event_id text,
  status text not null default 'pending' check (status in ('pending', 'synced', 'failed')),
  created_at timestamptz not null default now(),
  unique (plaid_item_id, plaid_transaction_id)
);

create index synced_transactions_user_id_idx on public.synced_transactions (user_id);

-- Row Level Security: users can only ever read/write their own rows.
-- All writes happen through the backend using the service-role key, which
-- bypasses RLS, so these policies only govern any direct client access.
alter table public.users enable row level security;
alter table public.plaid_items enable row level security;
alter table public.synced_transactions enable row level security;

create policy "users can read their own row"
  on public.users for select
  using (auth.uid() = id);

create policy "users can read their own plaid items"
  on public.plaid_items for select
  using (auth.uid() = user_id);

create policy "users can read their own transactions"
  on public.synced_transactions for select
  using (auth.uid() = user_id);
