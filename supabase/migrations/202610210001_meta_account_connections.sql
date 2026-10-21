create table if not exists public.meta_oauth_states (
  state_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists meta_oauth_states_expiry_idx
  on public.meta_oauth_states (expires_at);

create table if not exists public.meta_social_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  facebook_page_id text not null,
  facebook_page_name text not null,
  instagram_business_id text,
  instagram_username text,
  selected boolean not null default false,
  token_ciphertext text not null,
  token_iv text not null,
  token_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, facebook_page_id)
);

create index if not exists meta_social_connections_user_idx
  on public.meta_social_connections (user_id);

alter table public.meta_oauth_states enable row level security;
alter table public.meta_social_connections enable row level security;

revoke all on public.meta_oauth_states from anon, authenticated;
revoke all on public.meta_social_connections from anon, authenticated;
grant all on public.meta_oauth_states to service_role;
grant all on public.meta_social_connections to service_role;

