(async function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var CFG;
  try { CFG = await (await fetch('/api/config')).json(); }
  catch (e) { document.body.insertAdjacentText('afterbegin', '서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.'); return; }

  var WD = ['일', '월', '화', '수', '목', '금', '토'];
  var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
  var iso = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  function parseISO(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); if (!m) return null;
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    return (d.getFullYear() == +m[1] && d.getMonth() == +m[2] - 1 && d.getDate() == +m[3]) ? d : null;
  }
  function dayLabel(s) { var d = parseISO(s); return d ? s + ' (' + WD[d.getDay()] + ')' : s; }
  function range(slot) { var m = /^(\d{2}):(\d{2})$/.exec(slot || ''); return m ? slot + ' ~ ' + pad((+m[1] + 1) % 24) + ':' + m[2] : slot; }

  var earliest = new Date(); earliest.setHours(0, 0, 0, 0); earliest.setDate(earliest.getDate() + CFG.minDays);
  var earliestISO = iso(earliest);
  var maxD = new Date(); maxD.setDate(maxD.getDate() + CFG.maxAdvanceDays);
  $('#earliest').textContent = '오늘 예약하면 ' + (earliest.getMonth() + 1) + '월 ' + earliest.getDate() + '일 (' + WD[earliest.getDay()] + ')부터 고를 수 있어요. 수요일은 쉬는 날이에요.';

  /* ---------- 폼 준비 ---------- */
  function fill(sel, list) { sel.textContent = ''; list.forEach(function (v) { var o = document.createElement('option'); o.value = o.textContent = v; sel.appendChild(o); }); }
  function fillSlots(sel, list) { sel.textContent = ''; list.forEach(function (v) { var o = document.createElement('option'); o.value = v; o.textContent = range(v); sel.appendChild(o); }); }
  fill($('#c-course'), CFG.classCourses); fill($('#t-course'), CFG.tourCourses);
  var TOUR_INFO = {
    '얕은 곳 · 불가사리 마을 산책': '얕은 물에서 불가사리, 소라게, 말미잘, 꼬마 물고기를 만나요.',
    '중간 깊이 · 해초 숲 거북이 마중': '해초 숲 사이에서 바다거북과 가오리 떼를 만나요.',
    '깊은 곳 · 푸른 벼랑과 고래 노래': '깊은 바다에서만 볼 수 있는 푸른 벼랑과 고래를 만나요.'
  };
  function tourHint() { var v = $('#t-course').value; $('#t-hint').textContent = (TOUR_INFO[v] || '') + ' 얕은 곳부터 깊은 곳 순서예요. 수영 실력에 맞춰 골라 주세요.'; }
  $('#t-course').addEventListener('change', tourHint); tourHint();
  var itemsBox = $('#r-items');
  CFG.items.forEach(function (it, i) {
    var l = document.createElement('label'); l.className = 'pill';
    var c = document.createElement('input'); c.type = 'checkbox'; c.name = 'items'; c.value = it; c.id = 'r-item-' + i;
    l.appendChild(c); l.appendChild(document.createTextNode(' ' + it)); itemsBox.appendChild(l);
  });
  function slotsFor(type, dateStr) {
    var d = parseISO(dateStr) || earliest;
    return CFG.slots[type][CFG.winterMonths.indexOf(d.getMonth() + 1) >= 0 ? 'winter' : 'normal'];
  }
  [['class', 'c'], ['tour', 't']].forEach(function (p) {
    var date = $('#' + p[1] + '-date'), slot = $('#' + p[1] + '-slot');
    date.min = earliestISO; date.max = iso(maxD);
    fillSlots(slot, slotsFor(p[0], earliestISO));
    date.addEventListener('change', function () {
      var prev = slot.value; fillSlots(slot, slotsFor(p[0], date.value));
      if ($$('option', slot).some(function (o) { return o.value === prev; })) slot.value = prev;
    });
  });
  $('#r-date').min = earliestISO; $('#r-date').max = iso(maxD);

  /* ---------- 탭 ---------- */
  function showTab(name, scroll) {
    $$('.tabs button[data-tab]').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.tab === name)); });
    $$('form.panel').forEach(function (f) { f.hidden = f.dataset.type !== name; });
    $('#result').hidden = true;
    if (scroll) $('#apply').scrollIntoView({ behavior: 'smooth' });
  }
  $$('.tabs button[data-tab]').forEach(function (b) { b.addEventListener('click', function () { showTab(b.dataset.tab, false); }); });
  $$('[data-tab-go]').forEach(function (b) { b.addEventListener('click', function () { showTab(b.dataset.tabGo, true); }); });

  /* ---------- 화면 전환 ---------- */
  function showView(v) {
    $('#home').hidden = v !== 'home'; $('#roster-view').hidden = v !== 'roster';
    if (v === 'roster') { loadRoster(); window.scrollTo(0, 0); }
  }
  $$('[data-view]').forEach(function (a) {
    a.addEventListener('click', function (e) { e.preventDefault(); showView(a.dataset.view); if (a.dataset.view === 'home') window.scrollTo(0, 0); });
  });
  $$('[data-go]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      if ($('#home').hidden) showView('home');
      var t = document.getElementById(a.dataset.go); if (t) t.scrollIntoView({ behavior: 'smooth' });
    });
  });
  if (location.hash === '#roster') showView('roster');

  /* ---------- 예약하기 ---------- */
  function val(form, name) { var el = form.elements[name]; return el ? String(el.value || '').trim() : ''; }
  function mark(el, bad) { if (el && el.classList) el.classList.toggle('invalid', !!bad); }

  $$('form.panel').forEach(function (form) {
    form.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var type = form.dataset.type, err = $('.err', form); err.textContent = '';
      $$('.invalid', form).forEach(function (e) { e.classList.remove('invalid'); });
      var problems = [];
      function need(cond, el, msg) { if (!cond) { mark(el, true); problems.push(msg); } }

      var name = val(form, 'name'); need(name.length > 0, form.elements.name, '이름(성명)을 적어 주세요.');
      var d = parseISO(val(form, 'date'));
      need(!!d, form.elements.date, '날짜를 골라 주세요.');
      if (d) {
        need(d >= earliest, form.elements.date, '예약은 최소 2일 전에 신청해야 해요. ' + (earliest.getMonth() + 1) + '월 ' + earliest.getDate() + '일 이후로 골라 주세요.');
        need(d.getDay() !== CFG.closedWeekday, form.elements.date, '수요일은 쉬는 날이에요. 다른 날짜를 골라 주세요.');
      }
      var body = { type: type, name: name, date: val(form, 'date'), website: val(form, 'website') };
      if (type === 'rental') {
        body.items = $$('input[name=items]:checked', form).map(function (c) { return c.value; });
        need(body.items.length > 0, $('[data-group=items]', form), '빌려갈 품목을 하나 이상 골라 주세요.');
        body.size = val(form, 'size');
      } else {
        body.species = val(form, 'species'); need(body.species.length > 0, form.elements.species, '종족을 적어 주세요.');
        var lr = $('input[name=learned]:checked', form), lv = $('input[name=level]:checked', form);
        need(!!lr, $('[data-group=learned]', form), '수영을 배운 적이 있는지 골라 주세요.');
        need(!!lv, $('[data-group=level]', form), '수영 실력(상·중·하)을 골라 주세요.');
        body.learned = lr ? lr.value : ''; body.level = lv ? lv.value : '';
        body.note = val(form, 'note'); need(body.note.length > 0, form.elements.note, "기타 사항을 적어 주세요. 없으면 '없음'이라고 적어 주세요.");
        body.course = val(form, 'course'); body.slot = val(form, 'slot'); need(!!body.slot, form.elements.slot, '시간을 골라 주세요.');
      }
      if (problems.length) {
        err.textContent = problems[0];
        var bad = $('.invalid', form); if (bad && bad.scrollIntoView) bad.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return;
      }

      var btn = $('button[type=submit]', form); btn.disabled = true;
      try {
        var res = await fetch('/api/reservations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        var data = await res.json().catch(function () { return {}; });
        if (!res.ok) { err.textContent = data.error || '예약에 실패했어요. 잠시 후 다시 시도해 주세요.'; return; }
        form.reset(); tourHint();
        if (type !== 'rental') fillSlots($('#' + (type === 'class' ? 'c' : 't') + '-slot'), slotsFor(type, earliestISO));
        $('#res-code').textContent = data.code;
        var box = $('#result'); box.dataset.type = type; box.hidden = false; form.hidden = true;
        box.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (e) {
        err.textContent = '연결에 실패했어요. 잠시 후 다시 시도해 주세요.';
      } finally { btn.disabled = false; }
    });
  });
  $('#again').addEventListener('click', function () { var t = $('#result').dataset.type || 'class'; showTab(t, false); $('#form-' + t).scrollIntoView({ behavior: 'smooth' }); });
  $('#to-roster').addEventListener('click', function () { showView('roster'); });

  /* ---------- 예약자 명단 ---------- */
  var token = null; try { token = sessionStorage.getItem('hj-token'); } catch (e) {}
  var items = [], admin = false, filter = '';

  async function api(path, opts) {
    opts = opts || {};
    var headers = { 'Content-Type': 'application/json' };
    if (opts.auth && token) headers.Authorization = 'Bearer ' + token;
    var res = await fetch(path, { method: opts.method || 'GET', headers: headers, body: opts.body });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) { var e = new Error(data.error || '요청에 실패했어요.'); e.status = res.status; throw e; }
    return data;
  }
  function setToken(t) { token = t; try { if (t) sessionStorage.setItem('hj-token', t); else sessionStorage.removeItem('hj-token'); } catch (e) {} }

  async function loadRoster() {
    try {
      if (token) {
        try { items = (await api('/api/admin/reservations', { auth: true })).items; admin = true; }
        catch (e) { setToken(null); admin = false; items = (await api('/api/reservations')).items; }
      } else { admin = false; items = (await api('/api/reservations')).items; }
      $('#load-err').hidden = true;
    } catch (e) { $('#load-err').hidden = false; }
    $('#staff-login').hidden = admin; $('#staff-tools').hidden = !admin;
    renderRoster();
  }

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function line(parts) { var d = el('div', 'what'); parts.forEach(function (p) { d.appendChild(typeof p === 'string' ? document.createTextNode(p) : p); }); return d; }

  function renderRoster() {
    var list = items.filter(function (r) { return !filter || r.type === filter; })
      .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.slot < b.slot ? -1 : a.slot > b.slot ? 1 : 0); });
    $('#count').textContent = '전체 ' + items.length + '건 중 ' + list.length + '건';
    $('#empty').hidden = list.length > 0;
    var ul = $('#list'); ul.textContent = '';
    list.forEach(function (r) {
      var li = el('li', 'item'), main = el('div', 'main');
      var who = el('div', 'who', r.name); if (r.species) who.appendChild(el('small', null, r.species));
      main.appendChild(who);
      main.appendChild(el('div', 'when', dayLabel(r.date) + (r.type === 'rental' ? ' 대여' : ' ' + range(r.slot))));
      var tag = el('span', 'tag', CFG.types[r.type]);
      if (r.type === 'rental') {
        main.appendChild(line([tag, (r.items || []).join(', ')].concat(r.size ? [el('em', null, ' · 사이즈 ' + r.size)] : [])));
      } else {
        main.appendChild(line([tag, r.course]));
        if (admin) {
          main.appendChild(line(['배운 적 ' + r.learned + ' · 실력 ' + r.level]));
          main.appendChild(line([el('em', null, '기타: '), r.note]));
        }
      }
      var side = el('div', 'side');
      if (admin) {
        var sel = document.createElement('select'); sel.id = 'st-' + r.id; sel.setAttribute('aria-label', r.name + ' 상태'); sel.dataset.st = r.status;
        ['접수', '확정', '취소'].forEach(function (o) { var op = el('option', null, o); op.value = o; if (o === r.status) op.selected = true; sel.appendChild(op); });
        sel.addEventListener('change', async function () {
          try { await api('/api/admin/reservations/' + r.id, { method: 'PATCH', auth: true, body: JSON.stringify({ status: sel.value }) }); r.status = sel.value; sel.dataset.st = r.status; }
          catch (e) { sel.value = r.status; }
        });
        var del = el('button', 'link', '삭제'); del.type = 'button';
        del.addEventListener('click', async function () {
          if (del.dataset.sure) {
            try { await api('/api/admin/reservations/' + r.id, { method: 'DELETE', auth: true }); items = items.filter(function (x) { return x.id !== r.id; }); renderRoster(); } catch (e) {}
            return;
          }
          del.dataset.sure = '1'; del.textContent = '한 번 더 누르면 삭제돼요'; del.classList.add('warn');
          setTimeout(function () { del.dataset.sure = ''; del.textContent = '삭제'; del.classList.remove('warn'); }, 3000);
        });
        side.appendChild(sel); side.appendChild(del);
      } else {
        var st = el('span', 'st', r.status); st.dataset.s = r.status; side.appendChild(st);
      }
      li.appendChild(main); li.appendChild(side); ul.appendChild(li);
    });
  }

  $$('#seg button').forEach(function (b) {
    b.addEventListener('click', function () {
      filter = b.dataset.f; $$('#seg button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); renderRoster();
    });
  });
  $('#refresh').addEventListener('click', loadRoster);
  setInterval(function () { if (!$('#roster-view').hidden && !document.hidden) loadRoster(); }, 30000);

  /* 카냐 로그인 */
  $('#login-form').addEventListener('submit', async function (e) {
    e.preventDefault(); var msg = $('#login-msg'); msg.textContent = '';
    try {
      var r = await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ password: $('#pw').value }) });
      setToken(r.token); $('#pw').value = ''; await loadRoster();
    } catch (err) { msg.textContent = err.message; }
  });
  $('#logout').addEventListener('click', function () { setToken(null); loadRoster(); });
  $('#csv').addEventListener('click', function () {
    var safe = function (v) { v = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; };
    var head = ['예약번호', '종류', '이름', '종족', '날짜', '시간', '내용', '수영 경험', '수영 실력', '기타 사항', '상태', '접수시각'];
    var lines = [head.map(safe).join(',')];
    items.forEach(function (r) {
      lines.push([r.code, CFG.types[r.type], r.name, r.species, r.date, r.type === 'rental' ? '' : r.slot, r.type === 'rental' ? (r.items || []).join(', ') + (r.size ? ' / ' + r.size : '') : r.course, r.learned, r.level, r.note, r.status, r.createdAt].map(safe).join(','));
    });
    var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'reservations.csv'; a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });
})();
