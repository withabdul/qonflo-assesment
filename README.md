# Mini Task Manager

Aplikasi satu halaman untuk mengelola Task dengan Audit Log yang tidak dapat diubah. Setiap perubahan Status tercatat: siapa (Actor), kapan, dan dari Status apa ke Status apa. Istilah mengikuti [GLOSSARY.md](GLOSSARY.md).

Stack: Bun workspaces, backend Express + Drizzle ORM + `pg` + zod di atas Bun, database PostgreSQL, frontend React + Vite + Tailwind.

## Cara menjalankan

Prasyarat: [Bun](https://bun.sh) dan sebuah database PostgreSQL (Neon atau docker compose).

### Opsi A: Neon

1. Buat project Neon, salin connection string-nya. Neon membutuhkan `?sslmode=require` di akhir URL.
2. Dari root repo:

   ```bash
   bun install
   cp .env.example backend/.env      # lalu isi DATABASE_URL dengan connection string Neon
   cd backend
   bun run db:migrate                # menjalankan migrasi, termasuk trigger Audit Log
   bun run start                     # backend di http://localhost:3000
   ```

3. Di terminal lain:

   ```bash
   cd frontend
   bun run dev                       # Vite dev server
   ```

   Buka alamat yang ditampilkan Vite. Request ke `/api` di-proxy ke `http://localhost:3000` (lihat `frontend/vite.config.ts`), jadi backend harus berjalan.

### Opsi B: docker compose

```bash
docker compose up -d
```

Isi `backend/.env` dengan:

```
DATABASE_URL=postgres://user:password@localhost:5432/mini_task_manager
```

Nilai ini sama dengan `.env.example` dan `docker-compose.yml` (hanya untuk lokal). Setelah itu ikuti langkah 2 dan 3 pada Opsi A mulai dari `bun install`, tanpa menyalin `.env.example` lagi.

### Perintah lain

| Perintah | Lokasi | Fungsi |
| --- | --- | --- |
| `bun run typecheck` | `backend` | Typecheck backend |
| `bun run test` | `backend` | Test integrasi (butuh `DATABASE_URL`, lihat di bawah) |
| `bun run db:generate` | `backend` | Membuat migrasi baru dari `schema.ts` |
| `bun run build` | `frontend` | Typecheck dan build frontend |
| `bun run lint` | `frontend` | oxlint |

> **Peringatan: jangan jalankan `bun run test` ke database demo.**
> Test menjalankan migrasi sendiri dan menulis Task serta Audit Log nyata lewat API. Task tersebut muncul di daftar aplikasi, dan jumlahnya bertambah setiap test dijalankan. Audit Log dari test **tidak dapat dibersihkan** karena trigger menolak UPDATE, DELETE, dan TRUNCATE (itu tujuan fiturnya). Satu-satunya cara membersihkan adalah mengosongkan schema atau membuat ulang database.
> Gunakan database atau branch Neon khusus test, dan isi `DATABASE_URL` test hanya saat menjalankan test.

## API

Semua route memakai prefix `/api`.

| Method | Path | Keterangan |
| --- | --- | --- |
| GET | `/api/users` | Daftar Actor tetap |
| GET | `/api/tasks` | Task yang belum dihapus |
| POST | `/api/tasks` | Body `{ title, actor }`. 201, Task `to_do` + Creation Entry |
| PUT | `/api/tasks/:id/status` | Body `{ status, actor }`. Hanya satu langkah maju |
| DELETE | `/api/tasks/:id` | Body `{ actor }`. 204, soft delete + Deletion Entry |
| GET | `/api/tasks/:id/audit-logs` | Audit Log urut dari yang terlama. Tetap 200 untuk Task yang sudah dihapus |

Kode respons: input tidak valid atau Actor tidak dikenal 400; Transition ilegal (loncat, mundur, keluar dari `done`) 409; Task tidak ada atau sudah dihapus 404; Status sama dengan Status sekarang 200 tanpa Audit Log baru (Idempotent Update).

## Arsitektur singkat

- **Backend** (`backend/src/app.ts`): satu file Express. Daftar Actor tetap ada di kode (`ACTORS`). Body divalidasi dengan zod.
- **Konsistensi**: ubah Status dan insert Audit Log berjalan dalam satu transaksi. `PUT status` memakai `SELECT ... FOR UPDATE` pada baris Task, jadi request bersamaan pada Task yang sama diserialkan dan request kedua melihat Status terbaru. Create dan delete juga satu transaksi dengan log-nya.
- **Database** (`backend/src/db/schema.ts`): tabel `tasks` (UUID, `deleted_at` nullable) dan `audit_logs` (id serial menjadi urutan kronologis yang pasti (timestamp transaksi bisa lebih awal dari urutan commit); tanpa foreign key supaya log tetap ada setelah Task dihapus). Kolom `action` membedakan `create`, `status_change`, dan `delete`.
- **Frontend** (`frontend/src`): satu halaman tanpa router dan tanpa state library. Dropdown Actor global, form create, daftar Task dengan badge Status, tombol maju satu langkah, tombol hapus, panel Audit Log per Task. Error dari backend ditampilkan apa adanya.

## Asumsi dan trade-off

- **Actor dari dropdown bukan autentikasi.** Backend hanya memeriksa nama ada di daftar tetap. Siapa pun yang memanggil API dapat memakai nama Actor mana pun, jadi isi Audit Log bukan bukti identitas.
- **Soft delete membuat data menumpuk.** Task yang dihapus tetap ada di tabel `tasks` selamanya, dan Audit Log memang tidak boleh dihapus.
- **Trigger database mengikat solusi ke Postgres.** Perlindungan Audit Log memakai PL/pgSQL, bukan fitur portabel ORM.
- **Satu halaman tanpa router.** Cukup untuk lingkup ini, tetapi tidak ada deep link ke satu Task.
- **Id yang bentuknya salah dijawab 404**, bukan 400, karena id seperti itu pasti tidak cocok dengan Task mana pun.
- **Tanpa paginasi, filter, dan pencarian.** Di luar lingkup.
- **Endpoint audit-logs menjawab 404 jika tidak ada baris log sama sekali.** Ini aman karena setiap Task punya Creation Entry yang dibuat satu transaksi dengan Task.

## Keterbatasan yang diketahui

- **Task yang dihapus hilang dari UI**, jadi Deletion Entry-nya hanya dapat dibaca lewat API (`GET /api/tasks/:id/audit-logs`). UI tidak punya tampilan untuk Task yang sudah dihapus.
- **Judul Task tidak dapat diubah** setelah dibuat (di luar lingkup).
- Task yang dihapus tidak dapat dipulihkan.
- Tidak ada pembaruan real-time antar pengguna; UI baru menyegarkan daftar setelah aksi dari klien itu sendiri.
- **Database pengembangan berisi data hasil test.** Test integrasi sudah dijalankan ke database yang sama dengan demo, sehingga ada Task bertitle acak (mis. `T <uuid>`, `Logged`, `Ordered`) beserta Audit Log-nya. Audit Log itu tidak dapat dihapus oleh desain. Test tidak punya pengaman terhadap hal ini; membuat `TEST_DATABASE_URL` terpisah masuk daftar perbaikan lanjutan.

## Jawaban pertanyaan wajib

### 1. Bagaimana Audit Log dijaga agar tidak termodifikasi?

Dua lapis:

1. **Database.** Migrasi `backend/drizzle/0001_audit_log_immutable.sql` membuat trigger `BEFORE UPDATE OR DELETE` (per baris) dan `BEFORE TRUNCATE` (per statement) pada `audit_logs`. Keduanya memanggil fungsi yang selalu `RAISE EXCEPTION`. Jadi UPDATE, DELETE, dan TRUNCATE ditolak oleh Postgres, termasuk dari koneksi langsung ke database, bukan hanya lewat aplikasi.
2. **Aplikasi.** Kode backend hanya melakukan `insert` dan `select` pada `audit_logs`, dan tidak ada endpoint untuk mengubah atau menghapus log.

Batasnya: trigger dapat dilepas oleh pemilik tabel atau superuser (`DROP TRIGGER`, `ALTER TABLE ... DISABLE TRIGGER`). Untuk produksi, aplikasi sebaiknya memakai role yang hanya punya `INSERT` dan `SELECT` pada `audit_logs` dan bukan pemilik tabel. Itu belum diatur di repo ini.

### 2. Bagian mana yang paling berisiko jika pengguna banyak?

- **Row lock pada Task yang ramai.** Setiap perubahan Status mengunci baris Task (`FOR UPDATE`) selama transaksi. Banyak request pada Task yang sama akan antre dan menahan koneksi dari pool.
- **`audit_logs` tumbuh tanpa batas dan tanpa paginasi.** `GET /api/tasks/:id/audit-logs` dan `GET /api/tasks` mengembalikan semua baris. Tidak ada index selain primary key, jadi query per `task_id` akan melambat saat tabel membesar.
- **Tidak ada autentikasi**, sehingga Actor dapat dipalsukan. Dengan banyak pengguna, Audit Log paling mudah disalahgunakan.

### 3. Apa yang di-refactor lebih dulu jika sistem membesar, dan mengapa?

Yang pertama: **menambah autentikasi dan mengambil Actor dari identitas sesi, bukan dari body request.** Alasannya: seluruh nilai Audit Log bergantung pada kebenaran kolom `actor`, dan saat ini kolom itu hanya input klien. Risiko lain (lock, pertumbuhan tabel) hanya memengaruhi performa, sedangkan Actor yang dapat dipalsukan membuat data audit tidak dapat dipercaya.

Berikutnya, berurutan: `TEST_DATABASE_URL` terpisah dengan penolakan menjalankan test ke database lain; paginasi dan index `audit_logs(task_id, id)` serta `tasks(deleted_at)`; role database tanpa hak UPDATE/DELETE; memecah `app.ts` menjadi route dan lapisan data agar dapat diuji terpisah.

## Penggunaan AI

Sebagian besar kode, test, dan dokumen ini ditulis oleh AI (Claude Code) lewat subagent, dengan alur spec dan ticket: spec ditulis dan disetujui lebih dulu, dipecah menjadi ticket 01 sampai 06, lalu tiap ticket dikerjakan dan di-merge ke satu branch integrasi.

Cara validasi, apa adanya:

- Test integrasi (`backend/test/tasks.test.ts` dan `backend/test/audit-immutability.test.ts`) ditulis lebih dulu daripada implementasi (test-first) pada seam HTTP API dengan Postgres nyata.
- Review kode terhadap spec per ticket.
- Typecheck dan build (`tsc`, `vite build`).
- Dokumentasi library (Drizzle, Express, Vite, Tailwind) dirujuk lewat ctx7 saat implementasi.

**Yang belum dilakukan saat README ini ditulis:** test integrasi belum pernah dijalankan terhadap database, karena `DATABASE_URL` belum tersedia. Jadi pernyataan "test lulus" belum dapat dibuat. Perilaku trigger dan konkurensi baru diverifikasi lewat review kode, bukan eksekusi.

> **Pemilik: perbarui bagian ini setelah menjalankan `bun run test` di `backend`.**
> Status eksekusi test: BELUM DIJALANKAN (isi hasil, tanggal, dan database yang dipakai).
