-- =========================================================
-- Eternalgy 到期提醒系统 · Supabase 一次性设定
-- 用法：Supabase → SQL Editor → New query → 全部贴上 → Run
-- 记得把最下面的 YOUR_EMAIL@eternalgy.my 换成你自己登入用的 email
-- =========================================================

-- 1) 管理员名单（只有这里的 email 可以新增 / 修改 / 删除）
create table if not exists public.app_admins (
  email text primary key
);
alter table public.app_admins enable row level security;
drop policy if exists "admins readable" on public.app_admins;
create policy "admins readable" on public.app_admins
  for select to authenticated using (true);

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.app_admins
    where lower(email) = lower(auth.jwt() ->> 'email')
  );
$$;

-- 2) 记录表（车险、Road Tax、证书、执照……）
create table if not exists public.records (
  id              uuid primary key default gen_random_uuid(),
  category        text not null,
  title           text not null,
  holder          text,              -- 车牌 / 持有人
  ref_no          text,              -- 保单号 / 证件号码
  issue_date      date,
  expiry_date     date not null,
  notes           text,
  files           jsonb not null default '[]'::jsonb,
  history         jsonb not null default '[]'::jsonb,
  notified_stage  text,              -- 系统自用：上次发 WhatsApp 的阶段
  archived        boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
alter table public.records enable row level security;

drop policy if exists "staff can read"  on public.records;
drop policy if exists "admin can insert" on public.records;
drop policy if exists "admin can update" on public.records;
drop policy if exists "admin can delete" on public.records;
create policy "staff can read"   on public.records for select to authenticated using (true);
create policy "admin can insert" on public.records for insert to authenticated with check (public.is_admin());
create policy "admin can update" on public.records for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin can delete" on public.records for delete to authenticated using (public.is_admin());

grant select on public.app_admins to authenticated;
grant select, insert, update, delete on public.records to authenticated;
grant all on public.records to service_role;
grant all on public.app_admins to service_role;
grant execute on function public.is_admin() to authenticated;

-- 3) 文件存放区（私人，不公开）
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

drop policy if exists "staff can view files"   on storage.objects;
drop policy if exists "admin can upload files" on storage.objects;
drop policy if exists "admin can update files" on storage.objects;
drop policy if exists "admin can delete files" on storage.objects;
create policy "staff can view files"   on storage.objects for select to authenticated using (bucket_id = 'documents');
create policy "admin can upload files" on storage.objects for insert to authenticated with check (bucket_id = 'documents' and public.is_admin());
create policy "admin can update files" on storage.objects for update to authenticated using (bucket_id = 'documents' and public.is_admin());
create policy "admin can delete files" on storage.objects for delete to authenticated using (bucket_id = 'documents' and public.is_admin());

-- 4) 把你自己设为管理员 ↓↓↓ 换成你的 email
insert into public.app_admins (email) values ('YOUR_EMAIL@eternalgy.my')
on conflict do nothing;
