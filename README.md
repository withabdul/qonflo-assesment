# Mini Task Manager

Aplikasi satu halaman (dua tab: Tasks dan Audit Log) untuk mengelola Task dengan Audit Log yang tidak dapat diubah. Setiap perubahan Status tercatat: siapa (Actor), kapan, dan dari Status apa ke Status apa. Istilah mengikuti [GLOSSARY.md](GLOSSARY.md).

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
| GET | `/api/users` | Daftar Actor tetap. Nama path `users` mengikuti contoh brief; di domain istilahnya Actor |
| GET | `/api/tasks` | Task yang belum dihapus |
| POST | `/api/tasks` | Body `{ title, actor }`. 201, Task `to_do` + Creation Entry |
| PUT | `/api/tasks/:id/status` | Body `{ status, actor }`. Hanya satu langkah maju |
| DELETE | `/api/tasks/:id` | Body `{ actor }`. 204, soft delete + Deletion Entry |
| GET | `/api/audit-logs` | Semua Audit Log dengan `taskTitle`, urut dari yang terlama, termasuk milik Task yang sudah dihapus. Dipakai tab Audit Log |
| GET | `/api/tasks/:id/audit-logs` | Audit Log satu Task, urut dari yang terlama. Tetap 200 untuk Task yang sudah dihapus |

Kode respons: input tidak valid atau Actor tidak dikenal 400; Transition ilegal (loncat, mundur, keluar dari `done`) 409; Task tidak ada atau sudah dihapus 404; Status sama dengan Status sekarang 200 tanpa Audit Log baru (Idempotent Update).

## Arsitektur singkat

- **Backend** (`backend/src`): tiga lapisan kecil. `domain.ts` berisi aturan murni (daftar Actor, urutan Status, fungsi `transition`, error domain) tanpa HTTP dan tanpa database. `tasks.ts` berisi use case; tiap penulisan mengubah Task dan Audit Log dalam satu transaksi. `app.ts` hanya batas HTTP: validasi body dengan zod, memanggil use case, dan memetakan error domain ke kode status (400, 404, 409). Di backend urutan Status didefinisikan sekali di `domain.ts` dan dipakai juga oleh skema database.
- **Konsistensi**: ubah Status dan insert Audit Log berjalan dalam satu transaksi. `PUT status` memakai `SELECT ... FOR UPDATE` pada baris Task, jadi request bersamaan pada Task yang sama diserialkan dan request kedua melihat Status terbaru. Create dan delete juga satu transaksi dengan log-nya.
- **Database** (`backend/src/db/schema.ts`): tabel `tasks` (UUID, `deleted_at` nullable) dan `audit_logs` (id serial menjadi urutan kronologis yang pasti (timestamp transaksi bisa lebih awal dari urutan commit); tanpa foreign key supaya log tetap ada setelah Task dihapus). Kolom `action` membedakan `create`, `status_change`, dan `delete`.
- **Frontend** (`frontend/src`): satu halaman dengan dua tab, tanpa router dan tanpa state library. Dropdown Actor global; tab Tasks berisi form create, daftar Task dengan badge Status, tombol maju satu langkah, tombol hapus, dan tautan ke Audit Log Task itu; tab Audit Log menampilkan semua log kronologis dengan filter per Task, termasuk Task yang sudah dihapus. Error dari backend ditampilkan apa adanya. Frontend memegang salinan urutan Status sendiri (`status.ts` dan `NEXT_STATUS` di `App.tsx`) hanya untuk tampilan; backend tetap penentu transisi yang sah.

## Asumsi dan trade-off

- **Actor dari dropdown bukan autentikasi.** Backend hanya memeriksa nama ada di daftar tetap. Siapa pun yang memanggil API dapat memakai nama Actor mana pun, jadi isi Audit Log bukan bukti identitas.
- **Soft delete membuat data menumpuk.** Task yang dihapus tetap ada di tabel `tasks` selamanya, dan Audit Log memang tidak boleh dihapus.
- **Trigger database mengikat solusi ke Postgres.** Perlindungan Audit Log memakai PL/pgSQL, bukan fitur portabel ORM.
- **Satu halaman tanpa router.** Cukup untuk lingkup ini, tetapi tidak ada deep link ke satu Task.
- **Id yang bentuknya salah dijawab 404**, bukan 400, karena id seperti itu pasti tidak cocok dengan Task mana pun.
- **Tanpa paginasi, filter, dan pencarian.** Di luar lingkup.
- **Endpoint audit-logs menjawab 404 jika tidak ada baris log sama sekali.** Ini aman karena setiap Task punya Creation Entry yang dibuat satu transaksi dengan Task.

## Keterbatasan yang diketahui

- **Task yang dihapus hilang dari tab Tasks.** Riwayat dan Deletion Entry-nya tetap terlihat di tab Audit Log, tetapi tidak ada tampilan untuk memulihkan atau melihat daftar Task terhapus sebagai entitas sendiri.
- **Tab Audit Log memuat ulang saat dibuka**, bukan real-time, dan filter Task dilakukan di klien.
- **Judul Task tidak dapat diubah** setelah dibuat (di luar lingkup).
- Task yang dihapus tidak dapat dipulihkan.
- **Frontend tidak memiliki test otomatis**; test yang ada mencakup backend lewat HTTP API.
- Tidak ada pembaruan real-time antar pengguna; UI baru menyegarkan daftar setelah aksi dari klien itu sendiri.
- **Test tidak punya pengaman terhadap database yang salah.** Test menulis Task dan Audit Log nyata ke database mana pun yang ada di `DATABASE_URL`, dan Audit Log itu tidak dapat dihapus oleh desain. Database pengembangan pernah terkena ini dan dibersihkan dengan drop tabel lalu migrasi ulang (DROP TABLE tidak diblokir trigger). `TEST_DATABASE_URL` terpisah masuk daftar perbaikan lanjutan.

## Jawaban pertanyaan wajib

### 1. Bagaimana Audit Log dijaga agar tidak termodifikasi?

Dua lapis:

1. **Database.** Migrasi `backend/drizzle/0001_audit_log_immutable.sql` membuat trigger `BEFORE UPDATE OR DELETE` (per baris) dan `BEFORE TRUNCATE` (per statement) pada `audit_logs`. Keduanya memanggil fungsi yang selalu `RAISE EXCEPTION`. Jadi UPDATE, DELETE, dan TRUNCATE ditolak oleh Postgres, termasuk dari koneksi langsung ke database, bukan hanya lewat aplikasi.
2. **Aplikasi.** Kode backend hanya melakukan `insert` dan `select` pada `audit_logs`, dan tidak ada endpoint untuk mengubah atau menghapus log.

Batasnya: trigger dapat dilepas oleh pemilik tabel atau superuser (`DROP TRIGGER`, `ALTER TABLE ... DISABLE TRIGGER`). Untuk produksi, aplikasi sebaiknya memakai role yang hanya punya `INSERT` dan `SELECT` pada `audit_logs` dan bukan pemilik tabel. Itu belum diatur di repo ini.

### 2. Bagian mana yang paling berisiko jika pengguna banyak?

- **Row lock pada Task yang ramai.** Setiap perubahan Status mengunci baris Task (`FOR UPDATE`) selama transaksi. Banyak request pada Task yang sama akan antre dan menahan koneksi dari pool.
- **`audit_logs` tumbuh tanpa batas dan tanpa paginasi.** `GET /api/audit-logs` (dipakai tab Audit Log) mengembalikan seluruh log semua Task, sedangkan `GET /api/tasks/:id/audit-logs` dan `GET /api/tasks` mengembalikan semua baris yang cocok. Tidak ada index selain primary key, jadi query per `task_id` akan melambat saat tabel membesar.
- **Tidak ada autentikasi**, sehingga Actor dapat dipalsukan. Dengan banyak pengguna, Audit Log paling mudah disalahgunakan.

### 3. Apa yang di-refactor lebih dulu jika sistem membesar, dan mengapa?

Yang pertama: **menambah autentikasi dan mengambil Actor dari identitas sesi, bukan dari body request.** Alasannya: seluruh nilai Audit Log bergantung pada kebenaran kolom `actor`, dan saat ini kolom itu hanya input klien. Risiko lain (lock, pertumbuhan tabel) hanya memengaruhi performa, sedangkan Actor yang dapat dipalsukan membuat data audit tidak dapat dipercaya.

Berikutnya, berurutan: `TEST_DATABASE_URL` terpisah dengan penolakan menjalankan test ke database lain; paginasi dan index `audit_logs(task_id, id)` serta `tasks(deleted_at)`; role database tanpa hak UPDATE/DELETE; memisahkan akses data dari use case (repository) bila ada lebih dari satu sumber data, dan menambah test unit untuk `domain.ts`.

**Race condition dan lock.** Perubahan Status sudah memakai lock tingkat baris (`SELECT ... FOR UPDATE`) di dalam transaksi, sehingga dua request bersamaan pada Task yang sama diserialkan dan tidak menghasilkan Audit Log ganda atau Status yang melompat. Delete memakai `UPDATE ... WHERE deleted_at IS NULL` yang atomik. Jika beban bertambah, langkah berikutnya adalah mengatur `lock_timeout` agar request yang antre gagal cepat dan bukan menahan koneksi pool, serta menambah pengecekan versi (optimistic concurrency) supaya klien dengan tampilan basi mendapat konflik yang jelas. Lock ini ada di database, jadi tetap berlaku bila backend dijalankan lebih dari satu instance.

## Penggunaan AI

Saya memakai AI (Claude Code) di seluruh proses, bukan hanya untuk menulis kode, juga agar pengerjaan lebih cepat. Peran saya adalah memastikan alur kerja dan arsitektur (clean code) berjalan mulus, dan memutuskan hal-hal yang harus dipilih manusia.

### Bagian yang dibantu AI

- **Menggali kebutuhan:** AI mewawancarai saya per pertanyaan (struktur repo, persistence, aturan transisi, penghapusan, dll.) sebelum ada kode, lalu menuliskannya ke `GLOSSARY.md` dan spec.
- **Spec dan ticket:** spec dipecah menjadi 6 ticket vertikal dengan relasi blocker.
- **Implementasi:** tiap ticket dikerjakan subagent AI di worktree sendiri, test-first, lalu di-merge ke satu branch integrasi.
- **Code review:** dua sumbu, Standards (terhadap `GLOSSARY.md` dan smell baseline) dan Spec (terhadap acceptance criteria).
- **Dokumentasi library:** API Drizzle, Express, Tailwind, dan zod dirujuk lewat ctx7 (CLI untuk mendapatkan dokumentasi terbaru), bukan dari ingatan model. Perilaku row lock dan trigger dibuktikan lewat migrasi dan test yang dijalankan ke database.
- **README ini:** draf awalnya ditulis AI, lalu dikoreksi.

### Peran dan keputusan saya

- Menetapkan stack dan batasan: Bun, PostgreSQL di Neon dengan Drizzle dan driver `pg`, Tailwind, satu halaman tanpa router.
- Menetapkan model domain: Actor wajib di semua mutasi, pembuatan Task ikut tercatat sebagai Audit Log, soft delete supaya Audit Log tidak pernah hilang, dan proteksi immutability di database (trigger), bukan hanya di kode aplikasi.
- Menjaga alur dan arsitektur: satu seam test (HTTP API), kode yang sederhana tanpa abstraksi berlebih, dan istilah yang konsisten dengan `GLOSSARY.md`.
- Menyetujui spec dan breakdown ticket sebelum implementasi, serta memutuskan tindakan berisiko (menjalankan test dan migrasi ke database, membersihkan data test).

### Cara validasi

- **Test integrasi dijalankan** ke Postgres nyata (Neon) setelah ticket 01 sampai 05 digabung: 25 test lulus, mencakup transisi, idempotent update, soft delete, 5 request bersamaan menghasilkan satu log, dan UPDATE/DELETE/TRUNCATE langsung ke `audit_logs` ditolak database.
- **Test menemukan bug di test itu sendiri:** `audit-immutability.test.ts` menutup pool bersama sehingga test lain gagal. Diperbaiki dengan pool sendiri.
- **Review menemukan bug urutan log:** sebelumnya diurutkan `createdAt` lalu `id`, padahal `createdAt` adalah waktu awal transaksi. Sekarang diurutkan `id`.
- **Output AI tidak diterima mentah:** ctx7 mendokumentasikan Drizzle v1 RC, jadi versi dikunci ke stable 0.45; klaim "test lulus" ditahan sampai benar-benar dijalankan; konflik merge antar ticket diselesaikan dan diverifikasi ulang dengan typecheck, build, dan test.
- Typecheck dan build (`tsc`, `vite build`) lolos, termasuk setelah refactor backend (pemisahan `domain.ts`, `tasks.ts`, `app.ts`) dan perapihan duplikasi frontend.
