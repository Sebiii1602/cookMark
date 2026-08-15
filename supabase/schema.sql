-- cookMark — Datenbank-Schema
-- Im Supabase-Dashboard unter „SQL Editor“ einfügen und ausführen (Run).
--
-- Hinweis zu user_id: Der Client schickt sie nie mit, `default auth.uid()`
-- setzt sie. Die Edge Function läuft mit dem Service-Role-Key (dort ist
-- auth.uid() null) und muss user_id deshalb ausdrücklich mitgeben.

create table if not exists public.recipes (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  -- tiktok | instagram | web | image | text | manual
  source_type text not null default 'manual',
  source_url text,
  source_author text,
  -- Pfad im Storage-Bucket; die CDN-URLs von Insta/TikTok laufen ab
  image_path text,
  servings int,
  total_minutes int,
  -- complete | needs_recipe („im Post stand kein Rezept“)
  status text not null default 'complete',
  lang text,
  -- Original-Caption: der Beleg für alles Extrahierte
  raw_text text,
  ingredients jsonb not null default '[]'::jsonb,
  steps jsonb not null default '[]'::jsonb,
  tags jsonb not null default '[]'::jsonb,
  nutrition jsonb,
  -- Deine eigene Fassung. Das Original in den Spalten oben bleibt unangetastet.
  variant jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cook_logs (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  cooked_on date not null,
  -- 1 nie wieder | 2 ok | 3 nochmal
  rating smallint check (rating between 1 and 3),
  -- die Gegenprobe zum „30 Min“-Tag
  actual_minutes int,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shopping_items (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name_key text not null,
  name_display text not null,
  qty numeric,
  unit text,
  checked boolean not null default false,
  from_recipe_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Import-Aufträge. Schreibt nur der Server (Edge Function, auch vom
-- iOS-Kurzbefehl); der Client liest sie nur — deshalb kein Push aus der Outbox.
create table if not exists public.imports (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- url | text | image
  kind text not null,
  payload text,
  -- queued | running | done | failed | needs_input
  status text not null default 'queued',
  error text,
  recipe_id uuid references public.recipes (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Row Level Security: jede Zeile gehört genau einem Account —
-- die öffentliche URL allein gibt nichts preis.
alter table public.recipes enable row level security;
alter table public.cook_logs enable row level security;
alter table public.shopping_items enable row level security;
alter table public.imports enable row level security;

create policy "own recipes" on public.recipes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own cook_logs" on public.cook_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own shopping_items" on public.shopping_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own imports" on public.imports
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Für den Pull-Sync (updated_at-Cursor)
create index if not exists recipes_updated_at_idx on public.recipes (updated_at);
create index if not exists cook_logs_updated_at_idx on public.cook_logs (updated_at);
create index if not exists shopping_items_updated_at_idx on public.shopping_items (updated_at);
create index if not exists imports_updated_at_idx on public.imports (updated_at);
create index if not exists cook_logs_recipe_idx on public.cook_logs (recipe_id);

-- Rezeptbilder. Privat: der Client holt sie über signierte URLs,
-- damit nichts unter einer erratbaren Adresse offen im Netz liegt.
insert into storage.buckets (id, name, public)
values ('recipe-images', 'recipe-images', false)
on conflict (id) do nothing;

-- Jeder sieht nur seinen eigenen Ordner: recipe-images/<user_id>/<datei>
create policy "own recipe images" on storage.objects
  for all using (
    bucket_id = 'recipe-images' and (storage.foldername(name))[1] = auth.uid()::text
  ) with check (
    bucket_id = 'recipe-images' and (storage.foldername(name))[1] = auth.uid()::text
  );
