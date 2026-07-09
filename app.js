/* ==========================================
   TPQ AL-MAIDAH KARANGSONO - Application Logic
   ========================================== */

lucide.createIcons();

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

  // Cek PIN per anggota dulu, fallback ke PIN bersama
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

  // Look up jabatan from panitia records
  let jabatan = '';
  const pr = await Api.getSusunanPanitia({});
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
  document.getElementById('member-gate').classList.remove('hidden');
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
    const map = { keluar: 'input', masuk: 'pemasukan', panitia: 'panitia', riwayat: 'riwayat' };
    Object.entries(map).forEach(([key, tabId]) => {
      if (menu[key] === false) {
        const btn = document.getElementById('btn-' + tabId);
        if (btn) btn.style.display = 'none';
      }
    });
  });
}

// ===== INIT =====
function init() {
  applyMenuVisibility();
  loadDropdowns();
  loadMemberNameDropdown();
  applyMemberSession();
  applyHeaderInfo();
}

async function applyHeaderInfo() {
  const res = await Api.getAdminConfig();
  const cfg = res.data || {};
  const info = cfg.lpjInfo || {};
  const lembaga = info.lembaga || 'TPQ AL-MAIDAH KARANGSONO';
  const kegiatan = info.kegiatan || 'Sistem Administrasi';
  const year = new Date().getFullYear();

  const elH = document.getElementById('header-lembaga');
  if (elH) elH.textContent = lembaga;

  const elK = document.getElementById('header-kegiatan');
  if (elK) elK.textContent = kegiatan;

  const elF = document.getElementById('footer-lembaga');
  if (elF) elF.textContent = '©' + year + ' ' + lembaga;

  document.title = lembaga;
}

init();

// ===== DROPDOWN LOADING =====
function loadMemberNameDropdown() {
  Api.getDataPanitia().then(res => {
    if (res.status !== 'success') return;
    const el = document.getElementById('memberNama');
    el.innerHTML = '<option value="" disabled selected>Pilih Nama Anda...</option>';
    res.nama.forEach(n => el.innerHTML += `<option value="${n}">${n}</option>`);
  });
}

function loadDropdowns() {
  Api.getDropdownData().then((res) => {
    if (res.status === 'success') {
      const elSatuan = document.getElementById('harga');
      const elKategori = document.getElementById('jenis');
      const elFilterKat = document.getElementById('filterKatRiwayat');

      elSatuan.innerHTML = '<option value="" disabled selected>Pilih Satuan</option>';
      res.satuan.forEach(s => elSatuan.innerHTML += `<option value="${s}">${s}</option>`);

      elKategori.innerHTML = '<option value="" disabled selected>Pilih Kategori</option>';
      elFilterKat.innerHTML = '<option value="">Semua Kategori</option>';
      res.kategori.forEach(k => {
        elKategori.innerHTML += `<option value="${k}">${k}</option>`;
        elFilterKat.innerHTML += `<option value="${k}">${k}</option>`;
      });
    }
  });

  Api.getDataPanitia().then((res) => {
    if (res.status === 'success') {
      const elNama = document.getElementById('namaAnggota');
      const elJabatan = document.getElementById('jabatanPanitia');
      const elFilterJabatan = document.getElementById('filterJabatanList');

      elNama.innerHTML = '<option value="" disabled selected>Pilih Nama Anggota</option>';
      res.nama.forEach(n => elNama.innerHTML += `<option value="${n}">${n}</option>`);

      elJabatan.innerHTML = '<option value="" disabled selected>Pilih Jabatan / Peran</option>';
      elFilterJabatan.innerHTML = '<option value="">Semua Jabatan</option>';
      res.jabatan.forEach(j => {
        elJabatan.innerHTML += `<option value="${j}">${j}</option>`;
        elFilterJabatan.innerHTML += `<option value="${j}">${j}</option>`;
      });
    }
  });
}

// ===== TAB NAVIGATION =====
function switchTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(tab => {
    tab.classList.add('hidden');
    tab.classList.remove('block');
  });
  document.getElementById('tab-' + tabId).classList.remove('hidden');
  document.getElementById('tab-' + tabId).classList.add('block');

  ['input', 'pemasukan', 'panitia', 'riwayat'].forEach(t => {
    const btn = document.getElementById('btn-' + t);
    if (btn) btn.className = "flex-1 flex flex-col items-center justify-center py-3 gap-0.5 text-gray-400 transition-all";
  });
  const active = document.getElementById('btn-' + tabId);
  if (active) active.className = "flex-1 flex flex-col items-center justify-center py-3 gap-0.5 text-[#003399] transition-all";

  if (tabId === 'riwayat') fetchRiwayat();
  if (tabId === 'panitia') fetchPanitia();
}

// ===== FORM: PENGELUARAN =====
function handleSubmit(e) {
  e.preventDefault();
  const session = getMemberSession();
  if (!session) { alert('Silakan login sebagai anggota terlebih dahulu.'); return; }

  const btnSubmit = document.getElementById('btnSubmit');
  const btnText = document.getElementById('btnText');
  const loading = document.getElementById('loading');
  const payload = {
    pj: session.nama,
    jabatanPj: session.jabatan || '',
    noRek: document.getElementById('noRek').value,
    nama: document.getElementById('nama').value,
    harga: document.getElementById('harga').value,
    qty: document.getElementById('qty').value,
    jenis: document.getElementById('jenis').value
  };

  const resetBtn = () => { btnSubmit.disabled = false; btnText.classList.remove('hidden'); loading.classList.add('hidden'); };
  btnSubmit.disabled = true; btnText.classList.add('hidden'); loading.classList.remove('hidden');

  Api.simpanData(payload).then((res) => {
    resetBtn();
    if (res.status === 'success') { openModal(); document.getElementById('bcaForm').reset(); document.getElementById('pjPengeluaran').value = session.nama; }
    else { alert('Gagal: ' + res.message); }
  }).catch((err) => { resetBtn(); alert('Error: ' + err); });
}

// ===== FORM: PEMASUKAN =====
function handlePemasukan(e) {
  e.preventDefault();
  const session = getMemberSession();
  if (!session) { alert('Silakan login sebagai anggota terlebih dahulu.'); return; }

  const btnSubmit = document.getElementById('btnSubmitPemasukan');
  const btnText = document.getElementById('btnTextPemasukan');
  const loading = document.getElementById('loadingPemasukan');
  const payload = {
    pj: session.nama,
    jabatanPj: session.jabatan || '',
    nominal: document.getElementById('nominalPemasukan').value,
    keterangan: document.getElementById('ketPemasukan').value
  };

  const resetBtn = () => { btnSubmit.disabled = false; btnText.classList.remove('hidden'); loading.classList.add('hidden'); };
  btnSubmit.disabled = true; btnText.classList.add('hidden'); loading.classList.remove('hidden');

  Api.simpanPemasukan(payload).then((res) => {
    resetBtn();
    if (res.status === 'success') { openModal(); document.getElementById('pemasukanForm').reset(); document.getElementById('pjPemasukan').value = session.nama; }
    else { alert('Gagal: ' + res.message); }
  }).catch((err) => { resetBtn(); alert('Error: ' + err); });
}

// ===== FORM: PANITIA =====
function handlePanitia(e) {
  e.preventDefault();
  const btnSubmit = document.getElementById('btnSubmitPanitia');
  const btnText = document.getElementById('btnTextPanitia');
  const loading = document.getElementById('loadingPanitia');
  const payload = { jabatan: document.getElementById('jabatanPanitia').value, nama: document.getElementById('namaAnggota').value };

  const resetBtn = () => { btnSubmit.disabled = false; btnText.classList.remove('hidden'); loading.classList.add('hidden'); };
  btnSubmit.disabled = true; btnText.classList.add('hidden'); loading.classList.remove('hidden');

  Api.simpanSusunan(payload).then((res) => {
    resetBtn();
    if (res.status === 'success') { openModal(); document.getElementById('panitiaForm').reset(); fetchPanitia(); }
    else { alert('Gagal: ' + res.message); }
  }).catch((err) => { resetBtn(); alert('Error: ' + err); });
}

// ===== PANITIA LIST =====
let searchTimerPanitia;
function delaySearchPanitia() { clearTimeout(searchTimerPanitia); searchTimerPanitia = setTimeout(() => { fetchPanitia(); }, 600); }

function fetchPanitia() {
  const loadingEl = document.getElementById('panitia-loading');
  const listEl = document.getElementById('panitia-list');
  const params = { search: document.getElementById('searchPanitia').value, jabatan: document.getElementById('filterJabatanList').value };
  loadingEl.classList.remove('hidden'); loadingEl.classList.add('flex'); listEl.innerHTML = '';
  Api.getSusunanPanitia(params).then((res) => {
    loadingEl.classList.add('hidden'); loadingEl.classList.remove('flex');
    if (res.status === 'success') { tampilkanDataPanitia(res.data); lucide.createIcons(); }
    else { listEl.innerHTML = `<p class="text-xs text-red-500 text-center py-4">Gagal: ${res.message}</p>`; }
  });
}

function tampilkanDataPanitia(dataArray) {
  const listEl = document.getElementById('panitia-list');
  if (!dataArray || dataArray.length === 0) {
    listEl.innerHTML = `<div class="text-center py-6"><p class="text-xs text-gray-500">Belum ada data panitia.</p></div>`;
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
        <h3 class="text-sm font-bold text-gray-800">${item.nama}</h3>
        <p class="text-[10px] text-purple-600 font-semibold uppercase tracking-wider">${item.jabatan}</p>
      </div>`;
    listEl.appendChild(card);
  });
}

// ===== RIWAYAT =====
let searchTimer;
function delaySearch() { clearTimeout(searchTimer); searchTimer = setTimeout(() => { fetchRiwayat(); }, 600); }

function fetchRiwayat() {
  const loadingEl = document.getElementById('riwayat-loading');
  const listEl = document.getElementById('riwayat-list');
  const params = {
    search: document.getElementById('searchRiwayat').value,
    kategori: document.getElementById('filterKatRiwayat').value,
    limit: parseInt(document.getElementById('limitRiwayat').value)
  };
  loadingEl.classList.remove('hidden'); loadingEl.classList.add('flex'); listEl.innerHTML = '';
  Api.getRiwayatData(params).then((res) => {
    loadingEl.classList.add('hidden'); loadingEl.classList.remove('flex');
    if (res.status === 'success') { tampilkanDataRiwayat(res.data); lucide.createIcons(); }
    else { listEl.innerHTML = `<p class="text-xs text-red-500 text-center py-4">Gagal: ${res.message}</p>`; }
  });
}

function tampilkanDataRiwayat(dataArray) {
  const listEl = document.getElementById('riwayat-list');
  if (!dataArray || dataArray.length === 0) {
    listEl.innerHTML = `<div class="text-center py-8"><p class="text-xs text-gray-500">Data tidak ditemukan.</p></div>`;
    return;
  }
  dataArray.forEach(item => {
    const totalRp = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(item.total);
    const card = document.createElement('div');
    card.className = "p-4 bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-between";
    card.innerHTML = `
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm border border-gray-100"><i data-lucide="receipt" class="w-4 h-4 text-gray-600"></i></div>
        <div>
          <h3 class="text-sm font-bold text-gray-800 uppercase">${item.keterangan}</h3>
          <p class="text-[10px] text-gray-500">${item.waktu} • PJ: <span class="font-bold">${item.pj}</span>${item.jabatanPj ? ' <span class="text-purple-600">(' + item.jabatanPj + ')</span>' : ''} • <span class="text-blue-600 font-semibold">${item.kategori}</span></p>
          <p class="text-[10px] text-gray-500 font-medium">${item.qty} ${item.satuan}</p>
        </div>
      </div>
      <div class="text-right"><p class="text-sm font-bold text-red-600">-${totalRp}</p></div>`;
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

// ===== LPJ / PDF =====
function printLPJ() {
  const btn = document.getElementById('btnPrint');
  const text = document.getElementById('btnTextPrint');
  const load = document.getElementById('loadingPrint');
  const resetBtn = () => { btn.disabled = false; text.classList.remove('hidden'); load.classList.add('hidden'); };
  btn.disabled = true; text.classList.add('hidden'); load.classList.remove('hidden');

  Api.getLPJData().then((res) => {
    resetBtn();
    if (res.status === 'success') { generateQRAndPrint(res.data); }
    else { alert('Gagal mengambil data LPJ: ' + res.message); }
  }).catch((err) => { resetBtn(); alert('System Error: ' + err); });
}

function generateQRAndPrint(data) {
  const appUrl = 'https://muzadidil.github.io/lpj_pengajian/';
  const qrContainer = document.createElement('div');
  qrContainer.style.cssText = 'position:fixed;left:-9999px;top:0;';
  document.body.appendChild(qrContainer);
  const qrObj = new QRCode(qrContainer, { text: appUrl, width: 120, height: 120, correctLevel: QRCode.CorrectLevel.M });
  setTimeout(() => {
    const canvas = qrContainer.querySelector('canvas');
    const qrSrc = canvas ? canvas.toDataURL('image/png') : '';
    document.body.removeChild(qrContainer);
    generatePDFLayout(data, qrSrc);
  }, 300);
}

function generatePDFLayout(data, qrSrc) {
  const formatRp = (angka) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(angka);
  const dateObj = new Date();
  const tahun = dateObj.getFullYear();
  const bulanIndo = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
  const tanggalSekarang = dateObj.getDate() + ' ' + bulanIndo[dateObj.getMonth()] + ' ' + tahun;

  let html = `
  <html><head><title>Cetak LPJ Keuangan</title>
  <style>
    body { font-family: 'Times New Roman', serif; font-size: 13px; padding: 20px; color: #000; position: relative; }
    body::before { content: '${data.lpjInfo.lembaga}'; position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%) rotate(-45deg); font-size: 60px; color: rgba(0,51,153,0.06); font-weight: bold; white-space: nowrap; z-index: 0; pointer-events: none; }
    * { position: relative; z-index: 1; }
    h2 { text-align: center; margin-bottom: 20px; text-transform: uppercase; font-size: 17px; }
    h3 { text-transform: uppercase; font-size: 14px; margin-top: 30px; border-bottom: 2px solid #000; padding-bottom: 5px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
    th, td { border: 1px solid #000; padding: 5px; text-align: left; font-size: 12px; }
    .bg-cat { background-color: #f2f2f2 !important; -webkit-print-color-adjust: exact; }
    .highlight-total { font-weight: bold; background-color: #e6f0ff !important; color: #003399; text-align: right; -webkit-print-color-adjust: exact; }
    .cat-title { font-weight: bold; text-transform: uppercase; }
    .summary-table td { border: none !important; font-size: 15px; padding: 4px 0; }
    .sign-table td { border: none !important; text-align: center; vertical-align: bottom; }
    .qr-block { text-align: right; }
    .qr-block img { width: 90px; height: 90px; }
    .qr-block p { font-size: 9px; color: #666; margin: 2px 0 0; }
    @media print { body::before { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style></head>
  <body>
    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px; border-bottom:2px solid #003399; padding-bottom:10px;">
      <div style="display:flex; align-items:center; gap:12px; flex:1;">
        ${data.lpjInfo.logoBase64 ? `<img src="${data.lpjInfo.logoBase64}" style="width:60px;height:60px;object-fit:contain;" alt="Logo">` : ''}
        <div>
          <h2 style="text-align:left; font-size:16px; margin:0 0 4px;">LAPORAN PERTANGGUNGJAWABAN KEUANGAN (LPJ)<br>${data.lpjInfo.lembaga}</h2>
          <p style="font-size:12px; margin:0;">Kegiatan: ${data.lpjInfo.kegiatan} &nbsp;|&nbsp; Tahun ${tahun}</p>
          ${data.lpjInfo.alamat ? `<p style="font-size:11px; color:#555; margin:2px 0 0;">Alamat: ${data.lpjInfo.alamat}</p>` : ''}
        </div>
      </div>
      ${qrSrc ? `<div class="qr-block"><img src="${qrSrc}" alt="QR"><p>Scan untuk verifikasi</p></div>` : ''}
    </div>
    <table class="summary-table" style="margin-bottom:25px; margin-top:20px;">
      <tr><td width="30%"><b>Total Pemasukan</b></td><td width="2%">:</td><td><b>${formatRp(data.totalPemasukan)}</b></td></tr>
      <tr><td><b>Total Pengeluaran</b></td><td>:</td><td><b>${formatRp(data.totalPengeluaran)}</b></td></tr>
      <tr><td><b>Saldo Akhir</b></td><td>:</td><td style="color:${data.saldo<0?'red':'green'};"><b>${formatRp(data.saldo)}</b></td></tr>
      <tr><td colspan="3" style="font-style:italic; padding-top:8px;">Terbilang: ${terbilang(data.saldo)} Rupiah</td></tr>
    </table>
    <h3>Rincian Pengeluaran</h3>`;

  for (const [kategori, info] of Object.entries(data.grouped)) {
    html += `
    <table>
      <tr class="bg-cat"><td colspan="6" class="cat-title">${kategori}</td><td class="highlight-total">${formatRp(info.total)}</td></tr>
      <tr><th style="text-align:center;" width="18%">Tanggal &amp; Waktu</th><th width="30%">Keterangan</th><th style="text-align:center;" width="10%">Satuan</th><th style="text-align:center;" width="13%">Nominal</th><th width="15%">Nama PJ</th><th width="14%">Jabatan</th></tr>`;
    info.items.forEach(item => {
      html += `<tr>
        <td style="text-align:center;">${item.tanggal}</td>
        <td>${item.keterangan}</td>
        <td style="text-align:center;">${item.qty} ${item.satuan}</td>
        <td style="text-align:right;">${formatRp(item.nominal)}</td>
        <td>${item.pj || '-'}</td>
        <td>${item.jabatanPj || '-'}</td>
      </tr>`;
    });
    html += `</table>`;
  }

  html += `
    <div style="text-align:right; margin-top:40px; margin-right:5%; font-size:14px;">Karangsono, ${tanggalSekarang}</div><br>
    <div style="width:100%; text-align:center; margin-top:10px;">
      <div style="margin-bottom:20px;">
        <p style="margin:0;">Mengetahui,</p><br><br>
        <p style="margin:0; margin-bottom:70px;">Penanggung Jawab Kegiatan</p>
        <p style="margin:0; font-weight:bold; text-decoration:underline;">${data.struktur.pj}</p>
      </div>
      <table class="sign-table" style="width:100%; margin-top:40px;">
        <tr>
          <td style="width:33%;"><p style="margin:0; margin-bottom:70px;">Sekretaris</p><p style="margin:0; font-weight:bold; text-decoration:underline;">${data.struktur.sekretaris}</p></td>
          <td style="width:33%;"><p style="margin:0; margin-bottom:70px;">Ketua Panitia</p><p style="margin:0; font-weight:bold; text-decoration:underline;">${data.struktur.ketua}</p></td>
          <td style="width:33%;"><p style="margin:0; margin-bottom:70px;">Bendahara</p><p style="margin:0; font-weight:bold; text-decoration:underline;">${data.struktur.bendahara}</p></td>
        </tr>
      </table>
    </div>
  </body></html>`;

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  setTimeout(() => { win.print(); }, 800);
}

// ===== EXPORT EXCEL =====
async function exportExcel() {
  const res = await Api.getLPJData();
  if (res.status !== 'success') { alert('Gagal mengambil data'); return; }
  const d = res.data;

  const pengRows = [];
  for (const [kat, info] of Object.entries(d.grouped)) {
    info.items.forEach(item => {
      pengRows.push({
        'Tanggal': item.tanggal, 'PJ': item.pj, 'Jabatan PJ': item.jabatanPj,
        'Keterangan': item.keterangan, 'Qty': item.qty, 'Satuan': item.satuan,
        'Total (Rp)': item.nominal, 'Kategori': kat
      });
    });
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pengRows), 'Pengeluaran');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
    { 'Total Pemasukan': d.totalPemasukan, 'Total Pengeluaran': d.totalPengeluaran, 'Saldo': d.saldo }
  ]), 'Ringkasan');
  XLSX.writeFile(wb, `LPJ_${d.lpjInfo.kegiatan.replace(/\s+/g,'_')}_${new Date().toISOString().slice(0,10)}.xlsx`);
}

// ===== MODAL =====
function openModal() { document.getElementById('successModal').classList.remove('hidden'); document.getElementById('successModal').classList.add('flex'); }
function closeModal() { document.getElementById('successModal').classList.add('hidden'); document.getElementById('successModal').classList.remove('flex'); }
