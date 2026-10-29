-- StackSignal v2 — reliability, relevance feedback, SQL feed pagination, dependency security, source proposals.
-- Non-destructive: adds tables, columns, indexes and functions. The only altered constraint
-- (project_feedback.reason) is widened, so every existing row stays valid.

create extension if not exists pg_trgm with schema extensions;

-- ───────────────────────── Operations (service role only) ─────────────────────────

-- Small key/value store: GitHub quota window, advisory sync cursor, catalog signature…
create table public.ops_state (
  key text primary key,
  value jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

-- Alert de-duplication: one row per alert key, re-sent only after a cooldown.
create table public.ops_alerts (
  key text primary key,
  first_seen_at timestamptz not null default now(),
  last_sent_at timestamptz,
  last_message text,
  occurrences int not null default 1
);

alter table public.ops_state enable row level security;
alter table public.ops_alerts enable row level security;
-- No policy: only the service role (which bypasses RLS) reads or writes them.

alter table public.sources
  add column last_error_kind text
    check (last_error_kind in ('quota', 'secondary_quota', 'auth', 'permission', 'not_found', 'network', 'server', 'invalid', 'too_large'));

alter table public.ingestion_runs
  add column sources_deferred int not null default 0,
  add column advisories_updated int not null default 0;

-- ───────────────────────── Relevance feedback ─────────────────────────

alter table public.project_feedback drop constraint project_feedback_reason_check;
alter table public.project_feedback add constraint project_feedback_reason_check
  check (reason in ('wrong_topic', 'wrong_level', 'already_known', 'wrong_source', 'not_useful', 'unspecified'));
-- Snapshot of what the feedback was about, so adjustments stay explainable even if the item changes.
alter table public.project_feedback
  add column tech_keys text[] not null default '{}',
  add column source_id uuid references public.sources on delete set null;
create index project_feedback_project_idx on public.project_feedback (project_id);

-- Signature of everything that shapes an analysis besides the project context
-- (ranking rules, technology catalog/aliases, source catalog). A mismatch triggers a background recompute.
alter table public.projects add column ranking_signature text;

alter table public.preferences add column visual_effects boolean not null default true;

-- ───────────────────────── Feed: filtering, search, sort and keyset pagination in SQL ─────────────────────────

create index content_items_title_trgm_idx on public.content_items using gin (title extensions.gin_trgm_ops);
create index content_items_excerpt_trgm_idx on public.content_items using gin (excerpt extensions.gin_trgm_ops);
create index content_items_kind_idx on public.content_items (content_kind);

-- One row per content item visible to the caller (RLS applies: security invoker), with the concerned projects.
create function public.feed_items(
  p_project uuid default null,
  p_tech text default null,
  p_kind text default null,
  p_source uuid default null,
  p_since timestamptz default null,
  p_read text default null,
  p_q text default null
) returns table (
  id uuid,
  title text,
  canonical_url text,
  excerpt text,
  content_kind text,
  section text,
  is_prerelease boolean,
  release_tag text,
  published_at timestamptz,
  sort_date timestamptz,
  source_id uuid,
  source_name text,
  language text,
  best_score int,
  projects jsonb,
  is_read boolean,
  is_favorite boolean
)
language sql stable security invoker set search_path = '' as $$
  with ins as (
    select pi.content_item_id, pi.project_id, pi.score, pi.priority, pi.why, pi.matched_techs, p.name
    from public.project_insights pi
    join public.projects p on p.id = pi.project_id
    where ((p_project is null and p.archived_at is null) or pi.project_id = p_project)
      and (p_tech is null or p_tech = any (pi.matched_techs))
  )
  select
    c.id, c.title, c.canonical_url, c.excerpt, c.content_kind,
    -- Three separate sections: recent news, security information, background resources.
    case when c.content_kind = 'security' then 'security' when c.content_kind in ('release', 'breaking', 'news') then 'news' else 'background' end as section,
    c.is_prerelease, c.release_tag, c.published_at,
    coalesce(c.published_at, '-infinity'::timestamptz) as sort_date,
    c.source_id, s.name, c.language,
    max(i.score)::int as best_score,
    jsonb_agg(jsonb_build_object('projectId', i.project_id, 'projectName', i.name, 'score', i.score, 'priority', i.priority, 'why', i.why, 'matchedTechs', i.matched_techs) order by i.score desc),
    coalesce(st.is_read, false), coalesce(st.is_favorite, false)
  from ins i
  join public.content_items c on c.id = i.content_item_id
  left join public.sources s on s.id = c.source_id
  left join public.user_content_state st on st.content_item_id = c.id and st.user_id = (select auth.uid())
  where (p_kind is null or c.content_kind = p_kind)
    and (p_source is null or c.source_id = p_source)
    and (p_since is null or c.published_at >= p_since)
    and (p_q is null or c.title ilike '%' || p_q || '%' or c.excerpt ilike '%' || p_q || '%')
    and (p_read is null or (p_read = 'read') = coalesce(st.is_read, false))
  group by c.id, s.name, st.is_read, st.is_favorite
$$;


-- Keyset page over feed_items. Relevance order: (score, date, id); date order: (date, id). id breaks ties,
-- so a page boundary is always well defined. p_exclude removes items already shown above the feed.
create function public.feed_page(
  p_section text,
  p_sort text,
  p_limit int,
  p_exclude uuid[] default '{}',
  p_after_score int default null,
  p_after_date timestamptz default null,
  p_after_id uuid default null,
  p_project uuid default null,
  p_tech text default null,
  p_kind text default null,
  p_source uuid default null,
  p_since timestamptz default null,
  p_read text default null,
  p_q text default null
) returns table (
  id uuid, title text, canonical_url text, excerpt text, content_kind text, section text, is_prerelease boolean,
  release_tag text, published_at timestamptz, sort_date timestamptz, source_id uuid, source_name text, language text,
  best_score int, projects jsonb, is_read boolean, is_favorite boolean
)
language sql stable security invoker set search_path = '' as $$
  select f.*
  from public.feed_items(p_project, p_tech, p_kind, p_source, p_since, p_read, p_q) f
  where f.section = p_section
    and not (f.id = any (coalesce(p_exclude, '{}')))
    and (
      p_after_id is null
      or (case when p_sort = 'date' then 0 else f.best_score end, f.sort_date, f.id)
         < (case when p_sort = 'date' then 0 else coalesce(p_after_score, 0) end, p_after_date, p_after_id)
    )
  order by case when p_sort = 'date' then 0 else f.best_score end desc, f.sort_date desc, f.id desc
  limit least(greatest(p_limit, 1), 100)
$$;

revoke execute on function public.feed_items(uuid, text, text, uuid, timestamptz, text, text) from anon, public;
grant execute on function public.feed_items(uuid, text, text, uuid, timestamptz, text, text) to authenticated;
revoke execute on function public.feed_page(text, text, int, uuid[], int, timestamptz, uuid, uuid, text, text, uuid, timestamptz, text, text) from anon, public;
grant execute on function public.feed_page(text, text, int, uuid[], int, timestamptz, uuid, uuid, text, text, uuid, timestamptz, text, text) to authenticated;

-- ───────────────────────── Dependency inventory & security advisories ─────────────────────────

-- A dated, immutable import of a manifest or lockfile. Newer imports never erase older ones.
create table public.dependency_snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects on delete cascade,
  origin text not null check (origin in ('package.json', 'package-lock.json')),
  file_name text check (char_length(file_name) <= 200),
  lockfile_version smallint,
  imported_at timestamptz not null default now(),
  excluded_patterns text[] not null default '{}',
  stats jsonb not null default '{}',
  analysis_status text not null default 'pending' check (analysis_status in ('pending', 'complete', 'incomplete', 'failed')),
  analysis_error text check (char_length(analysis_error) <= 500),
  analyzed_at timestamptz
);
create index dependency_snapshots_project_idx on public.dependency_snapshots (project_id, imported_at desc);

create table public.dependency_entries (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.dependency_snapshots on delete cascade,
  project_id uuid not null references public.projects on delete cascade,
  name text not null check (char_length(name) between 1 and 214),
  declared text check (char_length(declared) <= 300),     -- spec as written (range, tag…); URLs are reduced to their kind
  version text check (char_length(version) <= 100),      -- exact or resolved version; null when unknown
  resolution text not null check (resolution in ('exact', 'range', 'resolved', 'local', 'alias', 'workspace', 'git', 'url', 'tag', 'unresolved')),
  is_direct boolean not null default false,
  scope text not null default 'unknown' check (scope in ('prod', 'dev', 'optional', 'peer', 'unknown')),
  excluded boolean not null default false               -- private package: never sent to the advisory service
);
create index dependency_entries_snapshot_idx on public.dependency_entries (snapshot_id);
create index dependency_entries_name_idx on public.dependency_entries (name);

-- Public advisory mirror (GitHub reviewed advisories, npm ecosystem). Written by the service role only.
create table public.security_advisories (
  ghsa_id text primary key,
  cve_id text,
  summary text not null,
  severity text not null default 'unknown',
  html_url text not null,
  source text not null default 'github-reviewed',
  packages text[] not null default '{}',
  vulnerabilities jsonb not null default '[]',   -- [{ package, range, patched }]
  published_at timestamptz,
  updated_at timestamptz,
  withdrawn_at timestamptz,
  fetched_at timestamptz not null default now()
);
create index security_advisories_packages_idx on public.security_advisories using gin (packages);

-- Package names already looked up (service role only): avoids re-querying GitHub on every import,
-- and is the list the scheduler re-checks for modified / withdrawn advisories.
create table public.advisory_package_checks (
  name text primary key,
  checked_at timestamptz not null default now()
);
alter table public.advisory_package_checks enable row level security;

-- Deterministic comparison results. Rows are never rewritten: a recomputation supersedes the previous ones,
-- so the history of conclusions survives corrected or withdrawn advisories.
create table public.dependency_findings (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.dependency_snapshots on delete cascade,
  project_id uuid not null references public.projects on delete cascade,
  ghsa_id text not null references public.security_advisories,
  package text not null,
  version text,
  declared text,
  is_direct boolean not null default false,
  scope text not null default 'unknown',
  status text not null check (status in ('affected', 'not_affected', 'unknown_version', 'incomplete', 'withdrawn')),
  matched_range text,
  patched jsonb not null default '[]',            -- [{ range, patched, sameMajor }]
  advisory_updated_at timestamptz,
  computed_at timestamptz not null default now(),
  superseded_at timestamptz
);
create index dependency_findings_snapshot_idx on public.dependency_findings (snapshot_id) where superseded_at is null;
create index dependency_findings_project_idx on public.dependency_findings (project_id, computed_at desc);

-- User choice to hide an alert. Separate from findings so it survives recomputation; always listed with its reason.
create table public.finding_dismissals (
  project_id uuid not null references public.projects on delete cascade,
  ghsa_id text not null,
  package text not null,
  reason text not null check (char_length(reason) between 1 and 300),
  created_at timestamptz not null default now(),
  primary key (project_id, ghsa_id, package)
);

alter table public.dependency_snapshots enable row level security;
alter table public.dependency_entries enable row level security;
alter table public.security_advisories enable row level security;
alter table public.dependency_findings enable row level security;
alter table public.finding_dismissals enable row level security;

create policy "own snapshots" on public.dependency_snapshots for all to authenticated
  using (public.owns_project(project_id)) with check (public.owns_project(project_id));
create policy "own entries" on public.dependency_entries for all to authenticated
  using (public.owns_project(project_id)) with check (public.owns_project(project_id));
create policy "own findings" on public.dependency_findings for all to authenticated
  using (public.owns_project(project_id)) with check (public.owns_project(project_id));
create policy "own dismissals" on public.finding_dismissals for all to authenticated
  using (public.owns_project(project_id)) with check (public.owns_project(project_id));
create policy "read advisories" on public.security_advisories for select to authenticated using (true);

-- ───────────────────────── Source proposals & moderation ─────────────────────────

create table public.app_admins (
  user_id uuid primary key references auth.users on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.app_admins enable row level security;
-- No policy: membership is managed with SQL by an operator (see README « Modération »).

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.app_admins where user_id = (select auth.uid()));
$$;
revoke execute on function public.is_admin() from anon, public;
grant execute on function public.is_admin() to authenticated;

create table public.source_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  url text not null check (url ~ '^https://' and char_length(url) <= 2000),
  language text not null check (language in ('fr', 'en', 'other')),
  topics text[] not null default '{}' check (cardinality(topics) <= 10),
  justification text check (char_length(justification) <= 1000),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  review_note text check (char_length(review_note) <= 1000),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users on delete set null,
  validation jsonb,
  created_at timestamptz not null default now()
);
create index source_proposals_user_idx on public.source_proposals (user_id, created_at desc);
create index source_proposals_status_idx on public.source_proposals (status, created_at);
alter table public.source_proposals enable row level security;

create policy "read own or moderate" on public.source_proposals for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
-- Authors only create pending proposals without review data, and cannot edit them afterwards.
create policy "propose" on public.source_proposals for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'pending' and review_note is null and reviewed_at is null and reviewed_by is null and validation is null);
create policy "moderate" on public.source_proposals for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

revoke all on all tables in schema public from anon;
