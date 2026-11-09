/* Dùng chung cho Dashboard và CMS — TT.Marcom SHS
 * - Gọi API Apps Script, giữ phiên đăng nhập (6 giờ)
 * - Màn hình đăng nhập bằng key
 * - Modal, thông báo, hiệu ứng tải
 * - Chuẩn hóa ngày/số và đọc file CSV chuyển đổi
 */
(function () {
  'use strict';

  var SESSION_KEY = 'shs_mkt_session';
  var API_KEY = 'shs_mkt_api_url';

  function store(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { } }
  function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

  function apiUrl() {
    var cfg = (window.SHS_CONFIG && window.SHS_CONFIG.apiUrl) || '';
    return (load(API_KEY) || cfg || '').trim();
  }

  function getSession() {
    try {
      var s = JSON.parse(load(SESSION_KEY) || 'null');
      if (s && s.token && s.exp > Date.now()) return s;
    } catch (e) { }
    return null;
  }
  function setSession(token, user, ttlSec) {
    store(SESSION_KEY, JSON.stringify({ token: token, user: user, exp: Date.now() + (ttlSec || 21600) * 1000 - 60000 }));
  }
  function clearSession() { store(SESSION_KEY, null); }

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ---------------- API ---------------- */
  function ApiError(msg, code) { this.message = msg; this.code = code; }
  ApiError.prototype = Object.create(Error.prototype);

  async function rawCall(body) {
    var url = apiUrl();
    if (!url) throw new ApiError('Chưa cấu hình địa chỉ máy chủ API.', 'config');
    var res, text;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // tránh preflight CORS với Apps Script
        body: JSON.stringify(body),
        redirect: 'follow'
      });
      text = await res.text();
    } catch (e) {
      throw new ApiError('Không kết nối được máy chủ. Kiểm tra mạng hoặc URL API.', 'network');
    }
    var data;
    try { data = JSON.parse(text); } catch (e) {
      throw new ApiError('Máy chủ API phản hồi không đúng định dạng. Kiểm tra URL triển khai và quyền truy cập "Bất kỳ ai" của Apps Script.', 'bad_response');
    }
    if (!data.ok) throw new ApiError(data.error || 'Có lỗi xảy ra.', data.code || 'error');
    return data;
  }

  async function call(action, payload) {
    var s = getSession();
    var body = Object.assign({}, payload || {}, { action: action, token: s ? s.token : '' });
    try {
      return await rawCall(body);
    } catch (e) {
      if (e.code === 'session') {
        clearSession();
        toast('Phiên đăng nhập đã hết. Vui lòng đăng nhập lại.', 'err');
        setTimeout(function () { location.reload(); }, 1200);
      }
      throw e;
    }
  }

  /* ---------------- Đăng nhập ---------------- */
  function showLogin(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var wrap = document.createElement('div');
      wrap.className = 'auth-wrap';
      var needApi = !apiUrl();
      wrap.innerHTML =
        '<form class="auth-card" autocomplete="off">' +
        '<img src="assets/logo.png" alt="SHS">' +
        '<h1>' + esc(opts.title || 'Marketing Dashboard') + '</h1>' +
        '<p class="lead">' + esc(opts.lead || 'Nhập key truy cập do TT.Marcom cấp để tiếp tục.') + '</p>' +
        '<div class="auth-api' + (needApi ? ' show' : '') + '">' +
        '<div class="row"><label for="authApi">Địa chỉ máy chủ API</label>' +
        '<input id="authApi" type="url" placeholder="https://script.google.com/macros/s/…/exec" value="' + esc(apiUrl()) + '">' +
        '<small>Dán URL Web app của Apps Script. Chỉ cần nhập một lần trên mỗi trình duyệt.</small></div></div>' +
        '<div class="row"><label for="authKey">Key truy cập</label>' +
        '<input id="authKey" type="password" placeholder="SHS-XXXX-XXXX-XXXX-XXXX" autofocus></div>' +
        '<button class="primary" type="submit">Đăng nhập</button>' +
        '<div class="auth-err" id="authErr" role="alert"></div>' +
        '<div class="auth-foot"><span>TT.Marcom SHS</span><a id="authApiToggle">Cấu hình máy chủ</a></div>' +
        '</form>';
      document.body.appendChild(wrap);
      var form = wrap.querySelector('form');
      var btn = form.querySelector('button.primary');
      var err = wrap.querySelector('#authErr');
      wrap.querySelector('#authApiToggle').onclick = function () { wrap.querySelector('.auth-api').classList.toggle('show'); };
      setTimeout(function () { (needApi ? wrap.querySelector('#authApi') : wrap.querySelector('#authKey')).focus(); }, 50);
      form.onsubmit = async function (ev) {
        ev.preventDefault();
        err.textContent = '';
        var api = wrap.querySelector('#authApi').value.trim();
        var key = wrap.querySelector('#authKey').value.trim();
        if (api) store(API_KEY, api);
        if (!apiUrl()) { err.textContent = 'Vui lòng nhập địa chỉ máy chủ API.'; wrap.querySelector('.auth-api').classList.add('show'); return; }
        if (!key) { err.textContent = 'Vui lòng nhập key.'; return; }
        btn.disabled = true; btn.textContent = 'Đang kiểm tra…';
        try {
          var r = await rawCall({ action: 'login', key: key });
          setSession(r.token, r.user, r.expiresIn);
          wrap.remove();
          resolve(r.user);
        } catch (e) {
          err.textContent = e.message;
          if (e.code === 'config' || e.code === 'network' || e.code === 'bad_response') wrap.querySelector('.auth-api').classList.add('show');
        } finally {
          btn.disabled = false; btn.textContent = 'Đăng nhập';
        }
      };
    });
  }

  async function requireLogin(opts) {
    var s = getSession();
    if (s) return s.user;
    return showLogin(opts);
  }

  async function logout() {
    try { await rawCall({ action: 'logout', token: (getSession() || {}).token }); } catch (e) { }
    clearSession();
    location.reload();
  }

  function userChip(user, extraHtml) {
    var role = user.owner ? 'Chủ hệ thống' : (user.role === 'admin' ? 'Admin' : 'Viewer');
    var el = document.createElement('div');
    el.className = 'user-chip';
    el.innerHTML = '<b>' + esc(user.name) + '</b><span class="role' + (user.role === 'admin' ? '' : ' viewer') + '">' + role + '</span>' +
      (extraHtml || '') + '<button type="button" data-act="logout">Đăng xuất</button>';
    el.querySelector('[data-act=logout]').onclick = logout;
    return el;
  }

  /* ---------------- Modal / thông báo / tải ---------------- */
  function modal(o) {
    return new Promise(function (resolve) {
      var bg = document.createElement('div');
      bg.className = 'ui-modal-bg';
      var buttons = o.buttons || [{ label: 'Đóng', value: null }];
      bg.innerHTML = '<div class="ui-modal" role="dialog" aria-modal="true"><h3>' + esc(o.title || '') + '</h3><div class="body">' + (o.html || esc(o.text || '')) +
        '</div><div class="acts">' + buttons.map(function (b, i) {
          return '<button type="button" class="ui-btn ' + (b.cls || '') + '" data-i="' + i + '">' + esc(b.label) + '</button>';
        }).join('') + '</div></div>';
      document.body.appendChild(bg);
      function close(v) { bg.remove(); document.removeEventListener('keydown', onKey); resolve(v); }
      function onKey(e) { if (e.key === 'Escape') close(null); }
      document.addEventListener('keydown', onKey);
      bg.querySelectorAll('.acts button').forEach(function (b) {
        b.onclick = function () {
          var def = buttons[+b.dataset.i];
          if (def.collect) close(def.collect(bg)); else close(def.value);
        };
      });
      bg.addEventListener('click', function (e) { if (e.target === bg && !o.sticky) close(null); });
      if (o.onOpen) o.onOpen(bg);
      var first = bg.querySelector('.body input, .body select, .body textarea') || bg.querySelector('.acts .primary');
      if (first) setTimeout(function () { first.focus(); }, 30);
    });
  }

  function confirmBox(title, html, okLabel, danger) {
    return modal({ title: title, html: html, buttons: [{ label: 'Hủy', value: false }, { label: okLabel || 'Đồng ý', value: true, cls: danger ? 'danger' : 'primary' }] });
  }

  var toastBox;
  function toast(msg, kind, ms) {
    if (!toastBox) { toastBox = document.createElement('div'); toastBox.className = 'ui-toast-box'; toastBox.setAttribute('aria-live', 'polite'); document.body.appendChild(toastBox); }
    var t = document.createElement('div');
    t.className = 'ui-toast ' + (kind || '');
    t.textContent = msg;
    toastBox.appendChild(t);
    setTimeout(function () { t.remove(); }, ms || (kind === 'err' ? 6000 : 3200));
  }

  var loadingEl;
  function loading(on, text) {
    if (on) {
      if (!loadingEl) { loadingEl = document.createElement('div'); loadingEl.className = 'ui-loading'; document.body.appendChild(loadingEl); }
      loadingEl.innerHTML = '<span>' + esc(text || 'Đang tải dữ liệu…') + '</span>';
    } else if (loadingEl) { loadingEl.remove(); loadingEl = null; }
  }

  /* ---------------- Ngày & số ---------------- */
  function pad2(n) { n = String(n); return n.length < 2 ? '0' + n : n; }

  /** Về 'YYYY-MM-DD'. Nhận Date, 'YYYY-MM-DD…', 'DD/MM/YYYY', số seri Excel. */
  function toDateStr(v) {
    if (v === null || v === undefined || v === '') return '';
    if (v instanceof Date) return isNaN(v) ? '' : v.getFullYear() + '-' + pad2(v.getMonth() + 1) + '-' + pad2(v.getDate());
    if (typeof v === 'number') {
      if (v > 20000 && v < 80000) { var d = new Date(Math.round((v - 25569) * 86400000)); return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate()); }
      return '';
    }
    var s = String(v).trim(), m;
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return m[1] + '-' + pad2(+m[2]) + '-' + pad2(+m[3]);
    if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/))) return m[3] + '-' + pad2(+m[2]) + '-' + pad2(+m[1]);
    return '';
  }
  function parseDate(v) { var s = toDateStr(v); if (!s) return null; var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function fmtDateVN(s) { s = toDateStr(s); if (!s) return ''; var p = s.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
  function fmtDateTimeVN(iso) {
    if (!iso) return '';
    var m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
    return m ? m[3] + '/' + m[2] + '/' + m[1] + ' ' + m[4] + ':' + m[5] : String(iso);
  }

  /** Số kiểu Việt Nam hoặc quốc tế → number; rỗng/không hợp lệ → null. */
  function toNum(v) {
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

  function isoWeek(d) {
    var t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    var n = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - n);
    var y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil(((t - y) / 86400000 + 1) / 7);
  }

  /* ---------------- Đọc CSV chuyển đổi ----------------
   * Nhận diện cột theo từ khóa (bỏ dấu), chạy được với file 10 cột cũ và 16 cột mới.
   * Trả về { rows:[{date:'YYYY-MM-DD', tot, mkt, …}], columns:{…}, warnings:[…] } */
  function parseConvCsv(text) {
    if (typeof XLSX === 'undefined') throw new Error('Thiếu thư viện đọc CSV.');
    var wb = XLSX.read(text.replace(/^﻿/, ''), { type: 'string', raw: true });
    var arr = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', blankrows: false, raw: true });
    if (!arr.length) throw new Error('File rỗng.');
    var norm = function (s) {
      return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]/g, '');
    };
    var head = arr[0].map(norm);
    var find = function () {
      for (var t = 0; t < arguments.length; t++) { var i = head.findIndex(arguments[t]); if (i >= 0) return i; }
      return -1;
    };
    var isNew = function (h) { return h.indexOf('khmoi') >= 0 || h.indexOf('khachhangmoi') >= 0; };
    var C = {
      date: find(function (h) { return h.indexOf('ngaythang') >= 0; }, function (h) { return h.indexOf('ngay') === 0; }, function (h) { return h === 'date'; }),
      tot: find(function (h) { return h.indexOf('taikhoanmomoitong') >= 0; }, function (h) { return h.indexOf('momoitong') >= 0; }, function (h) { return h.indexOf('sltaikhoanmomoi') >= 0; }, function (h) { return h.indexOf('momoi') >= 0 && h.indexOf('nav') < 0; }),
      mkt: find(function (h) { return h.indexOf('kenhonline') >= 0; }, function (h) { return h.indexOf('onlinemkt') >= 0 && h.indexOf('nav') < 0 && h.indexOf('slkh') < 0; }),
      tvdt: find(function (h) { return h === 'kenhtvdt'; }, function (h) { return h.indexOf('kenhtvdt') >= 0; }),
      counter: find(function (h) { return h === 'kenhquay'; }, function (h) { return h.indexOf('kenhquay') >= 0; }),
      act: find(function (h) { return h.indexOf('kichhoat') >= 0; }),
      paid: find(function (h) { return h.indexOf('tkdanoptien') >= 0; }, function (h) { return h.indexOf('noptien') >= 0 && h.indexOf('slkh') < 0; }),
      debt: find(function (h) { return h.indexOf('duno') >= 0; }),
      navNew: find(function (h) { return h.indexOf('nav') >= 0 && isNew(h); }),
      nav: find(function (h) { return h === 'tongnav'; }, function (h) { return h.indexOf('tongnav') >= 0 && !isNew(h); }),
      navMkt: find(function (h) { return h.indexOf('nav') >= 0 && !isNew(h) && h.indexOf('tongnav') < 0 && h.indexOf('online') >= 0; }),
      navTvdt: find(function (h) { return h.indexOf('nav') >= 0 && !isNew(h) && h.indexOf('tongnav') < 0 && h.indexOf('tvdt') >= 0; }),
      navQuay: find(function (h) { return h.indexOf('nav') >= 0 && !isNew(h) && h.indexOf('tongnav') < 0 && h.indexOf('quay') >= 0; }),
      paidMkt: find(function (h) { return h.indexOf('noptien') >= 0 && h.indexOf('slkh') >= 0 && h.indexOf('online') >= 0; }),
      paidTvdt: find(function (h) { return h.indexOf('noptien') >= 0 && h.indexOf('slkh') >= 0 && h.indexOf('tvdt') >= 0; }),
      paidQuay: find(function (h) { return h.indexOf('noptien') >= 0 && h.indexOf('slkh') >= 0 && h.indexOf('quay') >= 0; })
    };
    if (C.date < 0 || C.tot < 0) throw new Error('Không tìm thấy cột "Ngày/tháng" hoặc "Số lượng tài khoản mở mới tổng trong ngày".');
    var rows = [], seen = {}, dup = 0, badDate = 0;
    for (var i = 1; i < arr.length; i++) {
      var r = arr[i];
      if (!r || r.every(function (x) { return x === '' || x === null; })) continue;
      var d = toDateStr(r[C.date]);
      if (!d) { badDate++; continue; }
      if (seen[d]) { dup++; continue; }
      seen[d] = 1;
      var o = { date: d };
      Object.keys(C).forEach(function (k) { if (k !== 'date') o[k] = C[k] >= 0 ? toNum(r[C[k]]) : null; });
      rows.push(o);
    }
    rows.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var warnings = [];
    if (dup) warnings.push(dup + ' ngày bị trùng — chỉ giữ dòng đầu tiên.');
    if (badDate) warnings.push(badDate + ' dòng không đọc được ngày — đã bỏ qua.');
    var mis = rows.filter(function (o) { return o.mkt !== null && o.tvdt !== null && o.counter !== null && o.tot !== (o.mkt + o.tvdt + o.counter); }).length;
    if (mis) warnings.push(mis + ' ngày có Tổng TK mở mới ≠ Online + TVĐT + Quầy.');
    var misNav = rows.filter(function (o) { return o.navNew !== null && o.navMkt !== null && o.navTvdt !== null && Math.abs(o.navNew - (o.navMkt + o.navTvdt + (o.navQuay || 0))) > 1; }).length;
    if (misNav) warnings.push(misNav + ' ngày có NAV KH mới ≠ tổng NAV các kênh.');
    var missing = Object.keys(C).filter(function (k) { return C[k] < 0; });
    return { rows: rows, columns: C, missing: missing, warnings: warnings };
  }

  window.SHS = {
    api: call, rawCall: rawCall, apiUrl: apiUrl, requireLogin: requireLogin, logout: logout, getSession: getSession,
    userChip: userChip, modal: modal, confirm: confirmBox, toast: toast, loading: loading, esc: esc,
    toDateStr: toDateStr, parseDate: parseDate, fmtDateVN: fmtDateVN, fmtDateTimeVN: fmtDateTimeVN, toNum: toNum, isoWeek: isoWeek,
    parseConvCsv: parseConvCsv
  };
})();
