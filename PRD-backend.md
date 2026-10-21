# PRD Setup — Backend (`/backend`)

> Technical Test Azatech — Medior Fullstack Developer · Track A
> Dokumen ini fokus pada **instalasi, scaffolding, dan konfigurasi fondasi** service backend. Fitur bisnis lengkap ada di `PRD.md`.
> Stack: **Node.js 24 · NestJS · TypeScript strict · Prisma · PostgreSQL · JWT · Jest + Supertest · Swagger · Docker**

---

## 0. Analisis Soal Interview (bahan belajar)

### 0.1 Apa yang sebenarnya dinilai

| Aspek | Bobot | Artinya untuk backend | Dijawab oleh |
|---|---|---|---|
| Fungsionalitas & logika | 30% | Order atomik, stok benar, total dihitung server | `orders.service.ts` (satu `prisma.$transaction`) |
| Kualitas kode | 20% | Separation of concerns, best practice NestJS | Controller tipis → Service → Prisma; DTO terpisah |
| Desain API & DB | 15% | Status code konsisten, constraint, index | Envelope response, CHECK constraint, index FK |
| Testing | 15% | Skenario gagal, bukan hanya happy path | e2e: sukses, stok kurang + rollback, 422, 401 |
| Frontend & UX | 10% | (di luar dokumen ini) | — |
| Dokumentasi & Git | 10% | README ≤ 6 perintah, commit bertahap | §10 & §11 |

**Kata kunci penting dari soal:** *"satu database transaction"*, *"jangan terima price/total dari client"*, *"soft delete tapi tetap tampil di riwayat order"*, *"Next.js API Routes tidak boleh jadi backend"*, *"sesi review: harus bisa menjelaskan semua kode"*.

### 0.2 Titik rawan (sering jadi pertanyaan reviewer)

1. **Race condition stok.** Dua order bersamaan untuk stok terakhir. Solusi: `UPDATE products SET stock = stock - $qty WHERE id = $id AND stock >= $qty` (atomic). Jika 0 row ter-update → stok tidak cukup → throw → seluruh transaksi rollback. CHECK `stock >= 0` jadi pengaman terakhir di level DB.
2. **Nomor order unik `INV-YYYYMMDD-XXXX`.** Tabel `order_counters (date PK, last_seq)` di-`upsert` + increment di dalam transaksi yang sama → tidak ada duplikat walau konkuren, dan sequence ikut rollback jika order gagal.
3. **Soft delete vs riwayat order.** `order_items` tetap FK ke `products` (baris produk masih ada, hanya `deleted_at` terisi). Query detail order **tidak** memfilter `deleted_at`; query list produk memfilternya.
4. **Snapshot harga.** `order_items.unit_price` disalin dari `products.price` saat order dibuat.
5. **Uang.** `Decimal` (Prisma `Decimal`/Postgres `numeric`), bukan `float`. Serialisasi ke JSON sebagai string/number konsisten.
6. **Zona waktu.** Penomoran harian & filter tanggal memakai Asia/Jakarta (`jakarta-date.ts`), bukan UTC.
7. **Keamanan dasar.** argon2 untuk password, helmet, CORS eksplisit, throttling login, `whitelist + forbidNonWhitelisted` di ValidationPipe.

### 0.3 ERD

```
users 1───< orders >───1 customers
              │
              1
              │
              ^
          order_items >───1 products
order_counters (date → last_seq)   ← berdiri sendiri, generator nomor order
```

### 0.4 Skema Prisma (acuan; `prisma/schema.prisma`)

```prisma
enum Gender { Pria  Wanita }

model User {
  id        String   @id @default(uuid())
  name      String   @db.VarChar(100)
  email     String   @unique @db.VarChar(150)
  password  String
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")
  orders    Order[]
  @@map("users")
}

model Product {
  id          Int       @id @default(autoincrement())
  productCode String    @unique @map("product_code") @db.VarChar(20)
  productName String    @map("product_name") @db.VarChar(150)
  stock       Int
  price       Decimal   @db.Decimal(12, 2)
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")
  deletedAt   DateTime? @map("deleted_at")
  orderItems  OrderItem[]
  @@index([productName])
  @@map("products")
}

model Customer {
  id              String    @id @default(uuid())
  customerName    String    @map("customer_name") @db.VarChar(150)
  customerAddress String    @map("customer_address") @db.VarChar(255)
  gender          Gender
  birthDate       DateTime  @map("birth_date") @db.Date
  phone           String?   @db.VarChar(20)
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")
  deletedAt       DateTime? @map("deleted_at")
  orders          Order[]
  @@index([customerName])
  @@map("customers")
}

model Order {
  id          Int      @id @default(autoincrement())
  orderNumber String   @unique @map("order_number") @db.VarChar(30)
  customerId  String   @map("customer_id")
  createdBy   String   @map("created_by")
  orderDate   DateTime @default(now()) @map("order_date")
  totalAmount Decimal  @map("total_amount") @db.Decimal(14, 2)
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")
  customer    Customer @relation(fields: [customerId], references: [id])
  user        User     @relation(fields: [createdBy], references: [id])
  items       OrderItem[]
  @@index([orderDate])
  @@index([customerId])
  @@map("orders")
}

model OrderItem {
  id        Int      @id @default(autoincrement())
  orderId   Int      @map("order_id")
  productId Int      @map("product_id")
  quantity  Int
  unitPrice Decimal  @map("unit_price") @db.Decimal(12, 2)
  subtotal  Decimal  @db.Decimal(14, 2)
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")
  order     Order    @relation(fields: [orderId], references: [id], onDelete: Cascade)
  product   Product  @relation(fields: [productId], references: [id])
  @@index([orderId])
  @@index([productId])
  @@map("order_items")
}

model OrderCounter {
  date    String @id @db.VarChar(8)   // YYYYMMDD (Asia/Jakarta)
  lastSeq Int    @default(0) @map("last_seq")
  @@map("order_counters")
}
```

Catatan keputusan: `id` produk/order memakai `Int` (bukan `BigInt`) karena `BigInt` tidak bisa di-`JSON.stringify` tanpa workaround; kapasitas Int (±2 miliar) lebih dari cukup. Jelaskan di README.

### 0.5 Alur pembuatan order (inti penilaian)

```
POST /api/orders { customer_id, items:[{product_id, quantity}] }
 1. JwtAuthGuard           → 401 jika tanpa/invalid token
 2. ValidationPipe + DTO   → 422 (items minimal 1, quantity int > 0, product_id tidak duplikat)
 3. OrdersController       → ambil user dari token (@CurrentUser), panggil service
 4. OrdersService.create() → prisma.$transaction(async tx => {
      a. cek customer ada & belum soft-deleted        → 404/422
      b. ambil produk (deletedAt: null) untuk semua product_id → 422 jika ada yang tidak ditemukan
      c. per item: updateMany({ where:{id, stock:{gte:qty}}, data:{stock:{decrement:qty}} })
         count === 0 → throw 409/422 "Stok tidak mencukupi" + errors["items.N.quantity"]
      d. unit_price = product.price (snapshot), subtotal = unit_price × qty, total = Σ subtotal
      e. order_number = OrderNumberService.next(tx)   (upsert order_counters)
      f. tx.order.create({ ..., items: { create: [...] } })
    })
 5. Exception → rollback otomatis; semua stok kembali; sequence nomor ikut rollback
 6. ResponseInterceptor    → { success, message, data }  (201)
```

### 0.6 Peta status code

| Kode | Kapan |
|---|---|
| 200 / 201 / 204 | Sukses / dibuat / hapus tanpa body |
| 401 | Token tidak ada / invalid / expired |
| 404 | Resource tidak ditemukan (id salah, sudah soft-delete) |
| 409 | Konflik: `product_code` duplikat, stok tidak cukup |
| 422 | Validasi DTO gagal (`errors` per field) |
| 500 | Error tak terduga (pesan generik, detail hanya di log) |

### 0.7 Latihan pertanyaan interview

1. Kenapa `updateMany ... stock >= qty` dan bukan baca-lalu-tulis? *(race condition / atomic)*
2. Apa yang terjadi di DB kalau item ke-3 gagal? *(rollback seluruh transaksi)*
3. Kenapa `unit_price` disimpan di `order_items`? *(snapshot historis)*
4. Kenapa Decimal, bukan float? *(presisi uang)*
5. Kenapa guard JWT dipasang global + `@Public()`? *(secure by default)*
6. Kenapa `configureApp(app)` dibagi antara `main.ts` dan test? *(test = perilaku produksi)*
7. Apa trade-off soft delete? *(unique `product_code` tetap terpakai; query harus filter `deletedAt`)*
8. Bagaimana kamu skala-kan penomoran order? *(counter per hari; alternatif DB sequence)*
9. Apa yang kamu perbaiki jika ada waktu lebih? *(refresh token rotation + revoke list, pagination cursor, CI)*

---

## 1. Analisis: Mengapa Dua Folder Terpisah

| Aspek | Implikasi untuk backend |
|---|---|
| Dependency | `backend/package.json` & `pnpm-lock.yaml` sendiri. Tidak ada `pnpm-workspace.yaml` (bukan monorepo). |
| Kontrak dengan FE | Satu-satunya penghubung adalah **HTTP API + OpenAPI**. Tidak boleh ada kode/type yang di-import lintas folder. |
| Type sharing | Tidak ada paket shared. FE membuat type sendiri (atau generate dari `docs/openapi.json`). |
| CORS | Origin berbeda (`:3000` ↔ `:4000`) → CORS wajib diatur eksplisit via `FRONTEND_URL`. |
| Env | Dua `.env.example` terpisah (backend & frontend) + satu `.env` root untuk Docker Compose. |
| Deploy/Docker | Dua Dockerfile; satu `docker-compose.yml` di **root** yang menyatukan `db`, `backend`, `frontend`. |
| Git | Satu repository, dua folder. Commit diberi scope: `feat(backend): …`, `feat(frontend): …`. |

**Struktur akhir repo:**

```
.
├── backend/            ← dokumen ini
├── frontend/           ← lihat PRD-frontend.md
├── docs/
├── docker-compose.yml
├── .env.example        # variabel untuk compose
├── .gitignore
├── PRD.md · PRD-backend.md · PRD-frontend.md
└── README.md
```

---

## 2. Prasyarat

| Tool | Versi | Cek |
|---|---|---|
| Node.js | 24 LTS | `node -v` |
| pnpm | terbaru (via Corepack) | `corepack enable && pnpm -v` |
| Docker + Compose | terbaru | `docker compose version` |
| Git | terbaru | `git --version` |

---

## 3. Langkah Instalasi (urut, bisa di-copy)

### 3.1 Scaffold NestJS
```bash
mkdir azatech-shop && cd azatech-shop
git init
pnpm dlx @nestjs/cli new backend --package-manager pnpm --strict --skip-git
cd backend
```
`--strict` mengaktifkan mode strict TypeScript. Hapus file contoh (`app.controller.ts`, `app.service.ts`, `app.controller.spec.ts`) setelah modul pertama dibuat.

### 3.2 Dependency runtime
```bash
pnpm add @nestjs/config @nestjs/jwt @nestjs/passport passport passport-jwt \
         @nestjs/swagger @nestjs/throttler \
         class-validator class-transformer \
         argon2 helmet \
         @prisma/client
```
(Untuk versi Prisma terbaru yang memakai driver adapter, tambahkan juga `@prisma/adapter-pg` dan `pg` — ikuti dokumentasi Prisma sesuai versi yang terpasang.)

### 3.3 Dependency development
```bash
pnpm add -D prisma @types/passport-jwt @types/pg \
            @faker-js/faker tsx
```
`jest`, `ts-jest`, `supertest`, `@types/supertest`, `eslint`, `prettier` sudah disertakan scaffold NestJS.

### 3.4 Inisialisasi Prisma
```bash
pnpm prisma init --datasource-provider postgresql
```
Lalu:
1. Salin skema dari `PRD.md` §4.1 ke `prisma/schema.prisma`.
2. Buat migration awal: `pnpm prisma migrate dev --name init`.
3. Buat migration kedua khusus constraint (CHECK) — jalankan `pnpm prisma migrate dev --create-only --name add_check_constraints`, edit SQL-nya:
   ```sql
   ALTER TABLE "products"    ADD CONSTRAINT products_stock_gte_0   CHECK (stock >= 0);
   ALTER TABLE "products"    ADD CONSTRAINT products_price_gt_0    CHECK (price > 0);
   ALTER TABLE "order_items" ADD CONSTRAINT order_items_qty_gt_0   CHECK (quantity > 0);
   ```
   lalu `pnpm prisma migrate dev`.
4. Daftarkan seed di `package.json`: `"prisma": { "seed": "tsx prisma/seed.ts" }` (atau `prisma.config.ts` jika versi Prisma memakainya).

### 3.5 Generate modul (NestJS CLI)
```bash
pnpm nest g module prisma
pnpm nest g service prisma --no-spec
pnpm nest g module auth        && pnpm nest g controller auth --no-spec        && pnpm nest g service auth
pnpm nest g module products    && pnpm nest g controller products --no-spec    && pnpm nest g service products
pnpm nest g module customers   && pnpm nest g controller customers --no-spec   && pnpm nest g service customers
pnpm nest g module orders      && pnpm nest g controller orders --no-spec      && pnpm nest g service orders
pnpm nest g module dashboard   && pnpm nest g controller dashboard --no-spec   && pnpm nest g service dashboard
```
`PrismaModule` dibuat `@Global()` dan meng-export `PrismaService`.

---

## 4. Struktur Folder `backend/`

```
backend/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── configure-app.ts               # pipe/filter/interceptor/prefix (dipakai main + test)
│   ├── health/                        # GET /api/health
│   ├── config/
│   │   └── env.validation.ts          # validasi env saat boot
│   ├── common/
│   │   ├── decorators/                # @Public(), @CurrentUser()
│   │   ├── dto/                       # PaginationQueryDto
│   │   ├── filters/                   # all-exceptions.filter.ts
│   │   ├── guards/                    # jwt-auth.guard.ts (global)
│   │   ├── interceptors/              # response.interceptor.ts
│   │   ├── pipes/                     # validation pipe factory (format error 422)
│   │   └── utils/                     # pagination.ts, jakarta-date.ts
│   ├── prisma/
│   │   ├── prisma.module.ts
│   │   └── prisma.service.ts
│   ├── auth/        (dto/, strategies/jwt.strategy.ts, auth.*.ts)
│   ├── products/    (dto/, products.*.ts)
│   ├── customers/   (dto/, customers.*.ts)
│   ├── orders/      (dto/, orders.*.ts, order-number.service.ts)
│   └── dashboard/   (dashboard.*.ts)
├── test/
│   ├── jest-e2e.json
│   ├── setup-e2e.ts                   # migrate deploy + truncate + seed minimal
│   ├── helpers/                       # login helper, factory
│   ├── auth.e2e-spec.ts
│   ├── products.e2e-spec.ts
│   └── orders.e2e-spec.ts
├── .env.example
├── .env.test.example
├── Dockerfile
├── docker-entrypoint.sh
├── .dockerignore
├── eslint.config.mjs
├── nest-cli.json
├── tsconfig.json
└── package.json
```

### 4.1 Penjelasan tiap folder/file (untuk dipelajari)

| Path | Tanggung jawab | Alasan / yang perlu bisa dijelaskan |
|---|---|---|
| `prisma/schema.prisma` | Definisi model & relasi | Satu sumber kebenaran skema; `@@map` menjaga nama tabel snake_case |
| `prisma/migrations/` | Riwayat SQL migrasi | Reproducible dari DB kosong; ada migrasi khusus CHECK constraint |
| `prisma/seed.ts` | Data awal (admin, 20 produk, 15 customer, 30 order/30 hari) | Idempotent (upsert); order seed dibuat lewat logika yang sama agar stok konsisten |
| `src/main.ts` | Bootstrap: prefix, helmet, CORS, swagger | Memanggil `configureApp(app)` |
| `src/configure-app.ts` | Pipe, filter, interceptor, prefix global | Dipakai bersama oleh `main.ts` dan e2e test |
| `src/app.module.ts` | Root module, daftar provider global | `APP_GUARD`: JwtAuthGuard → ThrottlerGuard |
| `src/config/env.validation.ts` | Validasi env saat boot | Fail-fast jika secret/DB hilang |
| `src/common/decorators/` | `@Public()`, `@CurrentUser()` | Membuka route tertentu; mengambil user dari request |
| `src/common/dto/` | `PaginationQueryDto` | Validasi `page`, `per_page` sekali, dipakai ulang |
| `src/common/filters/` | `AllExceptionsFilter` | Semua error → envelope `{success:false,message,errors}` |
| `src/common/guards/` | `JwtAuthGuard` global | Secure by default |
| `src/common/interceptors/` | `ResponseInterceptor` | Membungkus sukses → `{success,message,data,meta}` |
| `src/common/pipes/` | Factory ValidationPipe | Ubah error class-validator → 422 per field |
| `src/common/utils/` | `pagination.ts`, `jakarta-date.ts` | Fungsi murni → mudah diuji |
| `src/health/` | `GET /api/health` | Dipakai verifikasi setup & healthcheck |
| `src/prisma/` | `PrismaModule` (@Global) + `PrismaService` | Satu koneksi DB, ditutup rapi saat shutdown |
| `src/auth/` | Login, refresh, logout, me, `JwtStrategy` | Password argon2; access + refresh token |
| `src/products/` | CRUD + search/sort/pagination + soft delete | Filter `deletedAt: null`; 409 jika kode duplikat |
| `src/customers/` | CRUD + search nama + soft delete | Sama pola dengan products |
| `src/orders/` | Buat order, list (filter tanggal/customer), detail | `OrderNumberService` + transaksi atomik |
| `src/dashboard/` | Ringkasan: total transaksi, omzet, top 5, stok < 5 | Agregasi via Prisma `groupBy` / raw query |
| `test/` | e2e (Jest + Supertest) + helper + setup DB test | DB terpisah, `--runInBand` |
| `Dockerfile`, `docker-entrypoint.sh` | Image backend + migrate otomatis saat start | Trade-off: devDeps ikut agar `prisma`/`tsx` tersedia |

**Aturan layering:** Controller (HTTP saja) → Service (logika bisnis) → PrismaService (data). Controller tidak boleh memanggil Prisma langsung; DTO tidak boleh berisi logika bisnis.

---

## 5. Konfigurasi Inti

### 5.1 `tsconfig.json` (pastikan)
```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true
  }
}
```

### 5.2 `src/main.ts` — bootstrap
Hal yang wajib terpasang:
- `app.setGlobalPrefix('api')`
- `app.use(helmet())`
- `app.enableCors({ origin: process.env.FRONTEND_URL, credentials: true })`
- `app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, exceptionFactory }))` — `exceptionFactory` mengubah error `class-validator` menjadi `{ "field.path": ["pesan"] }` dengan HTTP **422**.
- `app.useGlobalFilters(new AllExceptionsFilter())` dan `app.useGlobalInterceptors(new ResponseInterceptor())` (envelope `success/message/data/meta`).
- Swagger di `/api/docs` (`DocumentBuilder().addBearerAuth()`), plus tulis `docs/openapi.json` saat `NODE_ENV !== 'production'`.
- `app.enableShutdownHooks()` agar koneksi Prisma ditutup rapi.

### 5.3 `AppModule`
- `ConfigModule.forRoot({ isGlobal: true, validate })` (validasi env: wajib `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `FRONTEND_URL`).
- `ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }])`; login diberi limit lebih ketat (`@Throttle({ default: { limit: 5, ttl: 60_000 } })`).
- Provider global `APP_GUARD`: `JwtAuthGuard` (menghormati `@Public()`), lalu `ThrottlerGuard`.

### 5.4 Helper penting
| File | Fungsi |
|---|---|
| `common/utils/pagination.ts` | Hitung `skip/take`, bentuk `meta` (`page, per_page, total, total_pages`), batasi `per_page ≤ 100` |
| `common/utils/jakarta-date.ts` | Tanggal `YYYYMMDD` & batas hari zona Asia/Jakarta via `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' })` — tanpa dependency tambahan |
| `orders/order-number.service.ts` | Upsert atomik `order_counters` di dalam transaksi order |

---

## 6. Environment

**`backend/.env.example`**
```env
NODE_ENV=development
PORT=4000
DATABASE_URL="postgresql://azatech:azatech@localhost:5432/azatech_shop?schema=public"
FRONTEND_URL=http://localhost:3000
JWT_ACCESS_SECRET=ganti-dengan-string-acak-panjang
JWT_REFRESH_SECRET=ganti-dengan-string-acak-lain
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d
SEED_ADMIN_EMAIL=admin@azatech.id
SEED_ADMIN_PASSWORD=Admin123!
```

**`backend/.env.test.example`** — database terpisah:
```env
DATABASE_URL="postgresql://azatech:azatech@localhost:5432/azatech_shop_test?schema=public"
```

**`.env` root (untuk compose)** — lihat §9.

> `.env`, `.env.test`, `.env.*.local` masuk `.gitignore`. Hanya `*.example` yang di-commit.

---

## 7. Scripts `package.json`

```json
{
  "scripts": {
    "start:dev": "nest start --watch",
    "build": "prisma generate && nest build",
    "start:prod": "node dist/main",
    "lint": "eslint \"{src,test}/**/*.ts\" --fix",
    "format": "prettier --write \"src/**/*.ts\" \"test/**/*.ts\"",
    "db:migrate": "prisma migrate dev",
    "db:deploy": "prisma migrate deploy",
    "db:seed": "prisma db seed",
    "db:reset": "prisma migrate reset --force",
    "test:e2e": "dotenv -e .env.test -- jest --config ./test/jest-e2e.json --runInBand"
  }
}
```
Tambahkan `pnpm add -D dotenv-cli` untuk `test:e2e`. `--runInBand` agar test yang berbagi DB tidak saling menimpa.

> Catatan: jika `nest build` menghasilkan `dist/src/main.js` (karena `prisma/` ikut ter-compile), sesuaikan `start:prod` dan entrypoint — verifikasi sekali setelah build pertama.

---

## 8. Strategi Test (setup)

- `test/jest-e2e.json`: `rootDir: ".."`, `testRegex: ".e2e-spec.ts$"`, `transform` ts-jest, `setupFilesAfterEach`/`globalSetup` memanggil `prisma migrate deploy` ke DB test.
- Helper `createTestApp()` membuat `INestApplication` dengan **konfigurasi yang sama persis dengan `main.ts`** (pipe, filter, interceptor, prefix) — hindari duplikasi dengan mengekstrak fungsi `configureApp(app)` dan dipakai di keduanya.
- `beforeEach`: `TRUNCATE ... RESTART IDENTITY CASCADE` lalu buat admin, customer, dan produk minimal lewat helper.
- Skenario wajib ada di `PRD.md` §8 (order sukses, stok tidak cukup + atomik, validasi gagal, tanpa token, dll.).

---

## 9. Docker

### 9.1 `backend/Dockerfile`
```dockerfile
FROM node:24-slim AS base
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm build

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app ./
RUN chmod +x docker-entrypoint.sh
EXPOSE 4000
ENTRYPOINT ["./docker-entrypoint.sh"]
```
Image runtime sengaja menyertakan devDependencies agar `prisma migrate deploy` dan `tsx` (seed) tersedia — trade-off ukuran image dicatat di README.

### 9.2 `backend/docker-entrypoint.sh`
```sh
#!/bin/sh
set -e
pnpm prisma migrate deploy
if [ "$RUN_SEED" = "true" ]; then pnpm prisma db seed; fi
exec pnpm start:prod
```

### 9.3 `docker-compose.yml` (di **root**)
```yaml
services:
  db:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    ports: ["5432:5432"]
    volumes: [pgdata:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 5s
      timeout: 5s
      retries: 10

  backend:
    build: ./backend
    env_file: ./backend/.env
    environment:
      DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}?schema=public
      FRONTEND_URL: http://localhost:3000
    ports: ["4000:4000"]
    depends_on:
      db: { condition: service_healthy }

  frontend:
    build:
      context: ./frontend
      args:
        NEXT_PUBLIC_API_URL: http://localhost:4000/api
    ports: ["3000:3000"]
    depends_on: [backend]

volumes:
  pgdata:
```

**`.env` root (`.env.example`)**
```env
POSTGRES_USER=azatech
POSTGRES_PASSWORD=azatech
POSTGRES_DB=azatech_shop
```

Karena `backend` memakai `env_file: ./backend/.env`, pastikan `cp backend/.env.example backend/.env` ikut dijalankan (lihat langkah setup README di bawah).

---

## 10. Urutan Setup untuk README (≤ 6 perintah)

```bash
git clone <repo-url> && cd <repo>
cp .env.example .env && cp backend/.env.example backend/.env && cp frontend/.env.example frontend/.env
docker compose up -d --build
docker compose exec backend pnpm db:seed
# FE: http://localhost:3000 · API docs: http://localhost:4000/api/docs
# Login: admin@azatech.id / Admin123!
```

Mode lokal tanpa Docker untuk backend:
```bash
docker compose up -d db
cd backend && pnpm install && pnpm db:migrate && pnpm db:seed && pnpm start:dev
```

---

## 11. Rencana Commit Setup Backend

1. `chore(backend): scaffold nestjs strict, eslint, prettier`
2. `chore(backend): add prisma, env validation, prisma module`
3. `feat(db): initial schema, check constraints, seed`
4. `feat(backend): global pipe, filter, interceptor (response envelope)`
5. `feat(auth): jwt strategy, login, refresh, logout, me`
6. `chore(backend): swagger setup + openapi export`
7. `chore(docker): backend dockerfile, entrypoint, compose db+backend`
8. `test(backend): e2e harness (test db, helpers)`

---

## 12. Verifikasi Setup (Definition of Done — fondasi)

- [ ] `pnpm start:dev` berjalan; `GET http://localhost:4000/api/health` → `200` envelope standar.
- [ ] Swagger tampil di `/api/docs`, tombol Authorize (Bearer) berfungsi.
- [ ] `pnpm prisma migrate deploy` & `pnpm db:seed` sukses dari DB kosong; seed bisa diulang tanpa error.
- [ ] CHECK constraint aktif: update stok negatif / harga ≤ 0 via SQL ditolak DB.
- [ ] Request tanpa token → `401` envelope error; body tidak valid → `422` dengan `errors` per field.
- [ ] CORS: request dari `http://localhost:3000` diterima, origin lain ditolak.
- [ ] `pnpm lint` bersih, `pnpm build` sukses.
- [ ] `pnpm test:e2e` menjalankan minimal 1 test dummy (harness hidup) sebelum fitur ditulis.
- [ ] `docker compose up -d --build` menaikkan `db` + `backend` tanpa error; entrypoint menjalankan migrasi otomatis.
- [ ] Tidak ada `.env` yang ter-commit (`git ls-files | grep .env` hanya menampilkan `*.example`).

---

## 13. Catatan Realisasi Instalasi (status aktual)

Hal yang **berbeda dari rencana di atas** karena versi tool saat instalasi — penting dipahami untuk sesi review:

| Rencana PRD | Realisasi | Alasan |
|---|---|---|
| Jest + ts-jest | **Vitest 4** + Supertest | Scaffold NestJS 12 memakai Vitest; soal mengizinkan Vitest/Jest |
| ESLint + `eslint.config.mjs` | **oxlint** (`.oxlintrc.json`) | Default scaffold NestJS 12 |
| CommonJS | **ESM** (`"type": "module"`, impor memakai suffix `.js`) | Default scaffold NestJS 12 |
| `prisma` dari `latest` | **Prisma 7.10.1** dipin (CLI + client + adapter-pg) | `latest` = RC 8.x; CLI dev tidak cocok dengan client |
| Seed di `package.json` | `migrations.seed` di **`prisma.config.ts`** | Cara Prisma 7 |
| Client di `node_modules` | Di **`src/generated/prisma`** (gitignored) | Prisma 7 men-generate ke folder proyek; harus di bawah `rootDir` agar `nest build` lolos |
| `dotenv-cli` jalankan `jest` | `dotenv -e .env.test -- vitest run --config ./vitest.config.e2e.ts` | Mengikuti Vitest |
| `pnpm approve-builds` | `allowBuilds` di `pnpm-workspace.yaml` (argon2, prisma engines, esbuild) | pnpm 11 memblokir script build native |

**Sudah dikerjakan:** scaffold NestJS strict, semua dependency, skema Prisma tervalidasi + client ter-generate, 7 modul kosong (prisma global, auth, products, customers, orders, dashboard, health), `.env.example`/`.env.test.example`, folder `common/*`, script `package.json`, `GET /api/health`. `pnpm build` & `pnpm lint` lulus.

**Belum dikerjakan (butuh Postgres / tahap fitur):** migration `init` + CHECK constraint, seed, env validation, pipe/filter/interceptor/guard global, auth JWT, logika bisnis tiap modul, Swagger, Docker, test e2e. Docker Desktop belum menyala saat instalasi, jadi database belum bisa dijalankan.
