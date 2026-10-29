-- StackSignal — initial schema.
-- Public, shared data: sources, content_items, ingestion_runs (read-only for users, written by the service role).
-- Private data: everything hanging off auth.users / projects, protected by RLS (owner only).

-- ───────────────────────── Users ─────────────────────────

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table public.preferences (
  user_id uuid primary key references auth.users on delete cascade,
  languages text[] not null default '{fr,en}',
  interests text[] not null default '{}',
  excluded_topics text[] not null default '{}',
  hidden_source_ids uuid[] not null default '{}',
  ai_enabled boolean not null default false,
  last_manual_refresh_at timestamptz,
  ai_calls_day date,
  ai_calls_count int not null default 0,
  updated_at timestamptz not null default now()
);

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
    values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));
  insert into public.preferences (user_id) values (new.id);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────── Public catalog ─────────────────────────

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('rss', 'github')),
  key text not null,                      -- feed URL, or lowercased owner/repo
  name text not null,
  site_url text,
  language text not null default 'en',
  tech_keys text[] not null default '{}',
  quality smallint not null default 6 check (quality between 0 and 10),
  is_official boolean not null default false,
  in_catalog boolean not null default false,
  etag text,
  last_modified text,
  last_fetched_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  consecutive_failures int not null default 0,
  next_fetch_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (kind, key)
);
create index sources_next_fetch_idx on public.sources (next_fetch_at);

create table public.content_items (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources on delete cascade,
  external_id text not null,
  canonical_url text not null unique,
  title text not null,
  excerpt text,                           -- short plain-text extract, never the full article
  content_kind text not null default 'news'
    check (content_kind in ('release', 'tutorial', 'tool', 'experience', 'breaking', 'security', 'news')),
  is_prerelease boolean not null default false,
  release_tag text,
  language text,
  published_at timestamptz,               -- null = unknown, never replaced by collected_at
  collected_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  content_hash text not null,
  unique (source_id, external_id)
);
create index content_items_source_collected_idx on public.content_items (source_id, collected_at desc);
create index content_items_published_idx on public.content_items (published_at desc nulls last);

create table public.ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  trigger text not null check (trigger in ('cron', 'cli', 'manual')),
  status text not null default 'running' check (status in ('running', 'completed', 'partial', 'failed')),
  started_at timestamptz not null default now(),
  heartbeat_at timestamptz not null default now(),
  finished_at timestamptz,
  sources_done int not null default 0,
  sources_failed int not null default 0,
  items_new int not null default 0,
  projects_refreshed int not null default 0,
  errors jsonb not null default '[]'
);
-- At most one global run at a time: the second insert fails and acts as a lock.
create unique index ingestion_runs_single_running on public.ingestion_runs ((true)) where status = 'running' and trigger <> 'manual';

-- ───────────────────────── Private: projects ─────────────────────────

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text not null check (char_length(description) between 1 and 2000),
  problem text check (char_length(problem) <= 2000),
  audience text check (char_length(audience) <= 500),
  project_type text not null default 'other'
    check (project_type in ('website', 'saas', 'mobile', 'api', 'internal', 'other')),
  stage text not null default 'idea'
    check (stage in ('idea', 'prototype', 'development', 'production', 'paused')),
  features text[] not null default '{}',
  constraints text check (char_length(constraints) <= 2000),
  notes text check (char_length(notes) <= 10000),
  archived_at timestamptz,
  context_version int not null default 1,
  insights_version int not null default 0,
  insights_refreshed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_owner_idx on public.projects (owner_id);

create table public.project_technologies (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects on delete cascade,
  tech_key text not null check (tech_key ~ '^[a-z0-9][a-z0-9.+-]{0,40}$'),
  display_name text not null check (char_length(display_name) between 1 and 60),
  category text not null check (category in ('frontend', 'backend', 'database', 'infrastructure', 'testing', 'service')),
  status text not null default 'used' check (status in ('used', 'considered', 'exploring')),
  version text check (char_length(version) <= 30),
  unique (project_id, tech_key)
);

create table public.project_sources (
  project_id uuid not null references public.projects on delete cascade,
  source_id uuid not null references public.sources on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, source_id)
);
create index project_sources_source_idx on public.project_sources (source_id);

create table public.project_insights (
  project_id uuid not null references public.projects on delete cascade,
  content_item_id uuid not null references public.content_items on delete cascade,
  score smallint not null check (score between 0 and 100),
  priority text not null check (priority in ('explore', 'watch', 'verify', 'action')),
  why text not null,
  reasons jsonb not null default '[]',
  matched_techs text[] not null default '{}',
  matched_features text[] not null default '{}',
  context_version int not null,
  content_hash text not null,
  ai jsonb,
  ai_context_version int,
  ai_content_hash text,
  computed_at timestamptz not null default now(),
  primary key (project_id, content_item_id)
);
create index project_insights_item_idx on public.project_insights (content_item_id);
create index project_insights_score_idx on public.project_insights (project_id, score desc);

create table public.project_feedback (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects on delete cascade,
  content_item_id uuid not null references public.content_items on delete cascade,
  reason text not null check (reason in ('wrong_topic', 'wrong_level', 'already_known', 'wrong_source')),
  created_at timestamptz not null default now(),
  unique (project_id, content_item_id)
);

create table public.project_resources (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects on delete cascade,
  url text not null check (url ~ '^https?://' and char_length(url) <= 2000),
  title text not null check (char_length(title) between 1 and 300),
  note text check (char_length(note) <= 5000),
  created_at timestamptz not null default now()
);

create table public.project_actions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects on delete cascade,
  content_item_id uuid references public.content_items on delete set null,
  title text not null check (char_length(title) between 1 and 300),
  note text check (char_length(note) <= 5000),
  status text not null default 'to_study' check (status in ('to_study', 'todo', 'done', 'dropped')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index project_actions_project_idx on public.project_actions (project_id);

create table public.user_content_state (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  content_item_id uuid not null references public.content_items on delete cascade,
  is_read boolean not null default false,
  is_favorite boolean not null default false,
  note text check (char_length(note) <= 5000),
  favorited_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, content_item_id)
);

-- ───────────────────────── RLS ─────────────────────────

create function public.owns_project(pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.projects where id = pid and owner_id = (select auth.uid()));
$$;

alter table public.profiles enable row level security;
alter table public.preferences enable row level security;
alter table public.sources enable row level security;
alter table public.content_items enable row level security;
alter table public.ingestion_runs enable row level security;
alter table public.projects enable row level security;
alter table public.project_technologies enable row level security;
alter table public.project_sources enable row level security;
alter table public.project_insights enable row level security;
alter table public.project_feedback enable row level security;
alter table public.project_resources enable row level security;
alter table public.project_actions enable row level security;
alter table public.user_content_state enable row level security;

create policy "own profile" on public.profiles for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "own preferences" on public.preferences for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Public catalog: readable, never writable by users (service role bypasses RLS).
create policy "read sources" on public.sources for select to authenticated using (true);
create policy "read content" on public.content_items for select to authenticated using (true);
create policy "read runs" on public.ingestion_runs for select to authenticated using (true);

create policy "own projects" on public.projects for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "own project technologies" on public.project_technologies for all to authenticated
  using (public.owns_project(project_id)) with check (public.owns_project(project_id));
create policy "own project sources" on public.project_sources for all to authenticated
  using (public.owns_project(project_id)) with check (public.owns_project(project_id));
create policy "own project insights" on public.project_insights for all to authenticated
  using (public.owns_project(project_id)) with check (public.owns_project(project_id));
create policy "own project feedback" on public.project_feedback for all to authenticated
  using (public.owns_project(project_id)) with check (public.owns_project(project_id));
create policy "own project resources" on public.project_resources for all to authenticated
  using (public.owns_project(project_id)) with check (public.owns_project(project_id));
create policy "own project actions" on public.project_actions for all to authenticated
  using (public.owns_project(project_id)) with check (public.owns_project(project_id));

create policy "own content state" on public.user_content_state for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Anonymous visitors get nothing.
revoke all on all tables in schema public from anon;
revoke execute on function public.owns_project(uuid) from anon, public;
grant execute on function public.owns_project(uuid) to authenticated;
