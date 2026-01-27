-- 建立 project 資料表
create table public.projects (
  id uuid default gen_random_uuid() primary key,
  project_id text not null,
  name text not null,
  start_date timestamptz,
  end_date timestamptz,
  coordinates jsonb default '[]'::jsonb,
  light_ids jsonb default '[]'::jsonb,
  scenes jsonb default '[]'::jsonb,
  is_active boolean default false,
  lat_lon text,
  owner_emails jsonb default '[]'::jsonb,
  light_configs text,
  created_at timestamptz default now()
);

-- 在 project_id 上建立索引以加快查詢速度
create index projects_project_id_idx on public.projects (project_id);

-- 啟用 Row Level Security (RLS)
alter table public.projects enable row level security;

-- 建立允許公開讀取的策略 (如果儀表板需要公開讀取)
-- 或者根據需求進行限制。目前允許公開讀取以符合現有行為。
create policy "Allow public read access"
  on public.projects
  for select
  using (true);

-- 建立允許匿名使用者進行 新增/更新/刪除 的策略
-- 注意：實際運作時您應該設定 Auth 或使用 Service Role Key 進行後端操作。
-- 對於遷移腳本，我們將使用 SERVICE ROLE KEY 或這條允許匿名的策略。
create policy "Allow all access for anon (TEMPORARY FOR MIGRATION)"
  on public.projects
  for all
  using (true)
  with check (true);
