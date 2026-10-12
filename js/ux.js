/* Café Mood — UX layer (v28): undo, screen-reader announcements, haptics, offline / error / loading states,
   first-run intro + coach marks. Everything here is optional: if this file fails to load the app still works. */
(function () {
  window.CM = window.CM || {};
  const S = CM.store, D = CM.data, E = CM.engine;
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  };
  let api = {};   // { H, toast, render, go, openSheet } from app.js

  /* ---------- 1) Screen-reader announcements (one polite live region for the whole app) ---------- */
  let live, liveT;
  function say(msg) {
    if (!msg) return;
    live = live || document.body.appendChild(Object.assign(document.createElement('div'), { className: 'sr', id: 'sr-live' }));
    live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite');
    live.textContent = '';
    setTimeout(() => { live.textContent = msg; }, 60);   // empty → text is what makes screen readers speak it again
  }
  function sayLater(msg, ms) { clearTimeout(liveT); liveT = setTimeout(() => say(msg), ms || 700); }   // typing: speak once the user pauses

  /* ---------- 2) Undo instead of "are you sure?" ---------- */
  // act → message. A snapshot of the whole state is taken before the action runs; "เลิกทำ" puts it back.
  const UNDO = {
    'ev-delete': 'ลบอีเว้นท์แล้ว', 'del-contact': 'ลบข้อความแล้ว', 'avatar-clear': 'ลบรูปโปรไฟล์แล้ว', 'do-reset': 'ล้างข้อมูลทั้งหมดแล้ว',
    'trip-del': 'ลบทริปแล้ว', 'tk-del': 'ลบตั๋วแล้ว', 'plus-cancel-do': 'ยกเลิก Plus แล้ว', 'student-clear': 'ลบส่วนลดนักศึกษาแล้ว', 'duo-remove': 'ถอนคู่หูแล้ว',
    'st-moment-del': 'ลบ Café Moment แล้ว', 'cd-del': 'ลบโค้ดแล้ว', 'st-led-del': 'ลบรายการแล้ว', 'st-pick-clear': 'ล้างเมนูแนะนำแล้ว', 'st-dph-clear': 'ล้างรูปแล้ว',
    'logo-clear': 'ลบโลโก้แล้ว', 'shop-banner-clear': 'ลบแบนเนอร์แล้ว', 'owner-photo-clear': 'ลบรูปเจ้าของแล้ว', 'ev-banner-clear': 'ลบแบนเนอร์แล้ว', 'op-downgrade-do': 'กลับเป็น Starter แล้ว'
  };
  // confirm-only dialogs are skipped: the button does the action straight away and offers undo
  const SKIP_CONFIRM = { 'confirm-reset': 'do-reset', 'op-downgrade': 'op-downgrade-do' };

  let bar, barT;
  function undoBar(msg, onUndo) {
    bar = bar || document.body.appendChild(Object.assign(document.createElement('div'), { className: 'undo-bar', id: 'undoBar' }));
    bar.setAttribute('role', 'status');
    bar.innerHTML = '<span></span><button type="button" class="btn text sm">เลิกทำ</button>';
    bar.firstChild.textContent = msg;
    bar.lastChild.onclick = () => { hideBar(); onUndo(); };
    const t = $('#toast'); if (t) t.classList.remove('show');   // one message at a time
    bar.classList.add('show'); clearTimeout(barT); barT = setTimeout(hideBar, 7000);
  }
  function hideBar() { if (bar) bar.classList.remove('show'); }

  function undoable(act, run) {
    const snap = S.snapshot(), h0 = location.hash;
    const out = run();
    undoBar(UNDO[act], () => {
      try { S.restore(snap); } catch (e) { api.toast('เลิกทำไม่สำเร็จ'); return; }
      if (location.hash !== h0) api.go(h0); else api.render(true);   // e.g. "ล้างข้อมูล" had sent us to the welcome page
      say('เลิกทำแล้ว'); api.toast('เลิกทำแล้ว');
    });
    return out;
  }

  /* ---------- 3) Haptics (web: vibrate; a Capacitor / native shell: real haptics) ---------- */
  const PAT = { tap: 8, stamp: [14, 50, 26], warn: [30, 40, 30] };
  const hapticOn = () => ls.get('cafemood.haptic') !== 'off';
  function haptic(kind) {
    if (!hapticOn()) return;
    try {
      const cap = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics;   // shortcut: add @capacitor/haptics when this becomes a real app
      if (cap) { cap.notification ? cap.notification({ type: kind === 'warn' ? 'WARNING' : 'SUCCESS' }) : cap.vibrate(); return; }
      if (navigator.vibrate) navigator.vibrate(PAT[kind] || PAT.tap);
    } catch (e) { /* unsupported */ }
  }

  /* ---------- 4) Offline / error / not-found / slow-load ---------- */
  const sim = { slow: false, offline: false, error: false, boot: false };
  const offline = () => sim.offline || navigator.onLine === false;
  let net;
  function netBanner() {
    net = net || document.body.appendChild(Object.assign(document.createElement('div'), { className: 'net-banner', id: 'netBanner' }));
    net.setAttribute('role', 'status');
    if (offline()) { net.innerHTML = '<span>ออฟไลน์อยู่ — ร้านที่โหลดไว้ยังดูได้ อากาศใช้ค่าล่าสุด</span><button type="button" class="btn text sm" data-act="net-retry">ลองใหม่</button>'; net.classList.add('show'); }
    else net.classList.remove('show');
  }
  window.addEventListener('online', () => { netBanner(); say('กลับมาออนไลน์แล้ว'); if (CM.weather) CM.weather.refresh(); });
  window.addEventListener('offline', () => { netBanner(); say('ออฟไลน์อยู่'); });

  const page = (ic, title, body, btns) => ({ nav: true, html: '<section class="pad state-page rise"><div class="state-ic" aria-hidden="true">' + CM.icon(ic, 34) + '</div><h1 class="display sm">' + title + '</h1><p class="muted">' + body + '</p>' + btns + '</section>' });
  const errorView = () => page('cloud-rain', 'ขอโทษนะ มีบางอย่างสะดุด', 'หน้านี้โหลดไม่สำเร็จ ข้อมูลของคุณยังอยู่ครบ ลองอีกครั้ง หรือกลับไปหน้าแรกก็ได้', '<button class="btn primary lg" data-act="ux-retry">ลองอีกครั้ง</button><a class="btn ghost lg" href="#/home">กลับหน้าแรก</a>');
  const offlineView = (what) => page('cloud', 'ตอนนี้ออฟไลน์อยู่', what + 'ต้องใช้อินเทอร์เน็ต — ส่วนที่เหลือของแอปยังใช้ได้ตามปกติ', '<button class="btn primary lg" data-act="net-retry">ลองใหม่</button><a class="btn ghost lg" href="#/discover">ดูคาเฟ่ที่โหลดไว้แล้ว</a>');
  const notFound = (what) => page('search', 'ไม่พบ' + what, 'ลิงก์อาจเก่าไปหรือร้านถูกนำออกแล้ว', '<a class="btn primary lg" href="#/home">กลับหน้าแรก</a><a class="btn ghost lg" href="#/search">ค้นหาร้านอื่น</a>');

  // Called at the top of render(): returns a replacement view (or null to carry on) for the simulated / real bad states
  const NET_ROUTES = { map: 'แผนที่ ' };
  function guard(route) {
    if (sim.error && route !== 'welcome') { sim.error = false; return errorView(); }
    if (offline() && NET_ROUTES[route]) return offlineView(NET_ROUTES[route]);
    return null;
  }

  // Skeleton: only shown while we are really waiting (first weather lookup, or the "slow" test switch)
  const skelRoutes = ['home', 'results', 'discover', 'hidden', 'drink', 'lens', 'search'];
  const skeleton = () => ({ nav: true, html: '<section class="pad skel" aria-busy="true"><p class="sr" role="status">กำลังโหลด…</p><div class="sk sk-h"></div><div class="sk sk-line w60"></div><div class="sk-tiles"><i class="sk"></i><i class="sk"></i><i class="sk"></i><i class="sk"></i></div><div class="sk sk-hero"></div><div class="sk-row"><i class="sk"></i><div><div class="sk sk-line"></div><div class="sk sk-line w60"></div></div></div><div class="sk-row"><i class="sk"></i><div><div class="sk sk-line"></div><div class="sk sk-line w60"></div></div></div></section>' });
  const wantSkeleton = (route) => (sim.slow || sim.boot) && skelRoutes.includes(route);

  /* ---------- 5) First-run intro (3 short pages, real engine output as the preview) ---------- */
  const SAMPLE = (kind, hour, night) => ({ kind, night: !!night, hour, pm: null, label: '', icon: '' });
  function sampleTop(moodIds, ctx) {
    if (!D.CAFES.length) return null;
    const ses = { profile: null, mood: { moods: moodIds, boosts: {}, hidden: false, text: '' }, ctx };
    const open = E.rank(ses).filter((s) => s.open.open);
    return open[0] || E.rank(ses)[0];
  }
  const pick = (s, tag) => s ? '<div class="in-pick"><b>' + esc(s.cafe.name) + '</b><small>' + esc(s.cafe.area) + ' · ' + esc(s.reasons[0]) + '</small><span class="in-pct" aria-label="ตรงกัน ' + s.match + ' เปอร์เซ็นต์">' + s.match + '%</span></div>' : '';

  function introView(n) {
    n = parseInt(n, 10);
    if (!(n >= 0 && n <= 2)) { location.replace('#/intro/0'); return null; }
    // a mood whose best café really changes between a rainy and a sunny day, so the preview shows the point
    const mood = D.MOODS.find((m) => { const a = sampleTop([m.id], SAMPLE('rain', 16)), b = sampleTop([m.id], SAMPLE('sunny', 14)); return a && b && a.cafe.id !== b.cafe.id; }) || D.MOODS[0];
    let art, h, p;
    if (n === 0) {
      const top = sampleTop([mood.id], SAMPLE('cloudy', 15));
      h = 'บอก mood ของวันนี้'; p = 'แตะเลือก mood สั้น ๆ หรือเล่าเป็นประโยค — ไม่ต้องกรอกฟอร์ม';
      art = '<div class="in-tiles">' + D.MOODS.filter((m, i) => i < 3 || m === mood).slice(0, 4).map((m) => '<span class="in-tile' + (m === mood ? ' on' : '') + '">' + CM.icon(m.icon, 20) + m.thShort + '</span>').join('') + '</div><p class="in-arrow" aria-hidden="true">↓</p>' + pick(top);
    } else if (n === 1) {
      const a = sampleTop([mood.id], SAMPLE('rain', 16)), b = sampleTop([mood.id], SAMPLE('sunny', 14));
      h = 'อากาศเปลี่ยน คำตอบก็เปลี่ยน'; p = 'เรามองอากาศให้เอง — mood เดิม แต่วันฝนกับวันแดดได้คนละร้าน';
      art = '<div class="in-cmp"><div><span class="in-lbl">' + CM.icon('cloud-rain', 16) + ' ฝนตก</span>' + pick(a) + '</div><div><span class="in-lbl">' + CM.icon('sun', 16) + ' แดดดี</span>' + pick(b) + '</div></div>';
    } else {
      const ar = D.ARCHETYPES[0];
      h = 'Quiz 10 ข้อ ใช้เวลาไม่ถึงนาที'; p = 'เพื่อให้แม่นขึ้นตามนิสัยคาเฟ่ของคุณ จะข้ามไปก่อนแล้วทำทีหลังก็ได้';
      art = '<div class="in-persona">' + CM.icon(ar.icon, 34) + '<b>' + esc(ar.name) + '</b><small>' + esc(ar.th) + '</small></div><p class="muted small center">ตัวอย่างผลลัพธ์ — ของคุณอาจเป็นอีกแบบ</p>';
    }
    const dots = [0, 1, 2].map((i) => '<i class="' + (i === n ? 'on' : '') + '"></i>').join('');
    const last = n === 2;
    return { nav: false, html:
      '<section class="intro rise" aria-labelledby="inT"><div class="topbar between">' +
      (n > 0 ? '<button class="iconbtn" data-act="intro-go" data-n="' + (n - 1) + '" aria-label="หน้าก่อนหน้า">' + CM.icon('arrow-left', 22) + '</button>' : '<span style="width:44px" aria-hidden="true"></span>') +
      '<span class="in-dots" role="img" aria-label="หน้า ' + (n + 1) + ' จาก 3">' + dots + '</span>' +
      '<button class="btn ghost sm" data-act="skip-quiz">ข้ามทั้งหมด</button></div>' +
      '<div class="in-art">' + art + '</div><h1 id="inT" class="display sm">' + h + '</h1><p class="lead sm">' + p + '</p>' +
      (last ? '<button class="btn primary lg" data-act="quiz-begin">เริ่ม Quiz</button><button class="btn ghost lg" data-act="skip-quiz">ข้ามไปดูร้านเลย</button>'
        : '<button class="btn primary lg" data-act="intro-go" data-n="' + (n + 1) + '">ถัดไป</button>') + '</section>' };
  }

  /* ---------- 6) Coach marks: one light hint at a time, never modal, remembered per device ---------- */
  const COACH = {
    home: [
      { k: 'mood', at: '.mood-grid', where: 'beforebegin', t: 'แตะ mood ได้สูงสุด 3 อย่าง — คำแนะนำด้านล่างเปลี่ยนทันที ไม่ต้องกดค้นหา' },
      { k: 'weather', at: '.hero-top .topbar', where: 'afterend', right: true, t: 'ปุ่มอากาศ: แตะเพื่อลองเปลี่ยนเป็นฝนตก/ร้อน/กลางคืน แล้วดูว่าคำแนะนำเปลี่ยนยังไง' }
    ],
    passport: [{ k: 'passport', at: '.first-stamp', where: 'beforebegin', t: 'Stamp แต่ละดวงได้จากการ Check in ที่ร้าน — ทำเงื่อนไขครบถึงจะได้' }]
  };
  const seen = () => { try { return JSON.parse(ls.get('cafemood.coach') || '[]'); } catch (e) { return []; } };
  function coach(route) {
    $$('.coach').forEach((x) => x.remove());
    if (!S.get().profile && !S.get().skipped) return;
    const done = seen();
    const c = (COACH[route] || []).find((x) => !done.includes(x.k) && $(x.at, document.getElementById('view')));
    if (!c) return;
    const target = $(c.at, document.getElementById('view'));
    const el = document.createElement('div');
    el.className = 'coach ' + (c.where === 'beforebegin' ? 'dn' : 'up') + (c.right ? ' rt' : ''); el.setAttribute('role', 'note');
    el.innerHTML = '<span></span><button type="button" class="btn text sm">เข้าใจแล้ว</button>';
    el.firstChild.textContent = c.t;
    const dismiss = () => { ls.set('cafemood.coach', JSON.stringify(seen().concat(c.k))); el.remove(); };
    el.lastChild.onclick = dismiss;
    target.addEventListener('click', dismiss, { once: true });   // doing the thing counts as understood
    target.insertAdjacentElement(c.where, el);
  }
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  /* ---------- test switches (shown in the weather sheet) ---------- */
  const lab = () => '<h3 class="sh-h">ทดลองสถานะของแอป</h3><div class="sim-grid three">' +
    [['slow', 'clock', 'โหลดช้า'], ['offline', 'cloud', 'ออฟไลน์'], ['error', 'bolt', 'หน้าเออเรอร์']].map((s) => '<button class="sim' + (sim[s[0]] ? ' on' : '') + '" data-act="ux-sim" data-k="' + s[0] + '" aria-pressed="' + !!sim[s[0]] + '">' + CM.icon(s[1], 22) + '<span>' + s[2] + '</span></button>').join('') + '</div>' +
    '<p class="muted small">สำหรับลองดูหน้าตาแต่ละสถานะ — โหลดช้า/ออฟไลน์ค้างไว้จนกดปิด</p>';

  function install(a) {
    api = a;
    const H = a.H;
    H['ux-retry'] = () => a.render();
    H['net-retry'] = () => { sim.offline = false; netBanner(); if (CM.weather) CM.weather.refresh(); a.render(true); };
    H['ux-sim'] = (el) => {
      const k = el.dataset.k; sim[k] = !sim[k];
      el.classList.toggle('on', sim[k]); el.setAttribute('aria-pressed', sim[k]);
      netBanner();
      if (k === 'error' && sim.error) { a.closeSheet(); a.render(true); }
      else if (k === 'slow') a.toast(sim.slow ? 'โหมดโหลดช้า: เปลี่ยนหน้าจะเห็น skeleton' : 'ปิดโหมดโหลดช้าแล้ว');
      else if (k === 'offline') a.toast(sim.offline ? 'จำลองออฟไลน์แล้ว' : 'กลับมาออนไลน์แล้ว');
    };
    H['intro-go'] = (el) => a.go('#/intro/' + el.dataset.n);
    H['quiz-begin'] = () => { S.patch({ quizDraft: {}, skipped: false, seenIntro: true }); a.go('#/quiz/0'); };
    H['haptic-toggle'] = (el) => { const on = !hapticOn(); ls.set('cafemood.haptic', on ? 'on' : 'off'); el.setAttribute('aria-pressed', on); el.classList.toggle('on', on); if (on) haptic('stamp'); a.toast(on ? 'เปิดการสั่นตอนเก็บ stamp' : 'ปิดการสั่นแล้ว'); };
    netBanner();
  }

  CM.ux = { install, say, sayLater, haptic, hapticOn, UNDO, SKIP_CONFIRM, undoable, hideBar, guard, errorView, notFound, offline, skeleton, wantSkeleton, sim, introView, coach, lab,
    canVibrate: () => !!(navigator.vibrate || (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics)) };
})();
