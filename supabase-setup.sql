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

-- ---------------------------------------------------------------------
-- Grup patungan (tabelnya dibikin lewat dashboard, bukan file ini).
--
-- group_members udah punya policy SELECT ("member read members"),
-- INSERT ("self join") dan UPDATE ("self update member") — tapi belum
-- DELETE. Tanpa policy di bawah, RLS nolak hapus baris keanggotaan dan
-- tombol "Keluar dari grup" selalu gagal (0 baris kehapus, tanpa error).
create policy "self leave" on public.group_members
  for delete using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- Peta 24 jam: jam mulai & jam selesai per kegiatan.
--
-- Disimpen sebagai menit dari tengah malam (0–1439) biar gampang dihitung
-- dan gak kena urusan timezone. Boleh null — kegiatan yang gak punya jam
-- pasti (misal "scroll 2 jam") tetep cuma nyimpen durasinya di `hours`.
-- Kalau end_min < start_min berarti kegiatannya lewat tengah malam.
alter table public.time_blocks
  add column if not exists start_min int,
  add column if not exists end_min int;

alter table public.time_blocks
  add constraint time_blocks_start_min_range check (start_min between 0 and 1439) not valid,
  add constraint time_blocks_end_min_range   check (end_min   between 0 and 1439) not valid;

-- ---------------------------------------------------------------------
-- Tiap "bikin cape" punya solusinya sendiri: satu buat nahan sekarang,
-- satu buat ngeberesin akarnya.
alter table public.drains
  add column if not exists solusi_sementara text,
  add column if not exists solusi_panjang text;

-- Catatan: versi sebelumnya sempet nambah kolom `kind` buat misahin daftar
-- solusi. Sekarang udah gak kepake. Aman dibiarin, atau dibuang:
--   alter table public.drains drop column if exists kind;

-- Seed tugas awal
insert into tasks (title, priority, daily, status) values
  ('Masukkan baju kotor ke keranjang laundry', 1, true,  'todo'),
  ('Bersihkan kamar',                          1, true,  'todo'),
  ('Update reporting spreadsheet kantor',      0, true,  'todo'),
  ('Antar baju ke laundry store',              1, false, 'todo'),
  ('Kerjaan startup (1 hal paling penting hari ini)', 0, true, 'todo');
