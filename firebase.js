/* ==========================================
   TPQ AL-MAIDAH - Firebase Data Layer (Realtime Database)
   Replaces the old Google Apps Script bridge.

   RTDB tree structure (seed via Console -> Import JSON):
     /master/satuan       : ["Pcs", "Box", ...]
     /master/kategori     : ["Konsumsi", "Dekorasi", ...]
     /master/namaPanitia  : ["Nama 1", "Nama 2", ...]
     /master/jabatan      : ["Ketua", "Sekretaris", ...]
     /struktur            : { pj, ketua, bendahara, sekretaris }
     /pengeluaran/{pushId}: { waktu, pj, keterangan, total, qty, satuan, kategori, status }
     /pemasukan/{pushId}  : { waktu, pj, nominal, keterangan }
     /panitia/{pushId}    : { waktu, jabatan, nama }

   Every method returns the same shape as before:
     { status: 'success', data: ... } | { status: 'error', message: '...' }
   so the UI code in app.js does not need to change its checks.
   ========================================== */

const firebaseConfig = {
  apiKey: "AIzaSyDZapoLIviX-2tgi-DfaEYEASN4L8hbluY",
  authDomain: "al-maidah-karangsono.firebaseapp.com",
  databaseURL: "https://al-maidah-karangsono-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "al-maidah-karangsono",
  storageBucket: "al-maidah-karangsono.firebasestorage.app",
  messagingSenderId: "564960347514",
  appId: "1:564960347514:web:275be4c13c03a6f058c2c3"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// Sign in anonymously so Security Rules can require `auth != null`.
// Resolves to true/false; all Api methods await this before touching the DB.
const authReady = firebase.auth()
  .signInAnonymously()
  .then(() => true)
  .catch((err) => { logError('auth.signInAnonymously', err); return false; });

// ----- Centralized error logger (easy to forward to an external log sink later) -----
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

function clean(value, maxLen = 200) {
  return String(value || '').trim().slice(0, maxLen);
}

// ----- Data access API -----
const Api = {

  // 1. Dropdown: satuan & kategori
  async getDropdownData() {
    try {
      await authReady;
      const snap = await db.ref('master').once('value');
      const m = snap.val() || {};
      return { status: 'success', satuan: toArr(m.satuan), kategori: toArr(m.kategori) };
    } catch (e) {
      return { status: 'error', satuan: [], kategori: [], message: logError('getDropdownData', e).message };
    }
  },

  // 2. Dropdown panitia: nama & jabatan
  async getDataPanitia() {
    try {
      await authReady;
      const snap = await db.ref('master').once('value');
      const m = snap.val() || {};
      return { status: 'success', nama: toArr(m.namaPanitia), jabatan: toArr(m.jabatan) };
    } catch (e) {
      return { status: 'error', nama: [], jabatan: [], message: logError('getDataPanitia', e).message };
    }
  },

  // 3. Save pengeluaran (append-only)
  async simpanData(data) {
    try {
      await authReady;
      const total = Number(data.noRek) || 0;
      const qty = Number(data.qty) || 0;
      const pj = clean(data.pj, 100);
      const keterangan = clean(data.nama, 200);

      if (!pj || !keterangan) return { status: 'error', message: 'PJ dan keterangan wajib diisi' };
      if (total <= 0) return { status: 'error', message: 'Total harga harus lebih dari 0' };

      await db.ref('pengeluaran').push({
        waktu: firebase.database.ServerValue.TIMESTAMP,
        pj: pj,
        jabatanPj: clean(data.jabatanPj || '', 50),
        keterangan: keterangan,
        total: total,
        qty: qty,
        satuan: clean(data.harga, 50) || '-',
        kategori: clean(data.jenis, 50) || 'Lainnya',
        status: 'Berhasil'
      });
      return { status: 'success', message: 'Data pengeluaran berhasil disimpan' };
    } catch (e) {
      return { status: 'error', message: logError('simpanData', e).message };
    }
  },

  // 4. Save pemasukan (append-only)
  async simpanPemasukan(data) {
    try {
      await authReady;
      const nominal = Number(data.nominal) || 0;
      const pj = clean(data.pj, 100);

      if (!pj) return { status: 'error', message: 'Penanggung jawab wajib diisi' };
      if (nominal <= 0) return { status: 'error', message: 'Nominal harus lebih dari 0' };

      await db.ref('pemasukan').push({
        waktu: firebase.database.ServerValue.TIMESTAMP,
        pj: pj,
        nominal: nominal,
        keterangan: clean(data.keterangan, 200)
      });
      return { status: 'success', message: 'Data pemasukan berhasil disimpan' };
    } catch (e) {
      return { status: 'error', message: logError('simpanPemasukan', e).message };
    }
  },

  // 5. Save susunan panitia (append-only)
  async simpanSusunan(data) {
    try {
      await authReady;
      const jabatan = clean(data.jabatan, 50);
      const nama = clean(data.nama, 100);

      if (!jabatan || !nama) return { status: 'error', message: 'Jabatan dan nama wajib diisi' };

      await db.ref('panitia').push({
        waktu: firebase.database.ServerValue.TIMESTAMP,
        jabatan: jabatan,
        nama: nama
      });
      return { status: 'success', message: 'Susunan panitia berhasil disimpan' };
    } catch (e) {
      return { status: 'error', message: logError('simpanSusunan', e).message };
    }
  },

  // 6. Read susunan panitia with search/filter (newest first)
  async getSusunanPanitia(params) {
    try {
      await authReady;
      const snap = await db.ref('panitia').once('value');
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
      return { status: 'error', message: logError('getSusunanPanitia', e).message };
    }
  },

  // 7. Read riwayat pengeluaran with search/filter/limit (newest first)
  async getRiwayatData(params) {
    try {
      await authReady;
      const snap = await db.ref('pengeluaran').once('value');
      const val = snap.val() || {};

      let list = Object.keys(val).map(k => {
        const r = val[k];
        return {
          waktu: formatTanggalJam(r.waktu),
          pj: r.pj || '-',
          jabatanPj: r.jabatanPj || '',
          keterangan: r.keterangan || '-',
          total: Number(r.total) || 0,
          qty: r.qty || 0,
          satuan: r.satuan || '-',
          kategori: r.kategori || '-',
          _w: r.waktu || 0
        };
      });
      list.sort((a, b) => b._w - a._w);

      const limit = (params && params.limit) ? params.limit : 20;
      const search = (params && params.search) ? params.search.toLowerCase() : '';
      const filterKategori = (params && params.kategori) ? params.kategori : '';

      if (search) {
        list = list.filter(i =>
          String(i.keterangan).toLowerCase().includes(search) ||
          String(i.pj).toLowerCase().includes(search)
        );
      }
      if (filterKategori) list = list.filter(i => i.kategori === filterKategori);

      return { status: 'success', data: list.slice(0, limit).map(({ _w, ...rest }) => rest) };
    } catch (e) {
      return { status: 'error', message: logError('getRiwayatData', e).message };
    }
  },

  // 8. Aggregate data for LPJ / PDF
  async getLPJData() {
    try {
      await authReady;
      const [pengSnap, pemSnap, strSnap, adminSnap] = await Promise.all([
        db.ref('pengeluaran').once('value'),
        db.ref('pemasukan').once('value'),
        db.ref('struktur').once('value'),
        db.ref('admin/config').once('value')
      ]);
      const adminCfg = adminSnap.val() || {};
      const lpjInfo = adminCfg.lpjInfo || {};

      const peng = pengSnap.val() || {};
      const pem = pemSnap.val() || {};
      const str = strSnap.val() || {};

      const struktur = {
        pj: str.pj || '..........................',
        ketua: str.ketua || '..........................',
        bendahara: str.bendahara || '..........................',
        sekretaris: str.sekretaris || '..........................'
      };

      let grouped = {};
      let totalPengeluaran = 0;
      Object.values(peng).forEach(r => {
        const nominal = Number(r.total) || 0;
        const cat = r.kategori || 'Lainnya';
        if (!grouped[cat]) grouped[cat] = { total: 0, items: [] };
        grouped[cat].total += nominal;
        grouped[cat].items.push({
          tanggal: formatTanggalJam(r.waktu),
          keterangan: r.keterangan || '-',
          qty: r.qty || 0,
          satuan: r.satuan || '-',
          nominal: nominal,
          pj: r.pj || '-',
          jabatanPj: r.jabatanPj || '-'
        });
        totalPengeluaran += nominal;
      });

      let totalPemasukan = 0;
      Object.values(pem).forEach(r => { totalPemasukan += Number(r.nominal) || 0; });

      return {
        status: 'success',
        data: {
          grouped: grouped,
          totalPemasukan: totalPemasukan,
          totalPengeluaran: totalPengeluaran,
          saldo: totalPemasukan - totalPengeluaran,
          struktur: struktur,
          lpjInfo: {
            lembaga: lpjInfo.lembaga || 'TPQ AL-MAIDAH KARANGSONO',
            alamat: lpjInfo.alamat || '',
            kegiatan: lpjInfo.kegiatan || 'WISUDA SANTRI',
            logoBase64: adminCfg.logoBase64 || ''
          }
        }
      };
    } catch (e) {
      return { status: 'error', message: logError('getLPJData', e).message };
    }
  },

  // 9. Admin: get config (pinHash + menu visibility)
  async getAdminConfig() {
    try {
      await authReady;
      const snap = await db.ref('admin/config').once('value');
      return { status: 'success', data: snap.val() || {} };
    } catch (e) {
      return { status: 'error', data: {}, message: logError('getAdminConfig', e).message };
    }
  },

  // 10. Admin: save full config
  async saveAdminConfig(config) {
    try {
      await authReady;
      await db.ref('admin/config').set(config);
      return { status: 'success' };
    } catch (e) {
      return { status: 'error', message: logError('saveAdminConfig', e).message };
    }
  },

  // 11. Admin: get full master data
  async getMasterData() {
    try {
      await authReady;
      const snap = await db.ref('master').once('value');
      return { status: 'success', data: snap.val() || {} };
    } catch (e) {
      return { status: 'error', data: {}, message: logError('getMasterData', e).message };
    }
  },

  // 12. Admin: overwrite a master list (kategori, namaPanitia, etc.)
  async updateMasterList(key, arr) {
    try {
      await authReady;
      await db.ref('master/' + key).set(arr);
      return { status: 'success' };
    } catch (e) {
      return { status: 'error', message: logError('updateMasterList', e).message };
    }
  },

  // 13. Admin: get all panitia records with their Firebase keys
  async getAllPanitiaRecords() {
    try {
      await authReady;
      const snap = await db.ref('panitia').once('value');
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
      return { status: 'error', data: [], message: logError('getAllPanitiaRecords', e).message };
    }
  },

  // 14. Admin: update jabatan of a panitia record
  async updatePanitiaJabatan(key, jabatan) {
    try {
      await authReady;
      await db.ref('panitia/' + key + '/jabatan').set(clean(jabatan, 50));
      return { status: 'success' };
    } catch (e) {
      return { status: 'error', message: logError('updatePanitiaJabatan', e).message };
    }
  },

  // 15. Admin: delete a panitia record
  async deletePanitia(key) {
    try {
      await authReady;
      await db.ref('panitia/' + key).remove();
      return { status: 'success' };
    } catch (e) {
      return { status: 'error', message: logError('deletePanitia', e).message };
    }
  },

  // 16. Admin audit: get all pengeluaran records with keys (newest first)
  async getAllPengeluaranRecords() {
    try {
      await authReady;
      const snap = await db.ref('pengeluaran').once('value');
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
          total: Number(r.total) || 0,
          qty: r.qty || 0,
          satuan: r.satuan || '-',
          kategori: r.kategori || '-',
          status: r.status || ''
        };
      });
      list.sort((a, b) => b.waktu - a.waktu);
      return { status: 'success', data: list };
    } catch (e) {
      return { status: 'error', data: [], message: logError('getAllPengeluaranRecords', e).message };
    }
  },

  // 17. Admin audit: update a pengeluaran record
  async updatePengeluaran(key, data) {
    try {
      await authReady;
      await db.ref('pengeluaran/' + key).set({
        waktu: data.waktu || Date.now(),
        pj: clean(data.pj, 100),
        jabatanPj: clean(data.jabatanPj || '', 50),
        keterangan: clean(data.keterangan, 200),
        total: Number(data.total) || 0,
        qty: Number(data.qty) || 0,
        satuan: clean(data.satuan || '-', 50),
        kategori: clean(data.kategori || 'Lainnya', 50),
        status: 'Edit'
      });
      return { status: 'success' };
    } catch (e) {
      return { status: 'error', message: logError('updatePengeluaran', e).message };
    }
  },

  // 18. Admin audit: delete a pengeluaran record
  async deletePengeluaran(key) {
    try {
      await authReady;
      await db.ref('pengeluaran/' + key).remove();
      return { status: 'success' };
    } catch (e) {
      return { status: 'error', message: logError('deletePengeluaran', e).message };
    }
  },

  // 19. Get all per-member PIN hashes from /admin/memberPins
  async getMemberPins() {
    try {
      await authReady;
      const snap = await db.ref('admin/memberPins').once('value');
      return { status: 'success', data: snap.val() || {} };
    } catch (e) {
      return { status: 'error', data: {}, message: logError('getMemberPins', e).message };
    }
  },

  // 20. Set individual member PIN hash
  async setMemberPin(nameKey, pinHash) {
    try {
      await authReady;
      await db.ref('admin/memberPins/' + nameKey).set(pinHash);
      return { status: 'success' };
    } catch (e) {
      return { status: 'error', message: logError('setMemberPin', e).message };
    }
  },

  // 21. Remove individual member PIN (reverts to shared PIN)
  async removeMemberPin(nameKey) {
    try {
      await authReady;
      await db.ref('admin/memberPins/' + nameKey).remove();
      return { status: 'success' };
    } catch (e) {
      return { status: 'error', message: logError('removeMemberPin', e).message };
    }
  }
};
