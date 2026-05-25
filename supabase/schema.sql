create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wallets (
  address text primary key,
  user_id uuid references public.users(id) on delete set null,
  wallet_type text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.builders (
  id uuid primary key,
  wallet_address text references public.wallets(address) on delete set null,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agents (
  id uuid primary key,
  builder_id uuid not null,
  name text not null,
  slug text not null unique,
  description text,
  model text not null default 'deepseek-r1',
  status text not null default 'active',
  system_prompt text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.traces (
  id uuid primary key,
  creator_wallet text references public.wallets(address) on delete set null,
  creator_type text not null default 'anonymous',
  market_question text not null,
  asset_symbol text not null,
  verdict jsonb,
  synthesis text not null,
  agent_outputs jsonb not null default '[]'::jsonb,
  premium boolean not null default true,
  unlock_price text,
  unlock_count integer not null default 0,
  transaction_hash text,
  publish_tx_hash text,
  published_to_arc boolean not null default false,
  agent_id uuid not null,
  builder_id uuid not null,
  thesis text,
  reasoning_steps jsonb not null default '[]'::jsonb,
  risks jsonb not null default '[]'::jsonb,
  catalysts jsonb not null default '[]'::jsonb,
  confidence text not null default 'medium',
  position_intent jsonb not null default '{"side":"neutral","timeHorizon":"swing"}'::jsonb,
  raw_model_output text,
  status text not null default 'stored',
  access_tier text not null default 'premium',
  demand_score numeric not null default 0,
  locked boolean not null default true,
  trace_metrics jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.unlocks (
  id uuid primary key default gen_random_uuid(),
  trace_id uuid not null references public.traces(id) on delete cascade,
  wallet_address text references public.wallets(address) on delete set null,
  tx_hash text not null unique,
  amount_paid text not null,
  receipt_id text not null,
  network text not null,
  asset text not null default 'USDC',
  pay_to text,
  settlement_status text not null default 'confirmed',
  facilitator_reference text,
  created_at timestamptz not null default now()
);

create table if not exists public.publishes (
  id uuid primary key default gen_random_uuid(),
  trace_id uuid not null references public.traces(id) on delete cascade,
  wallet_address text not null references public.wallets(address) on delete cascade,
  tx_hash text unique,
  publication_id text not null unique,
  network text not null,
  amount text,
  asset text default 'USDC',
  pay_to text,
  settlement_status text not null default 'confirmed',
  message text not null,
  signature text not null,
  content_digest text not null,
  storage text not null default 'local',
  irys_id text,
  ipfs_cid text,
  published_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  trace_id uuid references public.traces(id) on delete cascade,
  wallet_address text references public.wallets(address) on delete set null,
  tx_hash text not null unique,
  kind text not null,
  amount text,
  asset text,
  network text,
  status text not null default 'confirmed',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.positions (
  id uuid primary key,
  agent_id uuid not null,
  trace_id uuid not null references public.traces(id) on delete cascade,
  asset_symbol text not null,
  side text not null,
  entry_price numeric,
  current_price numeric,
  target_price numeric,
  stop_loss numeric,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  pnl_percent numeric,
  is_open boolean not null default true
);

create table if not exists public.follows (
  id uuid primary key,
  user_id uuid not null,
  agent_id uuid not null,
  position_id uuid references public.positions(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.performance_snapshots (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists traces_created_at_idx on public.traces(created_at desc);
create index if not exists traces_asset_symbol_idx on public.traces(asset_symbol);
create index if not exists traces_premium_idx on public.traces(premium);
create index if not exists traces_unlock_count_idx on public.traces(unlock_count desc);
create index if not exists unlocks_trace_id_idx on public.unlocks(trace_id);
create index if not exists unlocks_wallet_address_idx on public.unlocks(wallet_address);
create unique index if not exists unlocks_trace_wallet_tx_idx on public.unlocks(trace_id, wallet_address, tx_hash);
create index if not exists publishes_trace_id_idx on public.publishes(trace_id);
create index if not exists publishes_wallet_address_idx on public.publishes(wallet_address);
create index if not exists publishes_published_at_idx on public.publishes(published_at desc);
create index if not exists transactions_trace_id_idx on public.transactions(trace_id);
create index if not exists transactions_wallet_address_idx on public.transactions(wallet_address);
create index if not exists positions_opened_at_idx on public.positions(opened_at desc);
create index if not exists positions_is_open_idx on public.positions(is_open);

alter table public.users enable row level security;
alter table public.wallets enable row level security;
alter table public.builders enable row level security;
alter table public.agents enable row level security;
alter table public.traces enable row level security;
alter table public.unlocks enable row level security;
alter table public.publishes enable row level security;
alter table public.transactions enable row level security;
alter table public.positions enable row level security;
alter table public.follows enable row level security;
alter table public.performance_snapshots enable row level security;

insert into public.builders (id, display_name)
values ('00000000-0000-4000-8000-000000000001', 'Vestige')
on conflict (id) do nothing;

insert into public.agents (id, builder_id, name, slug, description, model, status, system_prompt)
values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Macro Agent', 'macro-agent', 'Top-down regime analyst for liquidity, rates, dollar conditions, ETF flows, and cross-asset risk appetite.', 'deepseek-r1', 'active', 'Vestige Macro Agent. Cover only liquidity, rates, dollar, ETF/treasury flows, cross-asset risk appetite, and cycle regime. No chart, social, or protocol-event analysis. Be terse and evidence-weighted.'),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'Sentiment Agent', 'sentiment-agent', 'Narrative and positioning analyst focused on crowd behavior, funding tone, and reflexive market attention.', 'deepseek-r1', 'active', 'Vestige Sentiment Agent. Cover only positioning, funding tone, crowding, fear/euphoria, attention, narrative velocity, and reflexivity. No macro or chart analysis except divergence.'),
  ('10000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', 'Technical Agent', 'technical-agent', 'Market structure analyst for trend, volatility, expected value, drawdown ranges, and execution math.', 'deepseek-r1', 'active', 'Vestige Technical Agent. Cover only trend, momentum, support/resistance, confirmation/invalidation, volatility, and execution math. Derive levels only from supplied live price/high/low.'),
  ('10000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000001', 'Risk Agent', 'risk-agent', 'Downside-first analyst for liquidity, leverage, bridge, protocol, stablecoin, and oracle risk.', 'deepseek-r1', 'active', 'Vestige Risk Agent. Cover only downside: volatility expansion, liquidations, liquidity collapse, tail/correlation risk, stablecoin/bridge/protocol/oracle risk, and operational failure.'),
  ('10000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000001', 'Catalyst Agent', 'catalyst-agent', 'Catalyst analyst for event risk, narrative acceleration, breakout acceptance, invalidation, and execution timing.', 'deepseek-r1', 'active', 'Vestige Catalyst Agent. Cover only forward events: unlocks, launches, upgrades, governance, ETF/regulatory dates, protocol/product deadlines, emissions, and event timing. Penalize undated narratives.')
on conflict (id) do update set
  name = excluded.name,
  slug = excluded.slug,
  description = excluded.description,
  model = excluded.model,
  status = excluded.status,
  system_prompt = excluded.system_prompt,
  updated_at = now();
