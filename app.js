/* ==========================================
   MASJID JAMIK BAITULLATIF - Application Logic
   Sistem Elektronik Masjid
   ========================================== */

lucide.createIcons();

const DEFAULT_ORG = {
  lembaga: 'MASJID JAMIK BAITULLATIF',
  alamat: 'Dusun Krajan, Desa Karangsono, Kecamatan Bangsalsari, Kabupaten Jember',
  kota: 'Karangsono',
  kodeSurat: 'TKM-BTL'
};

// Filled by applyHeaderInfo(); used by report/letter generators.
let orgInfo = Object.assign({}, DEFAULT_ORG);
let orgLogoBase64 = '';

const formatRp = (angka) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(angka || 0);

// Used by onJenisSuratChange(), called from init() below, so it must be declared before init() runs.
const JENIS_SURAT_INFO = {
  undangan: { label: 'Surat Undangan', perihal: 'Undangan' },
  pemberitahuan: { label: 'Surat Pemberitahuan', perihal: 'Pemberitahuan' },
  permohonan: { label: 'Surat Permohonan Bantuan', perihal: 'Permohonan Bantuan' },
  keterangan: { label: 'Surat Keterangan', perihal: 'Surat Keterangan' },
  tugas: { label: 'Surat Tugas', perihal: 'Surat Tugas' }
};

// ===== SETUP GATE =====
if (!FIREBASE_CONFIGURED) {
  document.getElementById('setup-gate').classList.remove('hidden');
  document.getElementById('member-gate').classList.add('hidden');
}

// ===== MEMBER SESSION =====
function getMemberSession() {
  try { return JSON.parse(sessionStorage.getItem('memberSession') || 'null'); } catch { return null; }
}

function applyMemberSession() {
  const s = getMemberSession();
  if (s) {
    document.getElementById('member-gate').classList.add('hidden');
    document.getElementById('pjPengeluaran').value = s.nama;
    document.getElementById('pjPemasukan').value = s.nama;
  }
}

async function memberLogin() {
  const nama = document.getElementById('memberNama').value;
  const pin = document.getElementById('memberPin').value.trim();
  const errEl = document.getElementById('member-error');
  errEl.classList.add('hidden');

  if (!nama) { errEl.textContent = 'Pilih nama terlebih dahulu'; errEl.classList.remove('hidden'); return; }
  if (!pin) { errEl.textContent = 'Masukkan PIN'; errEl.classList.remove('hidden'); return; }

  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin));
  const inputHash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');

  // Check per-member PIN first, fall back to shared PIN
  const nameKey = nama.replace(/[.#$/\[\]]/g, '_');
  const [cfgRes, pinsRes] = await Promise.all([Api.getAdminConfig(), Api.getMemberPins()]);
  const cfg = cfgRes.data || {};
  const memberPins = pinsRes.data || {};

  let storedHash;
  if (memberPins[nameKey]) {
    storedHash = memberPins[nameKey];
  } else {
    storedHash = cfg.memberPinHash;
    if (!storedHash) {
      const buf2 = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('1234'));
      storedHash = Array.from(new Uint8Array(buf2)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
  }

  if (inputHash !== storedHash) {
    errEl.textContent = 'PIN salah. PIN default: 1234';
    errEl.classList.remove('hidden');
    document.getElementById('memberPin').value = '';
    return;
  }

  // Look up jabatan from pengurus records
  let jabatan = '';
  const pr = await Api.getSusunanPengurus({});
  if (pr.status === 'success') {
    const found = pr.data.find(p => p.nama === nama);
    jabatan = found ? found.jabatan : '';
  }

  sessionStorage.setItem('memberSession', JSON.stringify({ nama, jabatan }));
  document.getElementById('member-gate').classList.add('hidden');
  document.getElementById('pjPengeluaran').value = nama;
  document.getElementById('pjPemasukan').value = nama;
  lucide.createIcons();
}

function memberLogout() {
  sessionStorage.removeItem('memberSession');
  document.getElementById('pjPengeluaran').value = '';
  document.getElementById('pjPemasukan').value = '';
  document.getElementById('memberPin').value = '';
  document.getElementById('member-error').classList.add('hidden');
  if (FIREBASE_CONFIGURED) document.getElementById('member-gate').classList.remove('hidden');
  lucide.createIcons();
}

document.getElementById('memberPin').addEventListener('keydown', e => {
  if (e.key === 'Enter') memberLogin();
});

// ===== MENU VISIBILITY =====
function applyMenuVisibility() {
  Api.getAdminConfig().then(res => {
    if (res.status !== 'success' || !res.data || !res.data.menu) return;
    const menu = res.data.menu;
    ['keluar', 'masuk', 'laporan', 'surat', 'pengurus'].forEach(key => {
      if (menu[key] === false) {
        const btn = document.getElementById('btn-' + key);
        if (btn) btn.style.display = 'none';
      }
    });
  });
}

// ===== INIT =====
function init() {
  applyMenuVisibility();
  loadDropdowns();
  loadBukuOptions();
  loadMemberNameDropdown();
  applyMemberSession();
  applyHeaderInfo();
  initSuratForm();
}

async function applyHeaderInfo() {
  const res = await Api.getAdminConfig();
  const cfg = res.data || {};
  orgInfo = Object.assign({}, DEFAULT_ORG, cfg.orgInfo || {});
  orgLogoBase64 = cfg.logoBase64 || '';
  const year = new Date().getFullYear();

  const elH = document.getElementById('header-lembaga');
  if (elH) elH.textContent = orgInfo.lembaga;

  const elA = document.getElementById('hero-alamat');
  if (elA && orgInfo.alamat) elA.textContent = orgInfo.alamat;

  const elF = document.getElementById('footer-lembaga');
  if (elF) elF.textContent = '©' + year + ' ' + orgInfo.lembaga;

  document.title = orgInfo.lembaga;
  updateNomorPreview();
}

init();

// ===== DROPDOWN LOADING =====
function loadMemberNameDropdown() {
  Api.getDataPengurus().then(res => {
    if (res.status !== 'success') return;
    const el = document.getElementById('memberNama');
    el.innerHTML = '<option value="" disabled selected>Pilih Nama Anda...</option>';
    res.nama.forEach(n => el.innerHTML += `<option value="${esc(n)}">${esc(n)}</option>`);
  });
}

function loadDropdowns() {
  Api.getDropdownData().then((res) => {
    if (res.status === 'success') {
      const elSatuan = document.getElementById('satuanPengeluaran');
      const elKatKeluar = document.getElementById('kategoriPengeluaran');
      const elKatMasuk = document.getElementById('kategoriPemasukan');

      elSatuan.innerHTML = '<option value="" disabled selected>Pilih Satuan</option>';
      res.satuan.forEach(s => elSatuan.innerHTML += `<option value="${esc(s)}">${esc(s)}</option>`);

      elKatKeluar.innerHTML = '<option value="" disabled selected>Pilih Kategori</option>';
      res.kategoriKeluar.forEach(k => elKatKeluar.innerHTML += `<option value="${esc(k)}">${esc(k)}</option>`);

      elKatMasuk.innerHTML = '<option value="" disabled selected>Pilih Sumber Dana</option>';
      res.kategoriMasuk.forEach(k => elKatMasuk.innerHTML += `<option value="${esc(k)}">${esc(k)}</option>`);
    }
  });

  Api.getDataPengurus().then((res) => {
    if (res.status === 'success') {
      const elNama = document.getElementById('namaPengurusSel');
      const elJabatan = document.getElementById('jabatanPengurus');
      const elFilterJabatan = document.getElementById('filterJabatanList');

      elNama.innerHTML = '<option value="" disabled selected>Pilih Nama Pengurus</option>';
      res.nama.forEach(n => elNama.innerHTML += `<option value="${esc(n)}">${esc(n)}</option>`);

      elJabatan.innerHTML = '<option value="" disabled selected>Pilih Jabatan / Peran</option>';
      elFilterJabatan.innerHTML = '<option value="">Semua Jabatan</option>';
      res.jabatan.forEach(j => {
        elJabatan.innerHTML += `<option value="${esc(j)}">${esc(j)}</option>`;
        elFilterJabatan.innerHTML += `<option value="${esc(j)}">${esc(j)}</option>`;
      });
    }
  });
}

// Buku kas dropdowns: input forms get active kegiatan only, laporan gets all.
let kegiatanCache = [];

function loadBukuOptions() {
  Api.getKegiatanList('').then(res => {
    if (res.status !== 'success') return;
    kegiatanCache = res.data;
    const aktif = res.data.filter(k => k.status === 'aktif');

    ['bukuKeluar', 'bukuMasuk'].forEach(id => {
      const el = document.getElementById(id);
      const current = el.value;
      el.innerHTML = '<option value="masjid">Kas Masjid</option>';
      aktif.forEach(k => el.innerHTML += `<option value="${esc(k.id)}">Kegiatan: ${esc(k.nama)}</option>`);
      if ([...el.options].some(o => o.value === current)) el.value = current;
    });

    const elLap = document.getElementById('bukuLaporan');
    const currentLap = elLap.value;
    elLap.innerHTML = '<option value="masjid">Kas Masjid</option>';
    res.data.forEach(k => {
      const suffix = k.status === 'selesai' ? ' (selesai)' : '';
      elLap.innerHTML += `<option value="${esc(k.id)}">Kegiatan: ${esc(k.nama)}${esc(suffix)}</option>`;
    });
    if ([...elLap.options].some(o => o.value === currentLap)) elLap.value = currentLap;
  });
}

function namaBuku(bukuId) {
  if (bukuId === 'masjid') return 'KAS MASJID';
  const keg = kegiatanCache.find(k => k.id === bukuId);
  return keg ? 'KEGIATAN: ' + keg.nama.toUpperCase() : 'KEGIATAN';
}

// ===== TAB NAVIGATION =====
const TAB_IDS = ['keluar', 'masuk', 'laporan', 'surat', 'pengurus'];

function switchTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(tab => {
    tab.classList.add('hidden');
    tab.classList.remove('block');
  });
  document.getElementById('tab-' + tabId).classList.remove('hidden');
  document.getElementById('tab-' + tabId).classList.add('block');

  TAB_IDS.forEach(t => {
    const btn = document.getElementById('btn-' + t);
    if (btn) btn.className = "flex-1 flex flex-col items-center justify-center py-3 gap-0.5 text-gray-400 transition-all";
  });
  const active = document.getElementById('btn-' + tabId);
  if (active) active.className = "flex-1 flex flex-col items-center justify-center py-3 gap-0.5 text-emerald-700 transition-all";

  if (tabId === 'laporan') { loadBukuOptions(); fetchLaporan(); }
  if (tabId === 'surat') { updateNomorPreview(); fetchArsipSurat(); }
  if (tabId === 'pengurus') fetchPengurus();
  if (tabId === 'keluar' || tabId === 'masuk') loadBukuOptions();
}

// ===== FORM: PENGELUARAN =====
function handlePengeluaran(e) {
  e.preventDefault();
  const session = getMemberSession();
  if (!session) { alert('Silakan login sebagai pengurus terlebih dahulu.'); return; }

  const btnSubmit = document.getElementById('btnKeluar');
  const btnText = document.getElementById('btnTextKeluar');
  const loading = document.getElementById('loadingKeluar');
  const bukuId = document.getElementById('bukuKeluar').value;
  const payload = {
    pj: session.nama,
    jabatanPj: session.jabatan || '',
    keterangan: document.getElementById('ketPengeluaran').value,
    total: document.getElementById('totalPengeluaran').value,
    qty: document.getElementById('qtyPengeluaran').value,
    satuan: document.getElementById('satuanPengeluaran').value,
    kategori: document.getElementById('kategoriPengeluaran').value
  };

  const resetBtn = () => { btnSubmit.disabled = false; btnText.classList.remove('hidden'); loading.classList.add('hidden'); };
  btnSubmit.disabled = true; btnText.classList.add('hidden'); loading.classList.remove('hidden');

  Api.simpanPengeluaran(bukuId, payload).then((res) => {
    resetBtn();
    if (res.status === 'success') {
      openModal();
      document.getElementById('formKeluar').reset();
      document.getElementById('bukuKeluar').value = bukuId;
      document.getElementById('pjPengeluaran').value = session.nama;
    } else { alert('Gagal: ' + res.message); }
  }).catch((err) => { resetBtn(); alert('Error: ' + err); });
}

// ===== FORM: PEMASUKAN =====
function handlePemasukan(e) {
  e.preventDefault();
  const session = getMemberSession();
  if (!session) { alert('Silakan login sebagai pengurus terlebih dahulu.'); return; }

  const btnSubmit = document.getElementById('btnMasuk');
  const btnText = document.getElementById('btnTextMasuk');
  const loading = document.getElementById('loadingMasuk');
  const bukuId = document.getElementById('bukuMasuk').value;
  const payload = {
    pj: session.nama,
    jabatanPj: session.jabatan || '',
    nominal: document.getElementById('nominalPemasukan').value,
    kategori: document.getElementById('kategoriPemasukan').value,
    keterangan: document.getElementById('ketPemasukan').value
  };

  const resetBtn = () => { btnSubmit.disabled = false; btnText.classList.remove('hidden'); loading.classList.add('hidden'); };
  btnSubmit.disabled = true; btnText.classList.add('hidden'); loading.classList.remove('hidden');

  Api.simpanPemasukan(bukuId, payload).then((res) => {
    resetBtn();
    if (res.status === 'success') {
      openModal();
      document.getElementById('formMasuk').reset();
      document.getElementById('bukuMasuk').value = bukuId;
      document.getElementById('pjPemasukan').value = session.nama;
    } else { alert('Gagal: ' + res.message); }
  }).catch((err) => { resetBtn(); alert('Error: ' + err); });
}

// ===== FORM: PENGURUS =====
function handlePengurus(e) {
  e.preventDefault();
  const btnSubmit = document.getElementById('btnPengurus');
  const btnText = document.getElementById('btnTextPengurus');
  const loading = document.getElementById('loadingPengurus');
  const payload = { jabatan: document.getElementById('jabatanPengurus').value, nama: document.getElementById('namaPengurusSel').value };

  const resetBtn = () => { btnSubmit.disabled = false; btnText.classList.remove('hidden'); loading.classList.add('hidden'); };
  btnSubmit.disabled = true; btnText.classList.add('hidden'); loading.classList.remove('hidden');

  Api.simpanPengurus(payload).then((res) => {
    resetBtn();
    if (res.status === 'success') { openModal(); document.getElementById('formPengurus').reset(); fetchPengurus(); }
    else { alert('Gagal: ' + res.message); }
  }).catch((err) => { resetBtn(); alert('Error: ' + err); });
}

// ===== PENGURUS LIST =====
let searchTimerPengurus;
function delaySearchPengurus() { clearTimeout(searchTimerPengurus); searchTimerPengurus = setTimeout(() => { fetchPengurus(); }, 600); }

function fetchPengurus() {
  const loadingEl = document.getElementById('pengurus-loading');
  const listEl = document.getElementById('pengurus-list');
  const params = { search: document.getElementById('searchPengurus').value, jabatan: document.getElementById('filterJabatanList').value };
  loadingEl.classList.remove('hidden'); loadingEl.classList.add('flex'); listEl.innerHTML = '';
  Api.getSusunanPengurus(params).then((res) => {
    loadingEl.classList.add('hidden'); loadingEl.classList.remove('flex');
    if (res.status === 'success') { tampilkanDataPengurus(res.data); lucide.createIcons(); }
    else { listEl.innerHTML = `<p class="text-xs text-red-500 text-center py-4">Gagal: ${esc(res.message)}</p>`; }
  });
}

function tampilkanDataPengurus(dataArray) {
  const listEl = document.getElementById('pengurus-list');
  if (!dataArray || dataArray.length === 0) {
    listEl.innerHTML = `<div class="text-center py-6"><p class="text-xs text-gray-500">Belum ada data pengurus.</p></div>`;
    return;
  }
  dataArray.forEach(item => {
    const card = document.createElement('div');
    card.className = "flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100";
    card.innerHTML = `
      <div class="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center shadow-sm">
        <i data-lucide="user" class="w-4 h-4 text-purple-600"></i>
      </div>
      <div>
        <h3 class="text-sm font-bold text-gray-800">${esc(item.nama)}</h3>
        <p class="text-[10px] text-purple-600 font-semibold uppercase tracking-wider">${esc(item.jabatan)}</p>
      </div>`;
    listEl.appendChild(card);
  });
}

// ===== LAPORAN =====
let lastLaporan = null;
let searchTimerLaporan;
function delaySearchLaporan() { clearTimeout(searchTimerLaporan); searchTimerLaporan = setTimeout(() => { renderLaporanList(); }, 400); }

// Parse yyyy-mm-dd from <input type="date"> as LOCAL midnight (not UTC).
function parseDateInput(value, endOfDay) {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d, 0, 0, 0, 0);
  return endOfDay ? date.getTime() + 86399999 : date.getTime();
}

function toDateInputValue(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function setPeriode(preset) {
  const now = new Date();
  const elDari = document.getElementById('lapDari');
  const elSampai = document.getElementById('lapSampai');
  if (preset === 'semua') {
    elDari.value = ''; elSampai.value = '';
  } else if (preset === 'bulan') {
    elDari.value = toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1));
    elSampai.value = toDateInputValue(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  } else if (preset === 'bulanLalu') {
    elDari.value = toDateInputValue(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    elSampai.value = toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 0));
  } else if (preset === 'tahun') {
    elDari.value = toDateInputValue(new Date(now.getFullYear(), 0, 1));
    elSampai.value = toDateInputValue(new Date(now.getFullYear(), 11, 31));
  }
  fetchLaporan();
}

function periodeLabel() {
  const dari = document.getElementById('lapDari').value;
  const sampai = document.getElementById('lapSampai').value;
  const fmt = (v) => { const [y, m, d] = v.split('-'); return `${d}/${m}/${y}`; };
  if (!dari && !sampai) return 'Semua Transaksi';
  if (dari && sampai) return `${fmt(dari)} s/d ${fmt(sampai)}`;
  if (dari) return `Sejak ${fmt(dari)}`;
  return `Sampai ${fmt(sampai)}`;
}

function fetchLaporan() {
  const loadingEl = document.getElementById('laporan-loading');
  const listEl = document.getElementById('laporan-list');
  const bukuId = document.getElementById('bukuLaporan').value;
  const fromMs = parseDateInput(document.getElementById('lapDari').value, false);
  const toMs = parseDateInput(document.getElementById('lapSampai').value, true);

  loadingEl.classList.remove('hidden'); loadingEl.classList.add('flex'); listEl.innerHTML = '';
  Api.getLaporanData(bukuId, fromMs, toMs).then((res) => {
    loadingEl.classList.add('hidden'); loadingEl.classList.remove('flex');
    if (res.status !== 'success') {
      listEl.innerHTML = `<p class="text-xs text-red-500 text-center py-4">Gagal: ${esc(res.message)}</p>`;
      return;
    }
    lastLaporan = Object.assign({ bukuId: bukuId, periode: periodeLabel() }, res.data);
    document.getElementById('lapTotalD').textContent = formatRp(res.data.totalD);
    document.getElementById('lapTotalK').textContent = formatRp(res.data.totalK);
    document.getElementById('lapSaldo').textContent = formatRp(res.data.saldo);
    renderLaporanList();
  });
}

function renderLaporanList() {
  const listEl = document.getElementById('laporan-list');
  listEl.innerHTML = '';
  if (!lastLaporan) return;

  const search = document.getElementById('searchLaporan').value.toLowerCase().trim();
  let rows = lastLaporan.rows.slice().reverse(); // newest first for on-screen list
  if (search) {
    rows = rows.filter(r =>
      String(r.keterangan).toLowerCase().includes(search) ||
      String(r.pj).toLowerCase().includes(search) ||
      String(r.kategori).toLowerCase().includes(search)
    );
  }

  if (rows.length === 0) {
    listEl.innerHTML = `<div class="text-center py-8"><p class="text-xs text-gray-500">Tidak ada transaksi pada periode ini.</p></div>`;
    return;
  }

  rows.forEach(item => {
    const isD = item.jenis === 'D';
    const card = document.createElement('div');
    card.className = "p-3.5 bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-between gap-2";
    card.innerHTML = `
      <div class="flex items-center gap-3 min-w-0">
        <div class="w-9 h-9 ${isD ? 'bg-green-100' : 'bg-red-50'} rounded-full flex items-center justify-center shadow-sm flex-shrink-0">
          <span class="text-xs font-extrabold ${isD ? 'text-green-700' : 'text-red-600'}">${item.jenis}</span>
        </div>
        <div class="min-w-0">
          <h3 class="text-xs font-bold text-gray-800 uppercase truncate">${esc(item.keterangan)}</h3>
          <p class="text-[10px] text-gray-500 truncate">${esc(item.tanggalJam)} • ${esc(item.kategori)}</p>
          <p class="text-[10px] text-gray-500 truncate">PJ: <span class="font-bold">${esc(item.pj)}</span>${item.qty ? ' • ' + esc(item.qty + ' ' + item.satuan) : ''}</p>
        </div>
      </div>
      <div class="text-right flex-shrink-0"><p class="text-xs font-bold ${isD ? 'text-green-700' : 'text-red-600'}">${isD ? '+' : '-'}${formatRp(item.nominal)}</p></div>`;
    listEl.appendChild(card);
  });
}

// ===== TERBILANG =====
function terbilang(angka) {
  angka = Math.abs(angka);
  var bilne = ["", "Satu", "Dua", "Tiga", "Empat", "Lima", "Enam", "Tujuh", "Delapan", "Sembilan", "Sepuluh", "Sebelas"];
  if (angka < 12) return bilne[angka];
  else if (angka < 20) return terbilang(angka - 10) + " Belas";
  else if (angka < 100) return terbilang(Math.floor(angka / 10)) + " Puluh " + terbilang(angka % 10);
  else if (angka < 200) return "Seratus " + (terbilang(angka - 100)).toLowerCase();
  else if (angka < 1000) return terbilang(Math.floor(angka / 100)) + " Ratus " + terbilang(angka % 100);
  else if (angka < 2000) return "Seribu " + terbilang(angka - 1000);
  else if (angka < 1000000) return terbilang(Math.floor(angka / 1000)) + " Ribu " + terbilang(angka % 1000);
  else if (angka < 1000000000) return terbilang(Math.floor(angka / 1000000)) + " Juta " + terbilang(angka % 1000000);
  else return "";
}

// ===== KOP SURAT / LAPORAN (shared header for print) =====
function kopHTML() {
  return `
    <div style="display:flex; align-items:center; gap:14px; border-bottom:3px double #000; padding-bottom:10px; margin-bottom:14px;">
      ${orgLogoBase64 ? `<img src="${orgLogoBase64}" style="width:70px;height:70px;object-fit:contain;" alt="Logo">` : ''}
      <div style="flex:1; text-align:center;">
        <p style="margin:0; font-size:12px; letter-spacing:2px;">TAKMIR</p>
        <h1 style="margin:0; font-size:20px; letter-spacing:1px;">${esc(orgInfo.lembaga)}</h1>
        <p style="margin:2px 0 0; font-size:11px;">${esc(orgInfo.alamat)}</p>
      </div>
      ${orgLogoBase64 ? `<div style="width:70px;"></div>` : ''}
    </div>`;
}

// ===== LAPORAN: CETAK PDF =====
function printLaporan() {
  if (!lastLaporan) { alert('Muat laporan terlebih dahulu.'); return; }
  const btn = document.getElementById('btnPrint');
  const text = document.getElementById('btnTextPrint');
  const load = document.getElementById('loadingPrint');
  const resetBtn = () => { btn.disabled = false; text.classList.remove('hidden'); load.classList.add('hidden'); };
  btn.disabled = true; text.classList.add('hidden'); load.classList.remove('hidden');

  Api.getStruktur().then((res) => {
    resetBtn();
    const struktur = (res.status === 'success' ? res.data : {}) || {};
    generateQRAndPrintLaporan(lastLaporan, struktur);
  }).catch((err) => { resetBtn(); alert('System Error: ' + err); });
}

function generateQRAndPrintLaporan(data, struktur) {
  const appUrl = location.origin + location.pathname;
  const qrContainer = document.createElement('div');
  qrContainer.style.cssText = 'position:fixed;left:-9999px;top:0;';
  document.body.appendChild(qrContainer);
  new QRCode(qrContainer, { text: appUrl, width: 120, height: 120, correctLevel: QRCode.CorrectLevel.M });
  setTimeout(() => {
    const canvas = qrContainer.querySelector('canvas');
    const qrSrc = canvas ? canvas.toDataURL('image/png') : '';
    document.body.removeChild(qrContainer);
    generateLaporanPDF(data, struktur, qrSrc);
  }, 300);
}

function generateLaporanPDF(data, struktur, qrSrc) {
  const judulBuku = namaBuku(data.bukuId);
  const tanggalSekarang = formatTanggalPanjang(Date.now());
  const dots = '..........................';

  let rowsHtml = '';
  data.rows.forEach((r, i) => {
    rowsHtml += `<tr>
      <td style="text-align:center;">${i + 1}</td>
      <td style="text-align:center;">${esc(r.tanggal)}</td>
      <td>${esc(r.keterangan)}<br><span style="font-size:10px;color:#555;">${esc(r.kategori)} &bull; PJ: ${esc(r.pj)}${r.qty ? ' &bull; ' + esc(r.qty + ' ' + r.satuan) : ''}</span></td>
      <td style="text-align:right;">${r.jenis === 'D' ? formatRp(r.nominal) : '-'}</td>
      <td style="text-align:right;">${r.jenis === 'K' ? formatRp(r.nominal) : '-'}</td>
    </tr>`;
  });
  if (!data.rows.length) {
    rowsHtml = `<tr><td colspan="5" style="text-align:center; padding:15px;">Tidak ada transaksi pada periode ini</td></tr>`;
  }

  const html = `
  <html><head><title>Laporan Keuangan - ${esc(judulBuku)}</title>
  <style>
    body { font-family: 'Times New Roman', serif; font-size: 13px; padding: 20px; color: #000; position: relative; }
    body::before { content: '${esc(orgInfo.lembaga)}'; position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%) rotate(-45deg); font-size: 55px; color: rgba(6,95,70,0.06); font-weight: bold; white-space: nowrap; z-index: 0; pointer-events: none; }
    * { position: relative; z-index: 1; }
    h2 { text-align: center; margin: 4px 0 2px; text-transform: uppercase; font-size: 16px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
    th, td { border: 1px solid #000; padding: 5px; text-align: left; font-size: 12px; }
    th { background-color: #eef6f1 !important; text-align: center; -webkit-print-color-adjust: exact; }
    .total-row td { font-weight: bold; background-color: #eef6f1 !important; -webkit-print-color-adjust: exact; }
    .saldo-row td { font-weight: bold; background-color: #e0efe7 !important; color: #065f46; -webkit-print-color-adjust: exact; }
    .sign-table td { border: none !important; text-align: center; vertical-align: bottom; font-size: 13px; }
    .qr-block { text-align: right; }
    .qr-block img { width: 80px; height: 80px; }
    .qr-block p { font-size: 9px; color: #666; margin: 2px 0 0; }
    @media print { body::before { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style></head>
  <body>
    ${kopHTML()}
    <h2>LAPORAN KEUANGAN ${esc(judulBuku)}</h2>
    <p style="text-align:center; font-size:12px; margin:0 0 15px;">Periode: ${esc(data.periode)}</p>

    <table>
      <tr>
        <th style="width:5%;">No</th>
        <th style="width:14%;">Tanggal</th>
        <th>Uraian</th>
        <th style="width:16%;">Debit (Rp)</th>
        <th style="width:16%;">Kredit (Rp)</th>
      </tr>
      ${rowsHtml}
      <tr class="total-row">
        <td colspan="3" style="text-align:right;">JUMLAH</td>
        <td style="text-align:right;">${formatRp(data.totalD)}</td>
        <td style="text-align:right;">${formatRp(data.totalK)}</td>
      </tr>
      <tr class="saldo-row">
        <td colspan="3" style="text-align:right;">SALDO (Debit - Kredit)</td>
        <td colspan="2" style="text-align:right; color:${data.saldo < 0 ? 'red' : '#065f46'};">${formatRp(data.saldo)}</td>
      </tr>
    </table>
    <p style="font-style:italic; font-size:12px;">Terbilang: ${terbilang(data.saldo)} Rupiah</p>

    <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-top:30px;">
      ${qrSrc ? `<div class="qr-block" style="text-align:left;"><img src="${qrSrc}" alt="QR"><p>Scan untuk verifikasi</p></div>` : '<div></div>'}
      <div style="text-align:center; font-size:13px;">
        <p style="margin:0 0 4px;">${esc(orgInfo.kota)}, ${esc(tanggalSekarang)}</p>
      </div>
    </div>

    ${struktur.penasehat ? `
    <div style="text-align:center; margin-top:20px;">
      <p style="margin:0;">Mengetahui,</p>
      <p style="margin:0 0 70px;">Penasehat</p>
      <p style="margin:0; font-weight:bold; text-decoration:underline;">${esc(struktur.penasehat)}</p>
    </div>` : ''}

    <table class="sign-table" style="width:100%; margin-top:40px;">
      <tr>
        <td style="width:33%;"><p style="margin:0 0 70px;">Sekretaris</p><p style="margin:0; font-weight:bold; text-decoration:underline;">${esc(struktur.sekretaris || dots)}</p></td>
        <td style="width:33%;"><p style="margin:0 0 70px;">Ketua Takmir</p><p style="margin:0; font-weight:bold; text-decoration:underline;">${esc(struktur.ketua || dots)}</p></td>
        <td style="width:33%;"><p style="margin:0 0 70px;">Bendahara</p><p style="margin:0; font-weight:bold; text-decoration:underline;">${esc(struktur.bendahara || dots)}</p></td>
      </tr>
    </table>
  </body></html>`;

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  setTimeout(() => { win.print(); }, 800);
}

// ===== LAPORAN: EXPORT EXCEL =====
function exportLaporanExcel() {
  if (!lastLaporan) { alert('Muat laporan terlebih dahulu.'); return; }
  const d = lastLaporan;

  const rows = d.rows.map((r, i) => ({
    'No': i + 1,
    'Tanggal': r.tanggal,
    'Keterangan': r.keterangan,
    'Kategori': r.kategori,
    'PJ': r.pj,
    'Debit (Rp)': r.jenis === 'D' ? r.nominal : '',
    'Kredit (Rp)': r.jenis === 'K' ? r.nominal : ''
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Transaksi');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{
    'Buku Kas': namaBuku(d.bukuId),
    'Periode': d.periode,
    'Total Debit': d.totalD,
    'Total Kredit': d.totalK,
    'Saldo': d.saldo
  }]), 'Ringkasan');
  const nama = namaBuku(d.bukuId).replace(/[^A-Za-z0-9]+/g, '_');
  XLSX.writeFile(wb, `Laporan_${nama}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// ===== SURAT MENYURAT =====
function initSuratForm() {
  document.getElementById('tglSurat').value = toDateInputValue(new Date());
  onJenisSuratChange();
}

function onJenisSuratChange() {
  const jenis = document.getElementById('jenisSurat').value;
  ['undangan', 'keterangan', 'permohonan', 'tugas', 'pemberitahuan'].forEach(j => {
    const el = document.getElementById('detail-' + j);
    if (el) el.classList.toggle('hidden', j !== jenis);
  });
  // Keterangan & Tugas have no addressee block
  const grupTujuan = document.getElementById('grup-tujuan');
  grupTujuan.classList.toggle('hidden', jenis === 'keterangan' || jenis === 'tugas');
  document.getElementById('perihalSurat').value = JENIS_SURAT_INFO[jenis].perihal;
  updateNomorPreview();
}

function updateNomorPreview() {
  const el = document.getElementById('previewNomor');
  if (!el) return;
  const tgl = parseDateInput(document.getElementById('tglSurat').value, false) || Date.now();
  const d = new Date(tgl);
  el.textContent = `AUTO/${orgInfo.kodeSurat}/${BULAN_ROMAWI[d.getMonth()]}/${d.getFullYear()}`;
}

function collectSuratDetail(jenis) {
  if (jenis === 'undangan') {
    return {
      hari: clean(document.getElementById('undHari').value, 100),
      waktu: clean(document.getElementById('undWaktu').value, 100),
      tempat: clean(document.getElementById('undTempat').value, 150),
      acara: clean(document.getElementById('undAcara').value, 200)
    };
  }
  if (jenis === 'keterangan') {
    return {
      nama: clean(document.getElementById('ketrNama').value, 100),
      alamat: clean(document.getElementById('ketrAlamat').value, 200),
      isi: clean(document.getElementById('ketrIsi').value, 1000)
    };
  }
  if (jenis === 'permohonan') {
    return { isi: clean(document.getElementById('mohonIsi').value, 2000) };
  }
  if (jenis === 'tugas') {
    return {
      nama: clean(document.getElementById('tugasNama').value, 1000),
      tugas: clean(document.getElementById('tugasIsi').value, 300),
      waktu: clean(document.getElementById('tugasWaktu').value, 200)
    };
  }
  return { isi: clean(document.getElementById('beritahuIsi').value, 2000) };
}

function validateSurat(jenis, tujuan, detail) {
  if (jenis === 'undangan') {
    if (!tujuan) return 'Isi tujuan surat (Kepada)';
    if (!detail.hari || !detail.acara) return 'Isi hari/tanggal dan acara undangan';
  } else if (jenis === 'pemberitahuan') {
    if (!tujuan) return 'Isi tujuan surat (Kepada)';
    if (!detail.isi) return 'Isi teks pemberitahuan';
  } else if (jenis === 'permohonan') {
    if (!tujuan) return 'Isi tujuan surat (Kepada)';
    if (!detail.isi) return 'Isi uraian permohonan';
  } else if (jenis === 'keterangan') {
    if (!detail.nama || !detail.isi) return 'Isi nama dan isi keterangan';
  } else if (jenis === 'tugas') {
    if (!detail.nama || !detail.tugas) return 'Isi nama petugas dan tugasnya';
  }
  return null;
}

async function handleSurat(e) {
  e.preventDefault();
  const session = getMemberSession();
  if (!session) { alert('Silakan login sebagai pengurus terlebih dahulu.'); return; }

  const jenis = document.getElementById('jenisSurat').value;
  const tujuan = clean(document.getElementById('tujuanSurat').value, 200);
  const detail = collectSuratDetail(jenis);
  const errMsg = validateSurat(jenis, tujuan, detail);
  if (errMsg) { alert(errMsg); return; }

  const btnSubmit = document.getElementById('btnSurat');
  const btnText = document.getElementById('btnTextSurat');
  const loading = document.getElementById('loadingSurat');
  const resetBtn = () => { btnSubmit.disabled = false; btnText.classList.remove('hidden'); loading.classList.add('hidden'); };
  btnSubmit.disabled = true; btnText.classList.add('hidden'); loading.classList.remove('hidden');

  try {
    const tanggal = parseDateInput(document.getElementById('tglSurat').value, false) || Date.now();
    const nomorRes = await Api.generateNomorSurat(tanggal, orgInfo.kodeSurat);
    if (nomorRes.status !== 'success') { resetBtn(); alert('Gagal: ' + nomorRes.message); return; }

    const record = {
      nomor: nomorRes.nomor,
      jenis: jenis,
      tanggal: tanggal,
      perihal: clean(document.getElementById('perihalSurat').value, 150),
      tujuan: tujuan,
      lampiran: clean(document.getElementById('lampiranSurat').value, 50) || '-',
      detail: detail,
      pembuat: session.nama
    };

    const strukturRes = await Api.getStruktur();
    const struktur = (strukturRes.status === 'success' ? strukturRes.data : {}) || {};

    const saveRes = await Api.simpanSurat(record);
    resetBtn();
    if (saveRes.status !== 'success') { alert('Gagal menyimpan surat: ' + saveRes.message); return; }

    printSuratWindow(record, struktur);
    fetchArsipSurat();
  } catch (err) {
    resetBtn();
    alert('Error: ' + err);
  }
}

// Build & open the print-ready letter
function printSuratWindow(record, struktur) {
  const tanggalStr = formatTanggalPanjang(record.tanggal);
  const dots = '..........................';
  const ketua = struktur.ketua || dots;
  const sekretaris = struktur.sekretaris || dots;
  const d = record.detail || {};
  let body = '';

  const infoBlock = `
    <table style="border:none; margin:0 0 10px; font-size:13px;">
      <tr><td style="border:none; padding:1px 0; width:70px;">Nomor</td><td style="border:none; padding:1px 6px;">:</td><td style="border:none; padding:1px 0;">${esc(record.nomor)}</td></tr>
      <tr><td style="border:none; padding:1px 0;">Lampiran</td><td style="border:none; padding:1px 6px;">:</td><td style="border:none; padding:1px 0;">${esc(record.lampiran)}</td></tr>
      <tr><td style="border:none; padding:1px 0;">Perihal</td><td style="border:none; padding:1px 6px;">:</td><td style="border:none; padding:1px 0;"><b>${esc(record.perihal)}</b></td></tr>
    </table>`;

  const kepadaBlock = `
    <div style="margin:15px 0;">
      <p style="margin:0;">Kepada Yth.</p>
      <p style="margin:0; font-weight:bold;">${esc(record.tujuan)}</p>
      <p style="margin:0;">di &ndash; Tempat</p>
    </div>`;

  const salamBuka = `<p style="margin:12px 0 8px; font-style:italic; font-weight:bold;">Assalamu'alaikum Warahmatullahi Wabarakatuh</p>`;
  const salamTutup = `<p style="margin:8px 0 12px; font-style:italic; font-weight:bold;">Wassalamu'alaikum Warahmatullahi Wabarakatuh</p>`;

  const ttdDua = `
    <table style="width:100%; border:none; margin-top:30px;">
      <tr>
        <td style="border:none; width:50%; text-align:center;"><p style="margin:0 0 70px;">Sekretaris</p><p style="margin:0; font-weight:bold; text-decoration:underline;">${esc(sekretaris)}</p></td>
        <td style="border:none; width:50%; text-align:center;"><p style="margin:0 0 70px;">Ketua Takmir</p><p style="margin:0; font-weight:bold; text-decoration:underline;">${esc(ketua)}</p></td>
      </tr>
    </table>`;

  const ttdKetua = `
    <div style="margin-top:30px; text-align:right;">
      <div style="display:inline-block; text-align:center;">
        <p style="margin:0;">${esc(orgInfo.kota)}, ${esc(tanggalStr)}</p>
        <p style="margin:0 0 70px;">Ketua Takmir</p>
        <p style="margin:0; font-weight:bold; text-decoration:underline;">${esc(ketua)}</p>
      </div>
    </div>`;

  if (record.jenis === 'undangan') {
    body = `
      <div style="text-align:right;">${esc(orgInfo.kota)}, ${esc(tanggalStr)}</div>
      ${infoBlock}${kepadaBlock}${salamBuka}
      <p style="margin:8px 0; text-align:justify;">Dengan memohon rahmat dan ridho Allah SWT, kami selaku Takmir ${esc(orgInfo.lembaga)} mengharap kehadiran Bapak/Ibu/Saudara pada:</p>
      <table style="border:none; margin:10px 0 10px 30px; font-size:13px;">
        <tr><td style="border:none; padding:2px 0; width:110px;">Hari / Tanggal</td><td style="border:none; padding:2px 6px;">:</td><td style="border:none; padding:2px 0;"><b>${esc(d.hari)}</b></td></tr>
        <tr><td style="border:none; padding:2px 0;">Waktu</td><td style="border:none; padding:2px 6px;">:</td><td style="border:none; padding:2px 0;">${esc(d.waktu || '-')}</td></tr>
        <tr><td style="border:none; padding:2px 0;">Tempat</td><td style="border:none; padding:2px 6px;">:</td><td style="border:none; padding:2px 0;">${esc(d.tempat || '-')}</td></tr>
        <tr><td style="border:none; padding:2px 0;">Acara</td><td style="border:none; padding:2px 6px;">:</td><td style="border:none; padding:2px 0;"><b>${esc(d.acara)}</b></td></tr>
      </table>
      <p style="margin:8px 0; text-align:justify;">Demikian undangan ini kami sampaikan. Atas kehadiran dan partisipasi Bapak/Ibu/Saudara, kami ucapkan terima kasih. <i>Jazakumullah khairan katsiran.</i></p>
      ${salamTutup}${ttdDua}`;
  } else if (record.jenis === 'pemberitahuan') {
    body = `
      <div style="text-align:right;">${esc(orgInfo.kota)}, ${esc(tanggalStr)}</div>
      ${infoBlock}${kepadaBlock}${salamBuka}
      <p style="margin:8px 0; text-align:justify;">Dengan hormat, bersama surat ini kami selaku Takmir ${esc(orgInfo.lembaga)} menyampaikan pemberitahuan sebagai berikut:</p>
      <p style="margin:8px 0; text-align:justify; white-space:pre-line;">${esc(d.isi)}</p>
      <p style="margin:8px 0; text-align:justify;">Demikian pemberitahuan ini kami sampaikan untuk menjadi maklum. Atas perhatiannya kami ucapkan terima kasih.</p>
      ${salamTutup}${ttdDua}`;
  } else if (record.jenis === 'permohonan') {
    body = `
      <div style="text-align:right;">${esc(orgInfo.kota)}, ${esc(tanggalStr)}</div>
      ${infoBlock}${kepadaBlock}${salamBuka}
      <p style="margin:8px 0; text-align:justify;">Dengan hormat, kami selaku Takmir ${esc(orgInfo.lembaga)} bermaksud mengajukan permohonan bantuan sebagai berikut:</p>
      <p style="margin:8px 0; text-align:justify; white-space:pre-line;">${esc(d.isi)}</p>
      <p style="margin:8px 0; text-align:justify;">Demikian permohonan ini kami sampaikan. Atas perhatian, bantuan, dan partisipasi Bapak/Ibu, kami sampaikan terima kasih. <i>Jazakumullah khairan katsiran.</i></p>
      ${salamTutup}${ttdDua}`;
  } else if (record.jenis === 'keterangan') {
    body = `
      <h2 style="text-align:center; margin:15px 0 0; font-size:16px; text-decoration:underline; text-transform:uppercase;">SURAT KETERANGAN</h2>
      <p style="text-align:center; margin:2px 0 20px; font-size:13px;">Nomor: ${esc(record.nomor)}</p>
      <p style="margin:8px 0; text-align:justify;">Yang bertanda tangan di bawah ini, Ketua Takmir ${esc(orgInfo.lembaga)}, ${esc(orgInfo.alamat)}:</p>
      <table style="border:none; margin:10px 0 10px 30px; font-size:13px;">
        <tr><td style="border:none; padding:2px 0; width:90px;">Nama</td><td style="border:none; padding:2px 6px;">:</td><td style="border:none; padding:2px 0;"><b>${esc(ketua)}</b></td></tr>
        <tr><td style="border:none; padding:2px 0;">Jabatan</td><td style="border:none; padding:2px 6px;">:</td><td style="border:none; padding:2px 0;">Ketua Takmir</td></tr>
      </table>
      <p style="margin:8px 0;">dengan ini menerangkan bahwa:</p>
      <table style="border:none; margin:10px 0 10px 30px; font-size:13px;">
        <tr><td style="border:none; padding:2px 0; width:90px;">Nama</td><td style="border:none; padding:2px 6px;">:</td><td style="border:none; padding:2px 0;"><b>${esc(d.nama)}</b></td></tr>
        <tr><td style="border:none; padding:2px 0;">Alamat</td><td style="border:none; padding:2px 6px;">:</td><td style="border:none; padding:2px 0;">${esc(d.alamat || '-')}</td></tr>
      </table>
      <p style="margin:8px 0; text-align:justify; white-space:pre-line;">${esc(d.isi)}</p>
      <p style="margin:8px 0; text-align:justify;">Demikian surat keterangan ini dibuat dengan sebenar-benarnya untuk dipergunakan sebagaimana mestinya.</p>
      ${ttdKetua}`;
  } else if (record.jenis === 'tugas') {
    const namaList = String(d.nama || '').split('\n').map(s => s.trim()).filter(Boolean);
    const namaHtml = namaList.map(n => `<li style="margin:2px 0;"><b>${esc(n)}</b></li>`).join('');
    body = `
      <h2 style="text-align:center; margin:15px 0 0; font-size:16px; text-decoration:underline; text-transform:uppercase;">SURAT TUGAS</h2>
      <p style="text-align:center; margin:2px 0 20px; font-size:13px;">Nomor: ${esc(record.nomor)}</p>
      <p style="margin:8px 0; text-align:justify;">Yang bertanda tangan di bawah ini, Ketua Takmir ${esc(orgInfo.lembaga)}, dengan ini memberikan tugas kepada:</p>
      <ol style="margin:10px 0 10px 30px; padding-left:20px;">${namaHtml}</ol>
      <p style="margin:8px 0; text-align:justify;">untuk <b>${esc(d.tugas)}</b>${d.waktu ? ', yang dilaksanakan pada ' + esc(d.waktu) : ''}.</p>
      <p style="margin:8px 0; text-align:justify;">Demikian surat tugas ini dibuat untuk dilaksanakan dengan sebaik-baiknya dan penuh tanggung jawab.</p>
      ${ttdKetua}`;
  }

  const html = `
  <html><head><title>${esc(record.perihal)} - ${esc(record.nomor)}</title>
  <style>
    body { font-family: 'Times New Roman', serif; font-size: 13px; color: #000; padding: 25px 35px; }
    table { border-collapse: collapse; }
    p { line-height: 1.5; }
  </style></head>
  <body>
    ${kopHTML()}
    ${body}
  </body></html>`;

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  setTimeout(() => { win.print(); }, 800);
}

// ===== ARSIP SURAT =====
let arsipCache = [];

function fetchArsipSurat() {
  const loadingEl = document.getElementById('arsip-loading');
  const listEl = document.getElementById('arsip-list');
  loadingEl.classList.remove('hidden'); loadingEl.classList.add('flex'); listEl.innerHTML = '';
  Api.getArsipSurat().then((res) => {
    loadingEl.classList.add('hidden'); loadingEl.classList.remove('flex');
    if (res.status !== 'success') {
      listEl.innerHTML = `<p class="text-xs text-red-500 text-center py-4">Gagal: ${esc(res.message)}</p>`;
      return;
    }
    arsipCache = res.data;
    renderArsipList();
  });
}

function renderArsipList() {
  const listEl = document.getElementById('arsip-list');
  if (!arsipCache.length) {
    listEl.innerHTML = `<div class="text-center py-6"><p class="text-xs text-gray-500">Belum ada surat tersimpan.</p></div>`;
    return;
  }
  listEl.innerHTML = arsipCache.map((s, i) => {
    const info = JENIS_SURAT_INFO[s.jenis] || { label: s.jenis };
    return `
    <div class="p-3 bg-gray-50 rounded-xl border border-gray-100">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <p class="text-xs font-bold text-gray-800 truncate">${esc(s.nomor)}</p>
          <p class="text-[10px] text-sky-600 font-semibold uppercase">${esc(info.label)}</p>
          <p class="text-[10px] text-gray-500 truncate">${esc(s.perihal || '-')}${s.tujuan ? ' • Kpd: ' + esc(s.tujuan) : ''}</p>
          <p class="text-[10px] text-gray-400">${esc(formatTanggal(s.tanggal))} • oleh ${esc(s.pembuat || '-')}</p>
        </div>
        <div class="flex gap-1.5 flex-shrink-0">
          <button onclick="cetakUlangSurat(${i})" class="btn-delete bg-sky-50 hover:bg-sky-100 rounded-lg" title="Cetak ulang">
            <i data-lucide="printer" class="w-4 h-4 text-sky-600"></i>
          </button>
          <button onclick="hapusSurat(${i})" class="btn-delete bg-red-50 hover:bg-red-100 rounded-lg" title="Hapus">
            <i data-lucide="trash-2" class="w-4 h-4 text-red-500"></i>
          </button>
        </div>
      </div>
    </div>`;
  }).join('');
  lucide.createIcons();
}

async function cetakUlangSurat(index) {
  const record = arsipCache[index];
  if (!record) return;
  const res = await Api.getStruktur();
  const struktur = (res.status === 'success' ? res.data : {}) || {};
  printSuratWindow(record, struktur);
}

async function hapusSurat(index) {
  const record = arsipCache[index];
  if (!record) return;
  if (!confirm('Hapus surat ' + record.nomor + ' dari arsip? Nomor urut tidak dikembalikan.')) return;
  const res = await Api.deleteSurat(record.key);
  if (res.status === 'success') fetchArsipSurat();
  else alert('Gagal: ' + res.message);
}

document.getElementById('tglSurat').addEventListener('change', updateNomorPreview);

// ===== MODAL =====
function openModal() { document.getElementById('successModal').classList.remove('hidden'); document.getElementById('successModal').classList.add('flex'); }
function closeModal() { document.getElementById('successModal').classList.add('hidden'); document.getElementById('successModal').classList.remove('flex'); }
