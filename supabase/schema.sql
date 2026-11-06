-- Filth Manor club: accounts, diary, watchlists, follows, lists, likes and comments.
-- Run this once in the Supabase SQL editor (Dashboard -> SQL Editor -> New query -> paste -> Run).
-- It is safe to read first: every table has row-level security, so the public anon key in
-- data/club.json can only do what the policies below allow.

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text check (char_length(display_name) <= 40),
  bio text check (char_length(bio) <= 300),
  created_at timestamptz not null default now()
);

-- a profile appears when an account is created; the username travels in the sign-up's user metadata
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username) values (new.id, lower(new.raw_user_meta_data ->> 'username'));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- lets the sign-up form say "taken" before it tries; reveals nothing but yes or no
create function public.username_available(name text) returns boolean
language sql stable security definer set search_path = public as $$
  select lower(name) ~ '^[a-z0-9_]{3,20}$' and not exists (select 1 from public.profiles where username = lower(name));
$$;
grant execute on function public.username_available(text) to anon, authenticated;

-- ---------------------------------------------------------------- the diary
create table public.logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  subject_key text not null,
  kind text not null check (kind in ('movies', 'anime', 'manga', 'books', 'music', 'games')),
  title text not null check (char_length(title) <= 200),
  creator text check (char_length(creator) <= 200),
  year int check (year between 0 and 2200),
  cover text check (char_length(cover) <= 600),
  rating smallint check (rating between 1 and 10),          -- half stars: 1 is half a star, 10 is five
  liked boolean not null default false,
  review text check (char_length(review) <= 5000),
  spoilers boolean not null default false,
  logged_on date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index logs_user_idx on public.logs (user_id, created_at desc);
create index logs_subject_idx on public.logs (subject_key, created_at desc);

create function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger logs_touch before update on public.logs for each row execute function public.touch_updated_at();

create table public.watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  subject_key text not null,
  kind text not null check (kind in ('movies', 'anime', 'manga', 'books', 'music', 'games')),
  title text not null check (char_length(title) <= 200),
  creator text check (char_length(creator) <= 200),
  year int check (year between 0 and 2200),
  cover text check (char_length(cover) <= 600),
  created_at timestamptz not null default now(),
  unique (user_id, subject_key)
);

-- ---------------------------------------------------------------- follows
create table public.follows (
  follower_id uuid not null default auth.uid() references public.profiles on delete cascade,
  followee_id uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);

-- ---------------------------------------------------------------- lists
create table public.lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  description text check (char_length(description) <= 1000),
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists on delete cascade,
  position int not null default 0,
  subject_key text not null,
  kind text not null check (kind in ('movies', 'anime', 'manga', 'books', 'music', 'games')),
  title text not null check (char_length(title) <= 200),
  creator text check (char_length(creator) <= 200),
  year int check (year between 0 and 2200),
  cover text check (char_length(cover) <= 600),
  note text check (char_length(note) <= 300),
  unique (list_id, subject_key)
);

-- ---------------------------------------------------------------- likes and comments (on logs and lists)
create table public.likes (
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  target_type text not null check (target_type in ('log', 'list')),
  target_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, target_type, target_id)
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  target_type text not null check (target_type in ('log', 'list')),
  target_id uuid not null,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index comments_target_idx on public.comments (target_type, target_id, created_at);

-- a log or list can be seen by everyone; a private list only by its owner
create function public.can_see(t text, id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case t
    when 'log' then exists (select 1 from public.logs where logs.id = can_see.id)
    when 'list' then exists (select 1 from public.lists where lists.id = can_see.id and (is_public or user_id = auth.uid()))
    else false end;
$$;

-- likes and comments point at a log or list without a foreign key, so clear them when it goes
create function public.clear_target() returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.likes where target_type = tg_argv[0] and target_id = old.id;
  delete from public.comments where target_type = tg_argv[0] and target_id = old.id;
  return old;
end $$;
create trigger logs_clear after delete on public.logs for each row execute function public.clear_target('log');
create trigger lists_clear after delete on public.lists for each row execute function public.clear_target('list');

-- ratings across everyone, per subject
create view public.subject_stats with (security_invoker = true) as
  select subject_key, count(*)::int as logs, count(rating)::int as n, avg(rating)::float8 as avg, (count(*) filter (where liked))::int as liked
  from public.logs group by subject_key;

-- ---------------------------------------------------------------- row-level security
alter table public.profiles enable row level security;
alter table public.logs enable row level security;
alter table public.watchlist enable row level security;
alter table public.follows enable row level security;
alter table public.lists enable row level security;
alter table public.list_items enable row level security;
alter table public.likes enable row level security;
alter table public.comments enable row level security;

create policy "anyone can read profiles" on public.profiles for select using (true);
create policy "you change your own profile" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy "anyone can read logs" on public.logs for select using (true);
create policy "you write your own logs" on public.logs for insert with check (user_id = auth.uid());
create policy "you change your own logs" on public.logs for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "you delete your own logs" on public.logs for delete using (user_id = auth.uid());

create policy "anyone can read watchlists" on public.watchlist for select using (true);
create policy "you add to your own watchlist" on public.watchlist for insert with check (user_id = auth.uid());
create policy "you remove from your own watchlist" on public.watchlist for delete using (user_id = auth.uid());

create policy "anyone can read follows" on public.follows for select using (true);
create policy "you follow as yourself" on public.follows for insert with check (follower_id = auth.uid());
create policy "you unfollow as yourself" on public.follows for delete using (follower_id = auth.uid());

create policy "public lists and your own are readable" on public.lists for select using (is_public or user_id = auth.uid());
create policy "you make your own lists" on public.lists for insert with check (user_id = auth.uid());
create policy "you change your own lists" on public.lists for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "you delete your own lists" on public.lists for delete using (user_id = auth.uid());

create policy "items follow their list's visibility" on public.list_items for select
  using (exists (select 1 from public.lists l where l.id = list_id and (l.is_public or l.user_id = auth.uid())));
create policy "you add to your own lists" on public.list_items for insert
  with check (exists (select 1 from public.lists l where l.id = list_id and l.user_id = auth.uid()));
create policy "you change your own list items" on public.list_items for update
  using (exists (select 1 from public.lists l where l.id = list_id and l.user_id = auth.uid()))
  with check (exists (select 1 from public.lists l where l.id = list_id and l.user_id = auth.uid()));
create policy "you remove from your own lists" on public.list_items for delete
  using (exists (select 1 from public.lists l where l.id = list_id and l.user_id = auth.uid()));

create policy "likes are readable where the target is" on public.likes for select using (public.can_see(target_type, target_id));
create policy "you like as yourself" on public.likes for insert with check (user_id = auth.uid() and public.can_see(target_type, target_id));
create policy "you unlike as yourself" on public.likes for delete using (user_id = auth.uid());

create policy "comments are readable where the target is" on public.comments for select using (public.can_see(target_type, target_id));
create policy "you comment as yourself" on public.comments for insert with check (user_id = auth.uid() and public.can_see(target_type, target_id));
create policy "you delete your own comments" on public.comments for delete using (user_id = auth.uid());
