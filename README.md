# Sistem Elektronik Masjid Jamik Baitullatif

Aplikasi web statis (HTML + Vanilla JS + Tailwind CDN) untuk administrasi masjid:

- **Keuangan dua buku kas** — Kas Masjid (operasional rutin) dan Kas Kegiatan (setiap kegiatan punya buku sendiri), pencatatan pemasukan (Debit) & pengeluaran (Kredit), append-only dari sisi pengurus, koreksi lewat menu Audit di admin.
- **Laporan keuangan D/K** — per buku kas, dengan filter periode (rentang tanggal bebas + preset Bulan Ini / Bulan Lalu / Tahun Ini), cetak PDF siap print, dan export Excel.
- **Surat menyurat** — 5 jenis surat (Undangan, Pemberitahuan/Edaran, Permohonan Bantuan, Keterangan, Tugas) dengan kop surat, penomoran otomatis per tahun (`001/TKM-BTL/VII/2026`), cetak PDF siap print, dan arsip surat.
- **Susunan pengurus** — daftar takmir/pengurus dengan jabatan, login PIN per pengurus.
- **Panel admin** — kelola kegiatan, kategori, satuan, jabatan, identitas masjid (kop), logo, penandatangan, PIN, audit transaksi, export/import Excel.

Alamat: Dusun Krajan, Desa Karangsono, Kecamatan Bangsalsari, Kabupaten Jember.

## Struktur File

```
/
├── index.html            # Aplikasi pengurus: Keluar, Masuk, Laporan, Surat, Pengurus
├── admin.html            # Panel admin (PIN)
├── app.js                # Logika aplikasi utama
├── admin.js              # Logika panel admin
├── firebase.js           # Data layer: firebaseConfig + objek `Api`
├── style.css             # Style kustom (tema hijau masjid)
├── database.rules.json   # Security Rules RTDB (dipasang via Firebase Console)
├── seed-rtdb.json        # Data awal /master & /struktur (di-import via Console)
└── README.md
```

## Setup Firebase (WAJIB, sekali saja)

Aplikasi belum bisa jalan sebelum langkah ini selesai — halaman akan menampilkan
peringatan "Setup Firebase Diperlukan".

1. **Buat project** di [console.firebase.google.com](https://console.firebase.google.com)
   → *Add project* → beri nama misalnya `baitullatif` (Google Analytics boleh dimatikan).
2. **Buat Realtime Database**: menu *Build → Realtime Database → Create Database*.
   Pilih lokasi **Singapore (asia-southeast1)**, mulai dalam **locked mode**.
3. **Pasang Security Rules**: di tab *Rules*, ganti seluruh isinya dengan isi file
   [`database.rules.json`](database.rules.json), lalu **Publish**.
4. **Import data awal**: di tab *Data*, klik ⋮ (titik tiga) → *Import JSON* →
   pilih file [`seed-rtdb.json`](seed-rtdb.json) (lakukan saat database masih kosong).
5. **Aktifkan Anonymous Auth**: menu *Build → Authentication → Get started →
   Sign-in method → Anonymous → Enable*.
6. **Daftarkan web app**: klik ikon ⚙ *Project settings → Your apps → Add app → Web (`</>`)*
   → beri nama → *Register*. Salin nilai `firebaseConfig` yang ditampilkan.
7. **Tempel config**: buka [`firebase.js`](firebase.js) dan ganti semua nilai
   `PASTE_...` di bagian atas file dengan nilai dari langkah 6. Pastikan `databaseURL`
   sesuai dengan URL database (berakhiran `asia-southeast1.firebasedatabase.app`).

Setelah itu buka `index.html` — login pengurus dengan PIN default **1234**
(nama diambil dari *Master Nama* di `/master/namaPengurus`; contoh nama dari seed
bisa diganti lewat Admin → Pengurus).

## Penggunaan

- **PIN default** admin & pengurus: `1234` — segera ganti lewat Admin → Akun.
- **Kegiatan baru** dibuat di Admin → Kegiatan; kegiatan otomatis muncul sebagai
  pilihan "Buku Kas" di form Keluar/Masuk dan di Laporan. Tandai *selesai* agar
  tidak muncul lagi di form input (laporannya tetap bisa dibuka).
- **Nomor surat** otomatis bertambah per tahun; kode surat (default `TKM-BTL`)
  diubah di Admin → Identitas. Menghapus surat dari arsip TIDAK mengembalikan nomor urut.
- **Identitas masjid** (nama, alamat, kota, logo, penandatangan) di Admin → Identitas —
  dipakai di kop surat dan laporan PDF.

## Hosting

File statis — bisa langsung dipush ke GitHub Pages (Settings → Pages → deploy dari
branch `main`) atau hosting statis lain. Tidak perlu build.
