/* CMS — Quản trị dữ liệu Marketing, TT.Marcom SHS */
(function () {
  'use strict';
  var S = window.SHS, esc = S.esc;
  var $ = function (id) { return document.getElementById(id); };

  var STATE = {
    user: null, checklist: [], catalog: { programs: [], channels: [], pics: [], versions: {} },
    conv: { rows: [], meta: {} }, statuses: ['Kế hoạch', 'Đang thực hiện', 'Hoàn thành', 'Hủy'], loadedAt: null
  };

  /* ===================================================================
   * Khởi động
   * =================================================================== */
  async function boot() {
    var user = await S.requireLogin({ title: 'Quản trị dữ liệu Marketing', lead: 'Nhập key Admin để nhập liệu. Key Viewer chỉ xem được Dashboard.' });
    STATE.user = user;
    $('userSlot').appendChild(S.userChip(user));
    if (user.role !== 'admin') {
      $('main').style.display = 'block';
      $('main').innerHTML = '<div class="viewer-block"><h2 style="color:var(--navy);margin-top:0">Key của bạn là key Viewer</h2>' +
        '<p>Key Viewer chỉ xem được Dashboard, không nhập liệu được. Liên hệ TT.Marcom nếu cần quyền nhập liệu.</p>' +
        '<p><a href="index.html">&#8592; Mở Dashboard</a></p></div>';
      return;
    }
    if (user.owner) document.querySelectorAll('.owner-only').forEach(function (b) { b.style.display = ''; });
    $('tabs').style.display = 'flex';
    $('main').style.display = 'block';
    bindTabs();
    await loadAll();
    initChecklist();
    initMulti();
    initCatalogButtons();
    initConv();
    if (user.owner) initKeys();
    window.addEventListener('beforeunload', function (e) {
      if (ck.dirtyCount || Object.keys(cat.dirty).some(function (k) { return cat.dirty[k]; })) { e.preventDefault(); e.returnValue = ''; }
    });
  }

  async function loadAll() {
    S.loading(true, 'Đang tải dữ liệu…');
    try {
      var d = await S.api('data');
      STATE.checklist = d.checklist;
      STATE.catalog = d.catalog;
      STATE.conv = d.conv;
      if (d.statuses) STATE.statuses = d.statuses;
      STATE.loadedAt = new Date();
    } catch (e) {
      S.toast(e.message, 'err');
      throw e;
    } finally { S.loading(false); }
  }

  function bindTabs() {
    document.querySelectorAll('#tabs button[data-tab]').forEach(function (b) {
      b.onclick = function () { showTab(b.dataset.tab); };
    });
  }
  function showTab(name) {
    document.querySelectorAll('#tabs button[data-tab]').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === name); });
    document.querySelectorAll('section.pane').forEach(function (p) { p.classList.toggle('on', p.id === 'pane-' + name); });
    if (name === 'programs' || name === 'channels' || name === 'pics') ensureCatGrid(name);
    if (name === 'multi') refreshMultiOptions();
    if (name === 'keys') loadKeys();
    if (name === 'log') loadLog();
  }

  function uniq(arr) {
    var seen = {}, out = [];
    arr.forEach(function (v) { v = (v === null || v === undefined) ? '' : String(v).trim(); if (v && !seen[v]) { seen[v] = 1; out.push(v); } });
    return out;
  }
  function newId() { return 'N' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase(); }
  function todayStr() { return S.toDateStr(new Date()); }

  /* ===================================================================
   * CHECKLIST — lưới kiểu Excel
   * =================================================================== */
  var COLS = ['id', 'date', 'cap1', 'cap2', 'cap3', 'group', 'channel', 'item', 'content', 'pic', 'qty', 'status',
    'views', 'eng', 'conv', 'url', 'note', 'updatedBy', 'updatedAtView', 'ver'];
  var C = {}; COLS.forEach(function (k, i) { C[k] = i; });
  var EDIT = ['date', 'cap1', 'cap2', 'cap3', 'group', 'channel', 'item', 'content', 'pic', 'qty', 'status', 'views', 'eng', 'conv', 'url', 'note'];
  var NUMS = { qty: 1, views: 1, eng: 1, conv: 1 };
  var LABEL = { date: 'Ngày đăng', cap1: 'Cấp 1', cap2: 'Cấp 2', cap3: 'Cấp 3', group: 'Nhóm kênh', channel: 'Kênh', item: 'Hạng mục',
    content: 'Nội dung', pic: 'PIC', qty: 'SL bài tin', status: 'Tình trạng', views: 'Hiển thị', eng: 'Tương tác', conv: 'Chuyển đổi', url: 'URL', note: 'Ghi chú' };

  var ck = { grid: null, snapshot: {}, dirtyCount: 0, timer: null, programmatic: false };

  function toGridRow(r) {
    return COLS.map(function (k) {
      if (k === 'updatedAtView') return S.fmtDateTimeVN(r.updatedAt);
      if (k === 'ver') return r.updatedAt || '';
      var v = r[k];
      if (k === 'date') return S.toDateStr(v);
      return (v === null || v === undefined) ? '' : v;
    });
  }
  function fromGridRow(a) {
    var o = {};
    COLS.forEach(function (k, i) { o[k] = a[i]; });
    var out = { id: String(o.id || '').trim(), ver: String(o.ver || '') };
    EDIT.forEach(function (k) {
      if (NUMS[k]) out[k] = S.toNum(o[k]);
      else if (k === 'date') out[k] = S.toDateStr(o[k]);
      else out[k] = String(o[k] === null || o[k] === undefined ? '' : o[k]).replace(/[ \t]+/g, ' ').trim();
    });
    return out;
  }
  function normServer(r) {
    var out = { id: r.id, ver: r.updatedAt || '' };
    EDIT.forEach(function (k) {
      if (NUMS[k]) out[k] = (r[k] === null || r[k] === '' || r[k] === undefined) ? null : +r[k];
      else if (k === 'date') out[k] = S.toDateStr(r[k]);
      else out[k] = String(r[k] === null || r[k] === undefined ? '' : r[k]).trim();
    });
    return out;
  }
  function isBlank(o) { return EDIT.every(function (k) { return o[k] === null || o[k] === '' || (k === 'qty' && o[k] === null); }); }
  function sameRow(a, b) { return EDIT.every(function (k) { return (a[k] === null ? '' : a[k]) === (b[k] === null ? '' : b[k]); }); }

  // ---- danh sách cho dropdown
  function lists() {
    var P = STATE.catalog.programs, H = STATE.catalog.channels, used = STATE.checklist;
    return {
      cap1: uniq(P.map(function (x) { return x.cap1; }).concat(used.map(function (x) { return x.cap1; }))),
      cap2: uniq(P.map(function (x) { return x.cap2; }).concat(used.map(function (x) { return x.cap2; }))),
      cap3: uniq(P.map(function (x) { return x.cap3; }).concat(used.map(function (x) { return x.cap3; }))),
      group: uniq(H.map(function (x) { return x.group; }).concat(used.map(function (x) { return x.group; }))),
      channel: uniq(H.map(function (x) { return x.channel; }).concat(used.map(function (x) { return x.channel; }))),
      item: uniq(H.map(function (x) { return x.item; }).concat(used.map(function (x) { return x.item; }))),
      pic: uniq(STATE.catalog.pics.map(function (x) { return x.pic; }).concat(used.map(function (x) { return x.pic; }))),
      status: STATE.statuses.slice()
    };
  }
  // lựa chọn hợp lệ theo cột cha (dùng cho dropdown phụ thuộc và kiểm tra khi lưu)
  function validChildren(kind, row) {
    var P = STATE.catalog.programs, H = STATE.catalog.channels;
    if (kind === 'cap2') return uniq(P.filter(function (x) { return x.cap1 === row.cap1; }).map(function (x) { return x.cap2; }));
    if (kind === 'cap3') return uniq(P.filter(function (x) { return x.cap1 === row.cap1 && (!row.cap2 || x.cap2 === row.cap2); }).map(function (x) { return x.cap3; }));
    if (kind === 'channel') return uniq(H.filter(function (x) { return x.group === row.group; }).map(function (x) { return x.channel; }));
    if (kind === 'item') return uniq(H.filter(function (x) { return x.group === row.group && x.channel === row.channel; }).map(function (x) { return x.item; }));
    return [];
  }
  function gridInst(el) { return el.jspreadsheet || el.jexcel || ck.grid; }
  function depFilter(kind, parentCol) {
    return function (el, cell, c, r, source) {
      var inst = gridInst(el);
      var rowArr = inst.getRowData(+r);
      var o = fromGridRow(rowArr);
      if (!o[parentCol]) return source;
      var v = validChildren(kind, o);
      return v.length ? v : source;
    };
  }

  function columnsDef() {
    var L = lists();
    var w = function (n) { return n; };
    return [
      { type: 'hidden', title: 'ID' },
      { type: 'calendar', title: 'Ngày đăng', width: w(100), options: { format: 'DD/MM/YYYY', today: true } },
      { type: 'dropdown', align: 'left', title: 'Cấp 1', width: w(130), source: L.cap1, autocomplete: true },
      { type: 'dropdown', align: 'left', title: 'Cấp 2', width: w(170), source: L.cap2, autocomplete: true, filter: depFilter('cap2', 'cap1') },
      { type: 'dropdown', align: 'left', title: 'Cấp 3', width: w(190), source: L.cap3, autocomplete: true, filter: depFilter('cap3', 'cap1') },
      { type: 'dropdown', align: 'left', title: 'Nhóm kênh', width: w(110), source: L.group, autocomplete: true },
      { type: 'dropdown', align: 'left', title: 'Kênh', width: w(130), source: L.channel, autocomplete: true, filter: depFilter('channel', 'group') },
      { type: 'dropdown', align: 'left', title: 'Hạng mục', width: w(190), source: L.item, autocomplete: true, filter: depFilter('item', 'channel') },
      { type: 'text', align: 'left', title: 'Nội dung / Thông điệp', width: w(320), wordWrap: true },
      { type: 'dropdown', align: 'left', title: 'PIC', width: w(95), source: L.pic, autocomplete: true },
      { type: 'numeric', align: 'right', title: 'SL', width: w(48) },
      { type: 'dropdown', align: 'left', title: 'Tình trạng', width: w(115), source: L.status },
      { type: 'numeric', align: 'right', title: 'Hiển thị', width: w(80) },
      { type: 'numeric', align: 'right', title: 'Tương tác', width: w(80) },
      { type: 'numeric', align: 'right', title: 'Chuyển đổi', width: w(80) },
      { type: 'text', align: 'left', title: 'URL', width: w(180) },
      { type: 'text', align: 'left', title: 'Ghi chú', width: w(160), wordWrap: true },
      { type: 'text', align: 'left', title: 'Người sửa', width: w(100), readOnly: true },
      { type: 'text', align: 'left', title: 'Sửa lúc', width: w(110), readOnly: true },
      { type: 'hidden', title: 'ver' }
    ];
  }

  function initChecklist() {
    buildCkGrid();
    $('ckAdd').onclick = addCkRow;
    $('ckSave').onclick = saveCk;
    $('ckDiscard').onclick = async function () {
      if (!(await S.confirm('Bỏ thay đổi', 'Bỏ toàn bộ <b>' + ck.dirtyCount + '</b> thay đổi chưa lưu và tải lại dữ liệu từ hệ thống?', 'Bỏ thay đổi', true))) return;
      await reloadCk(true);
    };
    $('ckReload').onclick = function () { reloadCk(false); };
    $('ckExport').onclick = exportCk;
  }

  function sortedChecklist() {
    return STATE.checklist.slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return (a.createdAt || '') < (b.createdAt || '') ? -1 : 1;
    });
  }

  function gridHeight() { return Math.max(320, window.innerHeight - 270) + 'px'; }

  function buildCkGrid() {
    ck.snapshot = {};
    STATE.checklist.forEach(function (r) { ck.snapshot[r.id] = normServer(r); });
    var data = sortedChecklist().map(toGridRow);
    var el = $('gridCk');
    el.innerHTML = '';
    if (ck.grid && ck.grid.destroy) { try { ck.grid.destroy(); } catch (e) { } }
    ck.grid = jspreadsheet(el, {
      data: data.length ? data : [toGridRow({})],
      columns: columnsDef(),
      tableOverflow: true,
      tableHeight: gridHeight(),
      tableWidth: '100%',
      freezeColumns: 0,
      search: true,
      filters: true,
      columnSorting: true,
      allowInsertColumn: false, allowDeleteColumn: false, allowRenameColumn: false, allowManualInsertColumn: false,
      allowExport: false,
      defaultColWidth: 100,
      minDimensions: [COLS.length, 1],
      text: {
        search: 'Tìm', noRecordsFound: 'Không có dòng nào',
        insertANewRowBefore: 'Chèn dòng phía trên', insertANewRowAfter: 'Chèn dòng phía dưới',
        deleteSelectedRows: 'Xóa các dòng đang chọn', copy: 'Sao chép…', paste: 'Dán…',
        orderAscending: 'Sắp xếp tăng dần', orderDescending: 'Sắp xếp giảm dần',
        areYouSureToDeleteTheSelectedRows: 'Xóa các dòng đang chọn? (Chỉ thực sự xóa khi bấm Lưu thay đổi)',
        thisActionWillClearYourSearchResults: 'Thao tác này sẽ xóa kết quả tìm kiếm. Tiếp tục?',
        thisActionWillDestroyAnyExistingMergedCellsAreYouSure: 'Thao tác này sẽ bỏ gộp ô. Tiếp tục?'
      },
      contextMenu: function (obj, x, y) {
        var items = [];
        if (y !== null) {
          items.push({ title: 'Chèn dòng phía trên', onclick: function () { obj.insertRow(1, parseInt(y, 10), 1); } });
          items.push({ title: 'Chèn dòng phía dưới', onclick: function () { obj.insertRow(1, parseInt(y, 10)); } });
          items.push({ title: 'Nhân bản dòng này', onclick: function () { duplicateRow(parseInt(y, 10)); } });
          items.push({ title: 'Xóa các dòng đang chọn', onclick: function () { obj.deleteRow(obj.getSelectedRows().length ? undefined : parseInt(y, 10)); } });
          items.push({ type: 'line' });
        }
        items.push({ title: 'Sao chép', shortcut: 'Ctrl + C', onclick: function () { obj.copy(true); } });
        return items;
      },
      onchange: function (el, cell, x, y, value, oldValue) {
        x = +x; y = +y;
        if (!ck.programmatic && value !== oldValue) clearInvalidChildren(x, y);
        scheduleDirty();
      },
      onafterchanges: scheduleDirty,
      oninsertrow: function () { scheduleDirty(); },
      ondeleterow: function () { scheduleDirty(); },
      onsort: function () { scheduleDirty(); },
      onpaste: scheduleDirty,
      onundo: scheduleDirty, onredo: scheduleDirty
    });
    window.addEventListener('resize', function () {
      var c = el.querySelector('.jexcel_content'); if (c) c.style.maxHeight = gridHeight();
    });
    markDirty();
    updateCkStatus();
  }

  // Đổi cột cha → xóa cột con nếu không còn hợp lệ
  function clearInvalidChildren(x, y) {
    var deps = {};
    deps[C.cap1] = [['cap2', C.cap2], ['cap3', C.cap3]];
    deps[C.cap2] = [['cap3', C.cap3]];
    deps[C.group] = [['channel', C.channel], ['item', C.item]];
    deps[C.channel] = [['item', C.item]];
    if (!deps[x]) return;
    var o = fromGridRow(ck.grid.getRowData(y));
    ck.programmatic = true;
    try {
      deps[x].forEach(function (d) {
        var cur = o[d[0]];
        if (!cur) return;
        var valid = validChildren(d[0], o);
        if (valid.length && valid.indexOf(cur) < 0) { ck.grid.setValueFromCoords(d[1], y, '', true); o[d[0]] = ''; }
      });
    } finally { ck.programmatic = false; }
  }

  function scheduleDirty() { clearTimeout(ck.timer); ck.timer = setTimeout(markDirty, 120); }

  function diffCk() {
    var data = ck.grid.getData();
    var seen = {}, upserts = [], fresh = [], rowsInfo = [];
    data.forEach(function (arr, y) {
      var o = fromGridRow(arr);
      if (!o.id) {
        if (isBlank(o)) { rowsInfo.push(null); return; }
        fresh.push({ y: y, o: o }); rowsInfo.push('new'); return;
      }
      seen[o.id] = 1;
      var snap = ck.snapshot[o.id];
      if (!snap) { fresh.push({ y: y, o: o }); rowsInfo.push('new'); return; }
      if (!sameRow(o, snap)) { upserts.push({ y: y, o: o }); rowsInfo.push('dirty'); return; }
      rowsInfo.push(null);
    });
    var deletes = Object.keys(ck.snapshot).filter(function (id) { return !seen[id]; })
      .map(function (id) { return { id: id, ver: ck.snapshot[id].ver }; });
    return { upserts: upserts, fresh: fresh, deletes: deletes, rowsInfo: rowsInfo };
  }

  function markDirty() {
    if (!ck.grid) return;
    var d = diffCk();
    var rows = ck.grid.rows || [];
    d.rowsInfo.forEach(function (st, y) {
      var tr = rows[y]; if (!tr) return;
      tr.classList.toggle('row-dirty', st === 'dirty');
      tr.classList.toggle('row-new', st === 'new');
    });
    ck.dirtyCount = d.upserts.length + d.fresh.length + d.deletes.length;
    $('ckSave').disabled = !ck.dirtyCount;
    $('ckDiscard').disabled = !ck.dirtyCount;
    $('ckSave').textContent = ck.dirtyCount ? 'Lưu thay đổi (' + ck.dirtyCount + ')' : 'Lưu thay đổi';
    var b = $('badgeCk'); b.style.display = ck.dirtyCount ? '' : 'none'; b.textContent = ck.dirtyCount;
    updateCkStatus(d);
  }

  function updateCkStatus(d) {
    var parts = ['<b>' + STATE.checklist.length + '</b> dòng trên hệ thống'];
    if (d) {
      if (d.fresh.length) parts.push('<b style="color:var(--green)">' + d.fresh.length + '</b> dòng mới');
      if (d.upserts.length) parts.push('<b style="color:#B07C00">' + d.upserts.length + '</b> dòng sửa');
      if (d.deletes.length) parts.push('<b style="color:var(--red)">' + d.deletes.length + '</b> dòng xóa');
    }
    if (STATE.loadedAt) parts.push('tải lúc ' + STATE.loadedAt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }));
    $('ckStatus').innerHTML = parts.join(' · ');
  }

  function addCkRow() {
    var g = ck.grid;
    var last = g.getData().length;
    var blank = toGridRow({ date: todayStr(), status: 'Kế hoạch', qty: 1 });
    blank[C.id] = '';
    g.insertRow(blank);
    var y = g.getData().length - 1;
    if (y < last) y = last;
    setTimeout(function () {
      g.updateSelectionFromCoords(C.date, y, C.date, y);
      var td = g.getCellFromCoords(C.date, y); if (td && td.scrollIntoView) td.scrollIntoView({ block: 'center' });
    }, 30);
    scheduleDirty();
  }

  function duplicateRow(y) {
    var src = ck.grid.getRowData(y).slice();
    src[C.id] = ''; src[C.updatedBy] = ''; src[C.updatedAtView] = ''; src[C.ver] = '';
    ck.grid.insertRow(src, y);
    scheduleDirty();
  }

  // ---- kiểm tra dữ liệu trước khi lưu
  function validateRow(o) {
    var errs = [];
    var L = lists();
    if (!o.date) errs.push(['date', 'thiếu hoặc sai Ngày đăng']);
    if (!o.cap1) errs.push(['cap1', 'thiếu Cấp 1']);
    if (!o.group) errs.push(['group', 'thiếu Nhóm kênh']);
    if (!o.channel) errs.push(['channel', 'thiếu Kênh']);
    if (!o.content) errs.push(['content', 'thiếu Nội dung']);
    if (!o.pic) errs.push(['pic', 'thiếu PIC']);
    if (!o.status) errs.push(['status', 'thiếu Tình trạng']);
    else if (L.status.indexOf(o.status) < 0) errs.push(['status', 'Tình trạng "' + o.status + '" không hợp lệ']);
    var catPics = STATE.catalog.pics.map(function (x) { return x.pic; });
    if (o.pic && catPics.indexOf(o.pic) < 0) errs.push(['pic', 'PIC "' + o.pic + '" chưa có trong danh mục PIC']);
    var P = STATE.catalog.programs, H = STATE.catalog.channels;
    if (o.cap1 && !P.some(function (x) { return x.cap1 === o.cap1; })) errs.push(['cap1', 'Cấp 1 "' + o.cap1 + '" chưa có trong danh mục']);
    if (o.cap2 && !P.some(function (x) { return x.cap1 === o.cap1 && x.cap2 === o.cap2; })) errs.push(['cap2', 'Cấp 2 không thuộc Cấp 1 đã chọn']);
    if (o.cap3 && !P.some(function (x) { return x.cap1 === o.cap1 && (!o.cap2 || x.cap2 === o.cap2) && x.cap3 === o.cap3; })) errs.push(['cap3', 'Cấp 3 không thuộc Cấp 1/Cấp 2 đã chọn']);
    if (o.group && !H.some(function (x) { return x.group === o.group; })) errs.push(['group', 'Nhóm kênh "' + o.group + '" chưa có trong danh sách kênh']);
    if (o.channel && !H.some(function (x) { return x.group === o.group && x.channel === o.channel; })) errs.push(['channel', 'Kênh không thuộc Nhóm kênh đã chọn']);
    if (o.item && !H.some(function (x) { return x.group === o.group && x.channel === o.channel && x.item === o.item; })) errs.push(['item', 'Hạng mục không thuộc Kênh đã chọn']);
    ['qty', 'views', 'eng', 'conv'].forEach(function (k) { if (o[k] !== null && o[k] < 0) errs.push([k, LABEL[k] + ' không được âm']); });
    if (o.qty !== null && o.qty !== Math.round(o.qty)) errs.push(['qty', 'SL bài tin phải là số nguyên']);
    return errs;
  }

  function clearCellErrors() {
    document.querySelectorAll('#gridCk td.cell-err').forEach(function (td) { td.classList.remove('cell-err'); td.removeAttribute('title'); });
    $('ckErr').classList.remove('show'); $('ckErr').innerHTML = '';
  }

  function showErrors(list, title) {
    var box = $('ckErr');
    box.innerHTML = '<b>' + esc(title) + '</b><ul>' + list.slice(0, 60).map(function (e, i) {
      return '<li><a data-i="' + i + '">Dòng ' + (e.y + 1) + '</a>: ' + esc(e.msg) + '</li>';
    }).join('') + (list.length > 60 ? '<li>… và ' + (list.length - 60) + ' lỗi khác</li>' : '') + '</ul>';
    box.classList.add('show');
    box.querySelectorAll('a[data-i]').forEach(function (a) {
      a.onclick = function () {
        var e = list[+a.dataset.i];
        ck.grid.updateSelectionFromCoords(e.x, e.y, e.x, e.y);
        var td = ck.grid.getCellFromCoords(e.x, e.y); if (td) td.scrollIntoView({ block: 'center', inline: 'center' });
      };
    });
  }

  async function saveCk() {
    clearCellErrors();
    var d = diffCk();
    var toCheck = d.fresh.concat(d.upserts);
    var errList = [];
    toCheck.forEach(function (it) {
      validateRow(it.o).forEach(function (e) {
        var x = C[e[0]];
        errList.push({ y: it.y, x: x, msg: e[1] });
        var td = ck.grid.getCellFromCoords(x, it.y);
        if (td) { td.classList.add('cell-err'); td.title = e[1]; }
      });
    });
    if (errList.length) {
      showErrors(errList, 'Chưa lưu được — ' + errList.length + ' ô cần sửa (đã tô đỏ):');
      S.toast('Có ' + errList.length + ' ô cần sửa trước khi lưu.', 'err');
      return;
    }
    if (d.deletes.length) {
      var ok = await S.confirm('Xác nhận xóa', 'Bạn sắp xóa <b>' + d.deletes.length + '</b> dòng khỏi checklist. Dòng xóa được lưu sang tab "Đã xóa" trong Google Sheet để khôi phục khi cần.', 'Lưu và xóa', true);
      if (!ok) return;
    }
    // gán ID cho dòng mới
    ck.programmatic = true;
    try {
      d.fresh.forEach(function (it) {
        if (!it.o.id || ck.snapshot[it.o.id]) { it.o.id = newId(); ck.grid.setValueFromCoords(C.id, it.y, it.o.id, true); }
      });
    } finally { ck.programmatic = false; }

    var upserts = d.fresh.map(function (it) { var o = Object.assign({}, it.o); delete o.ver; return o; })
      .concat(d.upserts.map(function (it) { return it.o; }));
    $('ckSave').disabled = true;
    S.loading(true, 'Đang lưu ' + (upserts.length + d.deletes.length) + ' thay đổi…');
    try {
      var r = await S.api('saveChecklist', { upserts: upserts, deletes: d.deletes });
      // cập nhật ảnh chụp & cột hệ thống theo kết quả máy chủ
      var byId = {};
      r.rows.forEach(function (row) { byId[row.id] = row; });
      var data = ck.grid.getData();
      ck.programmatic = true;
      try {
        data.forEach(function (arr, y) {
          var id = arr[C.id], row = byId[id];
          if (!row) return;
          ck.snapshot[id] = normServer(row);
          ck.grid.setValueFromCoords(C.updatedBy, y, row.updatedBy, true);
          ck.grid.setValueFromCoords(C.updatedAtView, y, S.fmtDateTimeVN(row.updatedAt), true);
          ck.grid.setValueFromCoords(C.ver, y, row.updatedAt, true);
        });
      } finally { ck.programmatic = false; }
      var conflictIds = {};
      r.conflicts.forEach(function (c) { conflictIds[c.id] = c; });
      d.deletes.forEach(function (x) { if (!conflictIds[x.id]) delete ck.snapshot[x.id]; });
      // đồng bộ STATE.checklist
      var map = {};
      STATE.checklist.forEach(function (x) { map[x.id] = x; });
      r.rows.forEach(function (row) { map[row.id] = row; });
      d.deletes.forEach(function (x) { if (!conflictIds[x.id]) delete map[x.id]; });
      STATE.checklist = Object.keys(map).map(function (k) { return map[k]; });

      if (r.conflicts.length) {
        var list = [];
        data.forEach(function (arr, y) { var c = conflictIds[arr[C.id]]; if (c) list.push({ y: y, x: C.content, msg: c.reason }); });
        r.conflicts.forEach(function (c) { if (!list.some(function (l) { return data[l.y][C.id] === c.id; })) list.push({ y: 0, x: C.content, msg: '(dòng đã xóa) ' + c.reason }); });
        showErrors(list, r.conflicts.length + ' dòng không lưu được do người khác vừa sửa. Bấm "Tải lại" để lấy bản mới nhất rồi nhập lại phần của bạn:');
        S.toast('Đã lưu ' + r.saved + ' dòng. ' + r.conflicts.length + ' dòng bị xung đột.', 'err');
      } else {
        S.toast('Đã lưu ' + r.saved + ' dòng' + (r.deleted ? ', xóa ' + r.deleted + ' dòng' : '') + '.', 'ok');
      }
    } catch (e) {
      S.toast(e.message, 'err');
    } finally {
      S.loading(false);
      markDirty();
    }
  }

  async function reloadCk(force) {
    if (!force && ck.dirtyCount) {
      if (!(await S.confirm('Tải lại dữ liệu', 'Bạn đang có <b>' + ck.dirtyCount + '</b> thay đổi chưa lưu. Tải lại sẽ <b>mất</b> các thay đổi này.', 'Vẫn tải lại', true))) return;
    }
    clearCellErrors();
    await loadAll();
    buildCkGrid();
    refreshMultiOptions();
    S.toast('Đã tải dữ liệu mới nhất.', 'ok');
  }

  function exportCk() {
    var data = ck.grid.getData().map(fromGridRow).filter(function (o) { return !isBlank(o); });
    var rows = data.map(function (o) {
      var r = { 'ID': o.id };
      EDIT.forEach(function (k) {
        var v = o[k];
        if (k === 'date') v = S.fmtDateVN(v);
        r[LABEL[k]] = v === null ? '' : v;
      });
      return r;
    });
    var ws = XLSX.utils.json_to_sheet(rows);
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Checklist');
    XLSX.writeFile(wb, 'Checklist_truyen_thong_' + todayStr().replace(/-/g, '') + '.xlsx');
  }

  /* ===================================================================
   * ĐĂNG 1 NỘI DUNG NHIỀU KÊNH
   * =================================================================== */
  function fillSelect(sel, values, keep, placeholder) {
    var cur = keep ? sel.value : '';
    sel.innerHTML = '<option value="">' + esc(placeholder || '— Chọn —') + '</option>' +
      values.map(function (v) { return '<option>' + esc(v) + '</option>'; }).join('');
    if (cur && values.indexOf(cur) >= 0) sel.value = cur;
  }

  function initMulti() {
    $('mDate').value = todayStr();
    ['mCap1', 'mCap2'].forEach(function (id) { $(id).addEventListener('change', refreshMultiCaps); });
    $('mClearCh').onclick = function () { document.querySelectorAll('#mChannels input').forEach(function (c) { c.checked = false; }); updateMultiCount(); };
    $('mSubmit').onclick = submitMulti;
    refreshMultiOptions();
  }

  function refreshMultiOptions() {
    var L = lists();
    fillSelect($('mCap1'), uniq(STATE.catalog.programs.map(function (x) { return x.cap1; })), true);
    refreshMultiCaps();
    fillSelect($('mPic'), STATE.catalog.pics.map(function (x) { return x.pic; }), true);
    fillSelect($('mStatus'), L.status, true);
    if (!$('mStatus').value) $('mStatus').value = 'Kế hoạch';
    // kênh: Nhóm kênh → Kênh → Hạng mục
    var checked = {};
    document.querySelectorAll('#mChannels input:checked').forEach(function (c) { checked[c.value] = 1; });
    var groups = {};
    STATE.catalog.channels.forEach(function (x) {
      if (!x.group || !x.channel) return;
      groups[x.group] = groups[x.group] || {};
      groups[x.group][x.channel] = groups[x.group][x.channel] || [];
      groups[x.group][x.channel].push(x.item || '');
    });
    $('mChannels').innerHTML = Object.keys(groups).map(function (g) {
      return '<div class="ch-group"><div class="gh">' + esc(g) + '</div>' + Object.keys(groups[g]).map(function (c) {
        return '<div class="ch-chan"><div class="cn">' + esc(c) + '<button type="button" data-all>Chọn tất cả</button></div>' +
          groups[g][c].map(function (it) {
            var val = JSON.stringify([g, c, it]);
            return '<label><input type="checkbox" value="' + esc(val) + '"' + (checked[val] ? ' checked' : '') + '>' + esc(it || '(không có hạng mục)') + '</label>';
          }).join('') + '</div>';
      }).join('') + '</div>';
    }).join('');
    $('mChannels').querySelectorAll('input').forEach(function (c) { c.onchange = updateMultiCount; });
    $('mChannels').querySelectorAll('[data-all]').forEach(function (b) {
      b.onclick = function () {
        var boxes = b.closest('.ch-chan').querySelectorAll('input');
        var all = Array.prototype.every.call(boxes, function (x) { return x.checked; });
        boxes.forEach(function (x) { x.checked = !all; });
        updateMultiCount();
      };
    });
    updateMultiCount();
  }

  function refreshMultiCaps() {
    var cap1 = $('mCap1').value;
    fillSelect($('mCap2'), validChildren('cap2', { cap1: cap1 }), true, cap1 ? '— Chọn —' : '— Chọn Cấp 1 trước —');
    fillSelect($('mCap3'), validChildren('cap3', { cap1: cap1, cap2: $('mCap2').value }), true, cap1 ? '— Chọn —' : '— Chọn Cấp 1 trước —');
  }

  function updateMultiCount() {
    var n = document.querySelectorAll('#mChannels input:checked').length;
    $('mCount').textContent = n;
    $('mSubmit').disabled = !n;
    $('mSubmit').textContent = n ? 'Tạo ' + n + ' dòng & lưu' : 'Tạo dòng & lưu';
  }

  async function submitMulti() {
    var base = {
      date: S.toDateStr($('mDate').value), cap1: $('mCap1').value, cap2: $('mCap2').value, cap3: $('mCap3').value,
      content: $('mContent').value.replace(/[ \t]+/g, ' ').trim(), pic: $('mPic').value, status: $('mStatus').value,
      qty: Math.max(1, parseInt($('mQty').value, 10) || 1), url: $('mUrl').value.trim(), note: $('mNote').value.trim(),
      views: null, eng: null, conv: null
    };
    var miss = [];
    if (!base.date) miss.push('Ngày đăng');
    if (!base.cap1) miss.push('Cấp 1');
    if (!base.content) miss.push('Nội dung');
    if (!base.pic) miss.push('PIC');
    if (!base.status) miss.push('Tình trạng');
    if (miss.length) { S.toast('Vui lòng nhập: ' + miss.join(', ') + '.', 'err'); return; }
    var picks = Array.prototype.map.call(document.querySelectorAll('#mChannels input:checked'), function (c) { return JSON.parse(c.value); });
    var rows = picks.map(function (p) { return Object.assign({}, base, { id: newId(), group: p[0], channel: p[1], item: p[2] }); });
    if (!(await S.confirm('Tạo ' + rows.length + ' dòng', 'Nội dung "<b>' + esc(base.content.slice(0, 120)) + '</b>" sẽ được tạo thành <b>' + rows.length +
      '</b> dòng checklist (mỗi hạng mục một dòng) và lưu ngay lên hệ thống.', 'Tạo & lưu'))) return;
    S.loading(true, 'Đang lưu ' + rows.length + ' dòng…');
    try {
      var r = await S.api('saveChecklist', { upserts: rows, deletes: [] });
      r.rows.forEach(function (row) {
        STATE.checklist.push(row);
        ck.snapshot[row.id] = normServer(row);
        ck.programmatic = true;
        try { ck.grid.insertRow(toGridRow(row)); } finally { ck.programmatic = false; }
      });
      S.toast('Đã tạo ' + r.saved + ' dòng. Xem ở tab Checklist.', 'ok');
      $('mContent').value = ''; $('mUrl').value = ''; $('mNote').value = '';
      document.querySelectorAll('#mChannels input').forEach(function (c) { c.checked = false; });
      updateMultiCount();
      scheduleDirty();
    } catch (e) { S.toast(e.message, 'err'); } finally { S.loading(false); }
  }

  /* ===================================================================
   * DANH MỤC
   * =================================================================== */
  var CAT = {
    programs: { el: 'gridPrograms', cols: [['cap1', 'Cấp 1', 150], ['cap2', 'Cấp 2', 240], ['cap3', 'Cấp 3', 300], ['note', 'Ghi chú', 260]] },
    channels: { el: 'gridChannels', cols: [['group', 'Nhóm kênh', 160], ['channel', 'Kênh', 220], ['item', 'Hạng mục', 360]] },
    pics: { el: 'gridPics', cols: [['pic', 'PIC', 200], ['note', 'Ghi chú', 360]] }
  };
  var cat = { grids: {}, dirty: {}, timer: {} };

  function catRows(kind) {
    return STATE.catalog[kind].map(function (r) { return CAT[kind].cols.map(function (c) { return r[c[0]] || ''; }); });
  }
  function catFromGrid(kind) {
    return cat.grids[kind].getData().map(function (a) {
      var o = {};
      CAT[kind].cols.forEach(function (c, i) { o[c[0]] = String(a[i] === null || a[i] === undefined ? '' : a[i]).replace(/[ \t]+/g, ' ').trim(); });
      return o;
    }).filter(function (o) { return CAT[kind].cols.some(function (c) { return c[0] !== 'note' && o[c[0]]; }); });
  }

  function ensureCatGrid(kind) {
    if (cat.grids[kind]) return;
    var el = $(CAT[kind].el);
    el.innerHTML = '';
    var rows = catRows(kind);
    cat.grids[kind] = jspreadsheet(el, {
      data: rows.length ? rows : [CAT[kind].cols.map(function () { return ''; })],
      columns: CAT[kind].cols.map(function (c) { return { type: 'text', align: 'left', title: c[1], width: c[2], wordWrap: true }; }),
      tableOverflow: true, tableHeight: gridHeight(), tableWidth: '100%',
      search: true, columnSorting: true, allowInsertColumn: false, allowDeleteColumn: false, allowRenameColumn: false,
      allowManualInsertColumn: false, minDimensions: [CAT[kind].cols.length, 1],
      text: { search: 'Tìm', noRecordsFound: 'Không có dòng nào', insertANewRowBefore: 'Chèn dòng phía trên', insertANewRowAfter: 'Chèn dòng phía dưới',
        deleteSelectedRows: 'Xóa các dòng đang chọn', copy: 'Sao chép…', paste: 'Dán…', orderAscending: 'Sắp xếp tăng dần', orderDescending: 'Sắp xếp giảm dần',
        areYouSureToDeleteTheSelectedRows: 'Xóa các dòng đang chọn? (Chỉ thực sự xóa khi bấm Lưu danh mục)' },
      onchange: function () { catDirty(kind); }, onafterchanges: function () { catDirty(kind); },
      oninsertrow: function () { catDirty(kind); }, ondeleterow: function () { catDirty(kind); },
      onpaste: function () { catDirty(kind); }, onundo: function () { catDirty(kind); }, onredo: function () { catDirty(kind); }
    });
    catDirty(kind);
  }

  function catDirty(kind) {
    clearTimeout(cat.timer[kind]);
    cat.timer[kind] = setTimeout(function () {
      var now = JSON.stringify(catFromGrid(kind));
      var orig = JSON.stringify(STATE.catalog[kind].map(function (r) { var o = {}; CAT[kind].cols.forEach(function (c) { o[c[0]] = (r[c[0]] || '').trim(); }); return o; })
        .filter(function (o) { return CAT[kind].cols.some(function (c) { return c[0] !== 'note' && o[c[0]]; }); }));
      cat.dirty[kind] = now !== orig;
      var btn = document.querySelector('[data-cat-save="' + kind + '"]');
      btn.disabled = !cat.dirty[kind];
      btn.textContent = cat.dirty[kind] ? 'Lưu danh mục (có thay đổi)' : 'Lưu danh mục';
      document.querySelector('[data-cat-status="' + kind + '"]').innerHTML = '<b>' + STATE.catalog[kind].length + '</b> dòng trên hệ thống';
    }, 120);
  }

  function initCatalogButtons() {
    document.querySelectorAll('[data-cat-add]').forEach(function (b) {
      b.onclick = function () {
        var k = b.dataset.catAdd, g = cat.grids[k];
        g.insertRow();
        var y = g.getData().length - 1;
        setTimeout(function () { g.updateSelectionFromCoords(0, y, 0, y); var td = g.getCellFromCoords(0, y); if (td) td.scrollIntoView({ block: 'center' }); }, 30);
      };
    });
    document.querySelectorAll('[data-cat-save]').forEach(function (b) { b.onclick = function () { saveCatalog(b.dataset.catSave); }; });
    document.querySelectorAll('[data-cat-reload]').forEach(function (b) {
      b.onclick = async function () {
        var k = b.dataset.catReload;
        if (cat.dirty[k] && !(await S.confirm('Tải lại danh mục', 'Thay đổi chưa lưu trong danh mục này sẽ bị mất.', 'Vẫn tải lại', true))) return;
        await loadAll();
        Object.keys(cat.grids).forEach(function (kk) { try { cat.grids[kk].destroy(); } catch (e) { } delete cat.grids[kk]; });
        ensureCatGrid(k);
        refreshCkSources();
        refreshMultiOptions();
      };
    });
  }

  // các giá trị đang được checklist dùng nhưng sắp biến mất khỏi danh mục
  function orphanedUsage(kind, rows) {
    var key, used = {};
    var fields = kind === 'programs' ? ['cap1', 'cap2', 'cap3'] : kind === 'channels' ? ['group', 'channel', 'item'] : ['pic'];
    var exists = {};
    rows.forEach(function (r) { exists[fields.map(function (f) { return r[f] || ''; }).join('␟')] = 1; });
    // so khớp ở mức tổ hợp; dòng checklist có cấp con trống được coi là khớp nếu tổ hợp cha tồn tại
    STATE.checklist.forEach(function (r) {
      var vals = fields.map(function (f) { return r[f] || ''; });
      if (!vals[0]) return;
      var ok = rows.some(function (c) {
        return fields.every(function (f, i) { return !vals[i] || (c[f] || '') === vals[i]; });
      });
      if (!ok) { key = vals.filter(Boolean).join(' › '); used[key] = (used[key] || 0) + 1; }
    });
    return used;
  }

  async function saveCatalog(kind) {
    var rows = catFromGrid(kind);
    var orphan = orphanedUsage(kind, rows);
    var keys = Object.keys(orphan);
    if (keys.length) {
      var html = 'Các giá trị sau đang được dùng trong checklist nhưng <b>không còn</b> trong danh mục mới. Các dòng cũ vẫn giữ nguyên giá trị, nhưng sẽ bị báo lỗi khi sửa lại:<ul style="margin:8px 0 0;padding-left:18px">' +
        keys.slice(0, 15).map(function (k) { return '<li>' + esc(k) + ' — ' + orphan[k] + ' dòng</li>'; }).join('') + (keys.length > 15 ? '<li>…</li>' : '') + '</ul>';
      if (!(await S.confirm('Giá trị đang được sử dụng', html, 'Vẫn lưu', true))) return;
    }
    S.loading(true, 'Đang lưu danh mục…');
    try {
      var r = await S.api('saveCatalog', { kind: kind, rows: rows, ver: STATE.catalog.versions[kind] || '' });
      STATE.catalog[kind] = r.rows;
      STATE.catalog.versions[kind] = r.ver;
      try { cat.grids[kind].destroy(); } catch (e) { }
      delete cat.grids[kind];
      ensureCatGrid(kind);
      refreshCkSources();
      refreshMultiOptions();
      S.toast('Đã lưu danh mục (' + r.rows.length + ' dòng).', 'ok');
    } catch (e) { S.toast(e.message, 'err'); } finally { S.loading(false); }
  }

  function refreshCkSources() {
    if (!ck.grid) return;
    var L = lists();
    var map = { cap1: C.cap1, cap2: C.cap2, cap3: C.cap3, group: C.group, channel: C.channel, item: C.item, pic: C.pic };
    Object.keys(map).forEach(function (k) { ck.grid.options.columns[map[k]].source = L[k]; });
  }

  /* ===================================================================
   * DỮ LIỆU CHUYỂN ĐỔI
   * =================================================================== */
  var convPending = null;

  function renderConvCurrent() {
    var rows = STATE.conv.rows || [], m = STATE.conv.meta || {};
    $('convCurrent').innerHTML = [
      ['File đang dùng', m.file || '—'], ['Số ngày', rows.length],
      ['Từ ngày', rows.length ? S.fmtDateVN(rows[0].date) : '—'], ['Đến ngày', rows.length ? S.fmtDateVN(rows[rows.length - 1].date) : '—'],
      ['Up bởi', m.uploadedBy || '—'], ['Up lúc', S.fmtDateTimeVN(m.uploadedAt) || '—']
    ].map(function (x) { return '<div><span>' + esc(x[0]) + '</span><b>' + esc(x[1]) + '</b></div>'; }).join('');
  }

  function initConv() {
    renderConvCurrent();
    $('convPick').onclick = function () { $('convFile').click(); };
    $('convFile').onchange = function (e) { if (e.target.files[0]) readConvFile(e.target.files[0]); e.target.value = ''; };
    var drop = $('convDrop');
    ['dragover', 'dragenter'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('drag'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('drag'); }); });
    drop.addEventListener('drop', function (e) { var f = e.dataTransfer.files[0]; if (f) readConvFile(f); });
  }

  async function readConvFile(file) {
    if (!/\.csv$/i.test(file.name)) { S.toast('Chỉ nhận file .csv', 'err'); return; }
    var parsed;
    try { parsed = S.parseConvCsv(await file.text()); } catch (e) { $('convPreview').innerHTML = '<div class="warn bad">Không đọc được file: ' + esc(e.message) + '</div>'; return; }
    convPending = { file: file.name, parsed: parsed };
    var rows = parsed.rows, cur = STATE.conv.rows || [];
    var curDates = {}; cur.forEach(function (r) { curDates[r.date] = 1; });
    var newDates = {}; rows.forEach(function (r) { newDates[r.date] = 1; });
    var added = rows.filter(function (r) { return !curDates[r.date]; }).length;
    var lost = cur.filter(function (r) { return !newDates[r.date]; });
    var html = '<div class="kv" style="margin-top:14px">' +
      [['File mới', file.name], ['Số ngày', rows.length], ['Từ ngày', rows.length ? S.fmtDateVN(rows[0].date) : '—'],
        ['Đến ngày', rows.length ? S.fmtDateVN(rows[rows.length - 1].date) : '—'], ['Ngày mới so với bản đang dùng', '+' + added]]
        .map(function (x) { return '<div><span>' + esc(x[0]) + '</span><b>' + esc(x[1]) + '</b></div>'; }).join('') + '</div>';
    var bad = false;
    if (!rows.length) { html += '<div class="warn bad">File không có dòng dữ liệu hợp lệ.</div>'; bad = true; }
    if (lost.length) {
      bad = true;
      html += '<div class="warn bad"><b>Cảnh báo:</b> file mới <b>thiếu ' + lost.length + ' ngày</b> đang có trên hệ thống (ví dụ: ' +
        lost.slice(0, 5).map(function (r) { return S.fmtDateVN(r.date); }).join(', ') + (lost.length > 5 ? '…' : '') +
        '). Vì file mới thay toàn bộ dữ liệu, các ngày này sẽ <b>mất</b> khỏi Dashboard. Chỉ tiếp tục nếu đây là chủ đích.</div>';
    }
    var optional = { navNew: 'NAV KH mới', navMkt: 'NAV theo kênh', paidMkt: 'SL KH nộp tiền theo kênh', debt: 'Tổng dư nợ', nav: 'Tổng NAV' };
    var missOpt = parsed.missing.filter(function (k) { return optional[k]; }).map(function (k) { return optional[k]; });
    if (missOpt.length) html += '<div class="warn">File thiếu cột: ' + esc(uniq(missOpt).join(', ')) + '. Các phần tương ứng trên Dashboard sẽ ẩn.</div>';
    parsed.warnings.forEach(function (w) { html += '<div class="warn">' + esc(w) + '</div>'; });
    if (!bad && !parsed.warnings.length && !missOpt.length) html += '<div class="good">File hợp lệ, đủ cột, số liệu các kênh khớp tổng.</div>';
    html += '<div class="form-foot"><button class="ui-btn ' + (bad ? 'danger' : 'save') + '" id="convSave"' + (rows.length ? '' : ' disabled') + '>Lưu lên hệ thống</button>' +
      '<button class="ui-btn" id="convCancel">Hủy</button></div>';
    $('convPreview').innerHTML = html;
    $('convCancel').onclick = function () { convPending = null; $('convPreview').innerHTML = ''; };
    $('convSave').onclick = function () { saveConv(bad); };
  }

  async function saveConv(bad) {
    if (!convPending) return;
    if (bad && !(await S.confirm('Lưu file có cảnh báo', 'File mới thiếu dữ liệu so với bản đang dùng. Bạn chắc chắn muốn thay toàn bộ?', 'Vẫn lưu', true))) return;
    S.loading(true, 'Đang lưu dữ liệu chuyển đổi…');
    try {
      var r = await S.api('uploadConv', { rows: convPending.parsed.rows, fileName: convPending.file });
      STATE.conv.rows = convPending.parsed.rows;
      STATE.conv.meta = { file: convPending.file, uploadedAt: r.uploadedAt, uploadedBy: STATE.user.name };
      convPending = null;
      $('convPreview').innerHTML = '<div class="good">Đã lưu ' + r.days + ' ngày (' + S.fmtDateVN(r.from) + ' → ' + S.fmtDateVN(r.to) + '). Dashboard của mọi người sẽ thấy bản này khi tải lại.</div>';
      renderConvCurrent();
      S.toast('Đã cập nhật dữ liệu chuyển đổi.', 'ok');
    } catch (e) { S.toast(e.message, 'err'); } finally { S.loading(false); }
  }

  /* ===================================================================
   * KEY TRUY CẬP (chỉ Chủ hệ thống)
   * =================================================================== */
  var keysCache = [];

  function initKeys() {
    $('kMode').onchange = function () { $('kCustomWrap').style.display = $('kMode').value === 'custom' ? '' : 'none'; };
    $('kCreate').onclick = createKey;
    $('logReload').onclick = loadLog;
  }

  async function loadKeys() {
    try { var r = await S.api('keys.list'); keysCache = r.keys; renderKeys(); } catch (e) { S.toast(e.message, 'err'); }
  }

  function renderKeys() {
    $('keyRows').innerHTML = keysCache.map(function (k) {
      var role = k.owner ? '<span class="pill owner">Chủ hệ thống</span>' : (k.role === 'admin' ? '<span class="pill admin">Admin</span>' : '<span class="pill viewer">Viewer</span>');
      var st = k.active ? '<span class="pill on">Đang dùng</span>' : '<span class="pill off">Đã khóa</span>';
      var acts = '<button data-a="rename">Đổi tên</button><button data-a="reset">Đặt lại key</button>';
      if (!k.owner) {
        acts += '<button data-a="role">' + (k.role === 'admin' ? '→ Viewer' : '→ Admin') + '</button>';
        acts += k.active ? '<button data-a="lock" class="danger">Khóa</button>' : '<button data-a="unlock">Mở khóa</button>';
        acts += '<button data-a="del" class="danger">Xóa</button>';
      }
      return '<tr data-id="' + esc(k.id) + '"><td><b>' + esc(k.name) + '</b></td><td>' + role + '</td><td>' + st + '</td><td>' + esc(S.fmtDateTimeVN(k.createdAt)) +
        '</td><td>' + esc(S.fmtDateTimeVN(k.lastUsed) || '—') + '</td><td>' + esc(k.note || '') + '</td><td><div class="acts-cell">' + acts + '</div></td></tr>';
    }).join('');
    $('keyRows').querySelectorAll('button[data-a]').forEach(function (b) {
      b.onclick = function () { keyAction(b.closest('tr').dataset.id, b.dataset.a); };
    });
  }

  function revealKey(name, key) {
    return S.modal({
      title: 'Key của "' + name + '"', sticky: true,
      html: '<p>Key chỉ hiển thị <b>một lần</b>. Sao chép và gửi riêng cho người dùng qua kênh nội bộ.</p><div class="key-reveal" id="kShow">' + esc(key) + '</div>',
      buttons: [{ label: 'Sao chép', cls: 'primary', collect: function (bg) {
        var t = bg.querySelector('#kShow').textContent;
        if (navigator.clipboard) navigator.clipboard.writeText(t).then(function () { S.toast('Đã sao chép key.', 'ok'); });
        return true;
      } }, { label: 'Đã lưu, đóng', value: true }]
    });
  }

  async function createKey() {
    var name = $('kName').value.trim();
    if (!name) { S.toast('Vui lòng đặt tên cho key.', 'err'); return; }
    var payload = { name: name, role: $('kRole').value, note: $('kNote').value.trim() };
    if ($('kMode').value === 'custom') payload.key = $('kCustom').value.trim();
    try {
      var r = await S.api('keys.create', payload);
      keysCache = r.keys; renderKeys();
      $('kName').value = ''; $('kCustom').value = ''; $('kNote').value = '';
      await revealKey(name, r.key);
    } catch (e) { S.toast(e.message, 'err'); }
  }

  async function keyAction(id, a) {
    var k = keysCache.filter(function (x) { return x.id === id; })[0];
    if (!k) return;
    var r;
    try {
      if (a === 'rename') {
        var name = await S.modal({ title: 'Đổi tên key', html: '<input id="nn" value="' + esc(k.name) + '">',
          buttons: [{ label: 'Hủy', value: null }, { label: 'Lưu', cls: 'primary', collect: function (bg) { return bg.querySelector('#nn').value.trim(); } }] });
        if (!name) return;
        r = await S.api('keys.update', { id: id, name: name });
      } else if (a === 'reset') {
        var mode = await S.modal({ title: 'Đặt lại key cho "' + k.name + '"',
          html: '<p>Key cũ sẽ hết hiệu lực ngay. Chọn cách tạo key mới:</p><select id="rm"><option value="auto">Tự sinh (khuyến nghị)</option><option value="custom">Tự đặt</option></select>' +
            '<input id="rc" placeholder="Key tự đặt, ít nhất 10 ký tự" style="margin-top:8px;display:none">',
          onOpen: function (bg) { var sel = bg.querySelector('#rm'); sel.onchange = function () { bg.querySelector('#rc').style.display = sel.value === 'custom' ? '' : 'none'; }; },
          buttons: [{ label: 'Hủy', value: null }, { label: 'Đặt lại', cls: 'danger', collect: function (bg) {
            return bg.querySelector('#rm').value === 'custom' ? (bg.querySelector('#rc').value.trim() || null) : true;
          } }] });
        if (!mode) return;
        r = await S.api('keys.update', { id: id, resetKey: mode });
        keysCache = r.keys; renderKeys();
        await revealKey(k.name, r.key);
        return;
      } else if (a === 'role') {
        var to = k.role === 'admin' ? 'viewer' : 'admin';
        if (!(await S.confirm('Đổi loại key', 'Chuyển "<b>' + esc(k.name) + '</b>" sang <b>' + (to === 'admin' ? 'Admin (nhập liệu)' : 'Viewer (chỉ xem)') + '</b>?', 'Đồng ý'))) return;
        r = await S.api('keys.update', { id: id, role: to });
      } else if (a === 'lock' || a === 'unlock') {
        if (a === 'lock' && !(await S.confirm('Khóa key', 'Khóa key "<b>' + esc(k.name) + '</b>"? Người đang dùng key này sẽ bị đăng xuất ngay.', 'Khóa', true))) return;
        r = await S.api('keys.update', { id: id, active: a === 'unlock' });
      } else if (a === 'del') {
        if (!(await S.confirm('Xóa key', 'Xóa hẳn key "<b>' + esc(k.name) + '</b>"? Thao tác không hoàn tác được.', 'Xóa', true))) return;
        r = await S.api('keys.delete', { id: id });
      }
      if (r) { keysCache = r.keys; renderKeys(); S.toast('Đã cập nhật.', 'ok'); }
    } catch (e) { S.toast(e.message, 'err'); }
  }

  async function loadLog() {
    try {
      var r = await S.api('log.list', { limit: 200 });
      $('logRows').innerHTML = r.log.map(function (l) {
        return '<tr><td style="white-space:nowrap">' + esc(S.fmtDateTimeVN(l.time)) + '</td><td>' + esc(l.who) + '</td><td>' + esc(l.action) + '</td><td>' + esc(l.detail) + '</td></tr>';
      }).join('') || '<tr><td colspan="4">Chưa có hoạt động.</td></tr>';
    } catch (e) { S.toast(e.message, 'err'); }
  }

  boot().catch(function (e) { console.error(e); });
})();
