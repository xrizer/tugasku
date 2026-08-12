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
-- Peta 24 jam ikut ke link publik (?share=<user_id>).
--
-- Sama polanya kayak tasks.is_public: defaultnya privat, jadi gak ada yang
-- bocor sampe tombol matanya dinyalain. Policy SELECT di RLS itu di-OR,
-- jadi policy ini nempel di sebelah policy pemiliknya — bukan gantiin.
alter table public.time_blocks
  add column if not exists is_public boolean not null default false;

create policy "public read time blocks" on public.time_blocks
  for select using (is_public = true);

-- ---------------------------------------------------------------------
-- Strip mood 7 hari ikut ke link publik.
--
-- Bedanya sama time_blocks: policy-nya dibatesin tanggal juga. Jadi walau
-- semua baris ditandain publik, yang kebaca dari luar tetep cuma 7 hari
-- terakhir — riwayat mood setahun ke belakang gak ikut kebuka cuma gara-gara
-- saklarnya nyala.
alter table public.moods
  add column if not exists is_public boolean not null default false;

create policy "public read recent moods" on public.moods
  for select using (is_public = true and date >= current_date - 6);

-- ---------------------------------------------------------------------
-- Jatah perhatian: peran yang lu jalanin, plus berapa berat tiap harinya.
--
--   roles.target  -> persen perhatian yang LU MAU dikasih ke peran itu
--   role_days     -> satu baris per peran per hari, weight 1..3
--                    (1 dikit, 2 sedang, 3 penuh)
--
-- Sengaja ngitung "berapa hari dan seberat apa", bukan jam. Nyatet jam itu
-- ribet dan bakal ditinggalin; sekali ketuk per hari masih kekejar, dan yang
-- dicari emang perbandingannya, bukan angka absolutnya.
create table if not exists public.roles (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null,
  target     int  not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.role_days (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  date    date not null,
  weight  int  not null default 1 check (weight between 1 and 3),
  unique (user_id, role_id, date)
);

alter table public.roles     enable row level security;
alter table public.role_days enable row level security;

create policy "own roles" on public.roles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own role days" on public.role_days
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- Nandain pengeluaran yang asalnya dari tagihan Rutin.
--
-- Kalender di tab Catat ngewarnain tanggal dibanding rata-rata harian. Sekali
-- bayar kosan nominalnya jauh di atas belanja harian, jadi rata-ratanya
-- ketarik dan semua hari biasa keliatan sama aja. Baris yang ditandain
-- is_rutin tetep keitung di struk dan total bulanan — cuma gak ikut ngewarnain
-- kalender.
alter table public.expenses
  add column if not exists is_rutin boolean not null default false;

-- Backfill sekali jalan buat baris lama. `markPaid` selalu nulis note persis
-- sama nama tagihannya, jadi kecocokan nama ini cukup akurat. Baris yang
-- notenya udah keburu diedit manual gak ketangkep — tandain sendiri kalau ada.
update public.expenses e
   set is_rutin = true
 where coalesce(e.kind, 'out') = 'out'
   and e.is_rutin = false
   and exists (
     select 1 from public.fixed_costs f
      where f.user_id = e.user_id
        and f.name = e.note
   );

-- ---------------------------------------------------------------------
-- Pindah dana antar sumber (misal danamon -> cash).
--
-- Dicatet di tabel expenses juga, tapi kind-nya 'pindah' — bukan 'out' dan
-- bukan 'in'. Semua hitungan keluar/masuk nyaring pakai kind, jadi pindah
-- dana otomatis gak keitung sebagai pengeluaran maupun pemasukan. Yang
-- kegeser cuma saldo di tab Aset: berkurang di `source`, nambah di
-- `to_source`.
alter table public.expenses
  add column if not exists to_source text;

-- ---------------------------------------------------------------------
-- Riwayat total aset per bulan, buat grafik batang di tab Aset.
--
-- Baris ditulis pas halaman Aset dibuka, satu per bulan. Artinya grafiknya
-- keisi maju ke depan — bulan-bulan sebelum tabel ini ada emang gak kesimpen
-- di mana pun, jadi gak bisa direka ulang.
create table if not exists public.asset_snapshots (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  month      text not null,                          -- 'YYYY-MM'
  total      bigint not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, month)
);

alter table public.asset_snapshots enable row level security;

create policy "own asset snapshots" on public.asset_snapshots
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- Tab Barang: bukan cuma "barangnya di mana", tapi "barangnya gimana".
--
--   condition -> 'oke' | 'aus' | 'parah'; ini beda dari `status` yang ngurusin
--                posisi barang (ada / dipinjem / rusak / servis / ilang)
--   last_used -> tanggal terakhir dipake, buat nandain barang yang nganggur
--   care_note -> apa yang mesti dilakuin ke barangnya (cuci, servis, jual)
alter table public.items
  add column if not exists condition text not null default 'oke',
  add column if not exists last_used date,
  add column if not exists care_note text;

-- ---------------------------------------------------------------------
-- Tiap "bikin cape" punya solusinya sendiri: satu buat nahan sekarang,
-- satu buat ngeberesin akarnya.
alter table public.drains
  add column if not exists solusi_sementara text,
  add column if not exists solusi_panjang text;

-- Catatan: versi sebelumnya sempet nambah kolom `kind` buat misahin daftar
-- solusi. Sekarang udah gak kepake. Aman dibiarin, atau dibuang:
--   alter table public.drains drop column if exists kind;

-- ---------------------------------------------------------------------
-- Habit ada dua rasa:
--   'bad'  -> yang lagi dikurangin; poin dari lamanya bersih
--   'good' -> yang lagi dibiasain; poin tiap hari dikerjain
-- Dua-duanya nyatet ke habit_events. Baris lama otomatis jadi 'bad'.
alter table public.habits
  add column if not exists kind text not null default 'bad';

-- Seed tugas awal
insert into tasks (title, priority, daily, status) values
  ('Masukkan baju kotor ke keranjang laundry', 1, true,  'todo'),
  ('Bersihkan kamar',                          1, true,  'todo'),
  ('Update reporting spreadsheet kantor',      0, true,  'todo'),
  ('Antar baju ke laundry store',              1, false, 'todo'),
  ('Kerjaan startup (1 hal paling penting hari ini)', 0, true, 'todo');
