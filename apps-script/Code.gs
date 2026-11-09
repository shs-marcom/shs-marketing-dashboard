/**
 * SHS Marketing Dashboard — API (Google Apps Script)
 * TT.Marcom SHS
 *
 * Vai trò: cổng API cho giao diện trên GitHub Pages.
 *  - Kiểm tra key (Viewer / Admin), cấp phiên làm việc 6 giờ.
 *  - Đọc / ghi Checklist, Danh mục chương trình, Danh sách kênh, PIC.
 *  - Lưu dữ liệu chuyển đổi (CSV đã chuẩn hóa) — dashboard luôn đọc bản mới nhất.
 *  - Quản lý key (chỉ key Chủ hệ thống).
 *
 * Cài đặt: xem README.md trong repo. Chạy hàm setup() MỘT LẦN, đọc key chủ trong Nhật ký thực thi.
 * Mất key chủ: chạy hàm taoLaiKeyChu() trong trình soạn thảo Apps Script.
 */

var API_VERSION = '1.0.0';
var TZ = 'Asia/Ho_Chi_Minh';
var SESSION_SECONDS = 21600; // 6 giờ (mức tối đa của CacheService)

var SHEETS = {
  checklist: 'Checklist',
  programs: 'Danh mục chương trình',
  channels: 'Danh sách kênh',
  pics: 'PIC',
  conv: 'Chuyển đổi',
  deleted: 'Đã xóa',
  keys: 'Key',
  log: 'Nhật ký',
  meta: 'Meta'
};

var CK_COLS = [
  ['id', 'ID'], ['date', 'Ngày đăng'], ['week', 'Tuần'], ['month', 'Tháng'],
  ['cap1', 'Cấp 1'], ['cap2', 'Cấp 2'], ['cap3', 'Cấp 3'],
  ['group', 'Nhóm kênh'], ['channel', 'Kênh'], ['item', 'Hạng mục'],
  ['content', 'Nội dung / Thông điệp'], ['pic', 'PIC'], ['qty', 'SL bài tin'], ['status', 'Tình trạng'],
  ['views', 'Hiển thị'], ['eng', 'Tương tác'], ['conv', 'Chuyển đổi'],
  ['url', 'URL'], ['note', 'Ghi chú'],
  ['createdBy', 'Người tạo'], ['createdAt', 'Tạo lúc'], ['updatedBy', 'Người sửa'], ['updatedAt', 'Sửa lúc']
];
var CK_NUM = { week: 1, month: 1, qty: 1, views: 1, eng: 1, conv: 1 };
var CK_EDITABLE = ['date', 'cap1', 'cap2', 'cap3', 'group', 'channel', 'item', 'content', 'pic', 'qty',
  'status', 'views', 'eng', 'conv', 'url', 'note'];

var CATALOG_COLS = {
  programs: [['cap1', 'Cấp 1'], ['cap2', 'Cấp 2'], ['cap3', 'Cấp 3'], ['note', 'Ghi chú']],
  channels: [['group', 'Nhóm kênh'], ['channel', 'Kênh'], ['item', 'Hạng mục']],
  pics: [['pic', 'PIC'], ['note', 'Ghi chú']]
};

var CONV_COLS = [
  ['date', 'Ngày'], ['tot', 'TK mở mới'], ['mkt', 'TK Online MKT'], ['tvdt', 'TK TVĐT'], ['counter', 'TK Quầy'],
  ['act', 'TK kích hoạt'], ['paid', 'TK nộp tiền'], ['debt', 'Tổng dư nợ'], ['nav', 'Tổng NAV'],
  ['navNew', 'NAV KH mới'], ['navMkt', 'NAV KH mới Online MKT'], ['navTvdt', 'NAV KH mới TVĐT'], ['navQuay', 'NAV KH mới Quầy'],
  ['paidMkt', 'KH nộp tiền Online'], ['paidTvdt', 'KH nộp tiền TVĐT'], ['paidQuay', 'KH nộp tiền Quầy']
];

var KEY_COLS = [
  ['id', 'ID'], ['name', 'Tên'], ['role', 'Loại'], ['owner', 'Chủ hệ thống'], ['salt', 'Salt'], ['hash', 'Hash'],
  ['active', 'Trạng thái'], ['createdAt', 'Tạo lúc'], ['createdBy', 'Tạo bởi'], ['lastUsed', 'Dùng lần cuối'], ['note', 'Ghi chú']
];
var LOG_COLS = [['time', 'Thời gian'], ['who', 'Người thực hiện'], ['action', 'Hành động'], ['detail', 'Chi tiết']];
var META_COLS = [['k', 'Khóa'], ['v', 'Giá trị']];
var DELETED_COLS = CK_COLS.concat([['deletedBy', 'Xóa bởi'], ['deletedAt', 'Xóa lúc']]);

var STATUSES = ['Kế hoạch', 'Đang thực hiện', 'Hoàn thành', 'Hủy'];

/* =========================================================================
 * HTTP
 * ========================================================================= */

function doGet() {
  return json_({ ok: true, service: 'SHS Marketing Dashboard API', version: API_VERSION, time: nowIso_() });
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'Yêu cầu không hợp lệ.' });
  }
  try {
    return json_(route_(body));
  } catch (err) {
    var msg = (err && err.message) ? err.message : String(err);
    var code = (err && err.code) ? err.code : 'error';
    return json_({ ok: false, error: msg, code: code });
  }
}

function route_(b) {
  var action = String(b.action || '');
  if (action === 'login') return login_(b);
  if (action === 'ping') return { ok: true, version: API_VERSION };

  var s = requireSession_(b.token);
  switch (action) {
    case 'me': return { ok: true, user: publicUser_(s) };
    case 'logout': CacheService.getScriptCache().remove('sess_' + b.token); return { ok: true };
    case 'data': return getData_(s);
    case 'saveChecklist': requireAdmin_(s); return saveChecklist_(s, b);
    case 'saveCatalog': requireAdmin_(s); return saveCatalog_(s, b);
    case 'uploadConv': requireAdmin_(s); return uploadConv_(s, b);
    case 'keys.list': requireOwner_(s); return { ok: true, keys: listKeys_() };
    case 'keys.create': requireOwner_(s); return createKey_(s, b);
    case 'keys.update': requireOwner_(s); return updateKey_(s, b);
    case 'keys.delete': requireOwner_(s); return deleteKey_(s, b);
    case 'log.list': requireOwner_(s); return { ok: true, log: listLog_(b.limit) };
    default: throw apiError_('Hành động không được hỗ trợ: ' + action, 'bad_action');
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function apiError_(msg, code) {
  var e = new Error(msg);
  e.code = code || 'error';
  return e;
}

/* =========================================================================
 * Key & phiên làm việc
 * ========================================================================= */

function login_(b) {
  var key = String(b.key || '').trim();
  if (!key) throw apiError_('Vui lòng nhập key.', 'auth');
  var sh = sheet_(SHEETS.keys, KEY_COLS);
  var keys = readTable_(sh, KEY_COLS);
  var found = null, foundIdx = -1;
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (!k.salt || !k.hash) continue;
    if (hashKey_(k.salt, key) === k.hash) { found = k; foundIdx = i; break; }
  }
  if (!found) {
    Utilities.sleep(1200); // làm chậm thử key
    throw apiError_('Key không đúng.', 'auth');
  }
  if (!isActive_(found)) throw apiError_('Key này đã bị khóa. Liên hệ quản trị TT.Marcom.', 'auth');

  var token = randomToken_();
  CacheService.getScriptCache().put('sess_' + token, JSON.stringify({ kid: found.id }), SESSION_SECONDS);
  // ghi "dùng lần cuối"
  var col = colIndex_(KEY_COLS, 'lastUsed');
  sh.getRange(foundIdx + 2, col + 1).setValue(nowIso_());
  log_(found.name, 'Đăng nhập', roleLabel_(found));
  return { ok: true, token: token, user: publicUser_(found), expiresIn: SESSION_SECONDS };
}

function requireSession_(token) {
  if (!token) throw apiError_('Phiên làm việc đã hết. Vui lòng đăng nhập lại.', 'session');
  var raw = CacheService.getScriptCache().get('sess_' + token);
  if (!raw) throw apiError_('Phiên làm việc đã hết. Vui lòng đăng nhập lại.', 'session');
  var kid = JSON.parse(raw).kid;
  var keys = readTable_(sheet_(SHEETS.keys, KEY_COLS), KEY_COLS);
  for (var i = 0; i < keys.length; i++) {
    if (keys[i].id === kid) {
      if (!isActive_(keys[i])) throw apiError_('Key này đã bị khóa.', 'session');
      return keys[i];
    }
  }
  throw apiError_('Key không còn tồn tại. Vui lòng đăng nhập lại.', 'session');
}

function requireAdmin_(s) { if (s.role !== 'admin') throw apiError_('Thao tác này cần key Admin.', 'forbidden'); }
function requireOwner_(s) { if (!isOwner_(s)) throw apiError_('Chỉ key Chủ hệ thống mới quản lý được key.', 'forbidden'); }
function isOwner_(k) { return String(k.owner).toUpperCase() === 'TRUE' || k.owner === true; }
function isActive_(k) { return String(k.active) !== 'Khóa'; }
function roleLabel_(k) { return isOwner_(k) ? 'Chủ hệ thống' : (k.role === 'admin' ? 'Admin' : 'Viewer'); }
function publicUser_(k) { return { name: k.name, role: k.role, owner: isOwner_(k) }; }

function hashKey_(salt, key) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + key, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { var v = (b < 0 ? b + 256 : b).toString(16); return v.length === 1 ? '0' + v : v; }).join('');
}

function randomToken_() {
  return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
}

function generateKey_() {
  var alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // bỏ ký tự dễ nhầm O/0, I/1
  var raw = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  var out = '';
  for (var i = 0; i < 16; i++) out += alphabet[parseInt(raw.substr(i * 2, 2), 16) % alphabet.length];
  return 'SHS-' + out.substr(0, 4) + '-' + out.substr(4, 4) + '-' + out.substr(8, 4) + '-' + out.substr(12, 4);
}

function listKeys_() {
  return readTable_(sheet_(SHEETS.keys, KEY_COLS), KEY_COLS).map(function (k) {
    return {
      id: k.id, name: k.name, role: k.role, owner: isOwner_(k), active: isActive_(k),
      createdAt: k.createdAt, createdBy: k.createdBy, lastUsed: k.lastUsed, note: k.note
    };
  });
}

function validateCustomKey_(key) {
  key = String(key || '').trim();
  if (key.length < 10) throw apiError_('Key tự đặt phải có ít nhất 10 ký tự.', 'validation');
  return key;
}

function keyInUse_(keys, plain, exceptId) {
  for (var i = 0; i < keys.length; i++) {
    if (keys[i].id === exceptId || !keys[i].salt) continue;
    if (hashKey_(keys[i].salt, plain) === keys[i].hash) return true;
  }
  return false;
}

function createKey_(s, b) {
  var name = String(b.name || '').trim();
  var role = b.role === 'admin' ? 'admin' : 'viewer';
  if (!name) throw apiError_('Vui lòng đặt tên cho key.', 'validation');
  var lock = lock_();
  try {
    var sh = sheet_(SHEETS.keys, KEY_COLS);
    var keys = readTable_(sh, KEY_COLS);
    var plain = b.key ? validateCustomKey_(b.key) : generateKey_();
    if (keyInUse_(keys, plain, null)) throw apiError_('Key này đã được dùng cho một tên khác. Chọn key khác.', 'validation');
    var salt = Utilities.getUuid();
    var row = {
      id: 'K' + Utilities.getUuid().substr(0, 8), name: name, role: role, owner: 'FALSE', salt: salt,
      hash: hashKey_(salt, plain), active: 'Đang dùng', createdAt: nowIso_(), createdBy: s.name, lastUsed: '',
      note: String(b.note || '')
    };
    keys.push(row);
    writeTable_(sh, KEY_COLS, keys);
    log_(s.name, 'Tạo key', name + ' (' + (role === 'admin' ? 'Admin' : 'Viewer') + ')');
    return { ok: true, key: plain, keys: listKeys_() };
  } finally { lock.releaseLock(); }
}

function updateKey_(s, b) {
  var lock = lock_();
  try {
    var sh = sheet_(SHEETS.keys, KEY_COLS);
    var keys = readTable_(sh, KEY_COLS);
    var k = null;
    for (var i = 0; i < keys.length; i++) if (keys[i].id === b.id) k = keys[i];
    if (!k) throw apiError_('Không tìm thấy key.', 'not_found');
    var changes = [];
    if (b.name !== undefined && String(b.name).trim() && String(b.name).trim() !== k.name) {
      changes.push('đổi tên "' + k.name + '" → "' + String(b.name).trim() + '"');
      k.name = String(b.name).trim();
    }
    if (b.role !== undefined && !isOwner_(k)) {
      var nr = b.role === 'admin' ? 'admin' : 'viewer';
      if (nr !== k.role) { changes.push('đổi loại → ' + (nr === 'admin' ? 'Admin' : 'Viewer')); k.role = nr; }
    }
    if (b.active !== undefined) {
      if (isOwner_(k) && !b.active) throw apiError_('Không thể khóa key Chủ hệ thống.', 'validation');
      var na = b.active ? 'Đang dùng' : 'Khóa';
      if (na !== k.active) { changes.push(b.active ? 'mở khóa' : 'khóa'); k.active = na; }
    }
    if (b.note !== undefined) k.note = String(b.note);
    var plain = null;
    if (b.resetKey) {
      plain = (typeof b.resetKey === 'string') ? validateCustomKey_(b.resetKey) : generateKey_();
      if (keyInUse_(keys, plain, k.id)) throw apiError_('Key này đã được dùng cho một tên khác. Chọn key khác.', 'validation');
      k.salt = Utilities.getUuid();
      k.hash = hashKey_(k.salt, plain);
      changes.push('đặt lại key');
    }
    writeTable_(sh, KEY_COLS, keys);
    if (changes.length) log_(s.name, 'Sửa key', k.name + ': ' + changes.join(', '));
    var res = { ok: true, keys: listKeys_() };
    if (plain) res.key = plain;
    return res;
  } finally { lock.releaseLock(); }
}

function deleteKey_(s, b) {
  var lock = lock_();
  try {
    var sh = sheet_(SHEETS.keys, KEY_COLS);
    var keys = readTable_(sh, KEY_COLS);
    var keep = [], removed = null;
    keys.forEach(function (k) {
      if (k.id === b.id) {
        if (isOwner_(k)) throw apiError_('Không thể xóa key Chủ hệ thống.', 'validation');
        removed = k;
      } else keep.push(k);
    });
    if (!removed) throw apiError_('Không tìm thấy key.', 'not_found');
    writeTable_(sh, KEY_COLS, keep);
    log_(s.name, 'Xóa key', removed.name);
    return { ok: true, keys: listKeys_() };
  } finally { lock.releaseLock(); }
}

/* =========================================================================
 * Đọc dữ liệu cho dashboard & CMS
 * ========================================================================= */

function getData_(s) {
  var ck = readTable_(sheet_(SHEETS.checklist, CK_COLS), CK_COLS).map(normalizeCkRow_);
  var conv = readTable_(sheet_(SHEETS.conv, CONV_COLS), CONV_COLS).map(function (r) {
    r.date = toDateStr_(r.date);
    CONV_COLS.forEach(function (c) { if (c[0] !== 'date') r[c[0]] = toNumOrNull_(r[c[0]]); });
    return r;
  }).filter(function (r) { return r.date; });
  conv.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  var meta = readMeta_();
  return {
    ok: true,
    user: publicUser_(s),
    serverTime: nowIso_(),
    checklist: ck,
    catalog: {
      programs: readTable_(sheet_(SHEETS.programs, CATALOG_COLS.programs), CATALOG_COLS.programs),
      channels: readTable_(sheet_(SHEETS.channels, CATALOG_COLS.channels), CATALOG_COLS.channels),
      pics: readTable_(sheet_(SHEETS.pics, CATALOG_COLS.pics), CATALOG_COLS.pics),
      versions: {
        programs: meta['catalog_ver_programs'] || '',
        channels: meta['catalog_ver_channels'] || '',
        pics: meta['catalog_ver_pics'] || ''
      }
    },
    conv: {
      rows: conv,
      meta: { file: meta['conv_file'] || '', uploadedAt: meta['conv_uploaded_at'] || '', uploadedBy: meta['conv_uploaded_by'] || '' }
    },
    statuses: STATUSES
  };
}

function normalizeCkRow_(r) {
  r.date = toDateStr_(r.date);
  Object.keys(CK_NUM).forEach(function (k) { r[k] = toNumOrNull_(r[k]); });
  ['id', 'cap1', 'cap2', 'cap3', 'group', 'channel', 'item', 'content', 'pic', 'status', 'url', 'note',
    'createdBy', 'updatedBy'].forEach(function (k) { r[k] = r[k] === null || r[k] === undefined ? '' : String(r[k]); });
  r.createdAt = toIsoStr_(r.createdAt);
  r.updatedAt = toIsoStr_(r.updatedAt);
  return r;
}

/* =========================================================================
 * Ghi Checklist (upsert theo ID + xóa mềm sang tab "Đã xóa")
 * ========================================================================= */

function saveChecklist_(s, b) {
  var upserts = Array.isArray(b.upserts) ? b.upserts : [];
  var deletes = Array.isArray(b.deletes) ? b.deletes : [];
  if (!upserts.length && !deletes.length) return { ok: true, saved: 0, deleted: 0, conflicts: [], rows: [] };
  if (upserts.length > 2000) throw apiError_('Mỗi lần lưu tối đa 2.000 dòng.', 'validation');

  var lock = lock_();
  try {
    var sh = sheet_(SHEETS.checklist, CK_COLS);
    migrateCkDates_(sh);
    var t = readTableRows_(sh, CK_COLS);
    var byId = {};
    t.items.forEach(function (it) { it.obj = normalizeCkRow_(it.obj); if (it.obj.id) byId[it.obj.id] = it; });
    var now = nowIso_();
    var conflicts = [], savedRows = [], removed = [], fresh = [];

    // Xóa: kiểm tra phiên bản trước
    var delSet = {};
    deletes.forEach(function (d) {
      var it = byId[d.id];
      if (!it) return; // đã bị người khác xóa
      if (d.ver && it.obj.updatedAt && d.ver !== it.obj.updatedAt) {
        conflicts.push({ id: d.id, reason: 'Dòng đã được ' + it.obj.updatedBy + ' sửa lúc ' + it.obj.updatedAt + ' — chưa xóa.', server: it.obj });
        return;
      }
      delSet[d.id] = true;
    });

    // Cập nhật / thêm mới
    upserts.forEach(function (u) {
      var clean = cleanCkInput_(u);
      var it = clean.id ? byId[clean.id] : null;
      if (it) {
        var cur = it.obj;
        if (delSet[cur.id]) return;
        if (u.ver && cur.updatedAt && u.ver !== cur.updatedAt) {
          conflicts.push({ id: cur.id, reason: 'Dòng đã được ' + cur.updatedBy + ' sửa lúc ' + cur.updatedAt + ' — bản của anh/chị chưa được lưu.', server: cur });
          return;
        }
        CK_EDITABLE.forEach(function (k) { cur[k] = clean[k]; });
        cur.week = clean.week; cur.month = clean.month;
        cur.updatedBy = s.name; cur.updatedAt = now;
        it.dirty = true;
        savedRows.push(cur);
      } else {
        var nr = {};
        CK_COLS.forEach(function (c) { nr[c[0]] = ''; });
        CK_EDITABLE.forEach(function (k) { nr[k] = clean[k]; });
        nr.id = clean.id || newId_();
        nr.week = clean.week; nr.month = clean.month;
        nr.createdBy = s.name; nr.createdAt = now; nr.updatedBy = s.name; nr.updatedAt = now;
        byId[nr.id] = { obj: nr, isNew: true };
        fresh.push(nr);
        savedRows.push(nr);
      }
    });

    // 1) Ghi đè đúng các dòng đã sửa — không đảo vị trí dòng, người đang gõ trên Sheet không bị nhảy dòng
    t.items.forEach(function (it) {
      if (!it.dirty || delSet[it.obj.id]) return;
      sh.getRange(it.row, 1, 1, t.width).setValues([ckRowValues_(t, it.vals, it.obj)]);
    });

    // 2) Thêm dòng mới xuống cuối bảng
    if (fresh.length) {
      var start = sh.getLastRow() + 1;
      ensureRows_(sh, start + fresh.length - 1);
      var blank = []; for (var c = 0; c < t.width; c++) blank.push('');
      var block = fresh.map(function (o) { return ckRowValues_(t, blank, o); });
      setCkFormats_(sh, t, start, block.length);
      sh.getRange(start, 1, block.length, t.width).setValues(block);
      if (readMeta_()['sheet_entry'] === '1') applyCkValidation_(sh, t.map, start, block.length);
    }

    // 3) Xóa: lưu sang "Đã xóa" rồi xóa đúng các dòng, từ dưới lên
    var delRows = [];
    t.items.forEach(function (it) { if (delSet[it.obj.id]) { removed.push(it.obj); delRows.push(it.row); } });
    if (removed.length) {
      var dsh = sheet_(SHEETS.deleted, DELETED_COLS);
      var drows = removed.map(function (r) {
        var o = {}; Object.keys(r).forEach(function (k) { o[k] = r[k]; });
        o.deletedBy = s.name; o.deletedAt = now; return o;
      });
      appendTable_(dsh, DELETED_COLS, drows, CK_NUM);
      delRows.sort(function (a, b2) { return b2 - a; }).forEach(function (r) { sh.deleteRow(r); });
    }
    if (savedRows.length || removed.length) {
      log_(s.name, 'Lưu checklist', savedRows.length + ' dòng lưu, ' + removed.length + ' dòng xóa' +
        (conflicts.length ? ', ' + conflicts.length + ' dòng xung đột' : ''));
    }
    return { ok: true, saved: savedRows.length, deleted: removed.length, conflicts: conflicts, rows: savedRows, serverTime: now };
  } finally { lock.releaseLock(); }
}

/** Đọc bảng kèm số dòng thực tế trên sheet. Thiếu cột nào thì tự thêm tiêu đề vào cuối. */
function readTableRows_(sh, cols) {
  ensureHeaders_(sh, cols);
  var last = sh.getLastRow(), width = Math.max(sh.getLastColumn(), cols.length);
  var head = sh.getRange(1, 1, 1, width).getValues()[0].map(function (h) { return String(h).trim(); });
  var map = {};
  cols.forEach(function (c) { map[c[0]] = head.indexOf(c[1]); });
  var items = [];
  if (last >= 2) {
    var values = sh.getRange(2, 1, last - 1, width).getValues();
    values.forEach(function (row, i) {
      var o = {}, empty = true;
      cols.forEach(function (c) {
        var v = map[c[0]] >= 0 ? row[map[c[0]]] : '';
        if (v !== '' && v !== null) empty = false;
        o[c[0]] = v;
      });
      if (!empty) items.push({ row: i + 2, vals: row, obj: o });
    });
  }
  return { items: items, map: map, width: width };
}

function ensureHeaders_(sh, cols) {
  var lastCol = Math.max(sh.getLastColumn(), 1);
  var head = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
  var missing = cols.filter(function (c) { return head.indexOf(c[1]) < 0; });
  if (!missing.length) return;
  var startCol = head.join('') ? lastCol + 1 : 1;
  if (!head.join('')) missing = cols;
  sh.getRange(1, startCol, 1, missing.length).setValues([missing.map(function (c) { return c[1]; })]);
}

/** Tạo mảng giá trị cho 1 dòng checklist theo vị trí cột thực tế; giữ nguyên các cột không thuộc hệ thống. */
function ckRowValues_(t, baseRow, o) {
  var out = baseRow.slice();
  while (out.length < t.width) out.push('');
  CK_COLS.forEach(function (c) {
    var idx = t.map[c[0]];
    if (idx < 0) return;
    var v = o[c[0]];
    if (c[0] === 'date') out[idx] = v ? toDateObj_(toDateStr_(v)) : '';
    else if (CK_NUM[c[0]]) out[idx] = (v === null || v === undefined || v === '') ? '' : +v;
    else out[idx] = (v === null || v === undefined) ? '' : String(v);
  });
  return out;
}

function setCkFormats_(sh, t, startRow, n) {
  CK_COLS.forEach(function (c) {
    var idx = t.map[c[0]];
    if (idx < 0) return;
    var fmt = c[0] === 'date' ? 'dd/mm/yyyy' : (CK_NUM[c[0]] ? '#,##0' : '@');
    sh.getRange(startRow, idx + 1, n, 1).setNumberFormat(fmt);
  });
}

function toDateObj_(s) {
  if (!s) return '';
  var p = s.split('-');
  return new Date(+p[0], +p[1] - 1, +p[2]);
}

/** Chuyển cột Ngày đăng từ dạng chữ (file khởi tạo) sang kiểu ngày thật — chạy 1 lần, có cờ trong Meta. */
function migrateCkDates_(sh) {
  if (readMeta_()['date_type_v2'] === '1') return;
  var t = readTableRows_(sh, CK_COLS);
  var col = t.map.date;
  if (col >= 0) {
    var maxR = Math.max(sh.getMaxRows(), 2);
    sh.getRange(2, col + 1, maxR - 1, 1).setNumberFormat('dd/mm/yyyy');
    var last = sh.getLastRow();
    if (last >= 2) {
      var rng = sh.getRange(2, col + 1, last - 1, 1);
      var vals = rng.getValues().map(function (r) { var d = toDateStr_(r[0]); return [d ? toDateObj_(d) : r[0]]; });
      rng.setValues(vals);
    }
  }
  setMeta_('date_type_v2', '1');
}

/** Bảo đảm sheet có đủ số dòng (Google báo lỗi nếu ghi vượt số dòng hiện có). */
function ensureRows_(sh, needRow) {
  var max = sh.getMaxRows();
  if (needRow > max) sh.insertRowsAfter(max, needRow - max);
}

/** Thêm các dòng xuống cuối bảng (dùng cho tab Đã xóa). */
function appendTable_(sh, cols, rows, numCols) {
  if (!rows.length) return;
  ensureHeaders_(sh, cols);
  var width = Math.max(sh.getLastColumn(), cols.length);
  var head = sh.getRange(1, 1, 1, width).getValues()[0].map(function (h) { return String(h).trim(); });
  var start = sh.getLastRow() + 1;
  ensureRows_(sh, start + rows.length - 1);
  var data = rows.map(function (r) {
    var out = []; for (var i = 0; i < width; i++) out.push('');
    cols.forEach(function (c) {
      var idx = head.indexOf(c[1]); if (idx < 0) return;
      var v = r[c[0]];
      if (c[0] === 'date') v = toDateStr_(v);
      out[idx] = (v === null || v === undefined) ? '' : (numCols[c[0]] ? v : String(v));
    });
    return out;
  });
  sh.getRange(start, 1, data.length, width).setNumberFormat('@');
  sh.getRange(start, 1, data.length, width).setValues(data);
}

function cleanCkInput_(u) {
  var o = { id: String(u.id || '').trim() };
  CK_EDITABLE.forEach(function (k) {
    var v = u[k];
    if (CK_NUM[k]) o[k] = toNumOrNull_(v);
    else o[k] = (v === null || v === undefined) ? '' : String(v).replace(/[ \t]+/g, ' ').trim();
  });
  o.date = toDateStr_(o.date);
  if (o.qty === null) o.qty = 1;
  if (o.status && STATUSES.indexOf(o.status) < 0) throw apiError_('Tình trạng không hợp lệ: ' + o.status, 'validation');
  if (o.date) {
    var p = o.date.split('-');
    o.week = isoWeek_(+p[0], +p[1], +p[2]);
    o.month = +p[1];
  } else { o.week = null; o.month = null; }
  return o;
}

function newId_() {
  return 'R' + new Date().getTime().toString(36).toUpperCase() + Utilities.getUuid().substr(0, 4).toUpperCase();
}

function isoWeek_(y, m, d) {
  var t = new Date(Date.UTC(y, m - 1, d));
  var n = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - n);
  var y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - y0) / 86400000 + 1) / 7);
}

/* =========================================================================
 * Danh mục (thay toàn bộ, có kiểm tra phiên bản)
 * ========================================================================= */

function saveCatalog_(s, b) {
  var kind = String(b.kind || '');
  var cols = CATALOG_COLS[kind];
  if (!cols) throw apiError_('Loại danh mục không hợp lệ.', 'validation');
  var lock = lock_();
  try {
    var meta = readMeta_();
    var curVer = meta['catalog_ver_' + kind] || '';
    if (b.ver !== undefined && b.ver !== curVer) {
      throw apiError_('Danh mục vừa được người khác cập nhật. Bấm "Tải lại" rồi sửa lại.', 'conflict');
    }
    var rows = (Array.isArray(b.rows) ? b.rows : []).map(function (r) {
      var o = {};
      cols.forEach(function (c) { o[c[0]] = String(r[c[0]] === null || r[c[0]] === undefined ? '' : r[c[0]]).replace(/[ \t]+/g, ' ').trim(); });
      return o;
    }).filter(function (o) {
      return cols.some(function (c) { return c[0] !== 'note' && o[c[0]]; });
    });
    writeTable_(sheet_(SHEETS[kind], cols), cols, rows);
    var ver = nowIso_();
    setMeta_('catalog_ver_' + kind, ver);
    if (readMeta_()['sheet_entry'] === '1' && kind !== 'pics') { try { capNhatDropdown(true); } catch (err) { } }
    var label = { programs: 'Danh mục chương trình', channels: 'Danh sách kênh', pics: 'PIC' }[kind];
    log_(s.name, 'Lưu danh mục', label + ': ' + rows.length + ' dòng');
    return { ok: true, rows: rows, ver: ver };
  } finally { lock.releaseLock(); }
}

/* =========================================================================
 * Dữ liệu chuyển đổi (thay toàn bộ bằng file mới nhất)
 * ========================================================================= */

function uploadConv_(s, b) {
  var rows = Array.isArray(b.rows) ? b.rows : [];
  if (!rows.length) throw apiError_('File không có dòng dữ liệu nào.', 'validation');
  if (rows.length > 5000) throw apiError_('File quá lớn (tối đa 5.000 ngày).', 'validation');
  var clean = rows.map(function (r) {
    var o = { date: toDateStr_(r.date) };
    CONV_COLS.forEach(function (c) { if (c[0] !== 'date') o[c[0]] = toNumOrNull_(r[c[0]]); });
    return o;
  }).filter(function (o) { return o.date; });
  if (!clean.length) throw apiError_('Không đọc được ngày trong file.', 'validation');
  clean.sort(function (a, b2) { return a.date < b2.date ? -1 : 1; });
  var lock = lock_();
  try {
    var numCols = {};
    CONV_COLS.forEach(function (c) { if (c[0] !== 'date') numCols[c[0]] = 1; });
    writeTable_(sheet_(SHEETS.conv, CONV_COLS), CONV_COLS, clean, numCols);
    var now = nowIso_();
    setMeta_('conv_file', String(b.fileName || ''));
    setMeta_('conv_uploaded_at', now);
    setMeta_('conv_uploaded_by', s.name);
    log_(s.name, 'Up dữ liệu chuyển đổi', String(b.fileName || '') + ': ' + clean.length + ' ngày (' +
      clean[0].date + ' → ' + clean[clean.length - 1].date + ')');
    return { ok: true, days: clean.length, from: clean[0].date, to: clean[clean.length - 1].date, uploadedAt: now };
  } finally { lock.releaseLock(); }
}

/* =========================================================================
 * Nhật ký & Meta
 * ========================================================================= */

function log_(who, action, detail) {
  try {
    var sh = sheet_(SHEETS.log, LOG_COLS);
    sh.appendRow([nowIso_(), who, action, detail]);
    var last = sh.getLastRow();
    if (last > 5001) sh.deleteRows(2, last - 4001); // giữ ~4.000 dòng gần nhất
  } catch (err) { /* không chặn nghiệp vụ chính */ }
}

function listLog_(limit) {
  limit = Math.min(Math.max(parseInt(limit, 10) || 200, 1), 1000);
  var rows = readTable_(sheet_(SHEETS.log, LOG_COLS), LOG_COLS);
  return rows.slice(-limit).reverse().map(function (r) { r.time = toIsoStr_(r.time); return r; });
}

function readMeta_() {
  var out = {};
  readTable_(sheet_(SHEETS.meta, META_COLS), META_COLS).forEach(function (r) { if (r.k) out[r.k] = toIsoStr_(r.v) || String(r.v); });
  return out;
}

function setMeta_(k, v) {
  var sh = sheet_(SHEETS.meta, META_COLS);
  var rows = readTable_(sh, META_COLS);
  var hit = false;
  rows.forEach(function (r) { if (r.k === k) { r.v = v; hit = true; } });
  if (!hit) rows.push({ k: k, v: v });
  writeTable_(sh, META_COLS, rows);
}

/* =========================================================================
 * Tiện ích bảng tính
 * ========================================================================= */

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

function sheet_(name, cols) {
  var sh = ss_().getSheetByName(name);
  if (!sh) {
    sh = ss_().insertSheet(name);
    sh.getRange(1, 1, 1, cols.length).setValues([cols.map(function (c) { return c[1]; })])
      .setFontWeight('bold').setBackground('#0A2762').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
  }
  return sh;
}

function colIndex_(cols, key) {
  for (var i = 0; i < cols.length; i++) if (cols[i][0] === key) return i;
  return -1;
}

/** Đọc bảng theo TIÊU ĐỀ cột (không phụ thuộc thứ tự cột trong sheet). */
function readTable_(sh, cols) {
  var last = sh.getLastRow(), lastCol = sh.getLastColumn();
  if (last < 2 || lastCol < 1) return [];
  var values = sh.getRange(1, 1, last, lastCol).getValues();
  var head = values[0].map(function (h) { return String(h).trim(); });
  var map = cols.map(function (c) { return head.indexOf(c[1]); });
  var out = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r], empty = true, o = {};
    for (var j = 0; j < cols.length; j++) {
      var v = map[j] >= 0 ? row[map[j]] : '';
      if (v !== '' && v !== null) empty = false;
      o[cols[j][0]] = v;
    }
    if (!empty) out.push(o);
  }
  return out;
}

/** Ghi đè toàn bộ bảng (giữ dòng tiêu đề), cột chữ để định dạng văn bản thuần. */
function writeTable_(sh, cols, rows, numCols) {
  numCols = numCols || {};
  var head = cols.map(function (c) { return c[1]; });
  sh.getRange(1, 1, 1, head.length).setValues([head]);
  var last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, Math.max(sh.getLastColumn(), head.length)).clearContent();
  if (!rows.length) return;
  var data = rows.map(function (r) {
    return cols.map(function (c) {
      var v = r[c[0]];
      if (v === null || v === undefined) return '';
      if (numCols[c[0]]) return (typeof v === 'number') ? v : (v === '' ? '' : (isNaN(+v) ? String(v) : +v));
      return String(v);
    });
  });
  var formats = rows.map(function () { return cols.map(function (c) { return numCols[c[0]] ? '#,##0' : '@'; }); });
  ensureRows_(sh, data.length + 1);
  var range = sh.getRange(2, 1, data.length, head.length);
  range.setNumberFormats(formats);
  range.setValues(data);
}

function lock_() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw apiError_('Hệ thống đang bận lưu dữ liệu của người khác, vui lòng thử lại sau vài giây.', 'busy');
  return lock;
}

function nowIso_() { return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ss"); }

function toIsoStr_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, "yyyy-MM-dd'T'HH:mm:ss");
  return v === null || v === undefined ? '' : String(v);
}

/** Chuẩn hóa ngày về 'yyyy-MM-dd' từ Date, chuỗi ISO, dd/mm/yyyy hoặc số seri Excel. */
function toDateStr_(v) {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  if (typeof v === 'number') {
    if (v > 20000 && v < 80000) {
      var d = new Date(Math.round((v - 25569) * 86400000));
      return Utilities.formatDate(d, 'UTC', 'yyyy-MM-dd');
    }
    return '';
  }
  var s = String(v).trim();
  var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + '-' + pad2_(m[2]) + '-' + pad2_(m[3]);
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return m[3] + '-' + pad2_(m[2]) + '-' + pad2_(m[1]);
  return '';
}

function pad2_(x) { x = String(+x); return x.length === 1 ? '0' + x : x; }

/** Số kiểu Việt Nam ("1.234.567", "12,5") hoặc kiểu quốc tế → number; rỗng → null. */
function toNumOrNull_(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isNaN(v) ? null : v;
  var s = String(v).trim().replace(/\s/g, '');
  if (!s) return null;
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d+,\d+$/.test(s)) s = s.replace(',', '.');
  else s = s.replace(/,/g, '');
  var n = Number(s);
  return isNaN(n) ? null : n;
}

/* =========================================================================
 * Nhập liệu trực tiếp trên Google Sheet
 *  - Dropdown: Cấp 1, Nhóm kênh, PIC, Tình trạng lấy từ tab danh mục;
 *    Cấp 2, Cấp 3, Kênh, Hạng mục phụ thuộc cột cha (cập nhật theo từng dòng khi sửa cột cha).
 *  - Ô sai chỉ hiện cảnh báo (tam giác đỏ), không chặn — để dán nhiều dòng không bị từ chối.
 *  - onEdit tự điền: ID, Tuần, Tháng, Người tạo/sửa, thời điểm sửa.
 * ========================================================================= */

var CK_SYS = ['id', 'week', 'month', 'createdBy', 'createdAt', 'updatedBy', 'updatedAt'];
var DEP = [ // [cột con, các cột cha]
  ['cap2', ['cap1']], ['cap3', ['cap1', 'cap2']], ['channel', ['group']], ['item', ['group', 'channel']]
];

/** Menu: chạy 1 lần để bật nhập liệu trên Sheet. Chạy lại không sao. */
function thietLapNhapLieu() {
  var ss = ss_();
  ss.setSpreadsheetTimeZone(TZ);
  try { ss.setSpreadsheetLocale('vi_VN'); } catch (e) { }
  var sh = sheet_(SHEETS.checklist, CK_COLS);
  migrateCkDates_(sh);
  var t = readTableRows_(sh, CK_COLS);
  ensureRows_(sh, sh.getLastRow() + 500); // chừa sẵn 500 dòng trống có dropdown
  var n = sh.getMaxRows() - 1;
  setCkFormats_(sh, t, 2, n);
  applyCkValidation_(sh, t.map, 2, n);
  sh.setFrozenRows(1);

  // Khóa vùng hệ thống
  removeShsProtections_(sh);
  CK_SYS.forEach(function (k) {
    var idx = t.map[k];
    if (idx < 0) return;
    var p = sh.getRange(1, idx + 1, sh.getMaxRows(), 1).protect().setDescription('SHS: cột hệ thống tự điền');
    p.setWarningOnly(true);
  });
  [SHEETS.keys, SHEETS.log, SHEETS.meta].forEach(function (name) {
    var ksh = ss.getSheetByName(name);
    if (!ksh) return;
    removeShsProtections_(ksh);
    var p = ksh.protect().setDescription('SHS: chỉ hệ thống được sửa');
    try {
      p.addEditor(Session.getEffectiveUser());
      p.removeEditors(p.getEditors());
      if (p.canDomainEdit()) p.setDomainEdit(false);
    } catch (e) { p.setWarningOnly(true); }
  });
  setMeta_('sheet_entry', '1');
  log_('Google Sheet', 'Thiết lập nhập liệu trên Sheet', (sh.getMaxRows() - 1) + ' dòng có dropdown');
  try {
    SpreadsheetApp.getUi().alert('Đã thiết lập xong',
      'Tab Checklist đã có dropdown (Cấp 2/3, Kênh, Hạng mục lọc theo cột cha), lịch chọn ngày và tự điền ID/Người sửa.\n\n' +
      'Sau khi sửa danh mục trực tiếp trên Sheet, chạy "Cập nhật lại dropdown theo danh mục mới".',
      SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) { }
}

/** Menu: cập nhật dropdown phụ thuộc cho toàn bộ checklist (sau khi đổi danh mục). */
function capNhatDropdown(silent) {
  var sh = sheet_(SHEETS.checklist, CK_COLS);
  var t = readTableRows_(sh, CK_COLS);
  applyCkValidation_(sh, t.map, 2, Math.max(sh.getMaxRows() - 1, 1));
  if (silent === true) return;
  try { SpreadsheetApp.getUi().alert('Đã cập nhật dropdown theo danh mục mới.'); } catch (e) { }
}

function removeShsProtections_(sh) {
  [SpreadsheetApp.ProtectionType.RANGE, SpreadsheetApp.ProtectionType.SHEET].forEach(function (type) {
    sh.getProtections(type).forEach(function (p) {
      if (String(p.getDescription() || '').indexOf('SHS:') === 0) p.remove();
    });
  });
}

function catalogLists_() {
  var P = readTable_(sheet_(SHEETS.programs, CATALOG_COLS.programs), CATALOG_COLS.programs);
  var H = readTable_(sheet_(SHEETS.channels, CATALOG_COLS.channels), CATALOG_COLS.channels);
  var S = function (v) { return String(v === null || v === undefined ? '' : v).trim(); };
  P = P.map(function (r) { return { cap1: S(r.cap1), cap2: S(r.cap2), cap3: S(r.cap3) }; });
  H = H.map(function (r) { return { group: S(r.group), channel: S(r.channel), item: S(r.item) }; });
  return { P: P, H: H };
}

function uniqList_(arr) {
  var seen = {}, out = [];
  arr.forEach(function (v) { if (v && !seen[v]) { seen[v] = 1; out.push(v); } });
  return out;
}

/** Danh sách hợp lệ của cột con theo giá trị cột cha của một dòng. */
function childOptions_(L, child, row) {
  var src = (child === 'cap2' || child === 'cap3') ? L.P : L.H;
  var parents = DEP.filter(function (d) { return d[0] === child; })[0][1];
  var filtered = src.filter(function (x) {
    return parents.every(function (p) { return !row[p] || x[p] === row[p]; });
  });
  var list = uniqList_(filtered.map(function (x) { return x[child]; }));
  if (!list.length) list = uniqList_(src.map(function (x) { return x[child]; }));
  return list;
}

/** Gắn dropdown cho các dòng [startRow, startRow+n). */
function applyCkValidation_(sh, map, startRow, n) {
  if (n <= 0) return;
  var ss = ss_();
  var L = catalogLists_();
  var dv = function () { return SpreadsheetApp.newDataValidation().setAllowInvalid(true); };
  var help = 'Chọn từ danh sách. Ô có tam giác đỏ là giá trị chưa khớp danh mục.';

  var colRange = function (sheetName, colIdx) {
    var src = ss.getSheetByName(sheetName);
    return src.getRange(2, colIdx, Math.max(src.getMaxRows() - 1, 1), 1);
  };
  var setCol = function (key, rule) {
    if (map[key] < 0) return;
    sh.getRange(startRow, map[key] + 1, n, 1).setDataValidation(rule);
  };
  setCol('cap1', dv().requireValueInRange(colRange(SHEETS.programs, 1), true).setHelpText(help).build());
  setCol('group', dv().requireValueInRange(colRange(SHEETS.channels, 1), true).setHelpText(help).build());
  setCol('pic', dv().requireValueInRange(colRange(SHEETS.pics, 1), true).setHelpText(help).build());
  setCol('status', dv().requireValueInList(STATUSES, true).setHelpText('Kế hoạch / Đang thực hiện / Hoàn thành / Hủy').build());
  setCol('date', dv().requireDate().setHelpText('Nhập ngày dạng dd/mm/yyyy hoặc bấm đúp để chọn trên lịch.').build());

  // Dropdown phụ thuộc: tính theo giá trị cột cha của từng dòng
  var parentKeys = ['cap1', 'cap2', 'group', 'channel'];
  var parentVals = {};
  parentKeys.forEach(function (k) {
    parentVals[k] = map[k] >= 0 ? sh.getRange(startRow, map[k] + 1, n, 1).getValues().map(function (r) { return String(r[0] || '').trim(); }) : [];
  });
  DEP.forEach(function (d) {
    var child = d[0];
    if (map[child] < 0) return;
    var cache = {}, rules = [];
    for (var i = 0; i < n; i++) {
      var row = {};
      d[1].forEach(function (p) { row[p] = parentVals[p][i] || ''; });
      var key = d[1].map(function (p) { return row[p]; }).join('␟');
      if (!cache[key]) {
        var opts = childOptions_(L, child, row);
        cache[key] = opts.length ? dv().requireValueInList(opts.slice(0, 500), true).setHelpText(help).build() : null;
      }
      rules.push([cache[key]]);
    }
    sh.getRange(startRow, map[child] + 1, n, 1).setDataValidations(rules);
  });
}

/** Trình kích hoạt đơn giản: chạy mỗi khi có người sửa ô trên Sheet. */
function onEdit(e) {
  if (!e || !e.range) return;
  var sh = e.range.getSheet();
  var name = sh.getName();
  try {
    if (name === SHEETS.checklist) onEditChecklist_(e, sh);
    else if ((name === SHEETS.programs || name === SHEETS.channels) && readMeta_()['sheet_entry'] === '1') capNhatDropdown(true);
  } catch (err) {
    console.log('onEdit lỗi: ' + (err && err.message));
  }
}

function onEditChecklist_(e, sh) {
  var r0 = Math.max(e.range.getRow(), 2);
  var r1 = e.range.getRow() + e.range.getNumRows() - 1;
  if (r1 < 2) return;
  if (r1 - r0 > 1000) r1 = r0 + 1000; // giới hạn khi dán khối rất lớn
  var t = readTableRows_(sh, CK_COLS);
  var m = t.map;
  var n = r1 - r0 + 1;
  var values = sh.getRange(r0, 1, n, t.width).getValues();
  var who = editorName_(e);
  var now = nowIso_();
  var c0 = e.range.getColumn(), c1 = c0 + e.range.getNumColumns() - 1;
  var touchedParent = ['cap1', 'cap2', 'group', 'channel'].some(function (k) { return m[k] >= 0 && m[k] + 1 >= c0 && m[k] + 1 <= c1; });
  var touchedOnlySys = (function () {
    for (var c = c0; c <= c1; c++) { var key = null; CK_COLS.forEach(function (x) { if (m[x[0]] + 1 === c) key = x[0]; }); if (!key || CK_SYS.indexOf(key) < 0) return false; }
    return true;
  })();
  if (touchedOnlySys) return; // người dùng sửa tay cột hệ thống: không ghi đè vòng lặp

  var changed = false;
  values.forEach(function (row) {
    var get = function (k) { return m[k] >= 0 ? row[m[k]] : ''; };
    var set = function (k, v) { if (m[k] >= 0) row[m[k]] = v; };
    var hasContent = CK_EDITABLE.some(function (k) { var v = get(k); return v !== '' && v !== null; });
    if (!hasContent) return;
    if (!String(get('id') || '').trim()) { set('id', newId_()); set('createdBy', who); set('createdAt', now); }
    var d = toDateStr_(get('date'));
    if (d) {
      set('date', toDateObj_(d));
      var p = d.split('-');
      set('week', isoWeek_(+p[0], +p[1], +p[2])); set('month', +p[1]);
    }
    if (get('qty') === '' || get('qty') === null) set('qty', 1);
    set('updatedBy', who); set('updatedAt', now);
    changed = true;
  });
  if (changed) sh.getRange(r0, 1, n, t.width).setValues(values);
  if (touchedParent) applyCkValidation_(sh, m, r0, n);
}

function editorName_(e) {
  var email = '';
  try { email = (e && e.user && e.user.getEmail && e.user.getEmail()) || ''; } catch (x) { }
  if (!email) { try { email = Session.getActiveUser().getEmail() || ''; } catch (x) { } }
  return email ? 'Sheet: ' + email.split('@')[0] : 'Nhập trên Google Sheet';
}

/* =========================================================================
 * Khởi tạo & key Chủ hệ thống
 * Cách dễ nhất: mở Google Sheet → menu "SHS Dashboard" → "Khởi tạo / Lấy key Chủ hệ thống".
 * Hoặc chạy hàm setup() trong trình soạn thảo, đọc key trong "Nhật ký thực thi".
 * ========================================================================= */

/** Thêm menu "SHS Dashboard" vào Google Sheet mỗi khi mở file. */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('SHS Dashboard')
    .addItem('Khởi tạo / Lấy key Chủ hệ thống', 'menuKeyChu')
    .addSeparator()
    .addItem('Thiết lập nhập liệu trên Sheet (dropdown, lịch, khóa cột hệ thống)', 'thietLapNhapLieu')
    .addItem('Cập nhật lại dropdown theo danh mục mới', 'capNhatDropdown')
    .addToUi();
}

/** Menu: khởi tạo nếu chưa có, hoặc cấp lại key Chủ hệ thống — hiện key trong hộp thoại để sao chép. */
function menuKeyChu() {
  var ui = SpreadsheetApp.getUi();
  var keys = readTable_(sheet_(SHEETS.keys, KEY_COLS), KEY_COLS);
  var hasOwner = keys.some(function (k) { return isOwner_(k); });
  var plain;
  if (!hasOwner) {
    plain = setup();
  } else {
    var ans = ui.alert('Đã có key Chủ hệ thống',
      'Hệ thống đã có key Chủ hệ thống. Cấp key MỚI? Key cũ sẽ hết hiệu lực ngay.', ui.ButtonSet.YES_NO);
    if (ans !== ui.Button.YES) return;
    plain = taoLaiKeyChu();
  }
  if (!plain) { ui.alert('Không tạo được key. Xem Nhật ký thực thi trong Apps Script.'); return; }
  showKeyDialog_(plain);
}

function showKeyDialog_(plain) {
  var html = HtmlService.createHtmlOutput(
    '<div style="font-family:Arial,sans-serif;font-size:13px;color:#22304A">' +
    '<p style="margin:0 0 10px">Sao chép và lưu key này ở nơi an toàn. Hộp thoại đóng lại là <b>không xem lại được</b>.</p>' +
    '<input id="k" readonly value="' + plain + '" style="width:100%;box-sizing:border-box;font:700 16px Consolas,monospace;' +
    'padding:10px;border:2px dashed #FFB628;border-radius:8px;background:#FFF6E0;color:#0A2762;text-align:center">' +
    '<div style="margin-top:12px;text-align:right">' +
    '<button onclick="var k=document.getElementById(\'k\');k.select();document.execCommand(\'copy\');this.textContent=\'Đã sao chép ✓\'" ' +
    'style="background:#F35700;color:#fff;border:0;border-radius:6px;padding:8px 16px;font-weight:700;cursor:pointer">Sao chép</button> ' +
    '<button onclick="google.script.host.close()" style="background:#EEF1F8;color:#0A2762;border:0;border-radius:6px;padding:8px 16px;font-weight:700;cursor:pointer">Đã lưu, đóng</button>' +
    '</div></div>').setWidth(460).setHeight(190);
  SpreadsheetApp.getUi().showModalDialog(html, 'Key Chủ hệ thống');
}

/** Tạo các tab còn thiếu và key Chủ hệ thống đầu tiên. Trả về key (chỉ khi vừa tạo mới). */
function setup() {
  var ss = ss_();
  if (!ss) throw new Error('Không tìm thấy Google Sheet. Apps Script phải được mở từ trong Google Sheet: Tiện ích mở rộng → Apps Script.');
  ss.setSpreadsheetTimeZone(TZ);
  sheet_(SHEETS.checklist, CK_COLS);
  sheet_(SHEETS.programs, CATALOG_COLS.programs);
  sheet_(SHEETS.channels, CATALOG_COLS.channels);
  sheet_(SHEETS.pics, CATALOG_COLS.pics);
  sheet_(SHEETS.conv, CONV_COLS);
  sheet_(SHEETS.deleted, DELETED_COLS);
  sheet_(SHEETS.log, LOG_COLS);
  sheet_(SHEETS.meta, META_COLS);
  var ksh = sheet_(SHEETS.keys, KEY_COLS);

  var keys = readTable_(ksh, KEY_COLS);
  var hasOwner = keys.some(function (k) { return isOwner_(k); });
  if (hasOwner) {
    say_('Đã có key Chủ hệ thống từ lần chạy trước. Mất key? Chạy hàm taoLaiKeyChu, hoặc dùng menu "SHS Dashboard" trên Google Sheet.');
    return null;
  }
  var plain = generateKey_();
  var salt = Utilities.getUuid();
  keys.push({
    id: 'K' + Utilities.getUuid().substr(0, 8), name: 'Chủ hệ thống', role: 'admin', owner: 'TRUE', salt: salt,
    hash: hashKey_(salt, plain), active: 'Đang dùng', createdAt: nowIso_(), createdBy: 'setup()', lastUsed: '', note: ''
  });
  writeTable_(ksh, KEY_COLS, keys);
  log_('setup()', 'Khởi tạo hệ thống', 'Tạo key Chủ hệ thống');
  say_('KEY CHỦ HỆ THỐNG (lưu lại ngay, chỉ hiện 1 lần): ' + plain);
  return plain;
}

/** Cấp lại key Chủ hệ thống khi bị mất (key cũ hết hiệu lực). Trả về key mới. */
function taoLaiKeyChu() {
  var ksh = sheet_(SHEETS.keys, KEY_COLS);
  var keys = readTable_(ksh, KEY_COLS);
  var owner = null;
  keys.forEach(function (k) { if (isOwner_(k)) owner = k; });
  if (!owner) return setup();
  var plain = generateKey_();
  owner.salt = Utilities.getUuid();
  owner.hash = hashKey_(owner.salt, plain);
  owner.active = 'Đang dùng';
  writeTable_(ksh, KEY_COLS, keys);
  log_('taoLaiKeyChu()', 'Cấp lại key Chủ hệ thống', '');
  say_('KEY CHỦ HỆ THỐNG MỚI (key cũ hết hiệu lực): ' + plain);
  return plain;
}

/** Ghi ra cả console và Logger để chắc chắn hiện trong "Nhật ký thực thi". */
function say_(msg) {
  console.log(msg);
  try { Logger.log(msg); } catch (e) { }
}
