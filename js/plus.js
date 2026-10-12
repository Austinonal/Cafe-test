/* Café Mood Plus — the customer subscription (prototype, no real payment).
   Design rules (see README → "Subscription principles"):
     • Plus never changes recommendation ranking. It sells depth (insights, reports, reminders), not advantage.
     • Honest pricing: yearly is pre-selected but monthly is one tap away; per-month and per-day prices are shown.
     • Risk reversal: free trial, reminder before billing, cancel in 2 taps, access kept until the period ends.
     • Pause (1–3 months) is offered NEXT TO Cancel, never instead of it.
     • No fake scarcity, no fake social proof, no guilt-trip on "no thanks". The basics (map, recommendations) are never locked.
   Plans: Solo or Duo (one payer, two people), optional student discount (.ac.th e-mail), Gift Plus (a code for a friend).
   Plus tools (Notes, Smart List, Trip Mode, Passport export) live in js/plus-tools.js.                                  */
(function () {
  window.CM = window.CM || {};
  const D = CM.data, E = CM.engine, S = CM.store, I = CM.icon;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const DAY = 864e5, TRIAL_DAYS = 7, STUDENT_OFF = 30, STUDENT_VALID = 365 * DAY;
  // Demo prices (assumptions to test, not final). Duo = ONE payer, TWO people.
  const PRICE = { solo: { month: 69, year: 590 }, duo: { month: 99, year: 850 } };
  const GIFT = { 1: 69, 3: 189, 12: 590 };
  const price = (tier, per, student) => Math.round(PRICE[tier][per] * (student ? 1 - STUDENT_OFF / 100 : 1));
  const saveOf = (tier) => Math.round((1 - PRICE[tier].year / (PRICE[tier].month * 12)) * 100);
  const fmt = (ts) => new Date(ts).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
  const addMonths = (ts, n) => { const d = new Date(ts), day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n); d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); return d.getTime(); };
  let api = null, period = 'year', tier = 'solo', giftM = 12, giftTo = '', giftMsg = '', pauseM = 1, lastGift = '';

  const sub = () => S.get().sub;
  const isStudent = () => { const s = sub(); return !!(s.student && s.student.at + STUDENT_VALID > Date.now()); };
  const per = (t, p) => (t === 'duo' ? Math.round(price(t, p, isStudent()) / 2) : price(t, p, isStudent()));   // price per person

  function resume(s, until) {   // paused time moves the next billing date later by the same amount
    if (s.pausedAt) s.trialEnd += Math.min(Date.now(), until || Date.now()) - s.pausedAt;
    s.pausedAt = 0; s.pausedUntil = 0; S.save();
  }

  // Single source of truth for "what is this user's plan right now".
  function status() {
    const s = sub(), now = Date.now();
    if (s.plan === 'plus' && s.endsAt && s.endsAt <= now) { s.plan = 'free'; s.endsAt = 0; s.cancelled = false; S.save(); }
    if (s.grant && s.grant.until && s.grant.until <= now) { s.grant = null; if (!s.endsAt && s.trialEnd <= now) s.plan = 'free'; S.save(); }
    if (s.pausedUntil && s.pausedUntil <= now) resume(s, s.pausedUntil);
    const pu = CM.ent ? CM.ent.plusUntil() : null;
    const free = (until) => ({ plus: true, granted: true, gift: !!(s.grant && s.grant.gift), until, trialing: false, cancelled: false, period: 'year', amount: 0, next: until, endsAt: 0, day: 1, daysLeft: 0 });
    if (pu !== null && !s.grant) return free(pu);
    if (s.grant) return free(s.grant.until);
    if (s.plan === 'plus' && s.pausedUntil) return { plus: false, paused: true, until: s.pausedUntil, tier: s.tier || 'solo' };
    if (s.plan !== 'plus') return { plus: false };
    const trialing = s.trialEnd > now, t = s.tier || 'solo';
    let next = s.trialEnd;
    const step = (s.period === 'year' ? 365 : 30) * DAY;
    while (next <= now) next += step;
    return { plus: true, trialing, daysLeft: Math.max(0, Math.ceil((s.trialEnd - now) / DAY)), day: clampDay(TRIAL_DAYS - Math.ceil((s.trialEnd - now) / DAY) + 1),
      next, cancelled: !!s.cancelled, endsAt: s.endsAt, period: s.period, tier: t, amount: price(t, s.period, isStudent()) };
  }
  const clampDay = (d) => Math.min(TRIAL_DAYS, Math.max(1, d));
  const isPlus = () => status().plus;
  const badge = () => (isPlus() ? '<span class="plusbadge">Plus</span>' : '');
  const lockCard = (title, small, cta) => '<div class="card lock-card">' + I('lock', 22) + '<div><b>' + title + '</b><p class="muted small">' + small + '</p></div><a class="btn primary sm" href="#/plus">' + (cta || 'ดูรายละเอียด') + '</a></div>';

  /* ---------- Plus page ---------- */
  const FEATURES = [
    ['sparkles', 'Café Wrapped', 'สรุปเดือนของคุณ: ร้านที่ไปบ่อย เมนูโปรด มู้ดที่ชอบ', '#/wrapped'],
    ['eye', 'Mood Journal', 'ดูว่า Mood และอากาศมีผลกับการเลือกคาเฟ่ของคุณยังไง', '#/profile'],
    ['edit', 'Café Notes', 'จดโน้ตและให้คะแนนส่วนตัวต่อร้านและต่อเมนู — เห็นแค่คุณ', '#/notes'],
    ['heart', 'Smart List', 'จากร้านที่คุณชอบ → ร้านที่ยังไม่เคยไปแต่น่าจะถูกใจ พร้อมเหตุผล', '#/smart'],
    ['compass', 'Trip Mode', 'วางแผนเที่ยวคาเฟ่ต่างจังหวัด เป็นวัน เป็นเส้นทาง', '#/trip'],
    ['download', 'ส่งออก Passport', 'บันทึกเป็นรูปสวย ๆ หรือ PDF พร้อม 3 ธีม', '#/export'],
    ['clock', 'เตือนอัจฉริยะ', 'เตือนก่อนอีเว้นท์ที่บันทึกไว้เริ่ม และเตือนเมื่อฝนตกพร้อมเมนูอุ่น ๆ ที่เข้ากับคุณ', '#/profile']
  ];
  const COMPARE = [
    ['แนะนำคาเฟ่ Mood × Personality × Weather', true],
    ['Hidden Café · One Drink · Photo Spot · Map', true],
    ['Passport, XP, Achievement, Quest ของร้าน', true],
    ['อีเว้นท์และของแจกจากร้าน', true],
    ['Café Wrapped ฉบับเต็ม', false],
    ['Mood Journal', false],
    ['Café Notes · Smart List', false],
    ['Trip Mode · ส่งออก Passport', false],
    ['เตือนอัจฉริยะ', false]
  ];
  const feats = (links) => '<ul class="feat">' + FEATURES.map((f) => '<li><span class="feat-ic">' + I(f[0], 22) + '</span><div><b>' + f[1] + '</b><small>' + f[2] + '</small></div></li>').join('') + '</ul>';
  const featsOn = () => '<div class="card menu">' + FEATURES.map((f) => '<a class="mrow" href="' + f[3] + '"><span class="mi">' + I(f[0], 20) + '</span><span class="mt"><b>' + f[1] + '</b><small>' + f[2] + '</small></span>' + I('chevron-right', 18) + '</a>').join('') + '</div>';

  function priceBlock() {
    const st = isStudent(), a = price(tier, period, st), full = price(tier, period, false), pp = per(tier, period);
    const who = tier === 'duo' ? '<p class="pr-sub">จ่ายรวม <b>฿' + a + '</b> ' + (period === 'year' ? 'ต่อปี' : 'ต่อเดือน') + ' สำหรับ 2 คน · คนละ ≈ ฿' + Math.round(a / 2 / (period === 'year' ? 12 : 1)) + ' / เดือน</p>' : '';
    const main = period === 'year'
      ? '<div class="pr-main"><b>฿' + Math.round(pp / 12) + '</b><span>/ เดือน' + (tier === 'duo' ? ' ต่อคน' : '') + '</span></div>' + (tier === 'duo' ? '' : '<p class="pr-sub">' + (st ? '<s>฿' + Math.round(PRICE[tier].year / 12) + '</s> · ' : '<s>฿' + PRICE[tier].month + '</s> · ') + 'เรียกเก็บ ฿' + a + ' ต่อปี · <b>ประหยัด ' + (st ? Math.round((1 - a / (PRICE[tier].month * 12)) * 100) : saveOf(tier)) + '%</b></p>')
      : '<div class="pr-main"><b>฿' + pp + '</b><span>/ เดือน' + (tier === 'duo' ? ' ต่อคน' : '') + '</span></div>' + (tier === 'duo' ? '' : '<p class="pr-sub">≈ ฿' + (a / 30).toFixed(1) + ' ต่อวัน · ยกเลิกเมื่อไหร่ก็ได้</p>');
    return main + who + (st && full !== a ? '<p class="pr-sub"><span class="plusbadge">นักศึกษา -' + STUDENT_OFF + '%</span> ยืนยันแล้วด้วย ' + esc(sub().student.email) + ' · <button class="btn text sm" data-act="student-clear">ยกเลิกส่วนลด</button></p>' : '');
  }

  // A real preview of the visitor's own Wrapped, before asking for anything.
  function yourPreview() {
    const w = wrappedData();
    if (!w.vs.length) return '';
    const top = w.topCafe && D.CAFE_BY_ID[w.topCafe];
    return '<div class="card"><p class="eyebrow">ตัวอย่างจากข้อมูลของคุณ</p><div class="stat-grid"><div class="stat"><b>' + w.st.cafes.length + '</b><span>ร้านที่เคยไป</span></div><div class="stat"><b>' + w.vs.length + '</b><span>ครั้งที่ Check-in</span></div></div>' +
      (top ? '<div class="wrap-card"><span>' + I('pin', 22) + '</span><small>ร้านที่ไปบ่อยสุด</small><b>' + esc(top.name) + '</b></div>' : '') +
      '<p class="muted small">Plus เปิดฉบับเต็มให้: เมนูโปรด Mood ที่เลือกบ่อย และอื่น ๆ</p></div>';
  }

  const PROMISE = ['ไม่ขายอันดับ — ผลแนะนำของทุกคนใช้สูตรเดียวกัน และร้านค้าจ่ายเพื่อให้ขึ้นอันดับไม่ได้', 'ไม่ซ่อนของพื้นฐานหลัง paywall — แผนที่และการแนะนำฟรีตลอด', 'ไม่มีนับถอยหลังปลอม ไม่มี “คนอื่นกำลังดูอยู่” ปลอม', 'ยกเลิกได้เองในแอป 2 แตะ — ปุ่มพักแพ็กอยู่ข้าง ๆ ไม่ได้มาแทนปุ่มยกเลิก'];

  function vPlus() {
    const st = status();
    if (st.plus || st.paused) return manage(st);
    const cmp = COMPARE.map((r) => '<tr><th scope="row">' + esc(r[0]) + '</th><td>' + (r[1] ? I('check', 16) + '<span class="sr">มี</span>' : '<span class="sr">ไม่มี</span>–') + '</td><td>' + I('check', 16) + '<span class="sr">มี</span></td></tr>').join('');
    const seg = (act, k, items) => '<div class="seg" role="radiogroup">' + items.map((i) => '<button role="radio" aria-checked="' + (k === i[0]) + '" class="' + (k === i[0] ? 'on' : '') + '" data-act="' + act + '" data-k="' + i[0] + '">' + i[1] + '</button>').join('') + '</div>';
    return { nav: false, html:
      '<header class="hero-top ambient plus-hero"><div class="topbar">' + api.backBtn('#/profile') + '</div><p class="eyebrow">Café Mood Plus</p>' +
      '<h1 class="display">เข้าใจรสนิยมคาเฟ่ของตัวเอง<br>ให้ลึกขึ้น</h1><p class="lead sm">แอปยังใช้ฟรีครบทุกฟีเจอร์หลัก — Plus คือเครื่องมือเสริมสำหรับคนที่อยากรู้จักตัวเองมากขึ้น</p></header>' +
      '<section class="pad rise">' + yourPreview() +
      '<div class="card fair">' + I('badge-check', 20) + '<div><b>สัญญาของเรา</b><ul class="trust">' + PROMISE.map((p) => '<li>' + I('check', 15) + p + '</li>').join('') + '</ul></div></div>' +
      feats() +
      '<h2 class="sec-title">เลือกแผน</h2>' + seg('plus-tier', tier, [['solo', 'Solo · คนเดียว'], ['duo', 'Duo · ไปกันเป็นคู่']]) +
      (tier === 'duo' ? '<p class="muted small">จ่ายครั้งเดียว ใช้ได้ 2 คน — ชวนเพื่อนหรือแฟนมาใช้ด้วยบัญชีของเขาเอง ข้อมูล Passport และโน้ตแยกกัน</p>' : '') +
      seg('plus-period', period, [['year', 'รายปี <em>-' + saveOf(tier) + '%</em>'], ['month', 'รายเดือน']]) +
      '<div class="card price-card" aria-live="polite">' + priceBlock() +
      (isStudent() ? '' : '<button class="btn text sm" data-act="student-open">' + I('grad', 16) + ' เป็นนักศึกษา? ยืนยันอีเมล .ac.th ลด ' + STUDENT_OFF + '%</button>') +
      '<ul class="trust"><li>' + I('check', 15) + 'ทดลองฟรี ' + TRIAL_DAYS + ' วัน — วันนี้จ่าย ฿0</li><li>' + I('check', 15) + 'เตือนก่อนเรียกเก็บ 2 วัน</li><li>' + I('check', 15) + 'ยกเลิกในแอปได้ 2 แตะ ใช้ต่อได้ถึงสิ้นรอบ · หรือพัก 1–3 เดือนได้</li></ul>' +
      '<button class="btn primary lg" data-act="plus-start">เริ่มทดลองฟรี ' + TRIAL_DAYS + ' วัน</button><a class="btn text block" href="#/profile">ไว้ก่อน — ใช้ฟรีต่อ</a></div>' +
      '<a class="card plus-card" href="#/gift"><span class="feat-ic">' + I('gift', 22) + '</span><div><b>ให้ Plus เป็นของขวัญ</b><small>ซื้อให้เพื่อน 1 · 3 · 12 เดือน ส่งเป็นโค้ด</small></div>' + I('chevron-right', 18) + '</a>' +
      '<h2 class="sec-title">เทียบแผน</h2><div class="card tbl"><table><thead><tr><th scope="col">ฟีเจอร์</th><th scope="col">Free</th><th scope="col">Plus</th></tr></thead><tbody>' + cmp + '</tbody></table></div>' +
      '<p class="muted small">ราคาเป็นตัวอย่างในเดโม ไม่มีการเรียกเก็บเงินจริง</p></section>' };
  }

  function duoHtml(st) {
    if (st.granted || st.tier !== 'duo') return '';
    const s = sub(), p = s.partner;
    if (!s.duoCode) { s.duoCode = 'DUO-' + rnd(5); S.save(); }
    return '<div class="card duo"><h2 class="sec-title first">' + I('users', 20) + 'คู่หูของคุณ</h2>' + (p
      ? '<p><b>' + esc(p.name) + '</b> ใช้ Plus ร่วมกับคุณตั้งแต่ ' + fmt(p.at) + '</p><p class="muted small">ข้อมูล Passport และโน้ตของแต่ละคนแยกกัน · ถอนคู่หูแล้วเชิญคนใหม่ได้</p><button class="btn text sm" data-act="duo-remove">ถอนคู่หู</button>'
      : '<p class="muted small">ส่งรหัสเชิญนี้ให้เพื่อนหรือแฟน — เขาได้สิทธิ์ Plus เต็มรูปแบบ โดยคุณจ่ายแค่ครั้งเดียว</p><div class="cc-in tok"><input id="duoCode" type="text" readonly value="' + s.duoCode + '" aria-label="รหัสเชิญ"><button class="btn primary sm" data-act="copy-text" data-v="' + s.duoCode + '">คัดลอก</button></div>' +
        '<div class="cc-in tok"><input id="duoName" type="text" maxlength="24" placeholder="ชื่อเพื่อน (เดโม: จำลองว่ารับคำเชิญแล้ว)" aria-label="ชื่อเพื่อน"><button class="btn ghost sm" data-act="duo-join">จำลอง</button></div>') + '</div>';
  }

  function manage(st) {
    const s = sub(), head = '<header class="hero-top ambient plus-hero"><div class="topbar">' + api.backBtn('#/profile') + '</div><p class="eyebrow">Café Mood Plus' + (st.tier === 'duo' ? ' · Duo' : '') + '</p><h1 class="display">' + (st.paused ? 'พักสมาชิกอยู่' : 'คุณเป็นสมาชิก Plus') + '</h1></header>';
    if (st.paused) return { nav: false, html: head + '<section class="pad rise"><div class="card"><p><b>พักถึง ' + fmt(st.until) + '</b></p><p class="small">ช่วงนี้ไม่มีการเรียกเก็บเงิน และฟีเจอร์ Plus ถูกพักไว้ — ข้อมูล Passport โน้ต และทริปของคุณอยู่ครบ ฟรีฟีเจอร์ทั้งหมดใช้ได้ปกติ วันครบกำหนดเรียกเก็บถัดไปจะเลื่อนออกไปเท่ากับที่พัก</p>' +
      '<button class="btn primary block" data-act="plus-unpause">กลับมาใช้ Plus เลย</button><button class="btn text block" data-act="plus-cancel">ยกเลิกแพ็ก</button></div></section>' };
    const trialBar = st.trialing ? '<div class="progress" role="progressbar" aria-label="วันที่ทดลองใช้" aria-valuemin="0" aria-valuemax="' + TRIAL_DAYS + '" aria-valuenow="' + st.day + '"><span style="width:' + st.day / TRIAL_DAYS * 100 + '%"></span></div><p class="muted small">ทดลองใช้ วันที่ ' + st.day + ' จาก ' + TRIAL_DAYS + '</p>' : '';
    const line = st.granted ? '<p class="small">ใช้ Plus ฟรี <b>' + (st.until ? 'ถึง ' + fmt(st.until) : 'ตลอดไป') + '</b> ' + (st.gift ? 'จากของขวัญ Plus — ไม่มีการเรียกเก็บเงิน และไม่ต่ออายุเอง' : 'จากรหัสของผู้พัฒนา — ไม่มีการเรียกเก็บเงิน') + '</p>' : st.cancelled
      ? '<p class="small">ยกเลิกแล้ว — ใช้ Plus ได้ถึง <b>' + fmt(st.endsAt) + '</b> และจะไม่มีการเรียกเก็บเงิน</p>'
      : '<p class="small">' + (st.trialing ? 'เรียกเก็บครั้งแรก' : 'ต่ออายุครั้งถัดไป') + ' <b>' + fmt(st.next) + '</b> · ฿' + st.amount + ' / ' + (st.period === 'year' ? 'ปี' : 'เดือน') + (st.tier === 'duo' ? ' (2 คน)' : '') + '<br><span class="muted">เราจะเตือนคุณก่อน 2 วัน</span></p>';
    const stu = st.granted ? '' : isStudent() ? '<p class="muted small">' + I('grad', 14) + ' ส่วนลดนักศึกษา -' + STUDENT_OFF + '% ใช้ได้ถึง ' + fmt(s.student.at + STUDENT_VALID) + ' (ต้องยืนยันอีเมลใหม่ทุกปี)</p>' : '<button class="btn text sm" data-act="student-open">' + I('grad', 16) + ' ยืนยันนักศึกษา ลด ' + STUDENT_OFF + '%</button>';
    return { nav: false, html: head +
      '<section class="pad rise"><div class="card">' + trialBar + line + stu +
      (st.granted ? '' : st.cancelled ? '<button class="btn primary block" data-act="plus-resume">ต่ออายุ Plus</button>'
        : '<div class="row2e"><button class="btn ghost" data-act="plus-pause-open">' + I('pause', 16) + ' พักแพ็ก</button><button class="btn ghost" data-act="plus-cancel">ยกเลิกแพ็ก</button></div><button class="btn text block" data-act="plus-switch">เปลี่ยนเป็น' + (st.period === 'year' ? 'รายเดือน' : 'รายปี (ประหยัด ' + saveOf(st.tier) + '%)') + '</button>') + '</div>' +
      duoHtml(st) + featsOn() +
      '<a class="card plus-card" href="#/gift"><span class="feat-ic">' + I('gift', 22) + '</span><div><b>ให้ Plus เป็นของขวัญ</b><small>ซื้อให้เพื่อน 1 · 3 · 12 เดือน</small></div>' + I('chevron-right', 18) + '</a></section>' };
  }

  /* ---------- Gift Plus ---------- */
  const CH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const rnd = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => CH[b % CH.length]).join('');
  const chk = (s) => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 997; return CH[h % 31] + CH[(h / 31 | 0) % 31]; };
  // shortcut: the code carries its own months + a typo check, so any device can redeem it in the demo. It is forgeable and reusable on other devices — a real server must issue each code and mark it used.
  function redeemGift(code) {
    if (!/^GIFT-/.test(code)) return null;
    const m = /^GIFT-(1|3|12)-([A-Z2-9]{5})-([A-Z2-9]{2})$/.exec(code);
    if (!m || chk(m[1] + m[2]) !== m[3]) return { err: 'โค้ดของขวัญไม่ถูกต้อง ตรวจตัวสะกดอีกครั้ง' };
    const s = sub(), months = +m[1], until = addMonths(Math.max(Date.now(), (s.grant && s.grant.until) || 0), months);
    s.grant = { until, gift: true }; s.plan = 'plus'; S.save();
    return { until, msg: 'ได้รับ Gift Plus ' + months + ' เดือน — ใช้ได้ถึง ' + fmt(until) };
  }

  function vGift() {
    const gifts = sub().gifts || [], opt = (m, t) => '<button role="radio" aria-checked="' + (giftM === m) + '" class="' + (giftM === m ? 'on' : '') + '" data-act="gift-pick" data-k="' + m + '">' + t + '<em>฿' + GIFT[m] + '</em></button>';
    const made = lastGift ? '<div class="card"><p class="eyebrow">ของขวัญพร้อมส่ง</p><div class="cc-in tok"><input readonly value="' + lastGift + '" aria-label="โค้ดของขวัญ"><button class="btn primary sm" data-act="copy-text" data-v="' + lastGift + '">คัดลอก</button></div><p class="muted small">ส่งโค้ดนี้ให้เพื่อน — เขาใส่ที่ Profile → โค้ดของฉัน ได้ Plus เต็มรูปแบบ ไม่ต้องใส่บัตร และไม่ต่ออายุเอง</p></div>' : '';
    return { nav: false, html:
      '<header class="hero-top ambient plus-hero"><div class="topbar">' + api.backBtn('#/plus') + '</div><p class="eyebrow">Gift Plus</p><h1 class="display">ให้ Plus เป็นของขวัญ</h1><p class="lead sm">จ่ายครั้งเดียว ไม่ต่ออายุอัตโนมัติ — คนรับไม่ต้องผูกบัตร</p></header>' +
      '<section class="pad rise">' + made +
      '<div class="seg three" role="radiogroup" aria-label="ระยะเวลา">' + opt(1, '1 เดือน') + opt(3, '3 เดือน') + opt(12, '12 เดือน') + '</div>' +
      '<div class="card"><div class="field"><label for="giftTo">ถึงใคร (ไม่บังคับ)</label><input id="giftTo" class="name-in" maxlength="24" value="' + esc(giftTo) + '" placeholder="ชื่อเพื่อน"></div>' +
      '<div class="field"><label for="giftMsg">ข้อความ (ไม่บังคับ)</label><textarea id="giftMsg" maxlength="140" placeholder="เช่น ไปคาเฟ่ด้วยกันนะ">' + esc(giftMsg) + '</textarea></div>' +
      '<ul class="xp-lines"><li><span>ระยะเวลา</span><b>' + giftM + ' เดือน</b></li><li><span>ยอดชำระ</span><b>฿' + GIFT[giftM] + '</b></li></ul>' +
      '<button class="btn primary lg" data-act="gift-make">ซื้อของขวัญ ฿' + GIFT[giftM] + '</button><p class="muted small">เดโม: ไม่มีการเรียกเก็บเงินจริง · โค้ดมีอายุไม่จำกัดจนกว่าจะถูกใช้</p></div>' +
      (gifts.length ? '<h2 class="sec-title">ของขวัญที่คุณสร้างไว้</h2><ul class="card recent">' + gifts.slice().reverse().map((g) => '<li><span>' + esc(g.code) + '</span><small>' + g.m + ' เดือน' + (g.to ? ' · ถึง ' + esc(g.to) : '') + ' · ' + fmt(g.at) + '</small></li>').join('') + '</ul>' : '') + '</section>' };
  }

  /* ---------- Café Wrapped (Plus) ---------- */
  function wrappedData() {
    const vs = S.live(), st = E.stats(vs), mh = S.get().moodHistory || {};
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
      (plus ? '<div class="stat-grid">' + full + '</div><div class="wrap-grid">' + hl + '</div><a class="btn ghost block" href="#/wshare">' + I('download', 18) + ' ส่งออก Wrapped เป็นรูป / PDF</a>'
        : lockCard('ดูฉบับเต็ม: ร้านแห่งเดือน เมนูโปรด Mood ที่ชอบ และอื่น ๆ', 'เป็นของ Café Mood Plus — ทดลองฟรี ' + TRIAL_DAYS + ' วัน').replace('card lock-card', 'card lock-card wrap-lock')) + '</section>' };
  }

  /* ---------- fragments used by Profile / Passport ---------- */
  function profileCard() {
    const st = status();
    if (st.paused) return '<a class="card plus-card on" href="#/plus"><span class="feat-ic">' + I('pause', 22) + '</span><div><b>Café Mood Plus · พักถึง ' + fmt(st.until) + '</b><small>จัดการสมาชิก</small></div>' + I('chevron-right', 18) + '</a>';
    if (st.plus) return '<a class="card plus-card on" href="#/plus"><span class="feat-ic">' + I('sparkles', 22) + '</span><div><b>Café Mood Plus' + (st.tier === 'duo' ? ' Duo' : '') + ' ' + (st.granted ? '· ฟรี' + (st.until ? ' ถึง ' + fmt(st.until) : ' ตลอดไป') : st.trialing ? '· ทดลองวันที่ ' + st.day + '/' + TRIAL_DAYS : st.cancelled ? '· สิ้นสุด ' + fmt(st.endsAt) : '') + '</b><small>จัดการสมาชิก</small></div>' + I('chevron-right', 18) + '</a>';
    return '<a class="card plus-card" href="#/plus"><span class="feat-ic">' + I('sparkles', 22) + '</span><div><b>Café Mood Plus</b><small>Wrapped · Notes · Smart List · Trip Mode — ทดลองฟรี ' + TRIAL_DAYS + ' วัน</small></div>' + I('chevron-right', 18) + '</a>';
  }

  function journalHtml() {
    const mh = S.get().moodHistory || {}, plus = isPlus();
    const keys = Object.keys(mh).sort((a, b) => mh[b] - mh[a]).slice(0, 5), tot = keys.reduce((s, k) => s + mh[k], 0) || 1;
    if (!plus) return '<h2 class="sec-title">' + I('eye', 20) + 'Mood Journal</h2><div class="card lock-card">' + I('lock', 22) + '<div><b>ดูว่า Mood และอากาศพาคุณไปคาเฟ่แบบไหน</b><p class="muted small">เป็นของ Plus</p></div><a class="btn primary sm" href="#/plus">ลองฟรี</a></div>';
    const w = {}; S.live().forEach((v) => { const k = v.weather && (v.weather.night && v.weather.kind !== 'rain' ? 'night' : v.weather.kind); if (k) w[k] = (w[k] || 0) + 1; });
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
    const n = S.live().length;
    return '<a class="card plus-card" href="#/wrapped"><span class="feat-ic">' + I('sparkles', 22) + '</span><div><b>Café Wrapped</b><small>' + (n ? 'สรุปเดือนนี้ของคุณพร้อมแล้ว' : 'Check-in ครั้งแรกเพื่อเริ่มสะสมสรุปของคุณ') + '</small></div>' + I('chevron-right', 18) + '</a>' +
      '<a class="card plus-card" href="#/export"><span class="feat-ic">' + I('download', 22) + '</span><div><b>ส่งออก Passport</b><small>เป็นรูปสวย ๆ หรือ PDF · 3 ธีม</small></div>' + I('chevron-right', 18) + '</a>';
  }

  // Profile menu for the Plus tools (mrow is Profile's own row builder)
  function toolsHtml(mrow) {
    const n = Object.keys(S.get().notes || {}).length, t = (S.get().trips || []).length;
    return '<div class="card menu">' +
      mrow('edit', 'Café Notes', 'โน้ตและคะแนนส่วนตัวต่อร้าน/เมนู', n + ' ร้าน', 'href="#/notes"') +
      mrow('heart', 'Smart List', 'ร้านที่น่าจะถูกใจ จากร้านที่คุณชอบ', '', 'href="#/smart"') +
      mrow('compass', 'Trip Mode', 'วางแผนเที่ยวคาเฟ่ต่างจังหวัด', t + ' ทริป', 'href="#/trip"') +
      mrow('download', 'ส่งออก Passport', 'เป็นรูปหรือ PDF', '', 'href="#/export"') +
      mrow('gift', 'Gift Plus', 'ซื้อ Plus ให้เพื่อน', '', 'href="#/gift"') + '</div>';
  }

  /* ---------- actions ---------- */
  function install(a) {
    api = a;
    const H = api.H, toast = api.toast, $ = (s) => document.querySelector(s);
    const row = (k, v) => '<li><span>' + k + '</span><b>' + v + '</b></li>';
    H['plus-period'] = (el) => { period = el.dataset.k; api.render(true); };
    H['plus-tier'] = (el) => { tier = el.dataset.k; api.render(true); };
    H['plus-start'] = () => {
      const bill = Date.now() + TRIAL_DAYS * DAY, a = price(tier, period, isStudent());
      api.openSheet('<h2 id="sheetTitle">เริ่มทดลอง Plus ' + (tier === 'duo' ? 'Duo ' : '') + TRIAL_DAYS + ' วัน</h2><ul class="xp-lines">' + row('วันนี้', '฿0') + row('เรียกเก็บครั้งแรก', fmt(bill)) + row('ยอด', '฿' + a + ' / ' + (period === 'year' ? 'ปี' : 'เดือน') + (tier === 'duo' ? ' (2 คน)' : '')) + (isStudent() ? row('ส่วนลดนักศึกษา', '-' + STUDENT_OFF + '%') : '') + row('เตือนก่อนเรียกเก็บ', '2 วัน') + '</ul>' +
        '<p class="muted small">ยกเลิกหรือพักได้ที่ Profile → Café Mood Plus ก่อนวันที่ ' + fmt(bill) + ' โดยไม่โดนเรียกเก็บ (เดโม: ไม่มีการเก็บเงินจริง)</p>' +
        '<button class="btn primary lg" data-act="plus-confirm">เริ่มทดลองฟรี</button><button class="btn text block" data-act="close-sheet">ยังไม่เริ่ม</button>');
    };
    H['plus-confirm'] = () => { const s = sub(); s.plan = 'plus'; s.tier = tier; s.period = period; s.startedAt = Date.now(); s.trialEnd = Date.now() + TRIAL_DAYS * DAY; s.cancelled = false; s.endsAt = 0; s.pausedUntil = 0; s.pausedAt = 0; S.save(); api.closeSheet(true); api.render(true); toast('ยินดีต้อนรับสู่ Plus — ทดลองฟรี ' + TRIAL_DAYS + ' วัน'); };
    H['plus-switch'] = () => { const s = sub(); s.period = s.period === 'year' ? 'month' : 'year'; S.save(); api.render(true); toast('เปลี่ยนรอบเป็น' + (s.period === 'year' ? 'รายปี' : 'รายเดือน') + 'แล้ว'); };

    // Pause (next to Cancel — never instead of it)
    const pauseSheet = () => api.openSheet('<h2 id="sheetTitle">พัก Plus</h2><div class="seg three" role="radiogroup" aria-label="พักกี่เดือน">' + [1, 2, 3].map((m) => '<button role="radio" aria-checked="' + (pauseM === m) + '" class="' + (pauseM === m ? 'on' : '') + '" data-act="pause-pick" data-k="' + m + '">' + m + ' เดือน</button>').join('') + '</div>' +
      '<ul class="xp-lines">' + row('พักถึง', fmt(addMonths(Date.now(), pauseM))) + row('เรียกเก็บระหว่างพัก', '฿0') + row('ข้อมูล โน้ต ทริป', 'อยู่ครบ') + row('กลับมาใช้ก่อนได้', 'ทุกเมื่อ') + '</ul>' +
      '<p class="muted small">ระหว่างพัก ฟีเจอร์ Plus จะถูกพักไว้ ส่วนฟีเจอร์ฟรีใช้ได้ปกติ ครบกำหนดแล้วระบบจะกลับมาเรียกเก็บตามเดิม (เราเตือนก่อน 2 วัน)</p>' +
      '<button class="btn primary lg" data-act="plus-pause-do">พัก ' + pauseM + ' เดือน</button><button class="btn text block" data-act="close-sheet">ยังไม่พัก</button>');
    H['plus-pause-open'] = pauseSheet;
    H['pause-pick'] = (el) => { pauseM = +el.dataset.k; pauseSheet(); };
    H['plus-pause-do'] = () => { const s = sub(); s.pausedAt = Date.now(); s.pausedUntil = addMonths(Date.now(), pauseM); S.save(); api.closeSheet(true); api.render(true); toast('พัก Plus ถึง ' + fmt(s.pausedUntil)); };
    H['plus-unpause'] = () => { resume(sub()); api.render(true); toast('กลับมาใช้ Plus แล้ว'); };

    H['plus-cancel'] = () => {
      const st = status(), s = sub(), until = st.paused ? s.trialEnd : st.trialing ? s.trialEnd : st.next;
      api.openSheet('<h2 id="sheetTitle">ยกเลิก Plus?</h2><ul class="xp-lines">' + row('ใช้ Plus ได้ถึง', st.paused ? 'หยุดทันที' : fmt(until)) + row('เรียกเก็บเพิ่ม', '฿0') + row('ข้อมูล Passport / XP / โน้ต', 'อยู่ครบ') + '</ul>' +
        '<p class="muted small">คุณกลับมาสมัครได้ทุกเมื่อ</p><button class="btn danger lg" data-act="plus-cancel-do">ยืนยันยกเลิก</button>' + (st.paused ? '' : '<button class="btn ghost block" data-act="plus-pause-open">พักแทน (1–3 เดือน)</button>') + '<button class="btn text block" data-act="close-sheet">เก็บ Plus ไว้</button>');
    };
    H['plus-cancel-do'] = () => { const s = sub(), st = status(); const was = st.paused; if (was) resume(s); const st2 = status(); s.cancelled = true; s.endsAt = was ? Date.now() : st2.trialing ? s.trialEnd : st2.next; S.save(); api.closeSheet(true); api.render(true); toast('ยกเลิกแล้ว' + (was ? '' : ' — ใช้ได้ถึง ' + fmt(s.endsAt))); };
    H['plus-resume'] = () => { const s = sub(); s.cancelled = false; s.endsAt = 0; S.save(); api.render(true); toast('ต่ออายุ Plus แล้ว'); };
    H['rem-toggle'] = (el) => { const st = S.get(); st.reminders = st.reminders || {}; st.reminders[el.dataset.k] = !st.reminders[el.dataset.k]; S.save(); api.render(true); };

    // Student discount
    H['student-open'] = () => api.openSheet('<h2 id="sheetTitle">ส่วนลดนักศึกษา -' + STUDENT_OFF + '%</h2><p class="small">ใส่อีเมลมหาวิทยาลัยที่ลงท้าย <b>.ac.th</b></p>' +
      '<div class="field"><label for="stuMail">อีเมลมหาวิทยาลัย</label><input id="stuMail" type="email" inputmode="email" autocomplete="email" class="name-in" placeholder="ชื่อ@มหาวิทยาลัย.ac.th" aria-describedby="stuMsg"></div><p id="stuMsg" class="muted small" role="status"></p>' +
      '<p class="muted small">เดโม: ตรวจเฉพาะรูปแบบอีเมล ของจริงจะส่งลิงก์ยืนยันไปที่อีเมลนี้ และให้ยืนยันซ้ำทุก 1 ปี เราไม่ใช้อีเมลนี้ส่งโฆษณา</p>' +
      '<button class="btn primary lg" data-act="student-verify">ยืนยัน</button><button class="btn text block" data-act="close-sheet">ไว้ก่อน</button>');
    H['student-verify'] = () => {
      const m = ($('#stuMail').value || '').trim().toLowerCase(), msg = $('#stuMsg');
      if (!/^[^@\s]+@([a-z0-9-]+\.)+ac\.th$/.test(m)) { msg.textContent = 'ต้องเป็นอีเมลที่ลงท้ายด้วย .ac.th เช่น name@chula.ac.th'; msg.classList.add('bad'); return; }
      sub().student = { email: m, at: Date.now() }; S.save(); api.closeSheet(true); api.render(true); toast('ยืนยันนักศึกษาแล้ว — ลด ' + STUDENT_OFF + '%');
    };
    H['student-clear'] = () => { sub().student = null; S.save(); api.render(true); };

    // Duo
    H['duo-join'] = () => {
      const n = ($('#duoName').value || '').trim();
      if (!n) { $('#duoName').focus(); toast('ใส่ชื่อเพื่อนก่อนนะ'); return; }
      sub().partner = { name: n, at: Date.now() }; S.save(); api.render(true); toast(n + ' เข้าร่วม Duo แล้ว');
    };
    H['duo-remove'] = () => { sub().partner = null; S.save(); api.render(true); toast('ถอนคู่หูแล้ว — เชิญคนใหม่ได้'); };

    // Gift
    H['gift-pick'] = (el) => { giftM = +el.dataset.k; api.render(true); };
    H['gift-make'] = () => {
      const code = 'GIFT-' + giftM + '-' + (() => { const r = rnd(5); return r + '-' + chk(giftM + r); })(), s = sub();
      s.gifts = (s.gifts || []).concat({ code, m: giftM, to: giftTo.trim(), at: Date.now() }); S.save(); lastGift = code; giftTo = giftMsg = ''; api.render(true); toast('สร้างของขวัญแล้ว — คัดลอกโค้ดส่งให้เพื่อนได้เลย');
    };
    document.addEventListener('input', (e) => { if (e.target.id === 'giftTo') giftTo = e.target.value; if (e.target.id === 'giftMsg') giftMsg = e.target.value; });
    if (CM.plusTools) CM.plusTools.install(api);
  }

  const pages = { gift: vGift, wrapped: vWrapped };
  CM.plus = { install, pages, wrappedData, view: (n, a) => (pages[n] ? pages[n](a) : vPlus()), isPlus, badge, profileCard, toolsHtml, journalHtml, remindersHtml, passportTeaser, status, redeemGift, lockCard,
    noteBlock: (c) => (CM.plusTools ? CM.plusTools.noteBlock(c) : '') };
})();
