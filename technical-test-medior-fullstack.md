# Azatech Technical Test — Medior Fullstack Developer

**Studi kasus:** Sistem Online Shop (Order Management)

| Item | Keterangan |
|---|---|
| Posisi | Fullstack Web Developer — level Medior (±2–4 tahun pengalaman) |
| Durasi | 6 jam efektif, dikumpulkan maksimal 1 × 24 jam setelah soal diterima |
| Output | Repository GitHub (backend + frontend), README, API documentation, automated tests |
| Tahap lanjut | Sesi review 45–60 menit: demo, walkthrough kode, dan tanya jawab |

Tujuan test ini adalah melihat kemampuan Anda membangun aplikasi fullstack yang benar secara bisnis, rapi, dan bisa dijalankan orang lain. Kami lebih menilai kualitas dan alasan di balik keputusan teknis daripada jumlah fitur.

---

## 1. Pilihan Tech Stack

Kandidat memilih salah satu track backend di bawah ini. Kedua track dinilai setara; pilih yang paling Anda kuasai. Frontend sama untuk kedua track.

| Komponen | Track A — JavaScript / TypeScript | Track B — Laravel |
|---|---|---|
| Runtime | Node.js 24 LTS atau lebih baru | PHP 8.3 atau lebih baru (disarankan 8.4) |
| Framework | NestJS, Fastify, Express, atau Hono | Laravel 13 |
| Bahasa | TypeScript (wajib), mode strict | PHP dengan type declaration & `declare(strict_types=1)` disarankan |
| ORM & migrasi | Prisma, Drizzle, atau TypeORM — wajib ada migration & seed script | Eloquent + Migration + Factory + Seeder |
| Autentikasi | JWT (access token + refresh token) | Laravel Sanctum (API token) |
| Validasi input | Zod, Valibot, atau class-validator | Form Request |
| Testing | Vitest atau Jest + Supertest | Pest atau PHPUnit |
| Database | PostgreSQL (disarankan) atau MySQL 8 | PostgreSQL (disarankan) atau MySQL 8 |

### Frontend (sama untuk kedua track)

- React 19 + Next.js (App Router) atau Vue 3 + Nuxt / Vite, menggunakan TypeScript.
- Data fetching bebas, disarankan TanStack Query (React/Vue Query) atau setara.
- UI library bebas (Tailwind CSS, shadcn/ui, Mantine, Vuetify, PrimeVue, dll).

> **Catatan penting**
>
> Backend dan frontend tetap **dua service terpisah**. Untuk Track A, Next.js API Routes / Server Actions **tidak boleh** dipakai sebagai backend utama; semua logika bisnis ada di service backend.
>
> Monorepo diperbolehkan (pnpm workspaces, Turborepo, Nx) selama kedua service bisa dijalankan terpisah.
>
> IDE bebas (VS Code, PhpStorm, WebStorm, Cursor, dll).

---

## 2. Application Requirement

Bangun aplikasi Sistem Online Shop sederhana untuk mengelola produk, pelanggan, dan transaksi penjualan. Satu transaksi (order) dapat berisi lebih dari satu produk.

---

## 3. Struktur Database

Struktur di bawah adalah acuan minimum. Anda boleh menambah kolom/index selama ada alasannya (jelaskan di README).

### 3.1 Table: `users`

| Kolom | Field | Tipe Data | Contoh / Keterangan |
|---|---|---|---|
| ID | `id` | PK, bigint / uuid | Auto-generated |
| Nama | `name` | varchar(100) | Admin AZA |
| Email | `email` | varchar(150), unique | admin@azatech.id |
| Password | `password` | varchar | Hashed (bcrypt / argon2) |
| Created / Updated At | `created_at`, `updated_at` | timestamp | Auto-generated |

### 3.2 Table: `products`

| Kolom | Field | Tipe Data | Contoh / Keterangan |
|---|---|---|---|
| ID | `id` | PK, bigint (auto increment) | 1 |
| Kode Produk | `product_code` | varchar(20), unique | P0001 |
| Nama Produk | `product_name` | varchar(150) | Hydrococo 150ml |
| Stok | `stock` | int, ≥ 0 | 10 |
| Harga | `price` | decimal(12,2), > 0 | 12000.00 |
| Created / Updated At | `created_at`, `updated_at` | timestamp | Auto-generated |
| Deleted At | `deleted_at` | timestamp, nullable | Soft delete |

### 3.3 Table: `customers`

| Kolom | Field | Tipe Data | Contoh / Keterangan |
|---|---|---|---|
| ID | `id` | PK, uuid | Auto-generated |
| Nama | `customer_name` | varchar(150) | Budi Santoso |
| Alamat | `customer_address` | varchar(255) | Jakarta |
| Gender | `gender` | enum | Pria / Wanita |
| Tgl Lahir | `birth_date` | date | 1995-02-10 |
| No. HP | `phone` | varchar(20), nullable | 081234567890 |
| Created / Updated At | `created_at`, `updated_at` | timestamp | Auto-generated |
| Deleted At | `deleted_at` | timestamp, nullable | Soft delete |

### 3.4 Table: `orders`

| Kolom | Field | Tipe Data | Contoh / Keterangan |
|---|---|---|---|
| ID | `id` | PK, bigint | 1 |
| No. Order | `order_number` | varchar(30), unique | INV-20261021-0001 (digenerate server) |
| ID Customer | `customer_id` | FK, uuid | Refer ke `customers` |
| Dibuat Oleh | `created_by` | FK | Refer ke `users` |
| Tgl Order | `order_date` | timestamp | Auto-generated |
| Total | `total_amount` | decimal(14,2) | 36000.00 |
| Created / Updated At | `created_at`, `updated_at` | timestamp | Auto-generated |

### 3.5 Table: `order_items`

| Kolom | Field | Tipe Data | Contoh / Keterangan |
|---|---|---|---|
| ID | `id` | PK, bigint | 1 |
| ID Order | `order_id` | FK, bigint | Refer ke `orders` |
| ID Produk | `product_id` | FK, bigint | Refer ke `products` |
| Jumlah | `quantity` | int, > 0 | 2 |
| Harga Satuan | `unit_price` | decimal(12,2) | Snapshot harga saat transaksi |
| Subtotal | `subtotal` | decimal(14,2) | 24000.00 |
| Created / Updated At | `created_at`, `updated_at` | timestamp | Auto-generated |

> **Kenapa ada `unit_price`?**
>
> Harga produk bisa berubah setelah transaksi. `unit_price` menyimpan harga saat order dibuat agar laporan historis tetap akurat.

---

## 4. Fitur Aplikasi

### 4.1 Backend Service (REST API)

1. **Autentikasi:** login, logout, dan endpoint profil (`/me`). Semua endpoint selain login wajib terautentikasi. User admin dibuat lewat seeder.
2. **Manajemen Produk (CRUD):**
   - List dengan pagination, search (nama / kode), dan sort (nama, harga, stok).
   - Validasi: `product_code` unik, `price` > 0, `stock` ≥ 0.
   - Hapus menggunakan soft delete; produk yang sudah pernah ditransaksikan tetap bisa tampil di riwayat order.
3. **Manajemen Pelanggan (CRUD)** dengan pagination dan search nama.
4. **Proses Penjualan (Order):**
   - Satu order berisi satu atau lebih item produk.
   - Validasi stok setiap item sebelum transaksi. Jika satu item gagal, seluruh order gagal (tidak ada stok yang berkurang).
   - Hitung subtotal per item dan `total_amount` di server.
   - Kurangi stok setelah transaksi sukses. Seluruh proses dijalankan dalam **satu database transaction**.
   - Generate `order_number` unik dengan format `INV-YYYYMMDD-XXXX`.
5. **Riwayat Order:** list dengan filter rentang tanggal & customer, serta detail order beserta item-nya.
6. **Dashboard Summary:** total transaksi, total penjualan (Rp), 5 produk terlaris, dan produk dengan stok < 5.
7. **Seeder:** 1 user admin, minimal 20 produk, 15 customer, dan 30 order tersebar dalam 30 hari terakhir.
8. **Automated test:** minimal 5 feature/integration test, wajib mencakup: buat order sukses, stok tidak cukup, validasi input gagal, dan akses tanpa token.
9. **API documentation:** Postman collection (di-commit ke repo) atau OpenAPI / Swagger.

### 4.2 Frontend Service

1. Halaman login dan proteksi route (redirect ke login jika belum terautentikasi / token expired).
2. **Produk & Pelanggan:** tabel dengan pagination dan search, form tambah/edit dengan validasi, serta konfirmasi sebelum hapus.
3. **Buat Order:** pilih customer, tambah/hapus baris produk secara dinamis, subtotal & total ter-update otomatis, dan tampilkan error dari server (mis. stok tidak cukup) pada item yang bermasalah.
4. **Riwayat Order:** list dengan filter tanggal, serta halaman detail order.
5. **Dashboard:** kartu ringkasan (total transaksi, total penjualan), daftar produk terlaris, dan peringatan stok menipis.
6. Tampilan responsive (desktop & mobile) dengan state loading, empty, dan error yang jelas.
7. Format mata uang Rupiah (Rp 12.000) dan tanggal format Indonesia.

---

## 5. API Endpoint yang Diharapkan

| Endpoint | Method | Deskripsi |
|---|---|---|
| `/api/auth/login` | POST | Login, mengembalikan token |
| `/api/auth/logout` | POST | Logout / revoke token |
| `/api/auth/me` | GET | Profil user yang login |
| `/api/products` | GET | List produk (`?page`, `per_page`, `search`, `sort`) |
| `/api/products/{id}` | GET | Detail produk |
| `/api/products` | POST | Tambah produk |
| `/api/products/{id}` | PUT | Update produk |
| `/api/products/{id}` | DELETE | Soft delete produk |
| `/api/customers` | GET / POST | List (`?page`, `search`) / tambah pelanggan |
| `/api/customers/{id}` | GET / PUT / DELETE | Detail / update / hapus pelanggan |
| `/api/orders` | GET | List order (`?from`, `to`, `customer_id`, `page`) |
| `/api/orders/{id}` | GET | Detail order beserta item |
| `/api/orders` | POST | Buat transaksi penjualan |
| `/api/dashboard/summary` | GET | Ringkasan dashboard |

---

## 6. Standar Response API

Seluruh endpoint wajib menggunakan format response yang konsisten dan HTTP status code yang tepat (200, 201, 204, 401, 403, 404, 409, 422, 500).

**Contoh response sukses (list dengan pagination):**

```json
{
  "success": true,
  "message": "OK",
  "data": [ { "id": 1, "product_code": "P0001", "product_name": "Hydrococo 150ml", ... } ],
  "meta": { "page": 1, "per_page": 10, "total": 57, "total_pages": 6 }
}
```

**Contoh response error (validasi / stok tidak cukup):**

```json
{
  "success": false,
  "message": "Stok tidak mencukupi",
  "errors": {
    "items.1.quantity": ["Stok Hydrococo 150ml tersisa 3, diminta 5"]
  }
}
```

**Contoh request membuat order:**

```http
POST /api/orders
```

```json
{
  "customer_id": "9d2f6c1e-....",
  "items": [
    { "product_id": 1, "quantity": 2 },
    { "product_id": 3, "quantity": 1 }
  ]
}
```

> **Harga dan total wajib dihitung di server** berdasarkan data produk. Jangan menerima `price` atau `total` dari client.

---

## 7. Deliverables

1. Repository berisi folder `backend/` dan `frontend/` (atau struktur monorepo setara).
2. `README.md` yang memuat:
   - Tech stack yang dipilih dan alasannya.
   - Panduan setup dari `git clone` sampai aplikasi berjalan (maksimal ±6 perintah), termasuk akun login seeder.
   - Penjelasan logika aplikasi, terutama alur pembuatan order dan penanganan stok.
   - Cara menjalankan test.
   - Asumsi, keterbatasan, dan hal yang akan diperbaiki jika ada waktu lebih.
3. Migration & seeder yang bisa dijalankan dari database kosong.
4. Automated test yang lulus.
5. Postman collection atau dokumentasi OpenAPI.

### Bonus (opsional, menambah nilai)

- `docker compose up` untuk menjalankan seluruh aplikasi (backend, frontend, database).
- GitHub Actions untuk lint + test.
- Grafik penjualan harian di dashboard.
- Export riwayat order ke CSV / Excel.
- Test di sisi frontend (Vitest + Testing Library) atau E2E (Playwright).

---

## 8. Ketentuan Pengerjaan & Pengumpulan

1. Waktu pengerjaan: 6 jam efektif, dikumpulkan maksimal 1 × 24 jam setelah soal diterima.
2. Kode di-push ke repository GitHub **public**. Commit dilakukan bertahap (bukan satu commit besar di akhir); format Conventional Commits disarankan.
3. File `.env` dan kredensial tidak boleh ter-commit. Sediakan `.env.example`.
4. Kirim link repository ke **recruitment@azatech.id** dengan subject: `[Medior Fullstack Developer] Technical Result_[Nama Anda]`
5. Jika ada fitur yang belum selesai, tuliskan secara jujur di README beserta pendekatan yang akan Anda ambil. Pekerjaan yang rapi dan sebagian lebih dihargai daripada lengkap tapi rapuh.

### Penggunaan AI Assistant

Kandidat boleh menggunakan AI assistant (GitHub Copilot, Claude, ChatGPT, Cursor, dll). Ketentuannya:

- Seluruh kode adalah tanggung jawab kandidat dan akan dibahas di sesi review. Kandidat harus bisa menjelaskan dan memodifikasi kode apa pun di repository.
- Cantumkan di README bagian **"AI Usage"**: tools yang dipakai dan untuk bagian apa.

---

## 9. Aspek Penilaian

| Aspek | Bobot | Yang dilihat |
|---|---|---|
| Fungsionalitas & kebenaran logika | 30% | Fitur berjalan, perhitungan & stok benar, transaksi atomik |
| Kualitas kode | 20% | Struktur, penamaan, separation of concerns, best practice framework |
| Desain API & database | 15% | Konsistensi endpoint, status code, relasi, constraint, index |
| Testing | 15% | Test relevan, mencakup skenario gagal, bisa dijalankan |
| Frontend & UX | 10% | Alur pengguna, validasi, state loading/error, responsive |
| Dokumentasi & Git | 10% | README bisa diikuti, commit history rapi |

**Selamat mengerjakan!** Jika ada pertanyaan terkait soal, kirim email ke recruitment@azatech.id.
