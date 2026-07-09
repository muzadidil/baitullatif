/* ==========================================
   TPQ AL-MAIDAH - Admin Panel Logic
   ========================================== */

lucide.createIcons();

let adminConfig = {};
let masterData = {};
let panitiaRecords = [];
let jabatanList = [];
let strukturData = {};

const LICENSE_CODE = 'MUZADIDIL';
const FIXED_JABATAN = ['Ketua', 'Sekretaris', 'Bendahara', 'Penasehat'];

// ===== PIN HASHING =====
async function hashPin(pin) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ===== RESET PIN WITH LICENSE =====
async function resetPinByLicense() {
  const code = document.getElementById('license-input').value.trim().toUpperCase();
  if (code !== LICENSE_CODE) { showToast('Kode lisensi salah', true); return; }
  const defaultHash = await hashPin('1234');
  try {
    await db.ref('admin/config/pinHash').set(defaultHash);
    showToast('PIN admin direset ke 1234');
    document.getElementById('reset-form').classList.add('hidden');
    document.getElementById('license-input').value = '';
    document.getElementById('pin-input').value = '';
    document.getElementById('pin-error').classList.add('hidden');
  } catch (e) {
    showToast('Gagal reset: ' + e.message, true);
  }
}

// ===== PIN GATE =====
document.getElementById('pin-input').addEventListener('keydown', e => { if (e.key === 'Enter') verifyPin(); });

async function verifyPin() {
  const input = document.getElementById('pin-input').value.trim();
  const errEl = document.getElementById('pin-error');
  errEl.classList.add('hidden');
  if (!input) { errEl.textContent = 'Masukkan PIN terlebih dahulu'; errEl.classList.remove('hidden'); return; }

  const res = await Api.getAdminConfig();
  const storedHash = res.data && res.data.pinHash;
  const inputHash = await hashPin(input);

  if (!storedHash) {
    const defaultHash = await hashPin('1234');
    if (inputHash !== defaultHash) { errEl.textContent = 'PIN salah. PIN default: 1234'; errEl.classList.remove('hidden'); document.getElementById('pin-input').value = ''; return; }
    const initConfig = { pinHash: defaultHash, memberPinHash: defaultHash, menu: { keluar: true, masuk: true, panitia: true, riwayat: true } };
    await Api.saveAdminConfig(initConfig);
    adminConfig = initConfig;
  } else {
    if (inputHash !== storedHash) { errEl.textContent = 'PIN salah'; errEl.classList.remove('hidden'); document.getElementById('pin-input').value = ''; return; }
    adminConfig = res.data;
  }

  document.getElementById('pin-gate').classList.add('hidden');
  document.getElementById('admin-panel').classList.remove('hidden');
  loadAdminPanel();
}

// ===== LOAD PANEL =====
async function loadAdminPanel() {
  const [masterRes, panitiaRes, strSnap] = await Promise.all([
    Api.getMasterData(),
    Api.getAllPanitiaRecords(),
    db.ref('struktur').once('value')
  ]);
  masterData = masterRes.data || {};
  panitiaRecords = panitiaRes.data || [];
  jabatanList = toArr(masterData.jabatan);
  strukturData = strSnap.val() || {};

  renderMenuSettings();
  renderKategoriList();
  renderSatuanList();
  renderJabatanList();
  renderPanitiaRecords();
  renderPanitiaList();
  renderMemberPinList();
  renderLpjInfo();
  renderStruktur();
  renderLogoPreview();
}

// ===== SECTION SWITCHING =====
function showSection(name) {
  ['menu','kategori','satuan','jabatan','panitia','audit','lpj','akun'].forEach(s => {
    document.getElementById('section-' + s).classList.add('hidden');
    document.getElementById('tab-btn-' + s).className = "flex-shrink-0 py-2.5 px-3 text-[10px] font-bold text-gray-500 hover:bg-gray-50 rounded-xl transition-all";
  });
  document.getElementById('section-' + name).classList.remove('hidden');
  document.getElementById('tab-btn-' + name).className = "active-tab flex-shrink-0 py-2.5 px-3 text-[10px] font-bold rounded-xl transition-all";
  if (name === 'audit' && !auditLoaded) loadAuditList();
  lucide.createIcons();
}

// ===== MENU SETTINGS =====
function renderMenuSettings() {
  const menu = adminConfig.menu || { keluar: true, masuk: true, panitia: true, riwayat: true };
  ['keluar','masuk','panitia','riwayat'].forEach(key => {
    const el = document.getElementById('menu-' + key);
    if (el) el.checked = menu[key] !== false;
  });
}

async function saveMenuSettings() {
  const menu = {};
  ['keluar','masuk','panitia','riwayat'].forEach(key => { menu[key] = document.getElementById('menu-' + key).checked; });
  const newConfig = Object.assign({}, adminConfig, { menu });
  const res = await Api.saveAdminConfig(newConfig);
  if (res.status === 'success') { adminConfig = newConfig; showToast('Pengaturan menu disimpan'); }
  else { showToast('Gagal: ' + res.message, true); }
}

// ===== GENERIC LIST RENDERER =====
function renderMasterList(containerId, list, removeFn, colorClass) {
  const el = document.getElementById(containerId);
  if (!list || list.length === 0) { el.innerHTML = '<p class="text-xs text-gray-400 text-center py-4">Belum ada data</p>'; return; }
  el.innerHTML = list.map((item, i) => `
    <div class="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
      <span class="text-sm font-medium text-gray-700">${item}</span>
      <button onclick="${removeFn}(${i})" class="btn-delete bg-red-50 hover:bg-red-100 rounded-lg transition-all">
        <i data-lucide="trash-2" class="w-4 h-4 text-red-500"></i>
      </button>
    </div>`).join('');
  lucide.createIcons();
}

// ===== KATEGORI =====
function renderKategoriList() { renderMasterList('kategori-list', toArr(masterData.kategori), 'removeKategori'); }

async function addKategori() {
  const input = document.getElementById('new-kategori');
  const val = clean(input.value, 50);
  if (!val) return;
  const list = toArr(masterData.kategori);
  if (list.map(s => s.toLowerCase()).includes(val.toLowerCase())) { showToast('Kategori sudah ada', true); return; }
  list.push(val);
  const res = await Api.updateMasterList('kategori', list);
  if (res.status === 'success') { masterData.kategori = list; input.value = ''; renderKategoriList(); showToast('Kategori ditambahkan'); }
  else { showToast('Gagal: ' + res.message, true); }
}

async function removeKategori(index) {
  const list = toArr(masterData.kategori);
  list.splice(index, 1);
  const res = await Api.updateMasterList('kategori', list);
  if (res.status === 'success') { masterData.kategori = list; renderKategoriList(); showToast('Kategori dihapus'); }
  else { showToast('Gagal: ' + res.message, true); }
}

// ===== SATUAN =====
function renderSatuanList() { renderMasterList('satuan-list', toArr(masterData.satuan), 'removeSatuan'); }

async function addSatuan() {
  const input = document.getElementById('new-satuan');
  const val = clean(input.value, 50);
  if (!val) return;
  const list = toArr(masterData.satuan);
  if (list.map(s => s.toLowerCase()).includes(val.toLowerCase())) { showToast('Satuan sudah ada', true); return; }
  list.push(val);
  const res = await Api.updateMasterList('satuan', list);
  if (res.status === 'success') { masterData.satuan = list; input.value = ''; renderSatuanList(); showToast('Satuan ditambahkan'); }
  else { showToast('Gagal: ' + res.message, true); }
}

async function removeSatuan(index) {
  const list = toArr(masterData.satuan);
  list.splice(index, 1);
  const res = await Api.updateMasterList('satuan', list);
  if (res.status === 'success') { masterData.satuan = list; renderSatuanList(); showToast('Satuan dihapus'); }
  else { showToast('Gagal: ' + res.message, true); }
}

// ===== JABATAN (with protected entries) =====
function renderJabatanList() {
  jabatanList = toArr(masterData.jabatan);
  const el = document.getElementById('jabatan-list');
  if (!jabatanList.length) { el.innerHTML = '<p class="text-xs text-gray-400 text-center py-4">Belum ada jabatan</p>'; return; }
  el.innerHTML = jabatanList.map((item, i) => {
    const isFixed = FIXED_JABATAN.includes(item);
    return `
    <div class="flex items-center gap-2 p-3 bg-gray-50 rounded-xl border border-gray-100">
      ${isFixed ? '<i data-lucide="lock" class="w-3.5 h-3.5 text-gray-400 flex-shrink-0"></i>' : '<i data-lucide="briefcase" class="w-3.5 h-3.5 text-indigo-400 flex-shrink-0"></i>'}
      <span id="jabatan-text-${i}" class="flex-1 text-sm font-medium text-gray-700">${item}</span>
      <input id="jabatan-input-${i}" class="hidden flex-1 bg-white border border-indigo-200 rounded-lg px-2 py-1 text-sm text-gray-700 outline-none" value="${item}">
      <button onclick="toggleRenameJabatan(${i})" class="btn-delete bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-all" title="Ganti nama">
        <i data-lucide="pencil" class="w-4 h-4 text-indigo-500"></i>
      </button>
      <button id="jabatan-save-${i}" onclick="saveRenameJabatan(${i})" class="hidden btn-delete bg-green-50 hover:bg-green-100 rounded-lg transition-all">
        <i data-lucide="check" class="w-4 h-4 text-green-500"></i>
      </button>
      ${!isFixed ? `<button onclick="removeJabatan(${i})" class="btn-delete bg-red-50 hover:bg-red-100 rounded-lg transition-all"><i data-lucide="trash-2" class="w-4 h-4 text-red-500"></i></button>` : ''}
    </div>`;
  }).join('');
  lucide.createIcons();
}

function toggleRenameJabatan(i) {
  document.getElementById('jabatan-text-' + i).classList.toggle('hidden');
  document.getElementById('jabatan-input-' + i).classList.toggle('hidden');
  document.getElementById('jabatan-save-' + i).classList.toggle('hidden');
}

async function saveRenameJabatan(i) {
  const newVal = clean(document.getElementById('jabatan-input-' + i).value, 50);
  if (!newVal) return;
  const list = toArr(masterData.jabatan);
  list[i] = newVal;
  const res = await Api.updateMasterList('jabatan', list);
  if (res.status === 'success') { masterData.jabatan = list; jabatanList = list; renderJabatanList(); showToast('Jabatan diperbarui'); }
  else { showToast('Gagal: ' + res.message, true); }
}

async function addJabatan() {
  const input = document.getElementById('new-jabatan');
  const val = clean(input.value, 50);
  if (!val) return;
  const list = toArr(masterData.jabatan);
  if (list.map(s => s.toLowerCase()).includes(val.toLowerCase())) { showToast('Jabatan sudah ada', true); return; }
  list.push(val);
  const res = await Api.updateMasterList('jabatan', list);
  if (res.status === 'success') { masterData.jabatan = list; jabatanList = list; input.value = ''; renderJabatanList(); showToast('Jabatan ditambahkan'); }
  else { showToast('Gagal: ' + res.message, true); }
}

async function removeJabatan(index) {
  const list = toArr(masterData.jabatan);
  if (FIXED_JABATAN.includes(list[index])) { showToast('Jabatan ini tidak bisa dihapus', true); return; }
  list.splice(index, 1);
  const res = await Api.updateMasterList('jabatan', list);
  if (res.status === 'success') { masterData.jabatan = list; jabatanList = list; renderJabatanList(); showToast('Jabatan dihapus'); }
  else { showToast('Gagal: ' + res.message, true); }
}

// ===== PANITIA RECORDS =====
function renderPanitiaRecords() {
  const el = document.getElementById('panitia-records-list');
  if (!panitiaRecords || panitiaRecords.length === 0) {
    el.innerHTML = '<p class="text-xs text-gray-400 text-center py-4">Belum ada susunan panitia</p>';
    return;
  }
  el.innerHTML = panitiaRecords.map(item => `
    <div class="flex items-center gap-2 p-2.5 bg-gray-50 rounded-xl border border-gray-100">
      <span class="flex-1 text-sm font-medium text-gray-700 truncate">${item.nama}</span>
      <select class="jabatan-select bg-white rounded-xl border border-gray-200 text-xs font-medium text-gray-700 appearance-none outline-none input-focus"
        onchange="updateJabatan('${item.key}', this.value)">
        ${jabatanList.map(j => `<option value="${j}" ${j === item.jabatan ? 'selected' : ''}>${j}</option>`).join('')}
        ${!jabatanList.includes(item.jabatan) && item.jabatan ? `<option value="${item.jabatan}" selected>${item.jabatan}</option>` : ''}
      </select>
      <button onclick="deletePanitiaRecord('${item.key}')" class="btn-delete bg-red-50 hover:bg-red-100 rounded-lg transition-all flex-shrink-0">
        <i data-lucide="trash-2" class="w-4 h-4 text-red-500"></i>
      </button>
    </div>`).join('');
  lucide.createIcons();
}

async function updateJabatan(key, jabatan) {
  const res = await Api.updatePanitiaJabatan(key, jabatan);
  if (res.status === 'success') { const r = panitiaRecords.find(r => r.key === key); if (r) r.jabatan = jabatan; showToast('Jabatan diperbarui'); }
  else { showToast('Gagal: ' + res.message, true); }
}

async function deletePanitiaRecord(key) {
  const res = await Api.deletePanitia(key);
  if (res.status === 'success') { panitiaRecords = panitiaRecords.filter(r => r.key !== key); renderPanitiaRecords(); showToast('Panitia dihapus'); }
  else { showToast('Gagal: ' + res.message, true); }
}

// ===== PANITIA MASTER NAMA =====
function renderPanitiaList() { renderMasterList('panitia-master-list', toArr(masterData.namaPanitia), 'removePanitia'); }

async function addPanitia() {
  const input = document.getElementById('new-panitia');
  const val = clean(input.value, 100).toUpperCase();
  if (!val) return;
  const list = toArr(masterData.namaPanitia);
  if (list.map(s => s.toUpperCase()).includes(val)) { showToast('Nama sudah ada', true); return; }
  list.push(val);
  const res = await Api.updateMasterList('namaPanitia', list);
  if (res.status === 'success') { masterData.namaPanitia = list; input.value = ''; renderPanitiaList(); showToast('Nama panitia ditambahkan'); }
  else { showToast('Gagal: ' + res.message, true); }
}

async function removePanitia(index) {
  const list = toArr(masterData.namaPanitia);
  list.splice(index, 1);
  const res = await Api.updateMasterList('namaPanitia', list);
  if (res.status === 'success') { masterData.namaPanitia = list; renderPanitiaList(); showToast('Nama dihapus'); }
  else { showToast('Gagal: ' + res.message, true); }
}

// ===== LPJ INFO =====
function renderLpjInfo() {
  const info = adminConfig.lpjInfo || {};
  document.getElementById('lpj-lembaga').value = info.lembaga || '';
  document.getElementById('lpj-alamat').value = info.alamat || '';
  document.getElementById('lpj-kegiatan').value = info.kegiatan || '';
}

async function saveLpjInfo() {
  const lembaga = clean(document.getElementById('lpj-lembaga').value, 100) || 'TPQ AL-MAIDAH KARANGSONO';
  const alamat = clean(document.getElementById('lpj-alamat').value, 200);
  const kegiatan = clean(document.getElementById('lpj-kegiatan').value, 100) || 'WISUDA SANTRI';
  const newConfig = Object.assign({}, adminConfig, { lpjInfo: { lembaga, alamat, kegiatan } });
  const res = await Api.saveAdminConfig(newConfig);
  if (res.status === 'success') { adminConfig = newConfig; showToast('Info LPJ disimpan'); }
  else { showToast('Gagal: ' + res.message, true); }
}

// ===== ADMIN PIN CHANGE =====
async function changePin() {
  const newPin = document.getElementById('new-pin').value.trim();
  const confirmPin = document.getElementById('confirm-pin').value.trim();
  const errEl = document.getElementById('pin-change-error');
  errEl.classList.add('hidden');
  if (!newPin || newPin.length < 4) { errEl.textContent = 'PIN minimal 4 karakter'; errEl.classList.remove('hidden'); return; }
  if (newPin !== confirmPin) { errEl.textContent = 'Konfirmasi PIN tidak cocok'; errEl.classList.remove('hidden'); return; }
  const newHash = await hashPin(newPin);
  const newConfig = Object.assign({}, adminConfig, { pinHash: newHash });
  const res = await Api.saveAdminConfig(newConfig);
  if (res.status === 'success') { adminConfig = newConfig; document.getElementById('new-pin').value = ''; document.getElementById('confirm-pin').value = ''; showToast('PIN admin berhasil diubah'); }
  else { showToast('Gagal: ' + res.message, true); }
}

// ===== MEMBER PIN CHANGE =====
async function changeMemberPin() {
  const newPin = document.getElementById('new-member-pin').value.trim();
  const confirmPin = document.getElementById('confirm-member-pin').value.trim();
  const errEl = document.getElementById('member-pin-error');
  errEl.classList.add('hidden');
  if (!newPin || newPin.length < 4) { errEl.textContent = 'PIN minimal 4 karakter'; errEl.classList.remove('hidden'); return; }
  if (newPin !== confirmPin) { errEl.textContent = 'Konfirmasi PIN tidak cocok'; errEl.classList.remove('hidden'); return; }
  const newHash = await hashPin(newPin);
  const newConfig = Object.assign({}, adminConfig, { memberPinHash: newHash });
  const res = await Api.saveAdminConfig(newConfig);
  if (res.status === 'success') { adminConfig = newConfig; document.getElementById('new-member-pin').value = ''; document.getElementById('confirm-member-pin').value = ''; showToast('PIN anggota berhasil diubah'); }
  else { showToast('Gagal: ' + res.message, true); }
}

// ===== STRUKTUR (LPJ signatories) =====
function renderStruktur() {
  document.getElementById('str-pj').value = strukturData.pj || '';
  document.getElementById('str-ketua').value = strukturData.ketua || '';
  document.getElementById('str-sekretaris').value = strukturData.sekretaris || '';
  document.getElementById('str-bendahara').value = strukturData.bendahara || '';
}

async function saveStruktur() {
  const data = {
    pj: clean(document.getElementById('str-pj').value, 100),
    ketua: clean(document.getElementById('str-ketua').value, 100),
    sekretaris: clean(document.getElementById('str-sekretaris').value, 100),
    bendahara: clean(document.getElementById('str-bendahara').value, 100)
  };
  try {
    await db.ref('struktur').set(data);
    strukturData = data;
    showToast('Penandatangan disimpan');
  } catch (e) { showToast('Gagal: ' + e.message, true); }
}

// ===== LOGO =====
let pendingLogoBase64 = null;

function renderLogoPreview() {
  const logo = adminConfig.logoBase64;
  if (logo) {
    document.getElementById('logo-preview').innerHTML = `<img src="${logo}" class="w-full h-full object-contain p-1">`;
  }
}

function previewLogo(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 200 * 1024) { showToast('File terlalu besar, maks 200 KB', true); input.value = ''; return; }
  const reader = new FileReader();
  reader.onload = (e) => {
    pendingLogoBase64 = e.target.result;
    document.getElementById('logo-preview').innerHTML = `<img src="${pendingLogoBase64}" class="w-full h-full object-contain p-1">`;
  };
  reader.readAsDataURL(file);
}

async function saveLogo() {
  if (!pendingLogoBase64) { showToast('Pilih file logo terlebih dahulu', true); return; }
  const newConfig = Object.assign({}, adminConfig, { logoBase64: pendingLogoBase64 });
  const res = await Api.saveAdminConfig(newConfig);
  if (res.status === 'success') { adminConfig = newConfig; pendingLogoBase64 = null; showToast('Logo disimpan'); }
  else { showToast('Gagal: ' + res.message, true); }
}

async function removeLogo() {
  const newConfig = Object.assign({}, adminConfig);
  delete newConfig.logoBase64;
  const res = await Api.saveAdminConfig(newConfig);
  if (res.status === 'success') {
    adminConfig = newConfig;
    document.getElementById('logo-preview').innerHTML = '<i data-lucide="image" class="w-6 h-6 text-gray-400"></i>';
    document.getElementById('logo-input').value = '';
    pendingLogoBase64 = null;
    lucide.createIcons();
    showToast('Logo dihapus');
  } else { showToast('Gagal: ' + res.message, true); }
}

// ===== EXPORT EXCEL (admin) =====
async function exportExcelAdmin() {
  showToast('Menyiapkan export...');
  const [pengRes, pemRes] = await Promise.all([
    db.ref('pengeluaran').once('value'),
    db.ref('pemasukan').once('value')
  ]);
  const pengVal = pengRes.val() || {};
  const pemVal = pemRes.val() || {};

  const fmtDate = (ms) => ms ? new Date(ms).toLocaleDateString('id-ID') : '-';
  const fmtTime = (ms) => ms ? new Date(ms).toLocaleString('id-ID') : '-';

  const pengRows = Object.values(pengVal).map(r => ({
    'Waktu': fmtTime(r.waktu), 'PJ': r.pj || '-', 'Jabatan PJ': r.jabatanPj || '-',
    'Keterangan': r.keterangan || '-', 'Total': r.total || 0,
    'Qty': r.qty || 0, 'Satuan': r.satuan || '-', 'Kategori': r.kategori || '-'
  }));
  pengRows.sort((a, b) => a.Waktu < b.Waktu ? 1 : -1);

  const pemRows = Object.values(pemVal).map(r => ({
    'Waktu': fmtTime(r.waktu), 'PJ': r.pj || '-', 'Nominal': r.nominal || 0, 'Keterangan': r.keterangan || '-'
  }));
  pemRows.sort((a, b) => a.Waktu < b.Waktu ? 1 : -1);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pengRows), 'Pengeluaran');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pemRows), 'Pemasukan');
  XLSX.writeFile(wb, `LPJ_${new Date().toISOString().slice(0,10)}.xlsx`);
  showToast('File Excel berhasil diunduh');
}

// ===== IMPORT EXCEL (admin) =====
function importExcelPrompt() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.xlsx,.xls,.csv';
  input.onchange = (e) => importExcelFile(e.target.files[0]);
  input.click();
}

async function importExcelFile(file) {
  if (!file) return;
  showToast('Membaca file...');
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet);
      if (!rows.length) { showToast('File kosong atau format salah', true); return; }

      let sukses = 0, gagal = 0;
      for (const row of rows) {
        const keterangan = String(row['Keterangan'] || row['keterangan'] || '').trim();
        const total = Number(row['Total'] || row['total'] || 0);
        const pj = String(row['PJ'] || row['pj'] || '').trim();
        const kategori = String(row['Kategori'] || row['kategori'] || 'Lainnya').trim();
        if (!keterangan || !pj || total <= 0) { gagal++; continue; }
        try {
          await db.ref('pengeluaran').push({
            waktu: firebase.database.ServerValue.TIMESTAMP,
            pj: pj.slice(0, 100),
            jabatanPj: String(row['Jabatan PJ'] || row['jabatanPj'] || '').slice(0, 50),
            keterangan: keterangan.slice(0, 200),
            total: total,
            qty: Number(row['Qty'] || row['qty'] || 1),
            satuan: String(row['Satuan'] || row['satuan'] || 'Pcs').slice(0, 50),
            kategori: kategori.slice(0, 50),
            status: 'Import'
          });
          sukses++;
        } catch { gagal++; }
      }
      showToast(`Import selesai: ${sukses} berhasil, ${gagal} gagal`);
    } catch (err) { showToast('Error baca file: ' + err.message, true); }
  };
  reader.readAsArrayBuffer(file);
}

// ===== AUDIT PENGELUARAN =====
let auditRecords = [];
let auditLoaded = false;

async function loadAuditList() {
  auditLoaded = true;
  document.getElementById('audit-list').innerHTML = '<p class="text-xs text-gray-400 text-center py-4">Memuat data...</p>';
  const res = await Api.getAllPengeluaranRecords();
  auditRecords = res.data || [];
  renderAuditList();
}

function renderAuditList() {
  const el = document.getElementById('audit-list');
  if (!auditRecords.length) {
    el.innerHTML = '<p class="text-xs text-gray-400 text-center py-4">Belum ada data pengeluaran</p>';
    return;
  }
  const fmt = (n) => new Intl.NumberFormat('id-ID').format(n);
  el.innerHTML = auditRecords.map((r, i) => `
    <div class="p-3 bg-gray-50 rounded-xl border border-gray-100">
      <div class="flex items-start gap-2 mb-1">
        <div class="flex-1 min-w-0">
          <p class="text-xs font-bold text-gray-700 truncate">${r.keterangan}</p>
          <p class="text-[10px] text-gray-400 truncate">${r.waktuFmt} · ${r.pj}${r.jabatanPj ? ' (' + r.jabatanPj + ')' : ''}</p>
          <p class="text-[10px] text-gray-400">${r.kategori} · ${r.qty > 0 ? r.qty + ' ' + r.satuan : ''}</p>
        </div>
        <span class="text-xs font-bold text-red-600 flex-shrink-0">Rp ${fmt(r.total)}</span>
      </div>
      <div class="flex gap-1.5 mt-2">
        <button onclick="openAuditEdit(${i})" class="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-600 font-bold py-1.5 rounded-lg text-[10px] btn-bounce flex items-center justify-center gap-1">
          <i data-lucide="pencil" class="w-3 h-3"></i> Edit
        </button>
        <button onclick="confirmDeletePengeluaran('${r.key}')" class="flex-1 bg-red-50 hover:bg-red-100 text-red-500 font-bold py-1.5 rounded-lg text-[10px] btn-bounce flex items-center justify-center gap-1">
          <i data-lucide="trash-2" class="w-3 h-3"></i> Hapus
        </button>
      </div>
    </div>`).join('');
  lucide.createIcons();
}

function openAuditEdit(index) {
  const r = auditRecords[index];
  document.getElementById('audit-edit-key').value = r.key;
  document.getElementById('audit-edit-waktu').value = r.waktu;
  document.getElementById('audit-pj').value = r.pj !== '-' ? r.pj : '';
  document.getElementById('audit-jabatanPj').value = r.jabatanPj || '';
  document.getElementById('audit-keterangan').value = r.keterangan !== '-' ? r.keterangan : '';
  document.getElementById('audit-total').value = r.total;
  document.getElementById('audit-qty').value = r.qty || 0;
  document.getElementById('audit-satuan').value = r.satuan !== '-' ? r.satuan : '';
  document.getElementById('audit-kategori').value = r.kategori !== '-' ? r.kategori : '';
  const form = document.getElementById('audit-edit-form');
  form.classList.remove('hidden');
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function cancelAuditEdit() {
  document.getElementById('audit-edit-form').classList.add('hidden');
}

async function saveAuditEdit() {
  const key = document.getElementById('audit-edit-key').value;
  const waktu = Number(document.getElementById('audit-edit-waktu').value);
  const pj = document.getElementById('audit-pj').value.trim();
  const keterangan = document.getElementById('audit-keterangan').value.trim();
  const total = Number(document.getElementById('audit-total').value);
  if (!pj || !keterangan || total <= 0) { showToast('PJ, keterangan, dan total wajib diisi', true); return; }
  const data = {
    waktu: waktu || Date.now(),
    pj, keterangan, total,
    jabatanPj: document.getElementById('audit-jabatanPj').value.trim(),
    qty: Number(document.getElementById('audit-qty').value) || 0,
    satuan: document.getElementById('audit-satuan').value.trim() || '-',
    kategori: document.getElementById('audit-kategori').value.trim() || 'Lainnya'
  };
  const res = await Api.updatePengeluaran(key, data);
  if (res.status === 'success') {
    cancelAuditEdit();
    await loadAuditList();
    showToast('Data berhasil diperbarui');
  } else { showToast('Gagal: ' + res.message, true); }
}

async function confirmDeletePengeluaran(key) {
  if (!confirm('Yakin hapus data ini? Tidak bisa dibatalkan.')) return;
  const res = await Api.deletePengeluaran(key);
  if (res.status === 'success') {
    auditRecords = auditRecords.filter(r => r.key !== key);
    renderAuditList();
    showToast('Data dihapus');
  } else { showToast('Gagal: ' + res.message, true); }
}

// ===== PIN PER ANGGOTA =====
let memberPinsData = {};

async function renderMemberPinList() {
  const el = document.getElementById('member-pin-list');
  const namaList = toArr(masterData.namaPanitia);
  if (!namaList.length) {
    el.innerHTML = '<p class="text-xs text-gray-400 text-center py-2">Belum ada nama anggota di Master Nama</p>';
    return;
  }
  el.innerHTML = '<p class="text-xs text-gray-400 text-center py-2">Memuat...</p>';
  const res = await Api.getMemberPins();
  memberPinsData = res.data || {};
  el.innerHTML = namaList.map((nama, i) => {
    const nameKey = nama.replace(/[.#$/\[\]]/g, '_');
    const hasPin = !!memberPinsData[nameKey];
    return `
    <div class="p-2.5 bg-gray-50 rounded-xl border border-gray-100">
      <div class="flex items-center gap-2">
        <span class="flex-1 text-sm font-medium text-gray-700 truncate">${nama}</span>
        <span class="text-[10px] px-2 py-0.5 rounded-full font-bold flex-shrink-0 ${hasPin ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}">${hasPin ? 'PIN sendiri' : 'PIN bersama'}</span>
        <button onclick="togglePinSetForm(${i})" class="btn-delete bg-blue-50 hover:bg-blue-100 rounded-lg flex-shrink-0">
          <i data-lucide="key" class="w-3.5 h-3.5 text-blue-500"></i>
        </button>
      </div>
      <div id="pin-set-form-${i}" class="hidden mt-2 space-y-2">
        <input type="password" id="pin-set-input-${i}" placeholder="PIN baru (min 4 digit)" inputmode="numeric" maxlength="8"
          class="w-full bg-white px-3 py-2 rounded-xl border border-gray-200 text-sm text-center tracking-widest outline-none input-focus">
        <div class="flex gap-2">
          <button onclick="saveMemberPinAdmin(${i}, '${nama}')" class="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-1.5 rounded-lg text-xs btn-bounce">Simpan PIN</button>
          ${hasPin ? `<button onclick="resetMemberPin(${i}, '${nama}')" class="bg-orange-100 hover:bg-orange-200 text-orange-600 font-bold py-1.5 px-3 rounded-lg text-xs btn-bounce">Reset</button>` : ''}
          <button onclick="togglePinSetForm(${i})" class="bg-gray-200 hover:bg-gray-300 text-gray-600 font-bold py-1.5 px-3 rounded-lg text-xs">Batal</button>
        </div>
      </div>
    </div>`;
  }).join('');
  lucide.createIcons();
}

function togglePinSetForm(i) {
  const form = document.getElementById('pin-set-form-' + i);
  form.classList.toggle('hidden');
  if (!form.classList.contains('hidden')) document.getElementById('pin-set-input-' + i).focus();
}

async function saveMemberPinAdmin(i, nama) {
  const pinInput = document.getElementById('pin-set-input-' + i);
  const pin = pinInput.value.trim();
  if (!pin || pin.length < 4) { showToast('PIN minimal 4 digit', true); return; }
  const nameKey = nama.replace(/[.#$/\[\]]/g, '_');
  const pinHash = await hashPin(pin);
  const res = await Api.setMemberPin(nameKey, pinHash);
  if (res.status === 'success') {
    pinInput.value = '';
    showToast('PIN ' + nama + ' berhasil diset');
    renderMemberPinList();
  } else { showToast('Gagal: ' + res.message, true); }
}

async function resetMemberPin(i, nama) {
  const nameKey = nama.replace(/[.#$/\[\]]/g, '_');
  const res = await Api.removeMemberPin(nameKey);
  if (res.status === 'success') {
    showToast('PIN ' + nama + ' direset ke PIN bersama');
    renderMemberPinList();
  } else { showToast('Gagal: ' + res.message, true); }
}

// ===== TOAST =====
function showToast(msg, isError = false) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-3 rounded-2xl text-white text-sm font-bold shadow-xl z-[200] transition-all whitespace-nowrap ${isError ? 'bg-red-500' : 'bg-green-500'}`;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 2500);
}
