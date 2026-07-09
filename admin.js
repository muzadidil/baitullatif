/* ==========================================
   MASJID JAMIK BAITULLATIF - Admin Panel Logic
   ========================================== */

lucide.createIcons();

let adminConfig = {};
let masterData = {};
let pengurusRecords = [];
let jabatanList = [];
let strukturData = {};
let kegiatanRecords = [];

const LICENSE_CODE = 'MUZADIDIL';
const FIXED_JABATAN = ['Penasehat', 'Ketua', 'Sekretaris', 'Bendahara'];
const MENU_KEYS = ['keluar', 'masuk', 'laporan', 'surat', 'pengurus'];

// ===== SETUP GATE =====
if (!FIREBASE_CONFIGURED) {
  document.getElementById('setup-banner').classList.remove('hidden');
  document.getElementById('pin-gate').classList.add('hidden');
}

// ===== PIN HASHING =====
async function hashPin(pin) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ===== RESET PIN WITH LICENSE =====
async function resetPinByLicense() {
  if (!db) { showToast(NOT_CONFIGURED_MSG, true); return; }
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
  if (res.status === 'error' && !FIREBASE_CONFIGURED) { errEl.textContent = NOT_CONFIGURED_MSG; errEl.classList.remove('hidden'); return; }
  const storedHash = res.data && res.data.pinHash;
  const inputHash = await hashPin(input);

  if (!storedHash) {
    const defaultHash = await hashPin('1234');
    if (inputHash !== defaultHash) { errEl.textContent = 'PIN salah. PIN default: 1234'; errEl.classList.remove('hidden'); document.getElementById('pin-input').value = ''; return; }
    const menu = {};
    MENU_KEYS.forEach(k => menu[k] = true);
    const initConfig = { pinHash: defaultHash, memberPinHash: defaultHash, menu: menu };
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
  const [masterRes, pengurusRes, strukturRes, kegiatanRes] = await Promise.all([
    Api.getMasterData(),
    Api.getAllPengurusRecords(),
    Api.getStruktur(),
    Api.getKegiatanList('')
  ]);
  masterData = masterRes.data || {};
  pengurusRecords = pengurusRes.data || [];
  jabatanList = toArr(masterData.jabatan);
  strukturData = strukturRes.data || {};
  kegiatanRecords = kegiatanRes.data || [];

  renderMenuSettings();
  renderKegiatanList();
  renderBukuSelectors();
  renderKategoriKeluarList();
  renderKategoriMasukList();
  renderSatuanList();
  renderJabatanList();
  renderPengurusRecords();
  renderPengurusList();
  renderMemberPinList();
  renderOrgInfo();
  renderStruktur();
  renderLogoPreview();
}

// Fill the buku selectors on audit & import with kegiatan options
function renderBukuSelectors() {
  ['audit-buku', 'import-buku'].forEach(id => {
    const el = document.getElementById(id);
    const current = el.value;
    el.innerHTML = '<option value="masjid">Kas Masjid</option>';
    kegiatanRecords.forEach(k => {
      const suffix = k.status === 'selesai' ? ' (selesai)' : '';
      el.innerHTML += `<option value="${esc(k.id)}">Kegiatan: ${esc(k.nama)}${esc(suffix)}</option>`;
    });
    if ([...el.options].some(o => o.value === current)) el.value = current;
  });
}

// ===== SECTION SWITCHING =====
function showSection(name) {
  ['menu', 'kegiatan', 'kategori', 'satuan', 'jabatan', 'pengurus', 'audit', 'identitas', 'akun'].forEach(s => {
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
  const menu = adminConfig.menu || {};
  MENU_KEYS.forEach(key => {
    const el = document.getElementById('menu-' + key);
    if (el) el.checked = menu[key] !== false;
  });
}

async function saveMenuSettings() {
  const menu = {};
  MENU_KEYS.forEach(key => { menu[key] = document.getElementById('menu-' + key).checked; });
  const newConfig = Object.assign({}, adminConfig, { menu });
  const res = await Api.saveAdminConfig(newConfig);
  if (res.status === 'success') { adminConfig = newConfig; showToast('Pengaturan menu disimpan'); }
  else { showToast('Gagal: ' + res.message, true); }
}

// ===== KEGIATAN =====
function renderKegiatanList() {
  const el = document.getElementById('kegiatan-list');
  if (!kegiatanRecords.length) {
    el.innerHTML = '<p class="text-xs text-gray-400 text-center py-4">Belum ada kegiatan. Tambahkan untuk membuka buku kas kegiatan.</p>';
    return;
  }
  el.innerHTML = kegiatanRecords.map((k, i) => {
    const aktif = k.status !== 'selesai';
    return `
    <div class="p-3 bg-gray-50 rounded-xl border border-gray-100">
      <div class="flex items-center gap-2">
        <span class="text-[9px] px-2 py-0.5 rounded-full font-bold flex-shrink-0 ${aktif ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}">${aktif ? 'AKTIF' : 'SELESAI'}</span>
        <span id="kegiatan-text-${i}" class="flex-1 text-sm font-medium text-gray-700 truncate">${esc(k.nama)}</span>
        <input id="kegiatan-input-${i}" class="hidden flex-1 bg-white border border-amber-200 rounded-lg px-2 py-1 text-sm text-gray-700 outline-none" value="${esc(k.nama)}">
        <button onclick="toggleRenameKegiatan(${i})" class="btn-delete bg-amber-50 hover:bg-amber-100 rounded-lg transition-all" title="Ganti nama">
          <i data-lucide="pencil" class="w-4 h-4 text-amber-600"></i>
        </button>
        <button id="kegiatan-save-${i}" onclick="saveRenameKegiatan(${i})" class="hidden btn-delete bg-green-50 hover:bg-green-100 rounded-lg transition-all">
          <i data-lucide="check" class="w-4 h-4 text-green-500"></i>
        </button>
      </div>
      <div class="flex gap-1.5 mt-2">
        <button onclick="toggleStatusKegiatan(${i})" class="flex-1 ${aktif ? 'bg-gray-100 hover:bg-gray-200 text-gray-600' : 'bg-green-50 hover:bg-green-100 text-green-700'} font-bold py-1.5 rounded-lg text-[10px] btn-bounce flex items-center justify-center gap-1">
          <i data-lucide="${aktif ? 'flag' : 'rotate-ccw'}" class="w-3 h-3"></i> ${aktif ? 'Tandai Selesai' : 'Aktifkan Lagi'}
        </button>
        <button onclick="removeKegiatan(${i})" class="flex-1 bg-red-50 hover:bg-red-100 text-red-500 font-bold py-1.5 rounded-lg text-[10px] btn-bounce flex items-center justify-center gap-1">
          <i data-lucide="trash-2" class="w-3 h-3"></i> Hapus
        </button>
      </div>
    </div>`;
  }).join('');
  lucide.createIcons();
}

async function addKegiatan() {
  const input = document.getElementById('new-kegiatan');
  const val = clean(input.value, 100);
  if (!val) return;
  if (kegiatanRecords.some(k => k.nama.toLowerCase() === val.toLowerCase())) { showToast('Nama kegiatan sudah ada', true); return; }
  const res = await Api.simpanKegiatan(val);
  if (res.status === 'success') {
    input.value = '';
    const list = await Api.getKegiatanList('');
    kegiatanRecords = list.data || [];
    renderKegiatanList();
    renderBukuSelectors();
    showToast('Kegiatan ditambahkan');
  } else { showToast('Gagal: ' + res.message, true); }
}

function toggleRenameKegiatan(i) {
  document.getElementById('kegiatan-text-' + i).classList.toggle('hidden');
  document.getElementById('kegiatan-input-' + i).classList.toggle('hidden');
  document.getElementById('kegiatan-save-' + i).classList.toggle('hidden');
}

async function saveRenameKegiatan(i) {
  const newVal = clean(document.getElementById('kegiatan-input-' + i).value, 100);
  if (!newVal) return;
  const res = await Api.updateKegiatan(kegiatanRecords[i].id, { nama: newVal });
  if (res.status === 'success') {
    kegiatanRecords[i].nama = newVal;
    renderKegiatanList();
    renderBukuSelectors();
    showToast('Nama kegiatan diperbarui');
  } else { showToast('Gagal: ' + res.message, true); }
}

async function toggleStatusKegiatan(i) {
  const k = kegiatanRecords[i];
  const newStatus = k.status === 'selesai' ? 'aktif' : 'selesai';
  const res = await Api.updateKegiatan(k.id, { status: newStatus });
  if (res.status === 'success') {
    k.status = newStatus;
    renderKegiatanList();
    renderBukuSelectors();
    showToast('Status kegiatan: ' + newStatus);
  } else { showToast('Gagal: ' + res.message, true); }
}

async function removeKegiatan(i) {
  const k = kegiatanRecords[i];
  if (!confirm('Hapus kegiatan "' + k.nama + '"?\n\nPERHATIAN: Seluruh transaksi kas kegiatan ini ikut TERHAPUS dan tidak bisa dikembalikan.')) return;
  const res = await Api.deleteKegiatan(k.id);
  if (res.status === 'success') {
    kegiatanRecords = kegiatanRecords.filter(r => r.id !== k.id);
    renderKegiatanList();
    renderBukuSelectors();
    showToast('Kegiatan dihapus');
  } else { showToast('Gagal: ' + res.message, true); }
}

// ===== GENERIC LIST RENDERER =====
function renderMasterList(containerId, list, removeFn) {
  const el = document.getElementById(containerId);
  if (!list || list.length === 0) { el.innerHTML = '<p class="text-xs text-gray-400 text-center py-4">Belum ada data</p>'; return; }
  el.innerHTML = list.map((item, i) => `
    <div class="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
      <span class="text-sm font-medium text-gray-700">${esc(item)}</span>
      <button onclick="${removeFn}(${i})" class="btn-delete bg-red-50 hover:bg-red-100 rounded-lg transition-all">
        <i data-lucide="trash-2" class="w-4 h-4 text-red-500"></i>
      </button>
    </div>`).join('');
  lucide.createIcons();
}

async function addToMasterList(masterKey, inputId, renderFn, label) {
  const input = document.getElementById(inputId);
  const val = clean(input.value, 50);
  if (!val) return;
  const list = toArr(masterData[masterKey]);
  if (list.map(s => s.toLowerCase()).includes(val.toLowerCase())) { showToast(label + ' sudah ada', true); return; }
  list.push(val);
  const res = await Api.updateMasterList(masterKey, list);
  if (res.status === 'success') { masterData[masterKey] = list; input.value = ''; renderFn(); showToast(label + ' ditambahkan'); }
  else { showToast('Gagal: ' + res.message, true); }
}

async function removeFromMasterList(masterKey, index, renderFn, label) {
  const list = toArr(masterData[masterKey]);
  list.splice(index, 1);
  const res = await Api.updateMasterList(masterKey, list);
  if (res.status === 'success') { masterData[masterKey] = list; renderFn(); showToast(label + ' dihapus'); }
  else { showToast('Gagal: ' + res.message, true); }
}

// ===== KATEGORI KELUAR / MASUK =====
function renderKategoriKeluarList() { renderMasterList('kategori-keluar-list', toArr(masterData.kategoriKeluar), 'removeKategoriKeluar'); }
function renderKategoriMasukList() { renderMasterList('kategori-masuk-list', toArr(masterData.kategoriMasuk), 'removeKategoriMasuk'); }

function addKategoriKeluar() { addToMasterList('kategoriKeluar', 'new-kategori-keluar', renderKategoriKeluarList, 'Kategori'); }
function removeKategoriKeluar(i) { removeFromMasterList('kategoriKeluar', i, renderKategoriKeluarList, 'Kategori'); }
function addKategoriMasuk() { addToMasterList('kategoriMasuk', 'new-kategori-masuk', renderKategoriMasukList, 'Sumber dana'); }
function removeKategoriMasuk(i) { removeFromMasterList('kategoriMasuk', i, renderKategoriMasukList, 'Sumber dana'); }

// ===== SATUAN =====
function renderSatuanList() { renderMasterList('satuan-list', toArr(masterData.satuan), 'removeSatuan'); }
function addSatuan() { addToMasterList('satuan', 'new-satuan', renderSatuanList, 'Satuan'); }
function removeSatuan(i) { removeFromMasterList('satuan', i, renderSatuanList, 'Satuan'); }

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
      <span id="jabatan-text-${i}" class="flex-1 text-sm font-medium text-gray-700">${esc(item)}</span>
      <input id="jabatan-input-${i}" class="hidden flex-1 bg-white border border-indigo-200 rounded-lg px-2 py-1 text-sm text-gray-700 outline-none" value="${esc(item)}">
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

// ===== PENGURUS RECORDS =====
function renderPengurusRecords() {
  const el = document.getElementById('pengurus-records-list');
  if (!pengurusRecords || pengurusRecords.length === 0) {
    el.innerHTML = '<p class="text-xs text-gray-400 text-center py-4">Belum ada susunan pengurus</p>';
    return;
  }
  el.innerHTML = pengurusRecords.map(item => `
    <div class="flex items-center gap-2 p-2.5 bg-gray-50 rounded-xl border border-gray-100">
      <span class="flex-1 text-sm font-medium text-gray-700 truncate">${esc(item.nama)}</span>
      <select class="jabatan-select bg-white rounded-xl border border-gray-200 text-xs font-medium text-gray-700 appearance-none outline-none input-focus"
        onchange="updateJabatan('${esc(item.key)}', this.value)">
        ${jabatanList.map(j => `<option value="${esc(j)}" ${j === item.jabatan ? 'selected' : ''}>${esc(j)}</option>`).join('')}
        ${!jabatanList.includes(item.jabatan) && item.jabatan ? `<option value="${esc(item.jabatan)}" selected>${esc(item.jabatan)}</option>` : ''}
      </select>
      <button onclick="deletePengurusRecord('${esc(item.key)}')" class="btn-delete bg-red-50 hover:bg-red-100 rounded-lg transition-all flex-shrink-0">
        <i data-lucide="trash-2" class="w-4 h-4 text-red-500"></i>
      </button>
    </div>`).join('');
  lucide.createIcons();
}

async function updateJabatan(key, jabatan) {
  const res = await Api.updatePengurusJabatan(key, jabatan);
  if (res.status === 'success') { const r = pengurusRecords.find(r => r.key === key); if (r) r.jabatan = jabatan; showToast('Jabatan diperbarui'); }
  else { showToast('Gagal: ' + res.message, true); }
}

async function deletePengurusRecord(key) {
  const res = await Api.deletePengurus(key);
  if (res.status === 'success') { pengurusRecords = pengurusRecords.filter(r => r.key !== key); renderPengurusRecords(); showToast('Pengurus dihapus'); }
  else { showToast('Gagal: ' + res.message, true); }
}

// ===== PENGURUS MASTER NAMA =====
function renderPengurusList() { renderMasterList('pengurus-master-list', toArr(masterData.namaPengurus), 'removePengurus'); }

async function addPengurus() {
  const input = document.getElementById('new-pengurus');
  const val = clean(input.value, 100).toUpperCase();
  if (!val) return;
  const list = toArr(masterData.namaPengurus);
  if (list.map(s => s.toUpperCase()).includes(val)) { showToast('Nama sudah ada', true); return; }
  list.push(val);
  const res = await Api.updateMasterList('namaPengurus', list);
  if (res.status === 'success') { masterData.namaPengurus = list; input.value = ''; renderPengurusList(); showToast('Nama pengurus ditambahkan'); }
  else { showToast('Gagal: ' + res.message, true); }
}

async function removePengurus(index) {
  const list = toArr(masterData.namaPengurus);
  list.splice(index, 1);
  const res = await Api.updateMasterList('namaPengurus', list);
  if (res.status === 'success') { masterData.namaPengurus = list; renderPengurusList(); showToast('Nama dihapus'); }
  else { showToast('Gagal: ' + res.message, true); }
}

// ===== IDENTITAS (org info) =====
function renderOrgInfo() {
  const info = adminConfig.orgInfo || {};
  document.getElementById('org-lembaga').value = info.lembaga || '';
  document.getElementById('org-alamat').value = info.alamat || '';
  document.getElementById('org-kota').value = info.kota || '';
  document.getElementById('org-kode-surat').value = info.kodeSurat || '';
}

async function saveOrgInfo() {
  const orgInfo = {
    lembaga: clean(document.getElementById('org-lembaga').value, 100) || 'MASJID JAMIK BAITULLATIF',
    alamat: clean(document.getElementById('org-alamat').value, 200) || 'Dusun Krajan, Desa Karangsono, Kecamatan Bangsalsari, Kabupaten Jember',
    kota: clean(document.getElementById('org-kota').value, 50) || 'Karangsono',
    kodeSurat: clean(document.getElementById('org-kode-surat').value, 30).toUpperCase() || 'TKM-BTL'
  };
  const newConfig = Object.assign({}, adminConfig, { orgInfo });
  const res = await Api.saveAdminConfig(newConfig);
  if (res.status === 'success') { adminConfig = newConfig; showToast('Identitas disimpan'); }
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
  if (res.status === 'success') { adminConfig = newConfig; document.getElementById('new-member-pin').value = ''; document.getElementById('confirm-member-pin').value = ''; showToast('PIN pengurus berhasil diubah'); }
  else { showToast('Gagal: ' + res.message, true); }
}

// ===== STRUKTUR (penandatangan) =====
function renderStruktur() {
  document.getElementById('str-ketua').value = strukturData.ketua || '';
  document.getElementById('str-sekretaris').value = strukturData.sekretaris || '';
  document.getElementById('str-bendahara').value = strukturData.bendahara || '';
  document.getElementById('str-penasehat').value = strukturData.penasehat || '';
}

async function saveStruktur() {
  const data = {
    ketua: document.getElementById('str-ketua').value,
    sekretaris: document.getElementById('str-sekretaris').value,
    bendahara: document.getElementById('str-bendahara').value,
    penasehat: document.getElementById('str-penasehat').value
  };
  const res = await Api.saveStruktur(data);
  if (res.status === 'success') { strukturData = data; showToast('Penandatangan disimpan'); }
  else { showToast('Gagal: ' + res.message, true); }
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

// ===== EXPORT EXCEL (all books) =====
function sheetName(base) {
  // Excel sheet names: max 31 chars, no : \ / ? * [ ]
  return base.replace(/[:\\\/\?\*\[\]]/g, ' ').slice(0, 31);
}

async function exportExcelAdmin() {
  showToast('Menyiapkan export...');
  const bukuList = [{ id: 'masjid', nama: 'Masjid' }].concat(
    kegiatanRecords.map(k => ({ id: k.id, nama: k.nama }))
  );

  const wb = XLSX.utils.book_new();
  for (const buku of bukuList) {
    const [kelRes, masRes] = await Promise.all([
      Api.getAllKasRecords(buku.id, 'pengeluaran'),
      Api.getAllKasRecords(buku.id, 'pemasukan')
    ]);
    const kelRows = (kelRes.data || []).map(r => ({
      'Waktu': r.waktuFmt, 'PJ': r.pj, 'Jabatan PJ': r.jabatanPj,
      'Keterangan': r.keterangan, 'Total': r.nominal,
      'Qty': r.qty, 'Satuan': r.satuan, 'Kategori': r.kategori
    }));
    const masRows = (masRes.data || []).map(r => ({
      'Waktu': r.waktuFmt, 'PJ': r.pj, 'Nominal': r.nominal,
      'Keterangan': r.keterangan, 'Kategori': r.kategori
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(kelRows.length ? kelRows : [{}]), sheetName(buku.nama + ' - Keluar'));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(masRows.length ? masRows : [{}]), sheetName(buku.nama + ' - Masuk'));
  }
  XLSX.writeFile(wb, `Keuangan_Baitullatif_${new Date().toISOString().slice(0, 10)}.xlsx`);
  showToast('File Excel berhasil diunduh');
}

// ===== IMPORT EXCEL =====
function importExcelPrompt() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.xlsx,.xls,.csv';
  input.onchange = (e) => importExcelFile(e.target.files[0]);
  input.click();
}

async function importExcelFile(file) {
  if (!file) return;
  if (!db) { showToast(NOT_CONFIGURED_MSG, true); return; }
  const bukuId = document.getElementById('import-buku').value;
  const jenis = document.getElementById('import-jenis').value;
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
        const pj = String(row['PJ'] || row['pj'] || '').trim();
        const kategori = String(row['Kategori'] || row['kategori'] || 'Lain-lain').trim();
        try {
          if (jenis === 'pemasukan') {
            const nominal = Number(row['Nominal'] || row['nominal'] || 0);
            if (!pj || nominal <= 0) { gagal++; continue; }
            await db.ref('kas/' + bukuId + '/pemasukan').push({
              waktu: firebase.database.ServerValue.TIMESTAMP,
              pj: pj.slice(0, 100),
              jabatanPj: String(row['Jabatan PJ'] || row['jabatanPj'] || '').slice(0, 50),
              nominal: nominal,
              keterangan: String(row['Keterangan'] || row['keterangan'] || '').slice(0, 200),
              kategori: kategori.slice(0, 50)
            });
          } else {
            const keterangan = String(row['Keterangan'] || row['keterangan'] || '').trim();
            const total = Number(row['Total'] || row['total'] || 0);
            if (!keterangan || !pj || total <= 0) { gagal++; continue; }
            await db.ref('kas/' + bukuId + '/pengeluaran').push({
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
          }
          sukses++;
        } catch { gagal++; }
      }
      showToast(`Import selesai: ${sukses} berhasil, ${gagal} gagal`);
    } catch (err) { showToast('Error baca file: ' + err.message, true); }
  };
  reader.readAsArrayBuffer(file);
}

// ===== AUDIT TRANSAKSI =====
let auditRecords = [];
let auditLoaded = false;

function auditContext() {
  return {
    buku: document.getElementById('audit-buku').value,
    jenis: document.getElementById('audit-jenis').value
  };
}

async function loadAuditList() {
  auditLoaded = true;
  cancelAuditEdit();
  document.getElementById('audit-list').innerHTML = '<p class="text-xs text-gray-400 text-center py-4">Memuat data...</p>';
  const ctx = auditContext();
  const res = await Api.getAllKasRecords(ctx.buku, ctx.jenis);
  auditRecords = res.data || [];
  renderAuditList();
}

function renderAuditList() {
  const el = document.getElementById('audit-list');
  const ctx = auditContext();
  const isMasuk = ctx.jenis === 'pemasukan';
  if (!auditRecords.length) {
    el.innerHTML = '<p class="text-xs text-gray-400 text-center py-4">Belum ada data ' + ctx.jenis + '</p>';
    return;
  }
  const fmt = (n) => new Intl.NumberFormat('id-ID').format(n);
  el.innerHTML = auditRecords.map((r, i) => `
    <div class="p-3 bg-gray-50 rounded-xl border border-gray-100">
      <div class="flex items-start gap-2 mb-1">
        <div class="flex-1 min-w-0">
          <p class="text-xs font-bold text-gray-700 truncate">${esc(r.keterangan)}</p>
          <p class="text-[10px] text-gray-400 truncate">${esc(r.waktuFmt)} · ${esc(r.pj)}${r.jabatanPj ? ' (' + esc(r.jabatanPj) + ')' : ''}</p>
          <p class="text-[10px] text-gray-400">${esc(r.kategori)}${!isMasuk && r.qty > 0 ? ' · ' + esc(r.qty + ' ' + r.satuan) : ''}</p>
        </div>
        <span class="text-xs font-bold ${isMasuk ? 'text-green-700' : 'text-red-600'} flex-shrink-0">${isMasuk ? '+' : '-'}Rp ${fmt(r.nominal)}</span>
      </div>
      <div class="flex gap-1.5 mt-2">
        <button onclick="openAuditEdit(${i})" class="flex-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold py-1.5 rounded-lg text-[10px] btn-bounce flex items-center justify-center gap-1">
          <i data-lucide="pencil" class="w-3 h-3"></i> Edit
        </button>
        <button onclick="confirmDeleteKas('${esc(r.key)}')" class="flex-1 bg-red-50 hover:bg-red-100 text-red-500 font-bold py-1.5 rounded-lg text-[10px] btn-bounce flex items-center justify-center gap-1">
          <i data-lucide="trash-2" class="w-3 h-3"></i> Hapus
        </button>
      </div>
    </div>`).join('');
  lucide.createIcons();
}

function openAuditEdit(index) {
  const r = auditRecords[index];
  const ctx = auditContext();
  const isMasuk = ctx.jenis === 'pemasukan';
  document.getElementById('audit-edit-title').textContent = 'Edit Data ' + (isMasuk ? 'Pemasukan' : 'Pengeluaran');
  document.getElementById('audit-edit-key').value = r.key;
  document.getElementById('audit-edit-waktu').value = r.waktu;
  document.getElementById('audit-pj').value = r.pj !== '-' ? r.pj : '';
  document.getElementById('audit-jabatanPj').value = r.jabatanPj || '';
  document.getElementById('audit-keterangan').value = r.keterangan !== '-' ? r.keterangan : '';
  document.getElementById('audit-nominal').value = r.nominal;
  document.getElementById('audit-qty').value = r.qty || 0;
  document.getElementById('audit-satuan').value = r.satuan !== '-' ? r.satuan : '';
  document.getElementById('audit-kategori').value = r.kategori !== '-' ? r.kategori : '';
  document.querySelectorAll('.audit-grup-qty').forEach(el => el.classList.toggle('hidden', isMasuk));
  const form = document.getElementById('audit-edit-form');
  form.classList.remove('hidden');
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function cancelAuditEdit() {
  document.getElementById('audit-edit-form').classList.add('hidden');
}

async function saveAuditEdit() {
  const ctx = auditContext();
  const isMasuk = ctx.jenis === 'pemasukan';
  const key = document.getElementById('audit-edit-key').value;
  const waktu = Number(document.getElementById('audit-edit-waktu').value);
  const pj = document.getElementById('audit-pj').value.trim();
  const keterangan = document.getElementById('audit-keterangan').value.trim();
  const nominal = Number(document.getElementById('audit-nominal').value);
  if (!pj || nominal <= 0 || (!isMasuk && !keterangan)) { showToast('PJ, keterangan, dan nominal wajib diisi', true); return; }
  const data = {
    waktu: waktu || Date.now(),
    pj, keterangan, nominal,
    jabatanPj: document.getElementById('audit-jabatanPj').value.trim(),
    qty: Number(document.getElementById('audit-qty').value) || 0,
    satuan: document.getElementById('audit-satuan').value.trim() || '-',
    kategori: document.getElementById('audit-kategori').value.trim() || 'Lain-lain'
  };
  const res = await Api.updateKasRecord(ctx.buku, ctx.jenis, key, data);
  if (res.status === 'success') {
    cancelAuditEdit();
    await loadAuditList();
    showToast('Data berhasil diperbarui');
  } else { showToast('Gagal: ' + res.message, true); }
}

async function confirmDeleteKas(key) {
  if (!confirm('Yakin hapus data ini? Tidak bisa dibatalkan.')) return;
  const ctx = auditContext();
  const res = await Api.deleteKasRecord(ctx.buku, ctx.jenis, key);
  if (res.status === 'success') {
    auditRecords = auditRecords.filter(r => r.key !== key);
    renderAuditList();
    showToast('Data dihapus');
  } else { showToast('Gagal: ' + res.message, true); }
}

// ===== PIN PER PENGURUS =====
let memberPinsData = {};

async function renderMemberPinList() {
  const el = document.getElementById('member-pin-list');
  const namaList = toArr(masterData.namaPengurus);
  if (!namaList.length) {
    el.innerHTML = '<p class="text-xs text-gray-400 text-center py-2">Belum ada nama pengurus di Master Nama</p>';
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
        <span class="flex-1 text-sm font-medium text-gray-700 truncate">${esc(nama)}</span>
        <span class="text-[10px] px-2 py-0.5 rounded-full font-bold flex-shrink-0 ${hasPin ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}">${hasPin ? 'PIN sendiri' : 'PIN bersama'}</span>
        <button onclick="togglePinSetForm(${i})" class="btn-delete bg-emerald-50 hover:bg-emerald-100 rounded-lg flex-shrink-0">
          <i data-lucide="key" class="w-3.5 h-3.5 text-emerald-700"></i>
        </button>
      </div>
      <div id="pin-set-form-${i}" class="hidden mt-2 space-y-2">
        <input type="password" id="pin-set-input-${i}" placeholder="PIN baru (min 4 digit)" inputmode="numeric" maxlength="8"
          class="w-full bg-white px-3 py-2 rounded-xl border border-gray-200 text-sm text-center tracking-widest outline-none input-focus">
        <div class="flex gap-2">
          <button onclick="saveMemberPinAdmin(${i}, '${esc(nama)}')" class="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-1.5 rounded-lg text-xs btn-bounce">Simpan PIN</button>
          ${hasPin ? `<button onclick="resetMemberPin(${i}, '${esc(nama)}')" class="bg-orange-100 hover:bg-orange-200 text-orange-600 font-bold py-1.5 px-3 rounded-lg text-xs btn-bounce">Reset</button>` : ''}
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
