/* ==========================================
   MASJID JAMIK BAITULLATIF - Firebase Data Layer (Realtime Database)
   Sistem Elektronik Masjid

   RTDB tree structure (seed via Console -> Import JSON):
     /master/satuan            : ["Pcs", "Box", ...]
     /master/kategoriKeluar    : ["Listrik & Air", ...]
     /master/kategoriMasuk     : ["Infaq Jumat", ...]
     /master/namaPengurus      : ["Nama 1", ...]
     /master/jabatan           : ["Ketua", "Sekretaris", ...]
     /struktur                 : { ketua, sekretaris, bendahara, penasehat }
     /pengurus/{pushId}        : { waktu, jabatan, nama }
     /kegiatan/{pushId}        : { nama, status: 'aktif'|'selesai', dibuat }
     /kas/{bukuId}/pengeluaran/{pushId}
                               : { waktu, pj, jabatanPj, keterangan, total, qty, satuan, kategori, status }
     /kas/{bukuId}/pemasukan/{pushId}
                               : { waktu, pj, jabatanPj, keterangan, nominal, kategori }
     /surat/{pushId}           : { nomor, jenis, tanggal, perihal, tujuan, lampiran, detail, pembuat, dibuat }
     /suratCounter/{tahun}     : number (auto-increment per year)
     /admin/config             : { pinHash, memberPinHash, menu, orgInfo, logoBase64 }
     /admin/memberPins/{key}   : sha256 hash

   bukuId is either the literal 'masjid' (kas operasional masjid)
   or a /kegiatan pushId (kas per kegiatan).

   Every method returns:
     { status: 'success', data: ... } | { status: 'error', message: '...' }
   ========================================== */

// PASTE the config of your OWN Firebase project here (see README.md).
const firebaseConfig = {
  apiKey: "AIzaSyBDNs3AgbikSai9JKPXNO7kCWv-voHiCLk",
  authDomain: "baitullatif-karangsono.firebaseapp.com",
  databaseURL: "https://baitullatif-karangsono-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "baitullatif-karangsono",
  storageBucket: "baitullatif-karangsono.firebasestorage.app",
  messagingSenderId: "340304823291",
  appId: "1:340304823291:web:624557c61a1f8751a3015e"
};

const BUKU_MASJID = 'masjid';

// True once firebaseConfig no longer contains placeholder values.
const FIREBASE_CONFIGURED = !/^PASTE_/.test(firebaseConfig.apiKey);

let db = null;
let authReady = Promise.resolve(false);

if (FIREBASE_CONFIGURED) {
  firebase.initializeApp(firebaseConfig);
  db = firebase.database();
  // Sign in anonymously so Security Rules can require `auth != null`.
  authReady = firebase.auth()
    .signInAnonymously()
    .then(() => true)
    .catch((err) => { logError('auth.signInAnonymously', err); return false; });
}

const NOT_CONFIGURED_MSG = 'Firebase belum dikonfigurasi. Isi firebaseConfig di firebase.js (lihat README.md).';

// ----- Centralized error logger -----
function logError(context, error) {
  const entry = {
    context: context,
    message: (error && error.message) ? error.message : String(error),
    code: (error && error.code) ? error.code : null,
    time: new Date().toISOString()
  };
  console.error('[APP ERROR]', entry);
  return entry;
}

// ----- Helpers -----
function toArr(value) {
  if (!value) return [];
  const arr = Array.isArray(value) ? value : Object.values(value);
  return arr.filter(v => v !== null && v !== undefined && String(v).trim() !== '');
}

function _dateParts(ms) {
  const fmt = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    weekday: 'long',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false
  });
  const p = {};
  fmt.formatToParts(new Date(ms)).forEach(o => { p[o.type] = o.value; });
  return p;
}

function formatTanggalJam(ms) {
  if (!ms) return '-';
  const p = _dateParts(ms);
  const hari = p.weekday ? p.weekday.charAt(0).toUpperCase() + p.weekday.slice(1) : '';
  return `${p.hour}:${p.minute} ${hari} ${p.day}/${p.month}/${p.year}`;
}

function formatTanggal(ms) {
  if (!ms) return '-';
  const p = _dateParts(ms);
  return `${p.day}/${p.month}/${p.year}`;
}

const BULAN_INDO = ["Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const BULAN_ROMAWI = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

// "9 Juli 2026" in Asia/Jakarta
function formatTanggalPanjang(ms) {
  if (!ms) return '-';
  const p = _dateParts(ms);
  return `${Number(p.day)} ${BULAN_INDO[Number(p.month) - 1]} ${p.year}`;
}

function clean(value, maxLen = 200) {
  return String(value || '').trim().slice(0, maxLen);
}

// Escape user input before embedding in generated HTML (print windows, lists).
function esc(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function notConfigured(extra) {
  return Object.assign({ status: 'error', message: NOT_CONFIGURED_MSG }, extra || {});
}

// ----- Data access API -----
const Api = {

  // 1. Dropdown: satuan & kategori (keluar + masuk)
  async getDropdownData() {
    if (!db) return notConfigured({ satuan: [], kategoriKeluar: [], kategoriMasuk: [] });
    try {
      await authReady;
      const snap = await db.ref('master').once('value');
      const m = snap.val() || {};
      return {
        status: 'success',
        satuan: toArr(m.satuan),
        kategoriKeluar: toArr(m.kategoriKeluar),
        kategoriMasuk: toArr(m.kategoriMasuk)
      };
    } catch (e) {
      return { status: 'error', satuan: [], kategoriKeluar: [], kategoriMasuk: [], message: logError('getDropdownData', e).message };
    }
  },

  // 2. Dropdown pengurus: nama & jabatan
  async getDataPengurus() {
    if (!db) return notConfigured({ nama: [], jabatan: [] });
    try {
      await authReady;
      const snap = await db.ref('master').once('value');
      const m = snap.val() || {};
      return { status: 'success', nama: toArr(m.namaPengurus), jabatan: toArr(m.jabatan) };
    } catch (e) {
      return { status: 'error', nama: [], jabatan: [], message: logError('getDataPengurus', e).message };
    }
  },

  // ===== KEGIATAN =====

  // 3. List kegiatan (newest first). filterStatus: 'aktif' | 'selesai' | '' (all)
  async getKegiatanList(filterStatus) {
    if (!db) return notConfigured({ data: [] });
    try {
      await authReady;
      const snap = await db.ref('kegiatan').once('value');
      const val = snap.val() || {};
      let list = Object.keys(val).map(k => ({
        id: k,
        nama: val[k].nama || '-',
        status: val[k].status || 'aktif',
        dibuat: val[k].dibuat || 0
      }));
      list.sort((a, b) => b.dibuat - a.dibuat);
      if (filterStatus) list = list.filter(i => i.status === filterStatus);
      return { status: 'success', data: list };
    } catch (e) {
      return { status: 'error', data: [], message: logError('getKegiatanList', e).message };
    }
  },

  // 4. Create kegiatan
  async simpanKegiatan(nama) {
    if (!db) return notConfigured();
    try {
      await authReady;
      const n = clean(nama, 100);
      if (!n) return { status: 'error', message: 'Nama kegiatan wajib diisi' };
      await db.ref('kegiatan').push({
        nama: n,
        status: 'aktif',
        dibuat: firebase.database.ServerValue.TIMESTAMP
      });
      return { status: 'success' };
    } catch (e) {
      return { status: 'error', message: logError('simpanKegiatan', e).message };
    }
  },

  // 5. Update kegiatan (rename / change status)
  async updateKegiatan(id, patch) {
    if (!db) return notConfigured();
    try {
      await authReady;
      const upd = {};
      if (patch.nama !== undefined) upd.nama = clean(patch.nama, 100);
      if (patch.status !== undefined) upd.status = patch.status === 'selesai' ? 'selesai' : 'aktif';
      await db.ref('kegiatan/' + id).update(upd);
      return { status: 'success' };
    } catch (e) {
      return { status: 'error', message: logError('updateKegiatan', e).message };
    }
  },

  // 6. Delete kegiatan AND its ledger (/kas/{id})
  async deleteKegiatan(id) {
    if (!db) return notConfigured();
    try {
      await authReady;
      await db.ref('kas/' + id).remove();
      await db.ref('kegiatan/' + id).remove();
      return { status: 'success' };
    } catch (e) {
      return { status: 'error', message: logError('deleteKegiatan', e).message };
    }
  },

  // ===== KAS (per buku: 'masjid' or kegiatanId) =====

  // 7. Save pengeluaran (append-only)
  async simpanPengeluaran(bukuId, data) {
    if (!db) return notConfigured();
    try {
      await authReady;
      const buku = clean(bukuId, 50);
      const total = Number(data.total) || 0;
      const qty = Number(data.qty) || 0;
      const pj = clean(data.pj, 100);
      const keterangan = clean(data.keterangan, 200);

      if (!buku) return { status: 'error', message: 'Pilih buku kas terlebih dahulu' };
      if (!pj || !keterangan) return { status: 'error', message: 'PJ dan keterangan wajib diisi' };
      if (total <= 0) return { status: 'error', message: 'Total harga harus lebih dari 0' };

      await db.ref('kas/' + buku + '/pengeluaran').push({
        waktu: firebase.database.ServerValue.TIMESTAMP,
        pj: pj,
        jabatanPj: clean(data.jabatanPj || '', 50),
        keterangan: keterangan,
        total: total,
        qty: qty,
        satuan: clean(data.satuan, 50) || '-',
        kategori: clean(data.kategori, 50) || 'Lain-lain',
        status: 'Berhasil'
      });
      return { status: 'success', message: 'Data pengeluaran berhasil disimpan' };
    } catch (e) {
      return { status: 'error', message: logError('simpanPengeluaran', e).message };
    }
  },

  // 8. Save pemasukan (append-only)
  async simpanPemasukan(bukuId, data) {
    if (!db) return notConfigured();
    try {
      await authReady;
      const buku = clean(bukuId, 50);
      const nominal = Number(data.nominal) || 0;
      const pj = clean(data.pj, 100);

      if (!buku) return { status: 'error', message: 'Pilih buku kas terlebih dahulu' };
      if (!pj) return { status: 'error', message: 'Penanggung jawab wajib diisi' };
      if (nominal <= 0) return { status: 'error', message: 'Nominal harus lebih dari 0' };

      await db.ref('kas/' + buku + '/pemasukan').push({
        waktu: firebase.database.ServerValue.TIMESTAMP,
        pj: pj,
        jabatanPj: clean(data.jabatanPj || '', 50),
        nominal: nominal,
        keterangan: clean(data.keterangan, 200),
        kategori: clean(data.kategori, 50) || 'Lain-lain'
      });
      return { status: 'success', message: 'Data pemasukan berhasil disimpan' };
    } catch (e) {
      return { status: 'error', message: logError('simpanPemasukan', e).message };
    }
  },

  // 9. Laporan D/K per buku, optional period filter (ms timestamps, inclusive).
  //    Returns merged rows (D = pemasukan, K = pengeluaran) sorted oldest first.
  async getLaporanData(bukuId, fromMs, toMs) {
    if (!db) return notConfigured({ data: null });
    try {
      await authReady;
      const buku = clean(bukuId, 50) || BUKU_MASJID;
      const [kelSnap, masSnap] = await Promise.all([
        db.ref('kas/' + buku + '/pengeluaran').once('value'),
        db.ref('kas/' + buku + '/pemasukan').once('value')
      ]);
      const kel = kelSnap.val() || {};
      const mas = masSnap.val() || {};

      let rows = [];
      Object.keys(mas).forEach(k => {
        const r = mas[k];
        rows.push({
          key: k, jenis: 'D',
          waktu: r.waktu || 0,
          tanggal: formatTanggal(r.waktu),
          tanggalJam: formatTanggalJam(r.waktu),
          keterangan: r.keterangan || 'Pemasukan',
          kategori: r.kategori || '-',
          pj: r.pj || '-',
          jabatanPj: r.jabatanPj || '',
          qty: 0, satuan: '',
          nominal: Number(r.nominal) || 0
        });
      });
      Object.keys(kel).forEach(k => {
        const r = kel[k];
        rows.push({
          key: k, jenis: 'K',
          waktu: r.waktu || 0,
          tanggal: formatTanggal(r.waktu),
          tanggalJam: formatTanggalJam(r.waktu),
          keterangan: r.keterangan || '-',
          kategori: r.kategori || '-',
          pj: r.pj || '-',
          jabatanPj: r.jabatanPj || '',
          qty: r.qty || 0,
          satuan: r.satuan || '',
          nominal: Number(r.total) || 0
        });
      });

      if (fromMs) rows = rows.filter(r => r.waktu >= fromMs);
      if (toMs) rows = rows.filter(r => r.waktu <= toMs);
      rows.sort((a, b) => a.waktu - b.waktu);

      let totalD = 0, totalK = 0;
      rows.forEach(r => { if (r.jenis === 'D') totalD += r.nominal; else totalK += r.nominal; });

      return {
        status: 'success',
        data: { rows: rows, totalD: totalD, totalK: totalK, saldo: totalD - totalK }
      };
    } catch (e) {
      return { status: 'error', data: null, message: logError('getLaporanData', e).message };
    }
  },

  // ===== PENGURUS =====

  // 10. Save susunan pengurus (append-only)
  async simpanPengurus(data) {
    if (!db) return notConfigured();
    try {
      await authReady;
      const jabatan = clean(data.jabatan, 50);
      const nama = clean(data.nama, 100);
      if (!jabatan || !nama) return { status: 'error', message: 'Jabatan dan nama wajib diisi' };
      await db.ref('pengurus').push({
        waktu: firebase.database.ServerValue.TIMESTAMP,
        jabatan: jabatan,
        nama: nama
      });
      return { status: 'success', message: 'Susunan pengurus berhasil disimpan' };
    } catch (e) {
      return { status: 'error', message: logError('simpanPengurus', e).message };
    }
  },

  // 11. Read susunan pengurus with search/filter (newest first)
  async getSusunanPengurus(params) {
    if (!db) return notConfigured({ data: [] });
    try {
      await authReady;
      const snap = await db.ref('pengurus').once('value');
      const val = snap.val() || {};
      let list = Object.keys(val).map(k => ({
        jabatan: val[k].jabatan || '-',
        nama: val[k].nama || '-',
        _w: val[k].waktu || 0
      }));
      list.sort((a, b) => b._w - a._w);

      const search = (params && params.search) ? params.search.toLowerCase() : '';
      const filterJabatan = (params && params.jabatan) ? params.jabatan : '';
      if (search) list = list.filter(i => String(i.nama).toLowerCase().includes(search));
      if (filterJabatan) list = list.filter(i => i.jabatan === filterJabatan);

      return { status: 'success', data: list.map(({ _w, ...rest }) => rest) };
    } catch (e) {
      return { status: 'error', data: [], message: logError('getSusunanPengurus', e).message };
    }
  },

  // 12. Admin: get all pengurus records with keys
  async getAllPengurusRecords() {
    if (!db) return notConfigured({ data: [] });
    try {
      await authReady;
      const snap = await db.ref('pengurus').once('value');
      const val = snap.val() || {};
      const list = Object.keys(val).map(k => ({
        key: k,
        jabatan: val[k].jabatan || '-',
        nama: val[k].nama || '-',
        waktu: val[k].waktu || 0
      }));
      list.sort((a, b) => b.waktu - a.waktu);
      return { status: 'success', data: list };
    } catch (e) {
      return { status: 'error', data: [], message: logError('getAllPengurusRecords', e).message };
    }
  },

  // 13. Admin: update jabatan of a pengurus record
  async updatePengurusJabatan(key, jabatan) {
    if (!db) return notConfigured();
    try {
      await authReady;
      await db.ref('pengurus/' + key + '/jabatan').set(clean(jabatan, 50));
      return { status: 'success' };
    } catch (e) {
      return { status: 'error', message: logError('updatePengurusJabatan', e).message };
    }
  },

  // 14. Admin: delete a pengurus record
  async deletePengurus(key) {
    if (!db) return notConfigured();
    try {
      await authReady;
      await db.ref('pengurus/' + key).remove();
      return { status: 'success' };
    } catch (e) {
      return { status: 'error', message: logError('deletePengurus', e).message };
    }
  },

  // ===== STRUKTUR (penandatangan) =====

  // 15. Get struktur takmir { ketua, sekretaris, bendahara, penasehat }
  async getStruktur() {
    if (!db) return notConfigured({ data: {} });
    try {
      await authReady;
      const snap = await db.ref('struktur').once('value');
      return { status: 'success', data: snap.val() || {} };
    } catch (e) {
      return { status: 'error', data: {}, message: logError('getStruktur', e).message };
    }
  },

  // 16. Save struktur takmir
  async saveStruktur(data) {
    if (!db) return notConfigured();
    try {
      await authReady;
      await db.ref('struktur').set({
        ketua: clean(data.ketua, 100),
        sekretaris: clean(data.sekretaris, 100),
        bendahara: clean(data.bendahara, 100),
        penasehat: clean(data.penasehat, 100)
      });
      return { status: 'success' };
    } catch (e) {
      return { status: 'error', message: logError('saveStruktur', e).message };
    }
  },

  // ===== SURAT =====

  // 17. Generate nomor surat via transaction on /suratCounter/{tahun}.
  //     Format: 001/{kodeSurat}/{bulanRomawi}/{tahun}
  async generateNomorSurat(tanggalMs, kodeSurat) {
    if (!db) return notConfigured();
    try {
      await authReady;
      const d = new Date(tanggalMs || Date.now());
      const tahun = d.getFullYear();
      const bulan = d.getMonth();
      const ref = db.ref('suratCounter/' + tahun);
      const result = await ref.transaction(cur => (Number(cur) || 0) + 1);
      if (!result.committed) return { status: 'error', message: 'Gagal mengambil nomor urut surat' };
      const seq = result.snapshot.val();
      const nomor = String(seq).padStart(3, '0') + '/' + (clean(kodeSurat, 30) || 'TKM-BTL') +
        '/' + BULAN_ROMAWI[bulan] + '/' + tahun;
      return { status: 'success', nomor: nomor, seq: seq };
    } catch (e) {
      return { status: 'error', message: logError('generateNomorSurat', e).message };
    }
  },

  // 18. Save surat to archive
  async simpanSurat(record) {
    if (!db) return notConfigured();
    try {
      await authReady;
      const surat = {
        nomor: clean(record.nomor, 60),
        jenis: clean(record.jenis, 30),
        tanggal: Number(record.tanggal) || Date.now(),
        perihal: clean(record.perihal, 150),
        tujuan: clean(record.tujuan, 200),
        lampiran: clean(record.lampiran, 50) || '-',
        detail: record.detail || {},
        pembuat: clean(record.pembuat, 100),
        dibuat: firebase.database.ServerValue.TIMESTAMP
      };
      if (!surat.nomor || !surat.jenis) return { status: 'error', message: 'Nomor dan jenis surat wajib ada' };
      const ref = await db.ref('surat').push(surat);
      return { status: 'success', key: ref.key };
    } catch (e) {
      return { status: 'error', message: logError('simpanSurat', e).message };
    }
  },

  // 19. Archive list (newest first)
  async getArsipSurat() {
    if (!db) return notConfigured({ data: [] });
    try {
      await authReady;
      const snap = await db.ref('surat').once('value');
      const val = snap.val() || {};
      const list = Object.keys(val).map(k => Object.assign({ key: k }, val[k]));
      list.sort((a, b) => (b.dibuat || 0) - (a.dibuat || 0));
      return { status: 'success', data: list };
    } catch (e) {
      return { status: 'error', data: [], message: logError('getArsipSurat', e).message };
    }
  },

  // 20. Delete a surat from archive (numbering is NOT rolled back)
  async deleteSurat(key) {
    if (!db) return notConfigured();
    try {
      await authReady;
      await db.ref('surat/' + key).remove();
      return { status: 'success' };
    } catch (e) {
      return { status: 'error', message: logError('deleteSurat', e).message };
    }
  },

  // ===== ADMIN =====

  // 21. Admin: get config (pinHash + menu + orgInfo + logo)
  async getAdminConfig() {
    if (!db) return notConfigured({ data: {} });
    try {
      await authReady;
      const snap = await db.ref('admin/config').once('value');
      return { status: 'success', data: snap.val() || {} };
    } catch (e) {
      return { status: 'error', data: {}, message: logError('getAdminConfig', e).message };
    }
  },

  // 22. Admin: save full config
  async saveAdminConfig(config) {
    if (!db) return notConfigured();
    try {
      await authReady;
      await db.ref('admin/config').set(config);
      return { status: 'success' };
    } catch (e) {
      return { status: 'error', message: logError('saveAdminConfig', e).message };
    }
  },

  // 23. Admin: get full master data
  async getMasterData() {
    if (!db) return notConfigured({ data: {} });
    try {
      await authReady;
      const snap = await db.ref('master').once('value');
      return { status: 'success', data: snap.val() || {} };
    } catch (e) {
      return { status: 'error', data: {}, message: logError('getMasterData', e).message };
    }
  },

  // 24. Admin: overwrite a master list (kategoriKeluar, namaPengurus, etc.)
  async updateMasterList(key, arr) {
    if (!db) return notConfigured();
    try {
      await authReady;
      await db.ref('master/' + key).set(arr);
      return { status: 'success' };
    } catch (e) {
      return { status: 'error', message: logError('updateMasterList', e).message };
    }
  },

  // 25. Admin audit: all records of one buku + jenis ('pengeluaran'|'pemasukan'), newest first
  async getAllKasRecords(bukuId, jenis) {
    if (!db) return notConfigured({ data: [] });
    try {
      await authReady;
      const node = jenis === 'pemasukan' ? 'pemasukan' : 'pengeluaran';
      const snap = await db.ref('kas/' + clean(bukuId, 50) + '/' + node).once('value');
      const val = snap.val() || {};
      const list = Object.keys(val).map(k => {
        const r = val[k];
        return {
          key: k,
          waktu: r.waktu || 0,
          waktuFmt: formatTanggalJam(r.waktu),
          pj: r.pj || '-',
          jabatanPj: r.jabatanPj || '',
          keterangan: r.keterangan || '-',
          nominal: Number(node === 'pemasukan' ? r.nominal : r.total) || 0,
          qty: r.qty || 0,
          satuan: r.satuan || '-',
          kategori: r.kategori || '-'
        };
      });
      list.sort((a, b) => b.waktu - a.waktu);
      return { status: 'success', data: list };
    } catch (e) {
      return { status: 'error', data: [], message: logError('getAllKasRecords', e).message };
    }
  },

  // 26. Admin audit: update a kas record
  async updateKasRecord(bukuId, jenis, key, data) {
    if (!db) return notConfigured();
    try {
      await authReady;
      const node = jenis === 'pemasukan' ? 'pemasukan' : 'pengeluaran';
      const base = {
        waktu: Number(data.waktu) || Date.now(),
        pj: clean(data.pj, 100),
        jabatanPj: clean(data.jabatanPj || '', 50),
        keterangan: clean(data.keterangan, 200),
        kategori: clean(data.kategori || 'Lain-lain', 50)
      };
      let record;
      if (node === 'pemasukan') {
        record = Object.assign(base, { nominal: Number(data.nominal) || 0 });
      } else {
        record = Object.assign(base, {
          total: Number(data.nominal) || 0,
          qty: Number(data.qty) || 0,
          satuan: clean(data.satuan || '-', 50),
          status: 'Edit'
        });
      }
      await db.ref('kas/' + clean(bukuId, 50) + '/' + node + '/' + key).set(record);
      return { status: 'success' };
    } catch (e) {
      return { status: 'error', message: logError('updateKasRecord', e).message };
    }
  },

  // 27. Admin audit: delete a kas record
  async deleteKasRecord(bukuId, jenis, key) {
    if (!db) return notConfigured();
    try {
      await authReady;
      const node = jenis === 'pemasukan' ? 'pemasukan' : 'pengeluaran';
      await db.ref('kas/' + clean(bukuId, 50) + '/' + node + '/' + key).remove();
      return { status: 'success' };
    } catch (e) {
      return { status: 'error', message: logError('deleteKasRecord', e).message };
    }
  },

  // 28. Get all per-member PIN hashes from /admin/memberPins
  async getMemberPins() {
    if (!db) return notConfigured({ data: {} });
    try {
      await authReady;
      const snap = await db.ref('admin/memberPins').once('value');
      return { status: 'success', data: snap.val() || {} };
    } catch (e) {
      return { status: 'error', data: {}, message: logError('getMemberPins', e).message };
    }
  },

  // 29. Set individual member PIN hash
  async setMemberPin(nameKey, pinHash) {
    if (!db) return notConfigured();
    try {
      await authReady;
      await db.ref('admin/memberPins/' + nameKey).set(pinHash);
      return { status: 'success' };
    } catch (e) {
      return { status: 'error', message: logError('setMemberPin', e).message };
    }
  },

  // 30. Remove individual member PIN (reverts to shared PIN)
  async removeMemberPin(nameKey) {
    if (!db) return notConfigured();
    try {
      await authReady;
      await db.ref('admin/memberPins/' + nameKey).remove();
      return { status: 'success' };
    } catch (e) {
      return { status: 'error', message: logError('removeMemberPin', e).message };
    }
  }
};
