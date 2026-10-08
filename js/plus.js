/* Café Mood Plus — the customer subscription (prototype, no real payment).
   Design rules (see README → "Subscription principles"):
     • Plus never changes recommendation ranking. It sells depth (insights, reports, reminders), not advantage.
     • Honest pricing: yearly is pre-selected but monthly is one tap away; per-month and per-day prices are shown.
     • Risk reversal: free trial, reminder before billing, cancel in 2 taps, access kept until the period ends.
     • No fake scarcity, no fake social proof, no guilt-trip on "no thanks".                                   */
(function () {
  window.CM = window.CM || {};
  const D = CM.data, E = CM.engine, S = CM.store, I = CM.icon;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const DAY = 864e5, TRIAL_DAYS = 7;
  const PRICE = { month: 69, year: 590 };
  const SAVE = Math.round((1 - PRICE.year / (PRICE.month * 12)) * 100);   // ≈ 29
  const fmt = (ts) => new Date(ts).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
  let api = null, period = 'year';

  const sub = () => S.get().sub;

  // Single source of truth for "what is this user's plan right now".
  function status() {
    const s = sub(), now = Date.now();
    if (s.plan === 'plus' && s.endsAt && s.endsAt <= now) { s.plan = 'free'; s.endsAt = 0; s.cancelled = false; S.save(); }
    if (s.plan !== 'plus') return { plus: false };
    const trialing = s.trialEnd > now;
    let next = s.trialEnd;
    const step = (s.period === 'year' ? 365 : 30) * DAY;
    while (next <= now) next += step;
    return { plus: true, trialing, daysLeft: Math.max(0, Math.ceil((s.trialEnd - now) / DAY)), day: clampDay(TRIAL_DAYS - Math.ceil((s.trialEnd - now) / DAY) + 1),
      next, cancelled: !!s.cancelled, endsAt: s.endsAt, period: s.period, amount: PRICE[s.period] };
  }
  const clampDay = (d) => Math.min(TRIAL_DAYS, Math.max(1, d));
  const isPlus = () => status().plus;
  const badge = () => (isPlus() ? '<span class="plusbadge">Plus</span>' : '');

  /* ---------- Plus page ---------- */
  const FEATURES = [
    ['sparkles', 'Café Wrapped', 'สรุปเดือนของคุณ: ร้านที่ไปบ่อย เมนูโปรด มู้ดที่ชอบ'],
    ['eye', 'Mood Journal', 'ดูว่า Mood และอากาศมีผลกับการเลือกคาเฟ่ของคุณยังไง'],
    ['clock', 'เตือนอัจฉริยะ', 'เตือนก่อนอีเว้นท์ที่บันทึกไว้เริ่ม และเตือนเมื่อฝนตกพร้อมเมนูอุ่น ๆ ที่เข้ากับคุณ'],
    ['stamp', 'ธีม Passport', 'ปรับสีและสไตล์ stamp ของคุณ + ป้าย Plus บนโปรไฟล์']
  ];
  const COMPARE = [
    ['แนะนำคาเฟ่ Mood × Personality × Weather', true, true],
    ['Hidden Café · One Drink · Photo Spot · Map', true, true],
    ['Passport, XP, Achievement, Quest ของร้าน', true, true],
    ['อีเว้นท์และของแจกจากร้าน', true, true],
    ['Café Wrapped ฉบับเต็ม', false, true],
    ['Mood Journal', false, true],
    ['เตือนอัจฉริยะ', false, true],
    ['ธีม Passport', false, true]
  ];

  function priceBlock() {
    return period === 'year'
      ? '<div class="pr-main"><b>฿' + Math.round(PRICE.year / 12) + '</b><span>/ เดือน</span></div><p class="pr-sub"><s>฿' + PRICE.month + '</s> · เรียกเก็บ ฿' + PRICE.year + ' ต่อปี · <b>ประหยัด ' + SAVE + '%</b></p>'
      : '<div class="pr-main"><b>฿' + PRICE.month + '</b><span>/ เดือน</span></div><p class="pr-sub">≈ ฿' + (PRICE.month / 30).toFixed(1) + ' ต่อวัน · ยกเลิกเมื่อไหร่ก็ได้</p>';
  }

  function vPlus() {
    const st = status();
    if (st.plus) return manage(st);
    const cmp = COMPARE.map((r) => '<tr><th scope="row">' + esc(r[0]) + '</th><td>' + (r[1] ? I('check', 16) + '<span class="sr">มี</span>' : '<span class="sr">ไม่มี</span>–') + '</td><td>' + I('check', 16) + '<span class="sr">มี</span></td></tr>').join('');
    return { nav: false, html:
      '<header class="hero-top ambient plus-hero"><div class="topbar">' + api.backBtn('#/profile') + '</div><p class="eyebrow">Café Mood Plus</p>' +
      '<h1 class="display">เข้าใจรสนิยมคาเฟ่ของตัวเอง<br>ให้ลึกขึ้น</h1><p class="lead sm">แอปยังใช้ฟรีครบทุกฟีเจอร์หลัก — Plus คือเครื่องมือเสริมสำหรับคนที่อยากรู้จักตัวเองมากขึ้น</p></header>' +
      '<section class="pad rise">' +
      '<div class="card fair">' + I('badge-check', 20) + '<p><b>สัญญาของเรา:</b> Plus ไม่ซื้ออันดับ ผลแนะนำของทุกคนใช้สูตรเดียวกัน และร้านค้าก็จ่ายเพื่อให้ขึ้นอันดับไม่ได้ด้วย</p></div>' +
      '<ul class="feat">' + FEATURES.map((f) => '<li><span class="feat-ic">' + I(f[0], 22) + '</span><div><b>' + f[1] + '</b><small>' + f[2] + '</small></div></li>').join('') + '</ul>' +
      '<div class="seg" role="radiogroup" aria-label="รอบการชำระ"><button role="radio" aria-checked="' + (period === 'year') + '" class="' + (period === 'year' ? 'on' : '') + '" data-act="plus-period" data-k="year">รายปี <em>-' + SAVE + '%</em></button><button role="radio" aria-checked="' + (period === 'month') + '" class="' + (period === 'month' ? 'on' : '') + '" data-act="plus-period" data-k="month">รายเดือน</button></div>' +
      '<div class="card price-card" aria-live="polite">' + priceBlock() + '<ul class="trust"><li>' + I('check', 15) + 'ทดลองฟรี ' + TRIAL_DAYS + ' วัน — วันนี้จ่าย ฿0</li><li>' + I('check', 15) + 'เตือนก่อนเรียกเก็บ 2 วัน</li><li>' + I('check', 15) + 'ยกเลิกในแอปได้ 2 แตะ ใช้ต่อได้ถึงสิ้นรอบ</li></ul>' +
      '<button class="btn primary lg" data-act="plus-start">เริ่มทดลองฟรี ' + TRIAL_DAYS + ' วัน</button><a class="btn text block" href="#/profile">ไว้ก่อน — ใช้ฟรีต่อ</a></div>' +
      '<h2 class="sec-title">เทียบแผน</h2><div class="card tbl"><table><thead><tr><th scope="col">ฟีเจอร์</th><th scope="col">Free</th><th scope="col">Plus</th></tr></thead><tbody>' + cmp + '</tbody></table></div>' +
      '<p class="muted small">ราคาเป็นตัวอย่างในเดโม ไม่มีการเรียกเก็บเงินจริง</p></section>' };
  }

  function manage(st) {
    const s = sub();
    const trialBar = st.trialing ? '<div class="progress" role="progressbar" aria-label="วันที่ทดลองใช้" aria-valuemin="0" aria-valuemax="' + TRIAL_DAYS + '" aria-valuenow="' + st.day + '"><span style="width:' + st.day / TRIAL_DAYS * 100 + '%"></span></div><p class="muted small">ทดลองใช้ วันที่ ' + st.day + ' จาก ' + TRIAL_DAYS + '</p>' : '';
    const line = st.cancelled
      ? '<p class="small">ยกเลิกแล้ว — ใช้ Plus ได้ถึง <b>' + fmt(st.endsAt) + '</b> และจะไม่มีการเรียกเก็บเงิน</p>'
      : '<p class="small">' + (st.trialing ? 'เรียกเก็บครั้งแรก' : 'ต่ออายุครั้งถัดไป') + ' <b>' + fmt(st.next) + '</b> · ฿' + st.amount + ' / ' + (st.period === 'year' ? 'ปี' : 'เดือน') + '<br><span class="muted">เราจะเตือนคุณก่อน 2 วัน</span></p>';
    return { nav: false, html:
      '<header class="hero-top ambient plus-hero"><div class="topbar">' + api.backBtn('#/profile') + '</div><p class="eyebrow">Café Mood Plus</p><h1 class="display">คุณเป็นสมาชิก Plus</h1></header>' +
      '<section class="pad rise"><div class="card">' + trialBar + line +
      (st.cancelled ? '<button class="btn primary block" data-act="plus-resume">ต่ออายุ Plus</button>'
        : '<div class="row2"><button class="btn ghost" data-act="plus-switch">เปลี่ยนเป็น' + (st.period === 'year' ? 'รายเดือน' : 'รายปี (ประหยัด ' + SAVE + '%)') + '</button><button class="btn text" data-act="plus-cancel">ยกเลิก</button></div>') + '</div>' +
      '<ul class="feat">' + FEATURES.map((f) => '<li><span class="feat-ic">' + I(f[0], 22) + '</span><div><b>' + f[1] + '</b><small>' + f[2] + '</small></div></li>').join('') + '</ul>' +
      '<a class="btn ghost block" href="#/wrapped">เปิด Café Wrapped</a></section>' };
  }

  /* ---------- Café Wrapped (Plus) ---------- */
  function wrappedData() {
    const vs = S.get().visits, st = E.stats(vs), mh = S.get().moodHistory || {};
    const byCafe = {};
    vs.forEach((v) => { byCafe[v.cafeId] = (byCafe[v.cafeId] || 0) + 1; });
    const topCafe = Object.keys(byCafe).sort((a, b) => byCafe[b] - byCafe[a])[0];
    const types = {};
    vs.forEach((v) => v.drinks.forEach((id) => { const t = D.DRINK_BY_ID[id] && D.DRINK_BY_ID[id].type; if (t) types[t] = (types[t] || 0) + 1; }));
    const topType = Object.keys(types).sort((a, b) => types[b] - types[a])[0];
    const topMood = Object.keys(mh).sort((a, b) => mh[b] - mh[a])[0];
    return { vs, st, topCafe, topType, topMood, rainy: vs.filter((v) => v.weather && v.weather.kind === 'rain').length, night: vs.filter((v) => v.weather && v.weather.night).length, lv: E.levelInfo(st.xp) };
  }

  function vWrapped() {
    const w = wrappedData(), plus = isPlus(), month = new Date().toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
    const TT = { coffee: 'กาแฟ', latte: 'ลาเต้', matcha: 'มัทฉะ', tea: 'ชา', signature: 'ซิกเนเจอร์' };
    const p = S.get().profile, a = p && D.ARCHETYPE_BY_ID[p.archetype];
    const stat = (n, l) => '<div class="stat"><b>' + n + '</b><span>' + l + '</span></div>';
    const head = '<header class="hero-top ambient wrap-hero"><div class="topbar">' + api.backBtn('#/passport') + '</div><p class="eyebrow">Café Wrapped</p><h1 class="display">' + esc(month) + '</h1>' + (a ? '<p class="lead sm">ในฐานะ <b>' + esc(a.name) + '</b></p>' : '') + '</header>';
    if (!w.vs.length) return { nav: false, html: head + '<section class="pad"><div class="card empty"><p><b>ยังไม่มีข้อมูลให้สรุป</b></p><p class="muted">Check-in ที่คาเฟ่สักแห่ง แล้วกลับมาดูสรุปของคุณ</p><a class="btn primary" href="#/home">หาคาเฟ่วันนี้</a></div></section>' };
    const free = stat(w.st.cafes.length, 'ร้านที่เคยไป') + stat(w.vs.length, 'ครั้งที่ Check-in');
    const full = stat(w.st.drinks.length, 'เมนูที่ลอง') + stat(w.st.spots.length, 'Photo Spots') + stat(w.rainy, 'ครั้งที่ไปตอนฝนตก') + stat(w.st.hidden.length, 'Hidden Café ที่ค้นพบ');
    const hl = [w.topCafe ? ['pin', 'ร้านแห่งเดือน', D.CAFE_BY_ID[w.topCafe].name] : null, w.topType ? ['cup', 'เมนูโปรด', TT[w.topType]] : null, w.topMood ? ['sparkles', 'Mood ที่เลือกบ่อยสุด', D.MOOD_BY_ID[w.topMood].en] : null, ['trophy', 'ระดับ Passport', 'Lv.' + w.lv.level + ' ' + w.lv.name]]
      .filter(Boolean).map((h) => '<div class="wrap-card"><span>' + I(h[0], 22) + '</span><small>' + h[1] + '</small><b>' + esc(h[2]) + '</b></div>').join('');
    return { nav: false, html: head + '<section class="pad rise"><div class="stat-grid">' + free + '</div>' +
      (plus ? '<div class="stat-grid">' + full + '</div><div class="wrap-grid">' + hl + '</div>'
        : '<div class="card lock-card wrap-lock">' + I('lock', 22) + '<div><b>ดูฉบับเต็ม: ร้านแห่งเดือน เมนูโปรด Mood ที่ชอบ และอื่น ๆ</b><p class="muted small">เป็นของ Café Mood Plus — ทดลองฟรี ' + TRIAL_DAYS + ' วัน</p></div><a class="btn primary sm" href="#/plus">ดูรายละเอียด</a></div>') + '</section>' };
  }

  /* ---------- fragments used by Profile / Passport ---------- */
  function profileCard() {
    const st = status();
    if (st.plus) return '<a class="card plus-card on" href="#/plus"><span class="feat-ic">' + I('sparkles', 22) + '</span><div><b>Café Mood Plus ' + (st.trialing ? '· ทดลองวันที่ ' + st.day + '/' + TRIAL_DAYS : st.cancelled ? '· สิ้นสุด ' + fmt(st.endsAt) : '') + '</b><small>จัดการสมาชิก</small></div>' + I('chevron-right', 18) + '</a>';
    return '<a class="card plus-card" href="#/plus"><span class="feat-ic">' + I('sparkles', 22) + '</span><div><b>Café Mood Plus</b><small>Wrapped · Mood Journal · เตือนอัจฉริยะ — ทดลองฟรี ' + TRIAL_DAYS + ' วัน</small></div>' + I('chevron-right', 18) + '</a>';
  }

  function journalHtml() {
    const mh = S.get().moodHistory || {}, plus = isPlus();
    const keys = Object.keys(mh).sort((a, b) => mh[b] - mh[a]).slice(0, 5), tot = keys.reduce((s, k) => s + mh[k], 0) || 1;
    if (!plus) return '<h2 class="sec-title">' + I('eye', 20) + 'Mood Journal</h2><div class="card lock-card">' + I('lock', 22) + '<div><b>ดูว่า Mood และอากาศพาคุณไปคาเฟ่แบบไหน</b><p class="muted small">เป็นของ Plus</p></div><a class="btn primary sm" href="#/plus">ลองฟรี</a></div>';
    const w = {}; S.get().visits.forEach((v) => { const k = v.weather && (v.weather.night && v.weather.kind !== 'rain' ? 'night' : v.weather.kind); if (k) w[k] = (w[k] || 0) + 1; });
    const WT = { rain: 'ฝนตก', sunny: 'แดดดี', cloudy: 'ครึ้มฟ้า', hot: 'ร้อนจัด', night: 'ค่ำ' };
    return '<h2 class="sec-title">' + I('eye', 20) + 'Mood Journal</h2><div class="card">' + (keys.length
      ? '<ul class="mood-bars">' + keys.map((k) => '<li><span class="mlab">' + I(D.MOOD_BY_ID[k].icon, 16) + D.MOOD_BY_ID[k].short + '</span><span class="bar" aria-hidden="true"><i style="width:' + Math.round(mh[k] / tot * 100) + '%"></i></span><b>' + Math.round(mh[k] / tot * 100) + '%</b></li>').join('') + '</ul>'
        + (Object.keys(w).length ? '<p class="muted small">Check-in ตามอากาศ: ' + Object.keys(w).map((k) => WT[k] + ' ' + w[k]).join(' · ') + '</p>' : '')
      : '<p class="muted">ยังไม่มีข้อมูล — เลือก Mood บนหน้า Home สักพักแล้วกลับมาดู</p>') + '</div>';
  }

  function remindersHtml() {
    const r = S.get().reminders || {}, plus = isPlus();
    const row = (k, t, d) => '<div class="set-row"><div><b>' + t + '</b><small>' + d + '</small></div>' + (plus ? '<button class="switch" role="switch" aria-checked="' + !!r[k] + '" aria-label="' + t + '" data-act="rem-toggle" data-k="' + k + '"><i></i></button>' : '<a class="btn ghost sm" href="#/plus">Plus</a>') + '</div>';
    return '<div class="card settings">' + row('events', 'เตือนอีเว้นท์ที่บันทึกไว้', 'ก่อนงานเริ่ม 1 ชั่วโมง') + row('rain', 'เตือนวันฝนตก', 'เมนูอุ่น ๆ ที่เข้ากับคุณ') + '</div>' + (plus ? '<p class="muted small">ตัวอย่าง: การแจ้งเตือนจริงจะทำงานในแอปมือถือ</p>' : '');
  }

  function passportTeaser() {
    const n = S.get().visits.length;
    return '<a class="card plus-card" href="#/wrapped"><span class="feat-ic">' + I('sparkles', 22) + '</span><div><b>Café Wrapped</b><small>' + (n ? 'สรุปเดือนนี้ของคุณพร้อมแล้ว' : 'Check-in ครั้งแรกเพื่อเริ่มสะสมสรุปของคุณ') + '</small></div>' + I('chevron-right', 18) + '</a>';
  }

  /* ---------- actions ---------- */
  function install(a) {
    api = a;
    const H = api.H, toast = api.toast;
    const row = (k, v) => '<li><span>' + k + '</span><b>' + v + '</b></li>';
    H['plus-period'] = (el) => { period = el.dataset.k; api.render(true); };
    H['plus-start'] = () => {
      const bill = Date.now() + TRIAL_DAYS * DAY;
      api.openSheet('<h2 id="sheetTitle">เริ่มทดลอง Plus ' + TRIAL_DAYS + ' วัน</h2><ul class="xp-lines">' + row('วันนี้', '฿0') + row('เรียกเก็บครั้งแรก', fmt(bill)) + row('ยอด', '฿' + PRICE[period] + ' / ' + (period === 'year' ? 'ปี' : 'เดือน')) + row('เตือนก่อนเรียกเก็บ', '2 วัน') + '</ul>' +
        '<p class="muted small">ยกเลิกได้ที่ Profile → Café Mood Plus ก่อนวันที่ ' + fmt(bill) + ' โดยไม่โดนเรียกเก็บ (เดโม: ไม่มีการเก็บเงินจริง)</p>' +
        '<button class="btn primary lg" data-act="plus-confirm">เริ่มทดลองฟรี</button><button class="btn text block" data-act="close-sheet">ยังไม่เริ่ม</button>');
    };
    H['plus-confirm'] = () => { const s = sub(); s.plan = 'plus'; s.period = period; s.startedAt = Date.now(); s.trialEnd = Date.now() + TRIAL_DAYS * DAY; s.cancelled = false; s.endsAt = 0; S.save(); api.closeSheet(true); api.render(true); toast('ยินดีต้อนรับสู่ Plus — ทดลองฟรี ' + TRIAL_DAYS + ' วัน'); };
    H['plus-switch'] = () => { const s = sub(); s.period = s.period === 'year' ? 'month' : 'year'; S.save(); api.render(true); toast('เปลี่ยนรอบเป็น' + (s.period === 'year' ? 'รายปี' : 'รายเดือน') + 'แล้ว'); };
    H['plus-cancel'] = () => {
      const st = status();
      api.openSheet('<h2 id="sheetTitle">ยกเลิก Plus?</h2><ul class="xp-lines">' + row('ใช้ Plus ได้ถึง', fmt(st.trialing ? sub().trialEnd : st.next)) + row('เรียกเก็บเพิ่ม', '฿0') + row('ข้อมูล Passport / XP', 'อยู่ครบ') + '</ul>' +
        '<p class="muted small">คุณกลับมาสมัครได้ทุกเมื่อ</p><button class="btn danger lg" data-act="plus-cancel-do">ยืนยันยกเลิก</button><button class="btn text block" data-act="close-sheet">เก็บ Plus ไว้</button>');
    };
    H['plus-cancel-do'] = () => { const s = sub(), st = status(); s.cancelled = true; s.endsAt = st.trialing ? s.trialEnd : st.next; S.save(); api.closeSheet(true); api.render(true); toast('ยกเลิกแล้ว — ใช้ได้ถึง ' + fmt(s.endsAt)); };
    H['plus-resume'] = () => { const s = sub(); s.cancelled = false; s.endsAt = 0; S.save(); api.render(true); toast('ต่ออายุ Plus แล้ว'); };
    H['rem-toggle'] = (el) => { const st = S.get(); st.reminders = st.reminders || {}; st.reminders[el.dataset.k] = !st.reminders[el.dataset.k]; S.save(); api.render(true); };
  }

  CM.plus = { install, view: (n) => (n === 'wrapped' ? vWrapped() : vPlus()), isPlus, badge, profileCard, journalHtml, remindersHtml, passportTeaser, status };
})();
