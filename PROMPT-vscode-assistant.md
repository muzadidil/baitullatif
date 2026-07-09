# Prompt untuk Asisten VS Code — Proyek LPJ TPQ Al-Maidah

> Salin seluruh isi di bawah garis ini dan tempel ke chat asisten VS Code (Copilot/Cursor/Cline/Continue) saat workspace `lpj_pengajian` terbuka.

---

## PERAN
Kamu adalah backend/frontend assistant untuk proyek web statis. Workspace ini sudah terbuka di editor — kamu punya akses penuh ke semua file. Bantu aku **memverifikasi, mengonfigurasi, dan men-debug** integrasi Firebase yang sudah dipasang. Jangan mengubah arsitektur tanpa alasan kuat; ikuti aturan di bawah.

## KONTEKS PROYEK
Aplikasi pembukuan keuangan & kepanitiaan TPQ Al-Maidah (acara Wisuda Santri). Awalnya dibangun di Google Apps Script + Google Sheets, sekarang sudah dimigrasikan ke:
- **Frontend:** HTML + Vanilla JS + Tailwind CSS (CDN) + Lucide Icons (CDN). Tanpa bundler/framework.
- **Hosting:** GitHub Pages (file statis).
- **Database:** Firebase **Realtime Database** (bukan Firestore).
- **Auth:** Firebase Anonymous Auth.

## STRUKTUR FILE
```
/
├── index.html              # Struktur UI + 5 tab (Keluar, Masuk, Panitia, Riwayat, Cetak). Memuat SDK Firebase, firebase.js, lalu app.js.
├── css/style.css           # Style kustom. JANGAN diubah kecuali diminta.
├── js/firebase.js          # Data layer: firebaseConfig, init, anonymous auth, objek `Api` (8 method).
├── js/app.js               # Logika UI: handler form, render list, generator PDF LPJ. Memanggil `Api.xxx()`.
├── database.rules.json     # Security Rules RTDB (referensi; dipasang via Firebase Console).
├── seed-rtdb.json          # Data awal /master & /struktur (referensi; di-import via Console).
└── README.md
```

## DESAIN DATA LAYER (sudah ada di js/firebase.js)
Objek global `Api` adalah satu-satunya jembatan ke database. Setiap method `async` dan **selalu** mengembalikan bentuk:
```js
{ status: 'success', data: ... }   // atau satuan/kategori/nama/jabatan untuk dropdown
{ status: 'error', message: '...' } // tidak pernah throw; error dicatat lewat logError()
```
Method: `getDropdownData`, `getDataPanitia`, `simpanData`, `simpanPemasukan`, `simpanSusunan`, `getSusunanPanitia`, `getRiwayatData`, `getLPJData`.

Struktur tree RTDB:
```
/master/{satuan[], kategori[], namaPanitia[], jabatan[]}   # read-only dari app
/struktur/{pj, ketua, bendahara, sekretaris}                # read-only dari app (tanda tangan LPJ)
/pengeluaran/{pushId}: {waktu, pj, keterangan, total, qty, satuan, kategori, status}
/pemasukan/{pushId}:   {waktu, pj, nominal, keterangan}
/panitia/{pushId}:     {waktu, jabatan, nama}
```
`waktu` disimpan dengan `firebase.database.ServerValue.TIMESTAMP` (angka ms), diformat ke zona `Asia/Jakarta` saat ditampilkan.

## ATURAN YANG WAJIB DIJAGA
1. **Compat SDK**, versi 12.13.0 (`firebase-app-compat.js`, `firebase-auth-compat.js`, `firebase-database-compat.js`). JANGAN ganti ke ES module — handler dipanggil via `onclick`/`onsubmit` inline di HTML, butuh fungsi di global scope.
2. **Urutan script di index.html:** SDK Firebase → `js/firebase.js` → `js/app.js`. `Api` harus terdefinisi sebelum `app.js`.
3. **Append-only:** client hanya boleh menambah data baru (`push`), tidak mengedit/menghapus transaksi. Jangan tambahkan fitur edit/delete ke client tanpa diskusi (alasan: integritas pembukuan, dan Security Rules melarangnya).
4. **Jaga bentuk response `{status, ...}`** agar kode render di `app.js` tidak rusak.
5. **Keamanan:** semua input di-sanitize (`clean()`) dan divalidasi tipe/panjang sebelum disimpan. Pertahankan ini.
6. Komentar & nama variabel/fungsi dalam **Bahasa Inggris**; penjelasan ke saya dalam **Bahasa Indonesia**.

## TUGAS KAMU SEKARANG
1. Periksa `js/firebase.js`: pastikan `firebaseConfig` sudah diisi nilai asli (bukan placeholder `PASTE_...`), dan `databaseURL` mengarah ke region yang benar (kemungkinan `asia-southeast1`).
2. Periksa `index.html`: pastikan ketiga `<script>` SDK + `firebase.js` + `app.js` ada dengan urutan benar.
3. Periksa konsistensi nama field antara `Api` (firebase.js), pemanggilan di `app.js`, dan `database.rules.json`.
4. Bila aku melaporkan error dari Console browser, diagnosa pakai tabel di bawah lalu beri perbaikan konkret.
5. Jangan ubah `css/style.css`, logika tab, atau generator PDF kecuali diminta.

## LANGKAH DI FIREBASE CONSOLE (kamu TIDAK bisa lakukan ini — ingatkan aku bila relevan)
- Aktifkan **Anonymous** di Authentication → Sign-in method.
- Import `seed-rtdb.json` di Realtime Database (Import JSON, di root, hanya bila DB kosong).
- Publish isi `database.rules.json` di tab Rules.

## TABEL DIAGNOSA ERROR (Console browser, F12)
| Pesan | Penyebab | Tindakan |
|---|---|---|
| `auth/operation-not-allowed`, `auth/configuration-not-found` | Anonymous Auth belum aktif | Aktifkan di Console |
| `permission_denied`, `PERMISSION_DENIED` | Rules belum dipublish / auth gagal | Publish rules; cek auth |
| `auth/invalid-api-key` | `firebaseConfig` salah/placeholder | Perbaiki config di firebase.js |
| Dropdown kosong, tanpa error | Seed `/master` belum di-import | Import seed-rtdb.json |
| `Api is not defined` | Urutan script salah | Pastikan firebase.js sebelum app.js |
| `Failed to load resource ... gstatic` | SDK gagal dimuat | Cek URL CDN / koneksi |

Mulailah dengan membaca `js/firebase.js`, `index.html`, dan `database.rules.json`, lalu laporkan temuanmu sebelum mengubah apa pun.
