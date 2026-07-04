-- Run this once in Supabase SQL Editor (Dashboard → SQL Editor → New query)

create table tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  priority int not null default 1,        -- 0 = penting, 1 = normal
  daily boolean not null default false,   -- tugas harian, reset tiap hari
  status text not null default 'todo',    -- todo | inprogress | done
  done_date date,                         -- tanggal terakhir diselesaikan (buat reset harian)
  created_at timestamptz default now()
);

alter table tasks enable row level security;

-- App personal tanpa login: izinkan semua operasi via anon key.
-- Catatan: siapa pun yang punya URL + anon key bisa edit. Cukup aman
-- untuk personal use selama gak share link repo publik dengan .env.
create policy "allow all" on tasks
  for all using (true) with check (true);

-- Seed tugas awal
insert into tasks (title, priority, daily, status) values
  ('Masukkan baju kotor ke keranjang laundry', 1, true,  'todo'),
  ('Bersihkan kamar',                          1, true,  'todo'),
  ('Update reporting spreadsheet kantor',      0, true,  'todo'),
  ('Antar baju ke laundry store',              1, false, 'todo'),
  ('Kerjaan startup (1 hal paling penting hari ini)', 0, true, 'todo');
