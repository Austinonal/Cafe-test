/* Café Mood — views, routing and interaction. */
(function () {
  const D = CM.data, E = CM.engine, S = CM.store, W = CM.weather, A = CM.art, I = CM.icon, ST = CM.studio;

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uniq = (a) => Array.from(new Set(a));

  const view = $('#view'), nav = $('#nav'), sheetRoot = $('#sheet-root'), toastEl = $('#toast');

  let draftMoods = [];           // a new day starts with a clean mood picker
  let draftText = '';
  // ponytail: demo cafés only carry a ย่าน (area). Mapped to เขต here; real data should carry province + district itself.
  const PROVINCE = 'กรุงเทพมหานคร';
  const DISTRICT = { 'สยาม': 'ปทุมวัน', 'ทองหล่อ': 'วัฒนา', 'เอกมัย': 'วัฒนา', 'พร้อมพงษ์': 'วัฒนา', 'ตลิ่งชัน': 'ตลิ่งชัน', 'เยาวราช': 'สัมพันธวงศ์', 'เมืองเก่า': 'พระนคร',
    'เจริญกรุง': 'บางรัก', 'บางรัก': 'บางรัก', 'สีลม': 'บางรัก', 'อารีย์': 'พญาไท', 'สาทร': 'สาทร', 'รัชดา': 'ห้วยขวาง', 'พระโขนง': 'พระโขนง', 'บางนา': 'บางนา', 'ธนบุรี': 'ธนบุรี' };
  const distOf = (c) => c.district || DISTRICT[c.area] || c.area;
  D.districtOf = distOf;   // the developer console groups cafés by it
  const filt = { areas: new Set(), near: false, events: false };   // applied filter: areas holds เขต names
  const areaOn = () => filt.areas.size > 0 || filt.near;
  const filtOn = () => areaOn() || filt.events;
  const fN = () => filt.areas.size + (filt.near ? 1 : 0) + (filt.events ? 1 : 0);
  // Best running/upcoming event of a café: live first, then today, then soonest.
  const EV_RANK = { live: 0, today: 1, upcoming: 2 };
  const evOf = (c) => ST.eventsAll().filter((e) => e.cafeId === c.id && ST.eventStatus(e) !== 'ended').sort((a, b) => EV_RANK[ST.eventStatus(a)] - EV_RANK[ST.eventStatus(b)] || (a.startDate + a.startTime < b.startDate + b.startTime ? -1 : 1))[0];
  let searchQ = '';              // home search box (kept so Back from a café returns to the results)
  let ci = null;                 // check-in draft
  let drinkIdx = 0;
  let hiddenAll = false;
  let sheetOpen = false;
  let lastFocus = null;
  let quizLock = false;
  const stack = [];

  /* ---------- helpers ---------- */
  const session = () => { const st = S.get(); return { profile: st.profile, mood: st.mood, ctx: W.ctx }; };
  const center = () => { const l = S.get().location; return l.source === 'gps' && E.distKm(l, D.DEMO_CENTER) < 40 ? l : D.DEMO_CENTER; };
  const fmtDist = (c) => { const k = E.distKm(center(), c); return k < 1 ? Math.round(k * 100) * 10 + ' ม.' : k.toFixed(1) + ' กม.'; };
  const priceText = (c) => { const p = c.drinks.map((d) => d.price); return '฿' + Math.min.apply(null, p) + '–' + Math.max.apply(null, p); };
  const typeTh = { coffee: 'กาแฟ', latte: 'ลาเต้', matcha: 'มัทฉะ', tea: 'ชา', signature: 'ซิกเนเจอร์' };
  const tempTh = { hot: 'ร้อน', iced: 'เย็น' };
  const vis = () => S.live();

  function stars(n, max) {
    max = max || 5;
    let h = '';
    for (let i = 0; i < max; i++) h += '<span class="' + (i < n ? 'on' : '') + '">' + I('star', 14) + '</span>';
    return '<span class="stars" role="img" aria-label="' + n + ' จาก ' + max + '">' + h + '</span>';
  }

  function ring(pct, size, cls) {
    size = size || 56;
    const r = (size - 8) / 2, c = 2 * Math.PI * r, m = size / 2;
    return '<div class="ring ' + (cls || '') + '" style="--s:' + size + 'px" role="img" aria-label="' + pct + ' เปอร์เซ็นต์">' +
      '<svg viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size + '" aria-hidden="true">' +
      '<circle class="ring-bg" cx="' + m + '" cy="' + m + '" r="' + r + '"/>' +
      '<circle class="ring-fg" cx="' + m + '" cy="' + m + '" r="' + r + '" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + (c * (1 - pct / 100)).toFixed(1) + '" transform="rotate(-90 ' + m + ' ' + m + ')"/></svg>' +
      '<b aria-hidden="true"><span>' + pct + '<small>%</small></span></b></div>';
  }

  const chipInner = () => I(W.ctx.icon, 18) + '<span>' + esc(W.ctx.label) + (W.ctx.temp != null ? ' ' + W.ctx.temp + '°' : '') + '</span>';
  const weatherChip = () => '<button class="wchip" data-act="open-weather" data-weather-chip aria-label="สภาพอากาศตอนนี้: ' + esc(W.describe()) + ' — แตะเพื่อเปลี่ยน">' + chipInner() + '</button>';

  const backBtn = (fallback) => '<button class="iconbtn" data-act="back" data-fallback="' + fallback + '" aria-label="ย้อนกลับ">' + I('arrow-left', 22) + '</button>';

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => toastEl.classList.remove('show'), 2600);
  }

  const go = (h) => { location.hash = h; };

  function parseRoute() {
    const h = (location.hash || '#/').replace(/^#\/?/, '');
    const parts = h.split('/');
    return { name: parts[0] || 'home', arg: parts[1] };
  }

  /* ---------- reusable cards ---------- */
  function badges(s) {
    let h = '';
    if (s.hidden.eligible && s.hidden.score >= 80) h += '<span class="badge gem">' + I('gem', 13) + 'Hidden gem</span>';
    h += ST.badgesHtml(s.cafe);
    h += '<span class="badge ' + (s.open.open ? 'ok' : 'off') + '">' + I('clock', 13) + esc(s.open.text) + '</span>' + ST.liveChip(s.cafe);
    return h;
  }

  function rowCard(s, o) {
    o = o || {};
    const c = s.cafe;
    return '<a class="row-card" href="#/cafe/' + c.id + '">' +
      '<div class="thumb">' + A.coverArt(c) + '</div>' +
      '<div class="rc-body"><h3>' + esc(c.name) + (ST.isVerified(c) ? ' <span class="vmark" title="Verified">' + I('badge-check', 15) + '</span>' : '') + '</h3>' +
      '<p class="meta">' + I('pin', 13) + '<span class="nw">' + esc(c.area) + ' ·</span> <span class="nw">' + fmtDist(c) + ' ·</span> <span class="nw">' + priceText(c) + '</span></p>' +
      '<p class="why">' + esc(o.line || s.reasons[0]) + '</p></div>' +
      (o.hiddenScore ? ring(s.hidden.score, 52, 'gemring') : ring(s.match, 52)) +
      '<div class="rc-tags">' + (o.ev ? '<span class="evtag ev-' + EV_STATUS[ST.eventStatus(o.ev)][1] + '">' + I('star', 13) + '<b>' + EV_STATUS[ST.eventStatus(o.ev)][0] + '</b><span>' + esc(o.ev.title) + '</span></span>' : '') + ST.liveChip(c) +
      (s.open.open ? '' : '<span class="badge off">' + I('clock', 13) + esc(s.open.text) + '</span>') + '</div></a>';
  }

  /* ---------- views ---------- */
  function vWelcome() {
    return { nav: false, html:
      '<section class="welcome rise">' +
      '<div class="welcome-art" aria-hidden="true">' + A.drinkArt({ temp: 'hot', colors: ['#C98B4B', '#5B3A22'] }) + '</div>' +
      '<p class="eyebrow">Café Mood</p>' +
      '<h1 class="display">Don’t find a café.<br>Find <em>your</em> café for&nbsp;today.</h1>' +
      '<p class="lead">ไม่ได้ถามแค่ว่า “คาเฟ่ไหนดี?” แต่ถามว่า <strong>“วันนี้ฉันควรไปคาเฟ่ไหน?”</strong></p>' +
      '<ul class="pillars">' +
      '<li>' + I('sparkles', 20) + '<div><b>Mood วันนี้</b><span>รู้สึกยังไง อยากทำอะไร</span></div></li>' +
      '<li>' + I('cloud-rain', 20) + '<div><b>สภาพอากาศ</b><span>เราคิดให้เอง ไม่ต้องกด</span></div></li>' +
      '<li>' + I('user', 20) + '<div><b>นิสัยคาเฟ่ของคุณ</b><span>Quiz สั้น ๆ 10 ข้อ</span></div></li></ul>' +
      '<button class="btn primary lg" data-act="start-quiz">เริ่มค้นหา Café Personality ของฉัน</button>' +
      '<button class="btn text" data-act="skip-quiz">ข้ามไปก่อน เริ่มเลย</button>' +
      '<p class="muted small center">' + (CM.auth.current() ? 'เข้าสู่ระบบอยู่' : 'มีบัญชีอยู่แล้ว? <a href="#/login">เข้าสู่ระบบ</a> · <a href="#/signup">สมัครสมาชิก</a>') + '</p>' +
      '</section>' };
  }

  function vQuiz(n) {
    n = parseInt(n, 10);
    if (!(n >= 0 && n < D.QUIZ.length)) { location.replace('#/quiz/0'); return null; }
    const q = D.QUIZ[n], total = D.QUIZ.length, chosen = S.get().quizDraft[n];
    const opts = q.options.map((o, i) =>
      '<button class="opt' + (chosen === i ? ' on' : '') + (o.icon ? '' : ' noicon') + '" data-act="quiz-pick" data-q="' + n + '" data-o="' + i + '" aria-pressed="' + (chosen === i) + '">' +
      (o.icon ? '<span class="opt-ic">' + I(o.icon, 24) + '</span>' : '') +
      '<span class="opt-t"><b>' + esc(o.t) + '</b><small>' + esc(o.s) + '</small></span>' +
      '<span class="opt-ck">' + I('check', 18) + '</span></button>').join('');
    return { nav: false, html:
      '<section class="quiz rise" key="' + n + '">' +
      '<div class="topbar">' + (n > 0 ? '<button class="iconbtn" data-act="quiz-prev" aria-label="ข้อก่อนหน้า">' + I('arrow-left', 22) + '</button>' : '<button class="iconbtn" data-act="back" data-fallback="#/welcome" aria-label="ย้อนกลับ">' + I('arrow-left', 22) + '</button>') +
      '<span class="count" aria-live="polite">ข้อ ' + (n + 1) + ' / ' + total + '</span>' +
      '<button class="btn text sm" data-act="skip-quiz">ข้าม</button></div>' +
      '<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="' + total + '" aria-valuenow="' + (n + 1) + '"><span style="width:' + ((n + 1) / total * 100) + '%"></span></div>' +
      '<h1 class="q">' + esc(q.q) + '</h1>' + (q.hint ? '<p class="muted">' + esc(q.hint) + '</p>' : '') +
      '<div class="opts">' + opts + '</div></section>' };
  }

  function vPersona() {
    const p = S.get().profile;
    if (!p) { location.replace('#/home'); return null; }
    const a = D.ARCHETYPE_BY_ID[p.archetype];
    const likes = E.likes(p).map((t) => '<li>' + I('check', 15) + esc(t) + '</li>').join('');
    return { nav: false, html:
      '<section class="persona rise">' +
      '<p class="eyebrow center">Your Café Personality</p>' +
      '<div class="persona-card" style="--hue:' + a.hue + '"><div class="persona-ic">' + I(a.icon, 40) + '</div>' +
      '<h1 class="display sm">' + esc(a.name) + '</h1><p class="th">' + esc(a.th) + '</p><p class="blurb">' + esc(a.blurb) + '</p></div>' +
      '<h2 class="sec-title">คุณชอบ</h2><ul class="likes">' + likes + '</ul>' +
      '<p class="muted small">เราจะใช้โปรไฟล์นี้เป็นพื้นฐาน แล้วปรับตาม Mood และอากาศของแต่ละวัน</p>' +
      '<button class="btn primary lg" data-act="go" data-to="#/home">เริ่มหาคาเฟ่ของวันนี้</button>' +
      '<button class="btn text" data-act="retake">ทำ Quiz ใหม่</button></section>' };
  }

  /* ---------- ① Home — "Today" ---------- */
  const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };

  function heroCard(s) {
    const c = s.cafe;
    return '<a class="hero-card" href="#/cafe/' + c.id + '"><div class="hc-cover">' + A.coverArt(c) + '<span class="badge solid">Top pick</span></div>' +
      '<div class="hc-body"><div class="hc-head"><div><h2>' + esc(c.name) + '</h2><p class="meta">' + I('pin', 14) + esc(c.area) + ' · ' + fmtDist(c) + ' · ' + priceText(c) + '</p></div>' + ring(s.match, 64) + '</div>' +
      '<ul class="reasons">' + s.reasons.map((r) => '<li>' + I('check', 16) + esc(r) + '</li>').join('') + '</ul><div class="badges">' + badges(s) + '</div></div></a>';
  }

  // Search: name, area, tagline, drink names. Reuses rank() so each hit keeps its Match % card.
  function searchHtml(q) {
    q = q.trim().toLowerCase();
    const inArea = (c) => !areaOn() || filt.areas.has(distOf(c)) || (filt.near && E.distKm(center(), c) <= 5);
    const hits = E.rank(session()).filter((s) => inArea(s.cafe) && (!filt.events || evOf(s.cafe)) && [s.cafe.name, s.cafe.area, distOf(s.cafe), s.cafe.tagline].concat(s.cafe.drinks.map((d) => d.name)).join(' ').toLowerCase().includes(q));
    // Cafés with an event go first (live > today > soon), then the rest; each group keeps its Match order.
    hits.forEach((s) => { s.ev = evOf(s.cafe); });
    hits.sort((a, b) => (a.ev ? EV_RANK[ST.eventStatus(a.ev)] : 9) - (b.ev ? EV_RANK[ST.eventStatus(b.ev)] : 9));
    const withEv = hits.filter((s) => s.ev), rest = hits.filter((s) => !s.ev);
    const group = (t, l) => (l.length ? (withEv.length && rest.length ? '<h2 class="grp">' + t + '</h2>' : '') + '<div class="list">' + l.map((s) => rowCard(s, { line: s.cafe.tagline, ev: s.ev })).join('') + '</div>' : '');
    const chips = (filt.events ? '<button class="fchip on" data-act="filter-remove" data-k="@ev">มีอีเว้นท์ช่วงนี้ ' + I('x', 14) + '</button>' : '') + (filt.near ? '<button class="fchip on" data-act="filter-remove" data-k="@near">ใกล้ฉัน ' + I('x', 14) + '</button>' : '') +
      [...filt.areas].map((a) => '<button class="fchip on" data-act="filter-remove" data-k="' + esc(a) + '">' + esc(a) + ' ' + I('x', 14) + '</button>').join('');
    return (chips ? '<div class="fchips wrapchips" aria-label="ตัวกรองที่ใช้อยู่">' + chips + '</div>' : '') + '<p class="muted small" role="status">' + (hits.length ? (q || filtOn() ? 'พบ ' : 'ทั้งหมด ') + hits.length + ' ร้าน' : 'ไม่พบร้านที่ตรงกับ “' + esc(q) + '”') + '</p>' +
      (hits.length ? group(I('star', 16) + ' มีอีเว้นท์ช่วงนี้', withEv) + group('คาเฟ่อื่น ๆ', rest)
        : '<div class="card empty"><p class="muted">ลองค้นด้วยชื่อร้าน ย่าน (เช่น อารีย์) หรือเมนู (เช่น มัทฉะ)</p></div>');
  }

  // Everything under the mood picker. Re-rendered in place whenever the mood changes.
  function homeBody() {
    const ses = session();
    const ranked = E.rank(ses);
    const hasMood = !!ses.mood;
    const dp = E.drinkRank(ses)[0];
    const near = ranked.filter((s) => s.hidden.eligible && E.distKm(center(), s.cafe) <= 5).sort((a, b) => b.hidden.score - a.hidden.score);
    const moodLine = hasMood
      ? '<p class="mood-line">Your Café Mood · <b>' + esc(E.moodHeadline(ses.mood, W.ctx)) + '</b><span class="inline-ic">' + I(W.ctx.icon, 18) + '</span></p>'
      : '<p class="muted small">ยังไม่ได้เลือก mood — ตอนนี้เลือกจากนิสัยคาเฟ่ของคุณและอากาศ</p>';
    return '<h2 class="sec-title">' + I('sparkles', 20) + 'Recommended for You</h2>' + moodLine +
      heroCard(ranked[0]) + '<div class="list">' + ranked.slice(1, 3).map((s) => rowCard(s)).join('') + '</div>' +
      (hasMood ? '<a class="btn ghost block" href="#/results">ดูทั้งหมด ' + I('chevron-right', 18) + '</a>' : '') +
      '<h2 class="sec-title">' + I('cup', 20) + 'Today’s Drink</h2>' +
      '<a class="drink-card" href="#/drink"><span class="mr-art">' + A.drinkArt(dp.drink) + '</span><span class="dc-t"><b>' + esc(dp.drink.name) + '</b><small>' + esc(dp.cafe.name) + ' · ฿' + dp.drink.price + '</small><small class="why">' + esc(dp.reasons[0]) + '</small></span>' + I('chevron-right', 20) + '</a>' +
      eventsHomeHtml(ses) + momentsHtml(ses) +
      '<h2 class="sec-title">' + I('gem', 20) + 'Hidden Nearby</h2>' +
      '<a class="drink-card" href="#/hidden"><span class="dc-ic">' + I('gem', 26) + '</span><span class="dc-t"><b>' + near.length + ' cafés discovered</b><small>' + (near.slice(0, 2).map((s) => esc(s.cafe.name)).join(' · ') || 'ลองเปิดดูร้านลับทั้งหมด') + '</small></span>' + I('chevron-right', 20) + '</a>';
  }

  function momentsHtml(ses) {
    const ms = ST.momentsFor(ses);
    if (!ms.length) return '';
    return '<h2 class="sec-title">' + I('sparkles', 20) + 'Café Moment</h2>' + ms.map((m) => {
      const c = D.CAFE_BY_ID[m.cafeId];
      return '<a class="moment" href="#/cafe/' + c.id + '"><small class="kicker">' + (m.sponsored ? 'Sponsored · ' : '') + esc(c.name) + (ST.isVerified(c) ? ' · Verified' : '') + '</small><b>' + esc(m.title) + '</b><span>' + esc(m.body) + '</span></a>';
    }).join('');
  }

  // Area picker (full-height sheet). Draft selection lives in the DOM; "ตกลง" copies it into `filt`.
  function sheetFilter() {
    const by = {};
    D.CAFES.forEach((c) => { (by[distOf(c)] = by[distOf(c)] || []).push(c); });
    const ds = Object.keys(by).sort((x, y) => by[y].length - by[x].length || x.localeCompare(y, 'th'));
    const sub = ds.map((d) => '<li data-s="' + esc((d + ' ' + by[d].map((c) => c.area + ' ' + c.name).join(' ')).toLowerCase()) + '"><label class="arow sub"><input type="checkbox" data-d value="' + esc(d) + '"' + (filt.areas.has(d) ? ' checked' : '') + '><span class="rb" aria-hidden="true">' + I('check', 14) + '</span><b>เขต' + esc(d) + '</b><small class="cnt">' + by[d].length + '</small></label></li>').join('');
    openSheet('<div class="fs-head"><button class="iconbtn" data-act="close-sheet" aria-label="ปิด">' + I('x', 22) + '</button></div>' +
      '<h2 id="sheetTitle" class="center">ตัวกรอง</h2><p class="muted center">เลือกได้หลายเขต ตัวเลขท้ายชื่อคือจำนวนคาเฟ่ในเขตนั้น</p>' +
      '<div class="search">' + I('search', 20) + '<input id="areaSearch" type="search" autocomplete="off" aria-label="ค้นหาเขตหรือชื่อร้าน" placeholder="ค้นหาจากชื่อเขต ย่าน หรือชื่อร้าน"></div>' +
      '<label class="arow near"><input type="checkbox" id="nearMe"' + (filt.near ? ' checked' : '') + '><span class="rb" aria-hidden="true">' + I('check', 14) + '</span>' + I('target', 22) + '<b>ใกล้ฉัน</b><small>ในรัศมี 5 กม.</small></label>' +
      '<label class="arow near evnow"><input type="checkbox" id="evOnly"' + (filt.events ? ' checked' : '') + '><span class="rb" aria-hidden="true">' + I('check', 14) + '</span>' + I('star', 22) + '<b>มีอีเว้นท์ช่วงนี้</b><small class="cnt">' + new Set(ST.eventsAll().filter((e) => ST.eventStatus(e) !== 'ended').map((e) => e.cafeId)).size + '</small></label>' +
      '<ul class="areas"><li><div class="arow"><label><input type="checkbox" data-p><span class="rb" aria-hidden="true">' + I('check', 14) + '</span><b>' + PROVINCE + '</b><small class="cnt">' + D.CAFES.length + '</small></label>' +
      '<button class="chev" data-act="area-expand" aria-expanded="true" aria-label="ซ่อนหรือแสดงเขต">' + I('chevron-down', 20) + '</button></div>' +
      '<ul class="dists">' + sub + '</ul></li></ul>' +
      '<div class="fs-foot"><button class="btn text" data-act="filter-clear">ล้าง</button><button id="fApply" class="btn primary lg" data-act="filter-apply">ตกลง</button></div>');
    syncProv(); fCount();
    sheetRoot.firstElementChild.nextElementSibling.classList.add('tall');
  }
  const syncProv = () => { const p = $('.sheet [data-p]'), d = $$('.sheet [data-d]'); if (p) p.checked = d.length > 0 && d.every((i) => i.checked); };
  const fCount = () => {
    const n = $$('.sheet [data-d]:checked, #nearMe:checked, #evOnly:checked').length, b = $('#fApply');
    if (b) b.textContent = n ? 'ตกลง (' + n + ')' : 'ตกลง';
  };

  function refreshHome() {
    const el = $('#today');
    if (el) el.innerHTML = homeBody();
  }

  // Turn picker tiles (+ optional free text) into today's mood. Returns false if nothing usable.
  function applyMood(text) {
    const a = E.analyzeText(text);
    const moods = uniq(draftMoods.concat(a.moods)).slice(0, 3);
    if (!moods.length && !Object.keys(a.boosts).length) return false;
    const tileLabels = draftMoods.filter((id) => !a.moods.includes(id)).map((id) => D.MOOD_BY_ID[id].th);
    S.patch({ mood: { moods, boosts: a.boosts, hidden: a.hidden, drink: a.drink, night: a.night, labels: uniq(tileLabels.concat(a.labels)), text } });
    drinkIdx = 0;
    return true;
  }

  function vHome() {
    const st = S.get(), ses = session();
    const tiles = D.MOODS.map((m) => {
      const on = draftMoods.includes(m.id);
      return '<button class="mood-tile' + (on ? ' on' : '') + '" data-act="toggle-mood" data-id="' + m.id + '" aria-pressed="' + on + '" style="--m:' + m.hue + '">' +
        '<span class="mt-ic">' + I(m.icon, 22) + '</span><span class="mt-t"><b>' + m.short + '</b><small>' + esc(m.thShort) + '</small></span>' +
        '<span class="mt-ck">' + I('check', 14) + '</span></button>';
    }).join('');
    const ex = ['อยากนั่งเงียบ ๆ คนเดียว อ่านหนังสือ แล้วอยากได้ร้านบรรยากาศดี', 'นัดเพื่อนถ่ายรูป อยากได้ร้านที่มีต้นไม้และแสงสวย ๆ', 'อยากหามัทฉะอร่อย ๆ ร้านลับ ไม่ค่อยมีคนรู้'];
    const exChips = ex.map((t, i) => '<button class="chip" data-act="example" data-i="' + i + '">' + esc(t) + '</button>').join('');
    const persona = ses.profile
      ? 'จับคู่กับ <a href="#/profile"><strong>' + esc(D.ARCHETYPE_BY_ID[ses.profile.archetype].name) + '</strong></a> ของคุณ'
      : '<a href="#/quiz/0">ทำ Quiz เพื่อให้แนะนำแม่นขึ้น</a>';
    return { nav: true, html:
      '<header class="hero-top ambient"><div class="topbar between"><span class="brand">' + I('coffee', 20) + 'Café Mood</span>' + weatherChip() + '</div>' +
      '<h1 class="display sm">' + greeting() + (st.name ? ', ' + esc(st.name) : '') + '.</h1>' +
      '<p class="lead sm">' + I(W.ctx.icon, 18, 'inl') + ' ' + esc(W.ctx.label) + (W.ctx.temp != null ? ' · ' + W.ctx.temp + '°C' : '') + '</p>' +
      '<a class="search fake" href="#/search">' + I('search', 20) + '<span>ค้นหาร้าน ย่าน เมนู</span></a></header>' +
      '<section id="homeMain" class="pad rise">' + CM.dev.newsHtml() + '<h2 class="sec-title first">Your mood today?</h2>' +
      '<div class="mood-grid compact" role="group" aria-label="เลือก Mood ของวันนี้ (สูงสุด 3 อย่าง)">' + tiles + '</div>' +
      '<details class="tell"' + (draftText ? ' open' : '') + '><summary>' + I('sparkles', 18) + 'หรือเล่าให้ฟังเป็นประโยค</summary>' +
      '<div class="field"><label for="moodText" class="sr">เล่าว่าวันนี้เป็นยังไง</label>' +
      '<textarea id="moodText" rows="3" maxlength="240" aria-describedby="moodError" placeholder="เช่น วันนี้อยากนั่งเงียบ ๆ คนเดียว อ่านหนังสือ แล้วอยากได้ร้านบรรยากาศดี">' + esc(draftText) + '</textarea>' +
      '<div class="examples">' + exChips + '</div>' +
      '<p id="moodError" class="error" role="alert" hidden></p>' +
      '<button class="btn primary block" data-act="find">อ่าน mood ของฉัน</button></div></details>' +
      '<p class="muted small persona-line">' + persona + '</p>' +
      '<div id="today" class="today" aria-live="polite">' + homeBody() + '</div></section>' };
  }

  /* ---------- ② Discover (explore hub) + lenses ---------- */
  const isNightCafe = (c) => c.hours[1] >= 22;
  function winOf(best) { return best.split('–').map((t) => { const p = t.split(':'); return +p[0] + (+p[1]) / 60; }); }

  function bestSpot(c, hour) {
    let best = null;
    c.spots.forEach((p) => {
      const w = winOf(p.best), now = hour >= w[0] && hour < w[1], q = p.light + p.bg;
      if (!best || (now && !best.now) || (now === best.now && q > best.q)) best = { spot: p, now, q };
    });
    return best;
  }

  const LENS = {
    photo: { title: 'Photo Spots', icon: 'camera', sub: 'มุมถ่ายรูปที่แสงสวยที่สุด — ร้านที่แสงดีตอนนี้ขึ้นก่อน',
      build: (list, ses) => list.map((s) => ({ s, b: bestSpot(s.cafe, ses.ctx.hour) }))
        .sort((x, y) => (y.b.now - x.b.now) * 10 + (y.b.q - x.b.q) + (y.s.cafe.attr.photo - x.s.cafe.attr.photo) / 2).slice(0, 8)
        .map((o) => ({ s: o.s, line: o.b.spot.name + ' · ' + o.b.spot.best + (o.b.now ? ' · แสงสวยตอนนี้' : '') })) },
    nature: { title: 'Nature Cafés', icon: 'leaf', sub: 'ต้นไม้ สวน และธรรมชาติเต็มร้าน',
      build: (list) => list.filter((s) => s.cafe.attr.nature >= 7).sort((a, b) => (b.cafe.attr.nature - a.cafe.attr.nature) * 10 + (b.match - a.match))
        .map((s) => ({ s, line: s.cafe.tagline })) },
    night: { title: 'Night Cafés', icon: 'moon', sub: 'เปิดดึก บรรยากาศไฟอุ่น — ร้านที่เปิดอยู่ตอนนี้ขึ้นก่อน',
      build: (list) => list.filter((s) => isNightCafe(s.cafe)).sort((a, b) => (b.open.open - a.open.open) * 100 + (b.match - a.match))
        .map((s) => ({ s, line: s.cafe.tagline })) }
  };

  function vDiscover() {
    const ses = session(), all = D.CAFES;
    const dp = E.drinkRank(ses)[0];
    const hidN = all.filter((c) => E.hiddenInfo(c).eligible).length;
    const evN = ST.eventsAll().filter((e) => ST.eventStatus(e) !== 'ended').length;
    const rows = [
      ['star', 'Events', evN + ' อีเว้นท์ — เมนูพิเศษ เซ็ต และของแจกจากร้าน', '#/events'],
      ['gem', 'Hidden Cafés', hidN + ' ร้านลับ — รีวิวน้อย แต่คนกลับมาซ้ำเยอะ', '#/hidden'],
      ['camera', 'Photo Spots', all.reduce((n, c) => n + c.spots.length, 0) + ' จุดถ่ายรูป พร้อมเวลาที่แสงสวย', '#/lens/photo'],
      ['cup', 'One Drink', 'แก้วของวันนี้: ' + dp.drink.name, '#/drink'],
      ['leaf', 'Nature Cafés', all.filter((c) => c.attr.nature >= 7).length + ' ร้านที่เต็มไปด้วยต้นไม้', '#/lens/nature'],
      ['moon', 'Night Cafés', all.filter(isNightCafe).length + ' ร้านเปิดดึก ไฟอุ่น ๆ', '#/lens/night']
    ].map((r) => '<a class="lens-card" href="' + r[3] + '"><span class="lens-ic">' + I(r[0], 26) + '</span><span class="lc-t"><b>' + r[1] + '</b><small>' + esc(r[2]) + '</small></span>' + I('chevron-right', 20) + '</a>').join('');
    return { nav: true, html:
      '<header class="hero-top ambient"><div class="topbar between"><span class="brand">' + I('compass', 20) + 'Discover</span>' + weatherChip() + '</div>' +
      '<h1 class="display">สำรวจคาเฟ่<br>แบบไม่ซ้ำเดิม</h1><p class="lead sm">เลือกมุมมองที่อยากเล่นวันนี้</p></header>' +
      '<section class="pad rise"><div class="list lens">' + rows + '</div></section>' };
  }

  function vSearch() {
    const n = fN();
    // mount: focus only on a fresh visit, so closing the filter doesn't pop the keyboard
    return { nav: false, mount: (again) => { if (!again && !searchQ.trim() && !filtOn()) setTimeout(() => $('#cafeSearch') && $('#cafeSearch').focus({ preventScroll: true }), 50); }, html:
      '<header class="hero-top ambient compact"><div class="searchrow">' + backBtn('#/home') +
      '<div class="search">' + I('search', 20) + '<input id="cafeSearch" type="search" enterkeyhint="search" autocomplete="off" aria-label="ค้นหาคาเฟ่" placeholder="ค้นหาร้าน" value="' + esc(searchQ) + '"></div>' +
      '<button class="iconbtn fbtn' + (n ? ' on' : '') + '" data-act="open-filter" aria-label="ตัวกรองเขต' + (n ? ' (' + n + ')' : '') + '">' + I('sliders', 22) + (n ? '<i class="fcount">' + n + '</i>' : '') + '</button></div></header>' +
      '<section id="searchOut" class="pad" aria-live="polite">' + searchHtml(searchQ) + '</section>' };
  }

  function vLens(id) {
    const cfg = LENS[id];
    if (!cfg) { location.replace('#/discover'); return null; }
    const ses = session();
    const items = cfg.build(D.CAFES.map((c) => E.scoreCafe(c, ses)), ses);
    return { nav: true, html:
      '<header class="hero-top ambient"><div class="topbar between"><div class="topbar">' + backBtn('#/discover') + '<span class="brand">' + I(cfg.icon, 20) + esc(cfg.title) + '</span></div>' + weatherChip() + '</div>' +
      '<p class="lead sm">' + esc(cfg.sub) + '</p></header>' +
      '<section class="pad rise"><div class="list">' + items.map((o) => rowCard(o.s, { line: o.line })).join('') + '</div></section>' };
  }

  /* ---------- ③ Map ---------- */
  let map = null, mapMarkers = [], meMarker = null, meAcc = null;
  const geo = { prov: '', area: '' };
  const provOf = (c) => c.province || 'กรุงเทพฯ'; // shortcut: demo data is all Bangkok; add `province` to a café when real data arrives
  const mapFilters = new Set();
  const MAP_FILTERS = [
    ['mood', 'Mood วันนี้', (s, ctx) => ctx.moodTop.has(s.cafe.id)],
    ['quiet', 'Quiet', (s) => s.cafe.attr.quiet >= 8],
    ['photo', 'Photo', (s) => s.cafe.attr.photo >= 8],
    ['hidden', 'Hidden', (s) => s.hidden.eligible],
    ['coffee', 'Coffee', (s) => s.cafe.attr.coffee >= 8],
    ['outdoor', 'Outdoor', (s) => s.cafe.attr.outdoor >= 5],
    ['rainy', 'Rainy', (s) => E.weatherFit(s.cafe, { kind: 'rain', night: false }) >= .62],
    ['night', 'Night', (s) => isNightCafe(s.cafe)]
  ];

  function vMap() {
    const hasMood = !!S.get().mood;
    const chips = MAP_FILTERS.filter((f) => f[0] !== 'mood' || hasMood).map((f) =>
      '<button class="fchip' + (mapFilters.has(f[0]) ? ' on' : '') + '" data-act="toggle-filter" data-k="' + f[0] + '" aria-pressed="' + mapFilters.has(f[0]) + '">' + f[1] + '</button>').join('');
    return { nav: true, mount: initMap, html:
      '<header class="hero-top ambient compact"><div class="topbar between"><span class="brand">' + I('map', 20) + 'Map</span>' + weatherChip() + '</div>' +
      '<div class="fchips" role="group" aria-label="ตัวกรองแผนที่">' + chips + '</div>' + geoRow() + '</header>' +
      '<section class="map-wrap"><div class="map-stage"><div id="map" class="map"></div><button class="locate-btn" id="locateBtn" data-act="locate-me" aria-label="หาตำแหน่งของฉัน">' + I('navigation', 22) + '</button></div><p id="mapCount" class="map-count" aria-live="polite"></p><div id="mapCard" class="pad tight"></div></section>' };
  }

  function initMap() {
    const box = $('#map');
    if (!box) return;
    meMarker = meAcc = null;
    bindGeoRow();
    if (!window.L) { box.innerHTML = '<div class="map-fallback">' + I('map', 28) + '<p>ต้องต่ออินเทอร์เน็ตเพื่อโหลดแผนที่</p><a class="btn ghost" href="#/discover">ดูเป็นรายการแทน</a></div>'; return; }
    const c = center();
    map = L.map(box, { zoomControl: true, dragging: true, tap: true, scrollWheelZoom: true, touchZoom: true, doubleClickZoom: true, zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false }).setView([c.lat, c.lon], 12);
    L.control.scale({ imperial: false }).addTo(map);
    let tileFail = 0;
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map)
      .on('tileerror', () => { if (++tileFail === 3) box.insertAdjacentHTML('afterend', '<p class="map-note" role="status">โหลดพื้นแผนที่ไม่ได้ — OpenStreetMap ต้องเปิดผ่านเว็บ https (เช่น GitHub Pages) หรือ localhost ถ้าเปิดไฟล์ตรง ๆ หรืออยู่ในหน้าตัวอย่างจะเห็นแต่หมุด</p>'); });
    const loc0 = S.get().location;
    if (loc0.source === 'gps') showMe(loc0);
    drawMarkers(true);
  }

  /* province / district filter (selects: native, work well on mobile) */
  function geoRow() {
    const opt = (v, t, cur) => '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(t) + '</option>';
    const provs = Array.from(new Set(D.CAFES.map(provOf))).sort((a, b) => a.localeCompare(b, 'th'));
    const cnt = {};
    D.CAFES.filter((c) => !geo.prov || provOf(c) === geo.prov).forEach((c) => { cnt[c.area] = (cnt[c.area] || 0) + 1; });
    const areas = Object.keys(cnt).sort((a, b) => a.localeCompare(b, 'th'));
    return '<div class="geo-row">' +
      '<label><span>จังหวัด</span><select id="geoProv">' + opt('', 'ทุกจังหวัด', geo.prov) + provs.map((v) => opt(v, v, geo.prov)).join('') + '</select></label>' +
      '<label><span>เขต / ย่าน</span><select id="geoArea">' + opt('', 'ทุกเขต / ย่าน', geo.area) + areas.map((v) => opt(v, v + ' (' + cnt[v] + ')', geo.area)).join('') + '</select></label></div>';
  }

  function bindGeoRow() {
    const pv = $('#geoProv'), ar = $('#geoArea');
    if (!pv || !ar) return;
    pv.onchange = () => { geo.prov = pv.value; geo.area = ''; const row = $('.geo-row'); row.outerHTML = geoRow(); bindGeoRow(); drawMarkers(true); };
    ar.onchange = () => { geo.area = ar.value; drawMarkers(true); };
  }

  /* my location on the map */
  function showMe(l, acc) {
    const ll = [l.lat, l.lon];
    if (meMarker) meMarker.setLatLng(ll);
    else meMarker = L.marker(ll, { icon: L.divIcon({ className: '', html: '<div class="me-dot"></div>', iconSize: [18, 18] }), interactive: false, keyboard: false, zIndexOffset: 1000 }).addTo(map);
    if (meAcc) { meAcc.remove(); meAcc = null; }
    if (acc) meAcc = L.circle(ll, { radius: acc, color: '#1F5FBF', weight: 1, fillOpacity: .1, interactive: false }).addTo(map);
  }

  const getPos = (o) => new Promise((ok, no) => navigator.geolocation.getCurrentPosition(ok, no, o));

  async function locateMe(btn) {
    if (!map) return;
    if (!navigator.geolocation || !window.isSecureContext) { toast('เปิดแอปผ่าน https (เช่น GitHub Pages) ก่อนถึงจะหาตำแหน่งได้'); return; }
    btn.disabled = true; btn.classList.add('busy');
    try {
      let p;
      try { p = await getPos({ enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }); }
      catch (e) { if (e.code === 1) throw e; p = await getPos({ enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 }); } // shortcut: indoors GPS often times out, so retry once with network location
      const l = { lat: p.coords.latitude, lon: p.coords.longitude, source: 'gps' };
      S.patch({ location: l });
      if (W.refresh) W.refresh().catch(() => {});
      showMe(l, p.coords.accuracy);
      map.setView([l.lat, l.lon], Math.max(map.getZoom(), 15), { animate: false });
      btn.classList.add('on');
      toast(E.distKm(l, D.DEMO_CENTER) > 40 ? 'พบตำแหน่งแล้ว แต่คาเฟ่ในแอปตอนนี้อยู่ในกรุงเทพฯ' : 'พบตำแหน่งของคุณแล้ว (±' + Math.round(p.coords.accuracy) + ' ม.)');
    } catch (e) {
      toast(e && e.code === 1 ? 'ยังไม่ได้อนุญาตตำแหน่ง — เปิดสิทธิ์ตำแหน่งของเบราว์เซอร์ในการตั้งค่า แล้วกดใหม่'
        : e && e.code === 3 ? 'หาตำแหน่งนานเกินไป — ลองออกที่โล่งแล้วกดใหม่'
        : 'หาตำแหน่งไม่เจอ — เปิด GPS ของเครื่องแล้วลองอีกครั้ง');
    } finally { btn.disabled = false; btn.classList.remove('busy'); }
  }

  function drawMarkers(fit) {
    if (!map) return;
    mapMarkers.forEach((m) => m.remove());
    mapMarkers = [];
    const ses = session();
    const all = D.CAFES.map((c) => E.scoreCafe(c, ses));
    const ctx = { moodTop: new Set(all.slice().sort((a, b) => b.match - a.match).slice(0, 6).map((s) => s.cafe.id)) };
    const shown = all.filter((s) => Array.from(mapFilters).every((k) => MAP_FILTERS.find((f) => f[0] === k)[2](s, ctx)) &&
      (!geo.prov || provOf(s.cafe) === geo.prov) && (!geo.area || s.cafe.area === geo.area));
    shown.forEach((s) => {
      const gem = s.hidden.eligible && s.hidden.score >= 80;
      const m = L.marker([s.cafe.lat, s.cafe.lon], {
        icon: L.divIcon({ className: '', html: '<div class="pin' + (gem ? ' gem' : '') + '"><span>' + s.match + '</span></div>', iconSize: [40, 40], iconAnchor: [20, 48] }),
        title: s.cafe.name + ' — Match ' + s.match + '%', alt: s.cafe.name
      }).addTo(map);
      m.on('click', () => { $('#mapCard').innerHTML = rowCard(s); });
      mapMarkers.push(m);
    });
    $('#mapCount').textContent = all.length ? 'แสดง ' + shown.length + ' จาก ' + all.length + ' ร้าน · เลขบนหมุด = Match วันนี้' : 'ยังไม่มีคาเฟ่ในระบบ';
    $('#mapCard').innerHTML = shown.length || !all.length ? '' : '<div class="card empty"><p><b>ไม่มีร้านที่ตรงทุกตัวกรอง</b></p><p class="muted">ลองปิดตัวกรองบางอัน</p></div>';
    if (fit && shown.length) map.fitBounds(L.latLngBounds(shown.map((s) => [s.cafe.lat, s.cafe.lon]).concat(geo.prov || geo.area ? [] : [[center().lat, center().lon]])).pad(.15), { maxZoom: 14, animate: false });
  }

  function vResults() {
    const ses = session();
    if (!ses.mood) { location.replace('#/home'); return null; }
    const ranked = E.rank(ses);
    const top = ranked[0], rest = ranked.slice(1, 6);
    const headline = E.moodHeadline(ses.mood, W.ctx);
    const chips = (ses.mood.labels || []).map((l) => '<span class="chip static">' + esc(l) + '</span>').join('');
    const wnote = {
      rain: 'ฝนตกอยู่ — เลื่อนร้านที่นั่งในร่มและริมกระจกขึ้นมาก่อน',
      sunny: 'แดดดี — ร้านแสงสวยและโซนกลางแจ้งได้คะแนนเพิ่ม',
      hot: 'ร้อนจัด — เน้นร้านในร่มที่เย็นสบาย',
      cloudy: 'ฟ้าครึ้ม — เลือกร้านที่นั่งสบายและแสงนุ่ม',
      night: 'ค่ำแล้ว — ร้านที่เปิดดึกและบรรยากาศอบอุ่นได้คะแนนเพิ่ม'
    }[W.ctx.night && W.ctx.kind !== 'rain' ? 'night' : W.ctx.kind];
    const topC = top.cafe;
    const reasons = top.reasons.map((r) => '<li>' + I('check', 16) + esc(r) + '</li>').join('');
    return { nav: true, html:
      '<header class="hero-top ambient"><div class="topbar between">' + backBtn('#/home') + weatherChip() + '</div>' +
      '<p class="eyebrow">Your Café Mood</p>' +
      '<h1 class="display">' + esc(headline) + ' <span class="inline-ic">' + I(W.ctx.icon, 34) + '</span></h1>' +
      (chips ? '<div class="chips" aria-label="สิ่งที่เราเข้าใจ">' + chips + '</div>' : '') +
      '<p class="wnote">' + I('info', 16) + esc(wnote) + '</p></header>' +
      '<section class="pad rise">' +
      '<a class="hero-card" href="#/cafe/' + topC.id + '"><div class="hc-cover">' + A.coverArt(topC) + '<span class="badge solid">Top pick</span></div>' +
      '<div class="hc-body"><div class="hc-head"><div><h2>' + esc(topC.name) + '</h2><p class="meta">' + I('pin', 14) + esc(topC.area) + ' · ' + fmtDist(topC) + ' · ' + priceText(topC) + '</p></div>' + ring(top.match, 64) + '</div>' +
      '<ul class="reasons">' + reasons + '</ul><div class="badges">' + badges(top) + '</div>' +
      '<span class="btn primary block">ดูร้านนี้ ' + I('chevron-right', 18) + '</span></div></a>' +
      '<h2 class="sec-title">ร้านอื่นที่เข้ากับคุณวันนี้</h2><div class="list">' + rest.map((s) => rowCard(s)).join('') + '</div>' +
      '<div class="teasers"><a class="teaser" href="#/hidden"><span class="tz-ic">' + I('gem', 20) + '</span><small>Hidden Café</small><b>ลองร้านลับ</b><span>รีวิวน้อย คนกลับมาซ้ำเยอะ</span></a>' +
      '<a class="teaser" href="#/drink"><span class="tz-ic">' + I('cup', 20) + '</span><small>Today’s Drink</small><b>แก้วของวันนี้</b><span>เลือกให้ตาม Mood</span></a></div>' +
      '<button class="btn ghost block" data-act="go" data-to="#/home">เปลี่ยน Mood</button></section>' };
  }

  function meter(label, v) {
    return '<div class="meter"><span class="ml">' + esc(label) + '</span><span class="bar" aria-hidden="true"><i style="width:' + v * 10 + '%"></i></span><span class="mv">' + v + '/10</span></div>';
  }

  function vCafe(id) {
    const c = D.CAFE_BY_ID[id];
    if (!c) { location.replace('#/home'); return null; }
    const ses = session();
    const s = E.scoreCafe(c, ses);
    const visits = vis().filter((v) => v.cafeId === id);
    const cafeEvents = ST.eventsAll().filter((e) => e.cafeId === id && ST.eventStatus(e) !== 'ended');
    const reasons = s.reasons.map((r) => '<li>' + I('check', 16) + esc(r) + '</li>').join('');
    const drinks = c.drinks.map((d) =>
      '<li class="drink-row"><span class="dr-art">' + A.drinkArt(d) + '</span><div><b>' + esc(d.name) + '</b><p>' + esc(d.note) + '</p>' +
      '<span class="tag">' + typeTh[d.type] + '</span><span class="tag">' + tempTh[d.temp] + '</span></div><span class="price">฿' + d.price + '</span></li>').join('');
    const spots = c.spots.map((p, i) =>
      '<li class="spot"><div class="spot-h"><b>Spot 0' + (i + 1) + ' — ' + esc(p.name) + '</b>' + (p.outdoor ? '<span class="tag">กลางแจ้ง</span>' : '') + '</div>' +
      '<p class="spot-row">' + I('clock', 15) + 'Best time: <b>' + p.best + '</b></p>' +
      '<p class="spot-row">' + I('camera', 15) + 'Natural light ' + stars(p.light) + '</p>' +
      '<p class="spot-row">' + I('leaf', 15) + 'Background ' + stars(p.bg) + '</p>' +
      '<p class="tip">' + esc(p.tip) + '</p></li>').join('');
    const mt = ['quiet', 'cozy', 'bright', 'social', 'work', 'photo'].map((d) => meter(D.DIM_TH[d], c.attr[d])).join('');
    const h = s.hidden;
    return { nav: false, html:
      '<div class="cafe-cover">' + A.coverArt(c) + '<div class="cc-top">' + backBtn('#/home') + '<button class="iconbtn heartbtn' + (isFav(c.id) ? ' on' : '') + '" data-act="fav-cafe" data-id="' + c.id + '" aria-pressed="' + isFav(c.id) + '" aria-label="' + (isFav(c.id) ? 'นำออกจากรายการโปรด' : 'เพิ่มในรายการโปรด') + '">' + I('heart', 22) + '</button></div></div>' +
      '<section class="pad cafe rise">' +
      '<div class="cafe-head"><div>' + (A.logoArt(c) ? '<span class="cafe-logo">' + A.logoArt(c) + '</span>' : '') + '<h1 class="cafe-name">' + esc(c.name) + '</h1>' +
      '<p class="meta">' + I('pin', 14) + esc(c.area) + ' · ' + fmtDist(c) + ' · ' + priceText(c) + '</p>' +
      '<p class="meta">' + I('star', 14, 'ic-fill gold') + c.rating.toFixed(1) + ' (' + c.reviews.toLocaleString('th-TH') + ' รีวิว)</p></div>' + ring(s.match, 64) + '</div>' +
      '<div class="badges">' + badges(s) + (visits.length ? '<span class="badge ok">' + I('stamp', 13) + 'เคยมา ' + visits.length + ' ครั้ง</span>' : '') + '</div>' +
      '<p class="tagline">“' + esc(c.tagline) + '”</p>' + ST.liveBanner(c) +
      '<h2 class="sec-title">ทำไมถึงเหมาะกับวันนี้</h2><ul class="reasons card">' + reasons + '</ul>' +
      ST.pickCard(c) + ST.questCard(c, visits.some((v) => v.questDone === c.id + ':q')) + ST.passportCard(c, visits) + ST.rewardCard(c, visits.length) +
      (cafeEvents.length ? '<h2 class="sec-title">' + I('star', 20) + 'Events ของร้าน</h2>' + cafeEvents.map(eventCard).join('') : '') +
      '<h2 class="sec-title">' + I('coffee', 20) + 'Coffee & Drinks</h2><ul class="drinks card">' + drinks + '</ul>' +
      '<h2 class="sec-title">' + I('sparkles', 20) + 'Café DNA</h2>' + ST.dnaHtml(c) +
      '<h2 class="sec-title">' + I('camera', 20) + 'Best Photo Spots</h2><ul class="spots">' + spots + '</ul>' +
      '<h2 class="sec-title">' + I('info', 20) + 'Facilities</h2>' + ST.facilitiesHtml(c) +
      '<h2 class="sec-title">' + I('lock', 20) + 'ความลับของร้าน</h2>' +
      '<div class="card secret" id="secretBox"><p class="muted">ร้านนี้มีเรื่องที่คนไม่ค่อยรู้</p><button class="btn ghost" data-act="reveal-secret" data-id="' + c.id + '">' + I('eye', 18) + 'เปิดดูความลับ</button></div>' +
      (h.eligible ? '<h2 class="sec-title">' + I('gem', 20) + 'Hidden Score</h2><div class="card hidden-card">' + ring(h.score, 64, 'gemring') + '<p>' + esc(h.why) + '</p></div>' : '') +
      '<div class="spacer"></div></section>' +
      '<div class="cta-bar cta-2"><button class="btn ghost" data-act="nav-go" data-id="' + c.id + '">' + I('navigation', 18) + 'นำทาง</button><button class="btn primary lg" data-act="checkin" data-id="' + c.id + '">' + I('stamp', 20) + 'Check in</button></div>' };
  }

  function vHidden() {
    const ses = session();
    const list = D.CAFES.map((c) => E.scoreCafe(c, ses)).filter((s) => s.hidden.eligible).sort((a, b) => b.hidden.score - a.hidden.score);
    const shown = hiddenAll ? list : list.slice(0, 5);
    const cards = shown.map((s, i) =>
      '<a class="hidden-card-row" href="#/cafe/' + s.cafe.id + '"><span class="rank">' + (i + 1) + '</span>' +
      '<div class="thumb">' + A.coverArt(s.cafe) + '</div><div class="rc-body"><h3>' + esc(s.cafe.name) + '</h3>' +
      '<p class="meta">' + I('pin', 13) + esc(s.cafe.area) + ' · ' + fmtDist(s.cafe) + '</p>' +
      '<p class="why">' + esc(s.hidden.why) + '</p><p class="meta">Match วันนี้ ' + s.match + '%</p></div>' +
      '<div class="gemscore">' + ring(s.hidden.score, 56, 'gemring') + '<small>Hidden Score</small></div></a>').join('');
    return { nav: true, html:
      '<header class="hero-top ambient"><div class="topbar between"><div class="topbar">' + backBtn('#/discover') + '<span class="brand">' + I('gem', 20) + 'Hidden Café</span></div>' + weatherChip() + '</div>' +
      '<h1 class="display">' + list.length + ' hidden cafés discovered near you</h1>' +
      '<p class="lead sm">ร้านที่รีวิวน้อย แต่คะแนนสูงและมีคนกลับไปซ้ำ</p></header>' +
      '<section class="pad rise"><div class="list">' + cards + '</div>' +
      (!hiddenAll && list.length > 5 ? '<button class="btn ghost block" data-act="show-hidden">ดูทั้งหมด (' + list.length + ')</button>' : '') +
      '<details class="card explain"><summary>' + I('info', 18) + 'Hidden Score คำนวณยังไง?</summary>' +
      '<p>นับเฉพาะร้านที่มีรีวิวน้อยกว่า 400 และคะแนนตั้งแต่ 4.5</p><ul><li><b>40%</b> คะแนนรีวิว</li><li><b>30%</b> ยิ่งรีวิวน้อยยิ่งลับ</li><li><b>30%</b> สัดส่วนลูกค้าที่กลับมาซ้ำ</li></ul>' +
      '<p class="muted small">ข้อมูลร้านในเดโมนี้เป็นข้อมูลสมมติ</p></details></section>' };
  }

  function ownerPicksHtml(ses) {
    const picks = E.drinkRank(ses).filter((x) => x.ownerPick).slice(0, 3);
    if (!picks.length) return '';
    return '<h2 class="sec-title">' + I('badge-check', 20) + 'Owner’s Pick วันนี้</h2><div class="list compact">' + picks.map((x) => {
      const pk = x.cafe.live.pick;
      return '<a class="mini-row" href="#/cafe/' + x.cafe.id + '"><span class="mr-art">' + A.drinkArt(x.drink) + '</span><span><b>' + esc(x.drink.name) + ' · ฿' + pk.price + '</b><small>' + esc(x.cafe.name) + ' · “' + esc(pk.note) + '”</small></span>' + I('chevron-right', 18) + '</a>';
    }).join('') + '</div>';
  }

  function vDrink() {
    const ses = session();
    const picks = E.drinkRank(ses).slice(0, 5);
    const p = picks[drinkIdx % picks.length];
    const d = p.drink, c = p.cafe;
    const others = picks.map((x, i) => ({ x, i })).filter((o) => o.i !== drinkIdx % picks.length).slice(0, 3);
    return { nav: true, html:
      '<header class="hero-top ambient"><div class="topbar between"><div class="topbar">' + backBtn('#/discover') + '<span class="brand">' + I('cup', 20) + 'Today’s Drink</span></div>' + weatherChip() + '</div>' +
      '<h1 class="display">แก้วของวันนี้</h1></header>' +
      '<section class="pad rise"><div class="drink-hero"><div class="dh-art">' + A.drinkArt(d) + '</div>' +
      '<div class="dh-body"><div class="tags"><span class="tag">' + typeTh[d.type] + '</span><span class="tag">' + tempTh[d.temp] + '</span></div>' +
      (p.ownerPick ? '<span class="badge ver">' + I('badge-check', 13) + 'Owner’s Pick</span>' : '') +
      '<h2>' + esc(d.name) + '</h2><p class="muted">' + esc(d.note) + '</p>' +
      '<p class="meta"><a href="#/cafe/' + c.id + '">' + I('pin', 14) + esc(c.name) + '</a> · ' + esc(c.area) + '</p>' +
      '<p class="meta">' + I('star', 14, 'ic-fill gold') + p.rating.toFixed(1) + ' · ฿' + d.price + (p.open.open ? '' : ' · <span class="off">' + esc(p.open.text) + '</span>') + '</p>' +
      '<ul class="reasons">' + p.reasons.map((r) => '<li>' + I('check', 16) + esc(r) + '</li>').join('') + '</ul></div></div>' +
      '<button class="btn primary lg" data-act="try-drink" data-cafe="' + c.id + '" data-drink="' + d.id + '">' + I('stamp', 20) + 'Try it → Add to Passport</button>' +
      '<button class="btn ghost block" data-act="shuffle-drink">' + I('refresh', 18) + 'ขอแก้วอื่น</button>' +
      ownerPicksHtml(ses) +
      '<h2 class="sec-title">ตัวเลือกอื่นสำหรับวันนี้</h2><div class="list compact">' +
      others.map((o) => '<button class="mini-row" data-act="pick-drink" data-i="' + o.i + '"><span class="mr-art">' + A.drinkArt(o.x.drink) + '</span><span><b>' + esc(o.x.drink.name) + '</b><small>' + esc(o.x.cafe.name) + ' · ฿' + o.x.drink.price + '</small></span>' + I('chevron-right', 18) + '</button>').join('') + '</div></section>' };
  }

  /* ---------- Events (posted by café owners) ---------- */
  const fmtDate = (s) => new Date(s + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
  const evWhen = (ev) => (ev.startDate === ev.endDate ? fmtDate(ev.startDate) : fmtDate(ev.startDate) + ' – ' + fmtDate(ev.endDate)) + ' · ' + ev.startTime + '–' + ev.endTime;
  const EV_STATUS = { live: ['กำลังจัดอยู่', 'live'], today: ['วันนี้', 'today'], upcoming: ['เร็ว ๆ นี้', 'up'], ended: ['จบแล้ว', 'off'] };

  // Owner's uploaded banner, or the café's generated cover when there isn't one.
  const evImage = (ev, c) => ev.banner ? '<img class="ev-img" src="' + ev.banner + '" alt="แบนเนอร์อีเว้นท์ ' + esc(ev.title) + '" loading="lazy">' : A.coverArt(c);

  function eventCard(ev) {
    const c = D.CAFE_BY_ID[ev.cafeId], st = ST.eventStatus(ev), s = EV_STATUS[st];
    const min = ev.items.concat(ev.sets).map((x) => x.price).filter((p) => p > 0);
    return '<a class="event-card" href="#/event/' + ev.id + '"><div class="ec-cover">' + evImage(ev, c) + '<span class="evbadge ev-' + s[1] + '">' + s[0] + '</span></div>' +
      '<div class="ec-body"><small class="kicker">' + esc(ST.typeLabel(ev.type)) + ' · ' + esc(c.name) + (ST.isVerified(c) ? ' ' + I('badge-check', 13) : '') + '</small>' +
      '<b>' + esc(ev.title) + '</b><span class="meta">' + I('clock', 13) + esc(evWhen(ev)) + '</span>' +
      '<span class="ec-tags">' + (min.length ? '<span class="tag">เมนูเริ่ม ฿' + Math.min.apply(null, min) + '</span>' : '') + (ev.sets.length ? '<span class="tag">Set ' + ev.sets.length + '</span>' : '') + (ev.gives.length ? '<span class="tag">' + I('sparkles', 12) + ' Give away</span>' : '') + '</span></div></a>';
  }

  function eventsHomeHtml(ses) {
    const list = ST.eventsRelevant(ses, 2);
    if (!list.length) return '';
    return '<h2 class="sec-title">' + I('star', 20) + 'Events ที่น่าสนใจ</h2>' + '<div class="hscroll">' + list.map(eventCard).join('') + '</div><a class="btn ghost block" href="#/events">ดูอีเว้นท์ทั้งหมด ' + I('chevron-right', 18) + '</a>';
  }

  function vEvents() {
    const ses = session();
    const all = ST.eventsAll().filter((e) => ST.eventStatus(e) !== 'ended');
    const rel = new Map(ST.eventsRelevant(ses, 99).map((e, i) => [e.id, i]));
    all.sort((a, b) => (rel.has(a.id) ? rel.get(a.id) : 99) - (rel.has(b.id) ? rel.get(b.id) : 99));
    return { nav: true, html:
      '<header class="hero-top ambient"><div class="topbar between"><div class="topbar">' + backBtn('#/discover') + '<span class="brand">' + I('star', 20) + 'Events</span></div>' + weatherChip() + '</div>' +
      '<h1 class="display">อีเว้นท์จากร้านคาเฟ่</h1><p class="lead sm">เมนูพิเศษ เซ็ตเมนู และของแจก — เรียงตามที่เข้ากับ Mood ของคุณ</p></header>' +
      '<section class="pad rise">' + (all.length ? '<div class="list">' + all.map(eventCard).join('') + '</div>' : '<div class="card empty"><p><b>ยังไม่มีอีเว้นท์ที่กำลังมา</b></p><p class="muted">กลับมาดูใหม่เร็ว ๆ นี้</p></div>') + '</section>' };
  }

  function vEvent(id) {
    const ev = ST.eventById(id);
    if (!ev) { location.replace('#/events'); return null; }
    const c = D.CAFE_BY_ID[ev.cafeId], st = ST.eventStatus(ev), s = EV_STATUS[st], saved = ST.isSaved(ev.id);
    const items = ev.items.length ? '<h2 class="sec-title">' + I('cup', 20) + 'เมนูในอีเว้นท์</h2><ul class="card ev-list">' + ev.items.map((x) => '<li><span><b>' + esc(x.name) + '</b></span><b class="price">฿' + x.price + '</b></li>').join('') + '</ul>' : '';
    const sets = ev.sets.length ? '<h2 class="sec-title">' + I('coffee', 20) + 'Set Menu</h2>' + ev.sets.map((x) => '<div class="card set-card"><div class="set-h"><b>' + esc(x.name) + '</b><b class="price">฿' + x.price + '</b></div><p class="muted">' + esc(x.includes || '') + '</p></div>').join('') : '';
    const gives = ev.gives.length ? '<h2 class="sec-title">' + I('sparkles', 20) + 'Give away</h2>' + ev.gives.map((x) => '<div class="card give-card"><span class="gift">' + I('sparkles', 22) + '</span><div><b>' + esc(x.name) + '</b><p class="muted small">' + esc(x.rule || '') + (x.qty ? ' · จำนวน ' + x.qty + ' ชิ้น' : '') + '</p></div></div>').join('') : '';
    return { nav: false, html:
      '<div class="cafe-cover ev-hero">' + evImage(ev, c) + '<div class="cc-top">' + backBtn('#/events') + '</div></div>' +
      '<section class="pad cafe rise"><div class="badges"><span class="evbadge ev-' + s[1] + ' inline">' + s[0] + '</span><span class="badge">' + esc(ST.typeLabel(ev.type)) + '</span>' + ST.badgesHtml(c) + '</div>' +
      '<h1 class="cafe-name">' + esc(ev.title) + '</h1>' +
      '<p class="meta">' + I('clock', 14) + esc(evWhen(ev)) + '</p>' +
      '<p class="meta"><a href="#/cafe/' + c.id + '">' + I('pin', 14) + esc(c.name) + '</a> · ' + esc(c.area) + ' · ' + fmtDist(c) + '</p>' +
      (ev.desc ? '<p class="ev-desc">' + esc(ev.desc) + '</p>' : '') + items + sets + gives +
      '<p class="muted small">ข้อมูลอีเว้นท์มาจากร้านโดยตรง ราคาและเงื่อนไขอาจเปลี่ยนตามที่ร้านประกาศ</p><div class="spacer"></div></section>' +
      '<div class="cta-bar cta-2"><button class="btn ghost" data-act="nav-go" data-id="' + c.id + '">' + I('navigation', 18) + 'นำทาง</button>' +
      '<button class="btn ' + (saved ? 'ghost' : 'primary') + ' lg" data-act="ev-fav" data-id="' + ev.id + '" aria-pressed="' + saved + '">' + I(saved ? 'check' : 'star', 20) + (saved ? 'บันทึกแล้ว — เตือนฉัน' : 'สนใจ — เตือนฉัน') + '</button></div>' };
  }

  function vPassport() {
    const st = E.stats(vis());
    const lv = E.levelInfo(st.xp);
    const ach = E.achievementProgress(vis());
    const tiles = [
      ['coffee', st.cafes.length, 'Cafés'], ['camera', st.spots.length, 'Photo Spots'],
      ['cup', st.drinks.length, 'Drinks'], ['gem', st.hidden.length, 'Hidden Cafés']
    ].map((t) => '<div class="stat">' + I(t[0], 22) + '<b>' + t[1] + '</b><span>' + t[2] + '</span></div>').join('');
    const achItem = (a) =>
      '<li class="ach' + (a.done ? ' done' : '') + '"><span class="ach-ic">' + I(a.icon, 24) + '</span><b>' + esc(a.name) + '</b><small>' + esc(a.desc) + '</small>' +
      (a.done ? '<span class="ach-st">' + I('check', 14) + 'สำเร็จ</span>' : '<span class="ach-bar" role="progressbar" aria-valuemin="0" aria-valuemax="' + a.goal + '" aria-valuenow="' + a.value + '"><i style="width:' + a.value / a.goal * 100 + '%"></i></span><span class="ach-st">' + a.value + '/' + a.goal + '</span>') + '</li>';
    const achHtml = ach.map(achItem).join('');
    const collItem = (c) => {
      const vs = vis().filter((v) => v.cafeId === c.id), n = vs.length, got = ST.passEarned(c, vs);
      return '<a class="coll" href="#/cafe/' + c.id + '" aria-label="' + esc(c.name) + (got ? ' ได้ stamp แล้ว' : n ? ' เคยไป ' + n + ' ครั้ง ยังไม่ครบเงื่อนไข stamp' : ' ยังไม่เคยไป') + '">' + A.stamp(c, { locked: !got }) + '<small>' + esc(c.name) + '</small>' + (n && !got ? '<small class="pp-more">ยังไม่ครบเงื่อนไข</small>' : '') + '</a>';
    };
    const coll = D.CAFES.map(collItem).join('');
    // ponytail: "latest progress" = most-complete unfinished goals / latest 3 visited cafés; per-goal timestamps if exact recency matters
    const hot = ach.filter((a) => !a.done).sort((x, y) => y.value / y.goal - x.value / x.goal).slice(0, 2);
    const recentIds = [...new Set(vis().slice().reverse().map((v) => v.cafeId))].slice(0, 3);
    const fold = (n, body) => '<details class="fold-all"><summary><span class="more">ดูทั้งหมด (' + n + ')</span><span class="less">ซ่อน</span>' + I('chevron-right', 18) + '</summary>' + body + '</details>';
    const recent = vis().slice(-3).reverse().map((v) => {
      const c = D.CAFE_BY_ID[v.cafeId];
      return '<li><span>' + esc(c.name) + '</span><small>' + new Date(v.ts).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) + ' · +' + v.xp + ' XP</small></li>';
    }).join('');
    return { nav: true, html:
      '<header class="hero-top ambient"><div class="topbar between"><span class="brand">' + I('stamp', 20) + 'Café Passport</span>' + weatherChip() + '</div>' +
      '<p class="eyebrow">My Café Passport</p>' +
      '<h1 class="display">' + st.cafes.length + ' Cafés Visited</h1>' +
      '<div class="progress" role="progressbar" aria-label="ร้านที่เคยไป" aria-valuemin="0" aria-valuemax="' + D.CAFES.length + '" aria-valuenow="' + st.cafes.length + '"><span style="width:' + st.cafes.length / D.CAFES.length * 100 + '%"></span></div>' +
      '<p class="muted small">' + st.cafes.length + ' / ' + D.CAFES.length + ' ร้านในเดโม</p>' +
      '<div class="level"><div class="lv-h"><b>Lv.' + lv.level + ' ' + esc(lv.name) + '</b><span>' + st.xp + (lv.next ? ' / ' + lv.next : '') + ' XP</span></div>' +
      '<div class="progress" role="progressbar" aria-label="ความคืบหน้าเลเวล" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + lv.pct + '"><span style="width:' + lv.pct + '%"></span></div></div></header>' +
      '<section class="pad rise">' + (st.cafes.length ? '<div class="stat-grid">' + tiles + '</div>' : '') + CM.plus.passportTeaser() +
      (st.cafes.length || !D.CAFES.length ? '' : '<div class="card first-stamp"><div class="fs-art">' + A.stamp(D.CAFES[0], {}) + '</div><h2>หน้าแรกของพาสปอร์ตยังว่างอยู่</h2><p class="muted">แวะร้านไหนก็ได้ แล้วกด Check in จะได้ stamp ใบแรก</p><a class="btn primary lg" href="#/home">หาคาเฟ่วันนี้</a></div>') +
      (st.cafes.length ? '<h2 class="sec-title">' + I('trophy', 20) + 'Achievements <small>' + ach.filter((a) => a.done).length + '/' + ach.length + '</small></h2><ul class="ach-grid">' + hot.map(achItem).join('') + '</ul>' + fold(ach.length - hot.length, '<ul class="ach-grid">' + ach.filter((a) => !hot.includes(a)).map(achItem).join('') + '</ul>') +
        '<h2 class="sec-title">Café Collection <small>' + st.cafes.length + '/' + D.CAFES.length + '</small></h2><div class="coll-grid">' + recentIds.map((id) => collItem(D.CAFE_BY_ID[id])).join('') + '</div>' + fold(D.CAFES.length - recentIds.length, '<div class="coll-grid">' + D.CAFES.filter((c) => !recentIds.includes(c.id)).map(collItem).join('') + '</div>')
        : '<details class="card fold"><summary>' + I('trophy', 18) + 'ดูเป้าหมายที่รออยู่ (' + ach.length + ')</summary><ul class="ach-grid">' + achHtml + '</ul></details><details class="card fold"><summary>' + I('stamp', 18) + 'ร้านที่เก็บได้ 0/' + D.CAFES.length + '</summary><div class="coll-grid">' + coll + '</div></details>') +
      (recent ? '<h2 class="sec-title">ล่าสุด</h2><ul class="recent card">' + recent + '</ul>' : '') + '</section>' };
  }

  /* ---------- ⑤ Profile ---------- */
  const TYPE_NAME = { nature: 'Nature café', dark: 'Night & moody café', bright: 'Sunlit café', urban: 'Urban café', creative: 'Creative studio', coffee: 'Specialty coffee bar', cozy: 'Cozy hideaway', social: 'Social hangout' };
  const DRINK_TH = { coffee: 'กาแฟ / Specialty', latte: 'ลาเต้ นมนุ่ม ๆ', matcha: 'มัทฉะ', tea: 'ชา', signature: 'เมนูซิกเนเจอร์' };

  function favourites() {
    const st = S.get(), p = st.profile, none = 'ยังไม่มีข้อมูล';
    const mh = st.moodHistory || {};
    const topMood = Object.keys(mh).sort((a, b) => mh[b] - mh[a])[0];
    const counts = {};
    vis().forEach((v) => v.drinks.forEach((id) => { const t = D.DRINK_BY_ID[id].type; counts[t] = (counts[t] || 0) + 1; }));
    const topDrink = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] || (p && p.drinkPref);
    let atmos = none, type = none;
    if (p) {
      const dims = Object.keys(p.p).filter((d) => p.p[d] > 0).sort((a, b) => p.p[b] - p.p[a]);
      atmos = dims.slice(0, 2).map((d) => D.LIKE_POS[d]).join(' · ') || none;
      const t = Object.keys(TYPE_NAME).sort((a, b) => p.p[b] - p.p[a])[0];
      if (p.p[t] > 0) type = TYPE_NAME[t];
    }
    return [
      ['sparkles', 'Favorite Mood', topMood ? D.MOOD_BY_ID[topMood].en + ' · ' + D.MOOD_BY_ID[topMood].th : none],
      ['cup', 'Favorite Drink', topDrink ? DRINK_TH[topDrink] : none],
      ['flame', 'Favorite Atmosphere', atmos],
      ['coffee', 'Favorite Café Type', type]
    ];
  }

  /* ---------- Profile ---------- */
  const PROMOS = D.PROMOS;   // demo promo: WELCOME7 = 7-day Plus trial
  const ymd = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);   // local date
  const isFav = (id) => (S.get().favCafes || []).includes(id);
  const mrow = (ic, t, small, val, attrs, tag) => '<' + (tag || 'a') + ' class="mrow" ' + attrs + '><span class="mi">' + I(ic, 20) + '</span><span class="mt"><b>' + t + '</b>' + (small ? '<small>' + small + '</small>' : '') + '</span>' + (val ? '<span class="mv">' + val + '</span>' : '') + I('chevron-right', 18) + '</' + (tag || 'a') + '>';

  function vProfile() {
    const st = S.get(), p = st.profile, a = p && D.ARCHETYPE_BY_ID[p.archetype], me = CM.auth.current();
    const favs = (st.favCafes || []).map((id) => D.CAFE_BY_ID[id]).filter(Boolean), codes = codeHist();
    const stamps = new Set(S.live().map((v) => v.cafeId)).size;
    const loc = st.location.source === 'gps' ? 'ตำแหน่งของคุณ (GPS)' : D.DEMO_CENTER.name;
    const prefs = favourites().map((f) => '<li><span class="pf-ic">' + I(f[0], 20) + '</span><span class="pf-t"><small>' + f[1] + '</small><b>' + esc(f[2]) + '</b></span></li>').join('');
    const favStrip = favs.length
      ? '<div class="hscroll favstrip">' + favs.slice(0, 8).map((c) => '<a class="fav-card" href="#/cafe/' + c.id + '"><span class="fc-art">' + A.coverArt(c) + '</span><b>' + esc(c.name) + '</b><small>' + esc(c.area) + '</small></a>').join('') + '</div>'
      : '<div class="card empty fav-empty">' + I('heart', 26) + '<p><b>ยังไม่มีคาเฟ่โปรด</b></p><p class="muted small">แตะหัวใจที่หน้าร้านเพื่อเก็บไว้ที่นี่</p><a class="btn ghost sm" href="#/discover">ไปสำรวจคาเฟ่</a></div>';
    const themeOpt = [['', 'ตามเครื่อง', null], ['light', 'สว่าง', 'sun'], ['dark', 'มืด', 'moon']];
    return { nav: true, html:
      '<header class="hero-top ambient"><div class="topbar between"><span class="brand">' + I('user', 20) + 'Profile' + CM.plus.badge() + '</span>' + weatherChip() + '</div>' +
      '<div class="idrow"><label class="avatar pick" for="avatarIn" aria-label="เปลี่ยนรูปโปรไฟล์">' + (st.avatar ? '<img src="' + esc(st.avatar) + '" alt="">' : I(a ? a.icon : 'user', 30)) + '<span class="av-cam" aria-hidden="true">' + I('camera', 13) + '</span><input id="avatarIn" class="sr" type="file" accept="image/png,image/jpeg,image/webp"></label><div class="idtext">' +
      '<label class="eyebrow" for="nameInput">ชื่อที่ให้เราเรียก</label><input id="nameInput" class="name-in" type="text" maxlength="24" autocomplete="given-name" value="' + esc(st.name || '') + '" placeholder="ใส่ชื่อหรือชื่อเล่น">' +
      '<a class="persona-pill" href="' + (a ? '#/persona' : '#/quiz/0') + '">' + I(a ? a.icon : 'sparkles', 14) + (a ? esc(a.name) : 'ทำ Quiz เพื่อรู้ Personality') + '</a>' + (st.avatar ? '<button class="btn text sm" data-act="avatar-clear">ลบรูปโปรไฟล์</button>' : '') + '</div></div></header>' +
      '<section class="pad rise">' +
      (me ? '<div class="card auth-card"><span class="mi">' + I('user', 20) + '</span><div><b>' + esc(me.name || me.email) + '</b><small>' + esc(me.email) + ' · เข้าสู่ระบบอยู่</small></div><button class="btn ghost sm" data-act="auth-logout">ออกจากระบบ</button></div>' : '<a class="card auth-card" href="#/login"><span class="mi">' + I('user', 20) + '</span><div><b>เข้าสู่ระบบ / สมัครสมาชิก</b><small>เก็บ Passport และโค้ดไว้ในบัญชีของคุณ</small></div>' + I('chevron-right', 18) + '</a>') +
      '<a class="studio-card" href="#/studio"><span class="sc-ic">' + I('building', 24) + '</span><span class="sc-t"><b>Café Studio</b><small>สำหรับเจ้าของร้าน — จัดการร้าน Quest และ Insight</small></span>' + I('chevron-right', 20) + '</a>' +
      '<a class="card codecard cc-link" href="#/code"><div class="cc-row"><div><small class="cc-k">โค้ดของฉัน</small><b class="cc-big">' + (codes.length ? codes.length + ' โค้ดที่เก็บไว้' : 'ยังไม่มีโค้ด') + '</b><small class="cc-sub">' + (codes.length ? 'ล่าสุด ' + esc(codes[0].code) + ' · ' : '') + 'แตะเพื่อใส่โค้ดที่ได้จากอีเว้นท์</small></div>' + I('chevron-right', 20) + '</div></a>' +
      '<div class="sec-row"><h2 class="sec-title">' + I('heart', 20) + 'คาเฟ่โปรด' + (favs.length ? ' <span class="cnt">' + favs.length + '</span>' : '') + '</h2>' + (favs.length ? '<a class="seeall" href="#/favorites">ดูทั้งหมด</a>' : '') + '</div>' + favStrip +
      '<h2 class="grp-t">เส้นทางของฉัน</h2><div class="card menu">' +
      mrow('stamp', 'Passport', 'สะสม stamp จากร้านที่ไปมา', stamps + ' ร้าน', 'href="#/passport"') +
      mrow('star', 'อีเว้นท์ที่บันทึกไว้', 'ดูอีเว้นท์ทั้งหมดของร้าน', (st.savedEvents || []).length + ' งาน', 'href="#/events"') +
      mrow(a ? a.icon : 'sparkles', 'Café Personality', a ? esc(a.th) : 'ยังไม่ได้ทำ Quiz', a ? esc(a.name) : '', 'href="' + (a ? '#/persona' : '#/quiz/0') + '"') + '</div>' +
      '<details class="card fold pf"><summary>' + I('heart', 20) + 'รสนิยมของฉัน' + I('chevron-down', 18) + '</summary><ul class="prefs">' + prefs + '</ul></details>' +
      '<h2 class="grp-t">Plus & Journal</h2>' + CM.plus.profileCard() + (CM.ent.visible('customer').length ? '<div class="card menu">' + CM.ent.profileRow(mrow) + '</div>' : '') + CM.plus.journalHtml() +
      '<h2 class="grp-t">การเตือน</h2>' + CM.plus.remindersHtml() +
      '<h2 class="grp-t">การตั้งค่า</h2><div class="card menu">' +
      mrow('user', 'ข้อมูลส่วนตัว', 'ชื่อ อีเมล เบอร์โทร LINE', acctFilled() + '/4', 'href="#/account"') +
      mrow('message', 'ติดต่อเรา', 'อีเมล · LINE · ฝากช่องทางให้เราติดต่อกลับ', '', 'href="#/contact"') +
      '<div class="mrow static stack"><span class="mt"><b>ธีม</b><small>ตามเครื่องจะสลับสว่าง/มืดตามอุปกรณ์</small></span><div class="seg three" role="group" aria-label="ธีม">' +
      themeOpt.map((o) => '<button data-act="set-theme" data-t="' + o[0] + '" aria-pressed="' + (theme() === o[0]) + '" class="' + (theme() === o[0] ? 'on' : '') + '">' + (o[2] ? I(o[2], 18) : '') + o[1] + '</button>').join('') + '</div></div>' +
      mrow('cloud', 'สภาพอากาศ', esc(W.describe()), 'เปลี่ยน', 'data-act="open-weather"', 'button') +
      mrow('pin', 'พื้นที่', esc(loc), 'ใช้ตำแหน่งฉัน', 'data-act="use-gps"', 'button') +
      mrow('refresh', 'Quiz', 'ทำใหม่เมื่อรสนิยมเปลี่ยน', '', 'data-act="retake"', 'button') +
      mrow('lock', 'ผู้พัฒนา (หลังบ้าน)', 'ล็อกอินเพื่อเพิ่มร้านคาเฟ่และประกาศ', CM.dev.isDev() ? 'เข้าสู่ระบบแล้ว' : '', 'href="#/dev"') + '</div>' +
      '<div class="card menu danger-zone">' + mrow('trash', 'ล้างข้อมูล', 'ลบโปรไฟล์และ Passport ในเครื่องนี้', '', 'data-act="confirm-reset"', 'button') + '</div>' +
      '<p class="muted small center">Café Mood · ต้นแบบเว็บ — ข้อมูลร้านเป็นข้อมูลสมมติเพื่อสาธิต</p></section>' };
  }

  /* ---------- customer sign-up / sign-in ---------- */
  function vAuth(mode) {
    if (CM.auth.current()) { location.replace('#/profile'); return null; }
    const up = mode === 'signup', f = (id, label, attrs, hint) => '<div class="field"><label for="' + id + '">' + label + '</label><input id="' + id + '" ' + attrs + ' aria-describedby="authMsg">' + (hint ? '<small class="muted">' + hint + '</small>' : '') + '</div>';
    return { nav: false, html: '<header class="hero-top ambient compact"><div class="topbar between"><div class="topbar">' + backBtn('#/profile') + '<span class="brand">' + I('user', 20) + (up ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ') + '</span></div></div></header>' +
      '<section class="pad stagger"><div class="card"><h2 class="sec-title first">' + (up ? 'สร้างบัญชีลูกค้า' : 'ยินดีต้อนรับกลับ') + '</h2>' +
      (up ? '<p class="muted small">เก็บ Passport โค้ด และรสนิยมของคุณไว้ในบัญชี สลับบัญชีในเครื่องเดียวกันได้ — สิ่งที่มีอยู่ตอนนี้จะถูกย้ายเข้าบัญชีใหม่</p>' + f('authName', 'ชื่อที่ให้เราเรียก (ไม่บังคับ)', 'type="text" maxlength="24" autocomplete="given-name" value="' + esc(S.get().name || '') + '"') : '') +
      f('authEmail', 'อีเมล', 'type="email" inputmode="email" autocomplete="' + (up ? 'email' : 'username') + '" maxlength="60" placeholder="name@example.com"') +
      f('authPw', 'รหัสผ่าน', 'type="password" autocomplete="' + (up ? 'new-password' : 'current-password') + '" maxlength="64"', up ? 'อย่างน้อย 8 ตัวอักษร' : '') +
      (up ? f('authPw2', 'ยืนยันรหัสผ่าน', 'type="password" autocomplete="new-password" maxlength="64"') : '') +
      '<p id="authMsg" class="muted small" role="status"></p><button class="btn primary lg" data-act="auth-do" data-mode="' + mode + '">' + (up ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ') + '</button></div>' +
      '<p class="center small">' + (up ? 'มีบัญชีแล้ว? <a href="#/login">เข้าสู่ระบบ</a>' : 'ยังไม่มีบัญชี? <a href="#/signup">สมัครสมาชิก</a>') + '</p>' +
      '<p class="muted small">ต้นแบบนี้เก็บบัญชีไว้ในเบราว์เซอร์เครื่องนี้ (รหัสผ่านเก็บเป็นค่าเข้ารหัส) จึงเข้าสู่ระบบจากเครื่องอื่นไม่ได้ และยังไม่มีระบบลืมรหัสผ่าน — แอปจริงจะย้ายไปใช้เซิร์ฟเวอร์</p></section>' };
  }

  function vStore() {
    const html = CM.ent.cardsHtml('customer');
    return { nav: true, html: subHead('sparkles', 'ฟีเจอร์พิเศษและแพ็กเกจ') + '<section class="pad stagger">' + (html || '<div class="card empty fav-empty">' + I('sparkles', 26) + '<p><b>ยังไม่มีรายการ</b></p><p class="muted small">เมื่อมีแพ็กเกจหรือฟีเจอร์ใหม่ จะขึ้นที่นี่</p></div>') + '</section>' };
  }

  function vFavorites() {
    const ids = S.get().favCafes || [], rank = new Map(E.rank(session()).map((s) => [s.cafe.id, s]));
    const items = ids.map((id) => rank.get(id)).filter(Boolean);
    return { nav: true, html:
      '<header class="hero-top ambient compact"><div class="topbar between"><div class="topbar">' + backBtn('#/profile') + '<span class="brand">' + I('heart', 20) + 'คาเฟ่โปรด</span></div>' + weatherChip() + '</div></header>' +
      '<section class="pad rise">' + (items.length
        ? '<p class="muted small">' + items.length + ' ร้าน · เรียงจากที่เพิ่มล่าสุด</p><div class="list">' + items.map((s) => rowCard(s, { line: s.cafe.tagline, ev: evOf(s.cafe) })).join('') + '</div>'
        : '<div class="card empty fav-empty">' + I('heart', 26) + '<p><b>ยังไม่มีคาเฟ่โปรด</b></p><p class="muted small">เปิดหน้าร้านแล้วแตะหัวใจ ร้านจะมาอยู่ที่นี่</p><a class="btn primary sm" href="#/discover">ไปสำรวจคาเฟ่</a></div>') + '</section>' };
  }

  /* ---------- Code / Account / Contact pages ---------- */
  const dTh = (ts) => (ts ? new Date(ts).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'ไม่ทราบวันที่');
  const subHead = (ic, t, back) => '<header class="hero-top ambient compact"><div class="topbar between"><div class="topbar">' + backBtn(back || '#/profile') + '<span class="brand">' + I(ic, 20) + t + '</span></div>' + weatherChip() + '</div></header>';
  const xl = (k, v) => '<li><span>' + k + '</span><b>' + v + '</b></li>';
  const acct = () => Object.assign({ email: '', phone: '', line: '' }, S.get().account);
  const acctFilled = () => { const a = acct(); return [S.get().name, a.email, a.phone, a.line].filter((x) => x && String(x).trim()).length; };
  // "โค้ดของฉัน" = codes the user collected from events (and promos) — never invite codes.
  const codeHist = () => (S.get().redeemLog || []).filter((x) => x.kind === 'promo' || x.kind === 'event' || x.kind === 'dev').slice().reverse();
  const dayTh = (d) => new Date(d + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
  function codeStatus(h) {
    if (h.kind === 'event' || h.kind === 'dev') return !h.until ? 'ไม่มีวันหมดอายุ' : h.until >= ymd() ? 'ใช้ได้ถึง ' + dayTh(h.until) : 'หมดอายุแล้ว';
    const sub = S.get().sub, left = sub.trialEnd > Date.now() && sub.plan === 'plus' ? Math.ceil((sub.trialEnd - Date.now()) / 864e5) : 0;
    return left ? 'กำลังใช้งาน · เหลือ ' + left + ' วัน' : 'สิ้นสุดแล้ว';
  }

  function vCode() {
    const hist = codeHist();
    const list = hist.length
      ? '<div class="card menu">' + hist.map((h) => mrow(h.kind === 'event' ? 'star' : 'sparkles', esc(h.code), esc(h.kind === 'promo' ? 'โปรโมชัน' : h.kind === 'dev' ? h.gives || h.title : (h.gives ? h.gives + ' · ' : '') + h.title) + ' · ' + codeStatus(h), '', 'data-act="code-detail" data-code="' + esc(h.code) + '"', 'button')).join('') + '</div>'
      : '<div class="card empty fav-empty">' + I('sparkles', 26) + '<p><b>ยังไม่มีโค้ดที่เก็บไว้</b></p><p class="muted small">ใส่โค้ดที่ร้านแจกตามอีเว้นท์ แล้วโค้ดจะมาอยู่ที่นี่</p><a class="btn ghost sm" href="#/events">ดูอีเว้นท์</a></div>';
    return { nav: true, html: subHead('sparkles', 'โค้ดของฉัน') +
      '<section class="pad stagger">' +
      '<div class="card codecard"><label class="cc-k" for="codeInput">ใส่โค้ดจากอีเว้นท์ ร้านค้า หรือผู้พัฒนา</label>' +
      '<div class="cc-in tok"><input id="codeInput" type="text" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="ใส่โค้ดที่นี่" aria-describedby="codeMsg"><button class="btn primary sm" data-act="redeem">เก็บโค้ด</button></div>' +
      '<p id="codeMsg" class="muted small" role="status">' + (ST.lookupCode('ACOUSTIC') ? 'ต้นแบบ: ลองโค้ด ACOUSTIC หรือ WELCOME7' : 'ใส่โค้ดที่ได้รับจากร้านหรือผู้พัฒนา') + '</p></div>' +
      '<div class="sec-row"><h2 class="sec-title">' + I('star', 20) + 'โค้ดที่เก็บไว้' + (hist.length ? ' <span class="cnt">' + hist.length + '</span>' : '') + '</h2></div>' + list + '</section>' };
  }

  function sheetCode(code) {
    const h = codeHist().find((x) => x.code === code);
    if (!h) return;
    const c = h.cafeId && D.CAFE_BY_ID[h.cafeId];
    openSheet('<h2 id="sheetTitle">' + esc(h.code) + '</h2><ul class="xp-lines">' +
      xl('ประเภท', h.kind === 'event' ? 'โค้ดจากร้าน/อีเว้นท์' : h.kind === 'dev' ? 'โค้ดจากผู้พัฒนา' : 'โปรโมชัน') +
      (h.kind !== 'promo' ? xl('ที่มา', esc(h.title)) + (c ? xl('ร้าน', esc(c.name)) : '') : '') +
      xl('สิ่งที่ได้', esc(h.kind === 'promo' ? 'ทดลอง Plus ฟรี 7 วัน' : h.gives)) + xl('สถานะ', codeStatus(h)) + xl('เก็บไว้เมื่อ', dTh(h.ts)) + '</ul>' +
      (h.kind !== 'promo' && c ? '<p class="muted small">แสดงหน้านี้ให้พนักงานที่ร้านดูเพื่อรับสิทธิ์ — ต้นแบบนี้ยังไม่มีระบบตัดสิทธิ์จริง</p>' : '') +
      (c ? '<a class="btn ghost block" href="#/cafe/' + c.id + '">ไปที่หน้าร้าน</a>' : '') +
      '<button class="btn primary lg" data-act="close-sheet">ปิด</button>');
  }

  function vAccount() {
    const st = S.get(), a = acct(), pr = st.profile && D.ARCHETYPE_BY_ID[st.profile.archetype];
    const fld = (id, l, v, attrs, hint) => '<div class="field"><label for="' + id + '">' + l + '</label><input id="' + id + '" value="' + esc(v) + '" ' + attrs + ' aria-describedby="acMsg">' + (hint ? '<small class="muted">' + hint + '</small>' : '') + '</div>';
    return { nav: true, html: subHead('user', 'ข้อมูลส่วนตัว') +
      '<section class="pad stagger">' +
      '<div class="card"><h2 class="sec-title first">' + I('edit', 20) + 'ข้อมูลของฉัน</h2>' +
      fld('acName', 'ชื่อที่ให้เราเรียก', st.name || '', 'type="text" maxlength="24" autocomplete="given-name"') +
      fld('acEmail', 'อีเมล', a.email, 'type="email" inputmode="email" autocomplete="email" maxlength="60" placeholder="name@example.com"') +
      fld('acPhone', 'เบอร์โทร', a.phone, 'type="tel" inputmode="tel" autocomplete="tel" maxlength="16" placeholder="08x-xxx-xxxx"') +
      fld('acLine', 'LINE ID', a.line, 'type="text" autocapitalize="none" autocomplete="off" maxlength="21" placeholder="@yourid"') +
      '<p id="acMsg" class="muted small" role="status">ไม่บังคับกรอก — ใส่เท่าที่สะดวก</p><button class="btn primary lg" data-act="save-account">บันทึก</button></div>' +
      '<div class="card menu">' + mrow('sparkles', 'Café Personality', pr ? esc(pr.name) : 'ยังไม่ได้ทำ Quiz', '', 'href="' + (pr ? '#/persona' : '#/quiz/0') + '"') +
      mrow('stamp', 'Passport', 'ร้านที่เคยไป', new Set(S.live().map((v) => v.cafeId)).size + ' ร้าน', 'href="#/passport"') +
      mrow('heart', 'คาเฟ่โปรด', '', (st.favCafes || []).length + ' ร้าน', 'href="#/favorites"') + '</div>' +
      '<p class="muted small">ต้นแบบนี้เก็บข้อมูลไว้ในเครื่องนี้เท่านั้น ไม่ได้ส่งไปที่เซิร์ฟเวอร์ และยังไม่มีบัญชีผู้ใช้จริง</p></section>' };
  }

  const CT_CH = { line: ['LINE ID', '@yourid', 'text', 'LINE'], email: ['อีเมล', 'name@example.com', 'email', 'อีเมล'], phone: ['เบอร์โทร', '08x-xxx-xxxx', 'tel', 'โทร'] };
  const CT_TOPIC = ['สอบถามทั่วไป', 'แจ้งปัญหาการใช้งาน', 'เสนอแนะ', 'ร้านของฉัน (เจ้าของร้าน)'];
  let ctCh = 'line';
  function vContact() {
    const reqs = S.get().contactRequests || [], a = acct(), m = CT_CH[ctCh], c0 = CM.dev.contact(), dv = c0 && (c0.email || c0.line || c0.phone || c0.social) ? c0 : null;
    const chan = (ic, k, v) => '<div class="mrow static ct-ch"><span class="mi">' + I(ic, 20) + '</span><span class="mt"><small>' + k + '</small><b class="ct-v">' + v + '</b></span><button class="btn ghost sm" data-act="copy-text" data-v="' + v + '">คัดลอก</button></div>';
    return { nav: true, html: subHead('message', 'ติดต่อเรา') +
      '<section class="pad stagger">' +
      (dv ? '<div class="card menu">' + [dv.email && chan('mail', 'อีเมล', esc(dv.email)), dv.line && chan('message', 'LINE', esc(dv.line)), dv.phone && chan('phone', 'โทร', esc(dv.phone)), dv.social && chan('user', 'โซเชียล', esc(dv.social))].filter(Boolean).join('') + '</div>' + (dv.note ? '<p class="muted small">' + esc(dv.note) + '</p>' : '')
        : '<div class="card empty"><p class="muted">ผู้พัฒนายังไม่ได้ตั้งช่องทางติดต่อ — ฝากข้อความด้านล่างไว้ได้</p></div>') +
      '<div class="card"><h2 class="sec-title first">' + I('phone', 20) + 'ฝากช่องทางให้ติดต่อกลับ</h2>' +
      '<div class="field"><label for="ctTopic">เรื่อง</label><select id="ctTopic">' + CT_TOPIC.map((t) => '<option>' + t + '</option>').join('') + '</select></div>' +
      '<div class="field"><span class="lbl">ให้ติดต่อกลับทาง</span><div class="seg three" role="group" aria-label="ช่องทางที่สะดวก">' + Object.keys(CT_CH).map((k) => '<button data-act="contact-ch" data-k="' + k + '" aria-pressed="' + (ctCh === k) + '" class="' + (ctCh === k ? 'on' : '') + '">' + CT_CH[k][3] + '</button>').join('') + '</div></div>' +
      '<div class="field"><label id="ctLbl" for="ctVal">' + m[0] + '</label><input id="ctVal" type="' + m[2] + '" placeholder="' + m[1] + '" maxlength="60" autocomplete="off" value="' + esc(ctCh === 'email' ? a.email : ctCh === 'phone' ? a.phone : a.line) + '"></div>' +
      '<div class="field"><label for="ctMsg">ข้อความ</label><textarea id="ctMsg" rows="3" maxlength="300" placeholder="เล่าให้เราฟังสั้น ๆ"></textarea></div>' +
      '<p id="ctNote" class="muted small" role="status">ต้นแบบ: ข้อความจะถูกบันทึกในเครื่องนี้เท่านั้น ยังไม่ได้ส่งถึงทีมงานจริง</p><button class="btn primary lg" data-act="save-contact">บันทึกข้อความ</button></div>' +
      (reqs.length ? '<h2 class="grp-t">ที่ฝากไว้ในเครื่องนี้</h2><div class="card menu">' + reqs.slice().reverse().map((r) => '<div class="mrow static ct-req"><span class="mt"><b>' + esc(r.topic) + '</b><small>' + dTh(r.ts) + ' · ' + esc(CT_CH[r.ch][3]) + ': ' + esc(r.val) + '</small><small class="ct-msg">' + esc(r.msg) + '</small></span><button class="btn text sm" data-act="del-contact" data-id="' + r.id + '" aria-label="ลบข้อความนี้">ลบ</button></div>').join('') + '</div>' : '') + '</section>' };
  }

  /* ---------- nav / router ---------- */
  const TABS = [['home', 'home', 'Home'], ['discover', 'compass', 'Discover'], ['map', 'map', 'Map'], ['passport', 'stamp', 'Passport'], ['profile', 'user', 'Profile']];
  const TAB_OF = { login: 'profile', signup: 'profile', store: 'profile', dev: 'profile', favorites: 'profile', code: 'profile', account: 'profile', contact: 'profile', results: 'home', hidden: 'discover', lens: 'discover', drink: 'discover', events: 'discover', event: 'discover' };
  function navHtml(route) {
    const cur = TAB_OF[route] || route;
    return TABS.map((t) => '<a class="tab" href="#/' + t[0] + '"' + (cur === t[0] ? ' aria-current="page"' : '') + '>' + I(t[1], 24) + '<span>' + t[2] + '</span></a>').join('');
  }

  // Theme: '' = follow the device, 'light' / 'dark' = user choice (kept in its own key so the head script can read it before paint).
  const THEME_BAR = { light: '#F5EDE2', dark: '#17110D' };
  const theme = () => { try { return localStorage.getItem('cafemood.theme') || ''; } catch (e) { return ''; } };
  function applyTheme(t, keep) {
    // keep = boot call: only sync the page, never rewrite storage (a failed read must not erase the choice)
    if (!keep) try { t ? localStorage.setItem('cafemood.theme', t) : localStorage.removeItem('cafemood.theme'); } catch (e) { /* private mode: still applies for this visit */ }
    t ? (document.documentElement.dataset.theme = t) : delete document.documentElement.dataset.theme;
    $$('meta[name=theme-color]').forEach((m) => { m.content = t ? THEME_BAR[t] : /dark/.test(m.media) ? THEME_BAR.dark : THEME_BAR.light; });
  }
  function applyAmbient() { document.documentElement.dataset.ambient = W.ctx.ambient; }

  // Pages that recommend cafés need at least one café (the developer may have removed the samples before adding real ones)
  const NEEDS_CAFES = ['home', 'discover', 'results', 'lens', 'hidden', 'drink', 'search', 'persona'];   // (the map still opens with no cafés)
  const vEmpty = () => ({ nav: true, html: '<header class="hero-top ambient"><div class="topbar between"><span class="brand">' + I('coffee', 20) + 'Café Mood</span></div><h1 class="display sm">ยังไม่มีคาเฟ่ในระบบ</h1><p class="lead sm">กำลังเตรียมร้านให้คุณ — กลับมาดูใหม่เร็ว ๆ นี้</p></header><section class="pad"><div class="card empty fav-empty">' + I('coffee', 26) + '<p><b>ยังไม่มีร้านให้แนะนำ</b></p><p class="muted small">เมื่อมีคาเฟ่เข้ามา คำแนะนำตาม Mood อากาศ และนิสัยคาเฟ่ของคุณจะขึ้นที่นี่</p></div></section>' });
  function render(keepScroll) {
    const r = parseRoute(), st = S.get();
    if (!st.profile && !st.skipped && !['welcome', 'quiz', 'persona', 'login', 'signup'].includes(r.name)) { location.replace('#/welcome'); return; }
    if (map) { map.stop(); map.remove(); map = null; mapMarkers = []; }
    let v;
    if (!D.CAFES.length && NEEDS_CAFES.includes(r.name)) { v = vEmpty(); r.name = 'home'; r.empty = true; }
    else switch (r.name) {
      case 'welcome': v = vWelcome(); break;
      case 'quiz': v = vQuiz(r.arg); break;
      case 'persona': v = vPersona(); break;
      case 'favorites': v = vFavorites(); break;
      case 'code': v = vCode(); break;
      case 'account': v = vAccount(); break;
      case 'contact': v = vContact(); break;
      case 'results': v = vResults(); break;
      case 'search': v = vSearch(); break;
      case 'cafe': v = vCafe(r.arg); break;
      case 'discover': v = vDiscover(); break;
      case 'lens': v = vLens(r.arg); break;
      case 'hidden': v = vHidden(); break;
      case 'drink': v = vDrink(); break;
      case 'map': v = vMap(); break;
      case 'passport': v = vPassport(); break;
      case 'profile': v = vProfile(); break;
      case 'studio': v = ST.view(r.arg); break;
      case 'dev': v = CM.dev.view(r.arg); break;
      case 'store': v = vStore(); break;
      case 'login': case 'signup': v = vAuth(r.name); break;
      case 'plus': case 'wrapped': v = CM.plus.view(r.name); break;
      case 'events': v = vEvents(); break;
      case 'event': v = vEvent(r.arg); break;
      case 'me': location.replace('#/profile'); return;
      default: v = vHome();
    }
    if (!v) return;
    view.classList.toggle('still', !!keepScroll);
    view.innerHTML = v.html;
    nav.hidden = !v.nav;
    document.body.classList.toggle('has-nav', !!v.nav);
    if (v.nav) nav.innerHTML = v.navHtml || navHtml(r.name);
    document.body.dataset.route = r.name;
    applyAmbient();
    if (!keepScroll) window.scrollTo(0, 0);
    if (v.mount) v.mount(keepScroll);
  }

  window.addEventListener('hashchange', () => {
    const h = location.hash;
    if (h !== stack[stack.length - 1]) {
      if (stack.length > 1 && stack[stack.length - 2] === h) stack.pop(); else stack.push(h);
    }
    if (sheetOpen) closeSheet(true);
    trackView();
    render();
    if (!['quiz'].includes(parseRoute().name)) view.focus({ preventScroll: true });
  });

  let weatherSig = '';
  function trackView() { const r = parseRoute(); if (r.name === 'event') ST.trackEvent(r.arg); if (r.name === 'cafe' && D.CAFE_BY_ID[r.arg] && !(ST.myCafe() && ST.myCafe().id === r.arg)) ST.track(r.arg, 'views'); }

  W.onChange((c) => {
    ST.apply(c.hour);
    applyAmbient();
    const sig = [c.kind, c.night, c.temp, c.source].join('|');
    if (sig === weatherSig) return;
    const first = !weatherSig;
    weatherSig = sig;
    if (first) return;   // the boot render already used this context
    const n = parseRoute().name;
    if (sheetOpen || n === 'quiz' || n === 'welcome' || n === 'persona') return;
    render(true);
  });

  /* ---------- sheets ---------- */
  function openSheet(html) {
    lastFocus = document.activeElement;
    sheetRoot.innerHTML = '<div class="sheet-backdrop" data-act="close-sheet"></div><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheetTitle" tabindex="-1"><div class="grab" aria-hidden="true"></div>' + html + '</div>';
    sheetOpen = true;
    document.body.classList.add('sheet-open');
    const sh = $('.sheet', sheetRoot);
    const first = $('button', sh);
    (first || sh).focus({ preventScroll: true });
  }
  function closeSheet(silent) {
    if (!sheetOpen) return;
    sheetRoot.innerHTML = '';
    sheetOpen = false;
    document.body.classList.remove('sheet-open');
    if (!silent && lastFocus && lastFocus.focus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
  }

  document.addEventListener('keydown', (e) => {
    if (!sheetOpen) return;
    if (e.key === 'Escape') { closeSheet(); render(true); return; }
    if (e.key === 'Tab') {
      const f = $$('button, a[href], input, [tabindex="0"]', $('.sheet', sheetRoot)).filter((x) => !x.disabled);
      if (!f.length) return;
      const a = f[0], z = f[f.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    }
  });

  function sheetWeather() {
    const cur = S.get().weatherOverride;
    const sims = [['sunny', 'sun', 'แดดดี'], ['cloudy', 'cloud', 'ครึ้มฟ้า'], ['rain', 'cloud-rain', 'ฝนตก'], ['hot', 'thermometer', 'ร้อนจัด'], ['night', 'moon', 'กลางคืน']];
    openSheet('<h2 id="sheetTitle">สภาพอากาศ</h2><p class="muted">ตอนนี้: <b>' + esc(W.describe()) + '</b><br>อากาศเป็น context ที่ระบบนำไปคิดเอง — ที่นี่เพื่อทดลองดูว่าคำแนะนำเปลี่ยนยังไง</p>' +
      '<div class="sim-grid">' + sims.map((s) => '<button class="sim' + (cur === s[0] ? ' on' : '') + '" data-act="set-weather" data-k="' + s[0] + '" aria-pressed="' + (cur === s[0]) + '">' + I(s[1], 24) + '<span>' + s[2] + '</span></button>').join('') + '</div>' +
      '<button class="btn ghost block" data-act="set-weather" data-k="auto">' + I('refresh', 18) + 'ใช้อากาศจริง (อัตโนมัติ)</button>' +
      '<button class="btn ghost block" data-act="use-gps">' + I('navigation', 18) + 'ใช้ตำแหน่งของฉัน</button>' +
      '<button class="btn text block" data-act="close-sheet">ปิด</button>');
  }

  function sheetCheckin() {
    const c = D.CAFE_BY_ID[ci.cafeId];
    const chip = (kind, id, label, sub) => '<button class="chip-toggle' + (ci[kind].has(id) ? ' on' : '') + '" data-act="toggle-ci" data-kind="' + kind + '" data-id="' + id + '" aria-pressed="' + ci[kind].has(id) + '"><span>' + esc(label) + '</span>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '<span class="ck">' + I('check', 16) + '</span></button>';
    openSheet('<h2 id="sheetTitle">Check in ที่ ' + esc(c.name) + '</h2>' +
      '<p class="muted">บันทึกว่าวันนี้ทำอะไรบ้าง · ตอนนี้ ' + I(W.ctx.icon, 14) + ' ' + esc(W.ctx.label) + '</p>' +
      '<h3 class="sh-h">เครื่องดื่มที่ลอง</h3><div class="toggles">' + c.drinks.map((d) => chip('drinks', d.id, d.name, '฿' + d.price)).join('') + '</div>' +
      '<h3 class="sh-h">Photo Spot ที่ได้ถ่าย</h3><div class="toggles">' + c.spots.map((p) => chip('spots', p.id, p.name, p.best)).join('') + '</div>' +
      (ST.questFor(c) ? ST.questCard(c, vis().some((v) => v.questDone === c.id + ':q')) : '') +
      '<button class="btn primary lg" data-act="confirm-ci">' + I('stamp', 20) + 'เก็บ stamp</button>' +
      '<button class="btn text block" data-act="close-sheet">ยกเลิก</button>');
  }

  function sheetStampResult(r, c, unlocked, lvBefore, lvAfter) {
    const lines = [];
    if (r.isNewCafe) lines.push(['ร้านใหม่', 40]);
    lines.push(['Check in', 20]);
    if (r.newDrinks) lines.push(['เมนูใหม่ × ' + r.newDrinks, r.newDrinks * 10]);
    if (r.newSpots) lines.push(['Photo Spot ใหม่ × ' + r.newSpots, r.newSpots * 10]);
    if (r.hiddenFirst) lines.push(['ค้นพบ Hidden Café', 30]);
    if (r.questXp) lines.push(['Quest สำเร็จ', r.questXp]);
    const got = ST.passEarned(c, vis().filter((v) => v.cafeId === c.id));
    openSheet('<div class="stamp-result"><div class="stamp-pop">' + A.stamp(c, { locked: !got }) + '</div>' +
      '<h2 id="sheetTitle">' + (got ? 'Stamp collected!' : 'Check-in แล้ว!') + '</h2><p class="muted">' + esc(c.name) + '</p>' +
      (got ? '' : '<p class="muted small">ทำให้ครบเพื่อรับ stamp ของร้านนี้</p><ul class="pp-conds">' + r.pass.parts.map((p) => '<li class="' + (p.done ? 'done' : '') + '">' + I(p.done ? 'check' : 'target', 15) + esc(p.t) + '</li>').join('') + '</ul>') +
      '<ul class="xp-lines">' + lines.map((l) => '<li><span>' + l[0] + '</span><b>+' + l[1] + ' XP</b></li>').join('') + '<li class="total"><span>รวม</span><b>+' + r.xp + ' XP</b></li></ul>' +
      (r.rewardText ? '<div class="unlock"><span class="ach-ic">' + I('stamp', 24) + '</span><div><small>Stamp Card ครบแล้ว — แสดงให้ร้านดู</small><b>' + esc(r.rewardText) + '</b></div></div>' : '') +
      (lvAfter.level > lvBefore.level ? '<p class="levelup">' + I('bolt', 18) + 'Level up! Lv.' + lvAfter.level + ' ' + esc(lvAfter.name) + '</p>' : '') +
      unlocked.map((a) => '<div class="unlock"><span class="ach-ic">' + I(a.icon, 24) + '</span><div><small>Achievement unlocked</small><b>' + esc(a.name) + '</b></div></div>').join('') +
      '<a class="btn primary lg" href="#/passport">ดู Passport</a><button class="btn text block" data-act="close-sheet">ปิด</button></div>');
  }

  function startCheckin(cafeId, drinkId) {
    ci = { cafeId, drinks: new Set(drinkId ? [drinkId] : []), spots: new Set() };
    sheetCheckin();
  }

  /* ---------- actions ---------- */
  const H = {
    go: (el) => go(el.dataset.to),
    back: (el) => { if (stack.length > 1) history.back(); else go(el.dataset.fallback || '#/home'); },

    'start-quiz': () => { S.patch({ quizDraft: {}, skipped: false }); go('#/quiz/0'); },
    'skip-quiz': () => { S.patch({ skipped: true }); go('#/home'); },
    'quiz-prev': () => { const n = parseInt(parseRoute().arg, 10); go('#/quiz/' + Math.max(0, n - 1)); },
    'quiz-pick': (el) => {
      if (quizLock) return;
      quizLock = true;
      const q = +el.dataset.q, o = +el.dataset.o;
      const draft = Object.assign({}, S.get().quizDraft);
      draft[q] = o;
      S.patch({ quizDraft: draft });
      $$('.opt', view).forEach((b) => { const on = b === el; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
      setTimeout(() => {
        quizLock = false;
        if (q + 1 < D.QUIZ.length) go('#/quiz/' + (q + 1));
        else { S.patch({ profile: E.buildProfile(draft), skipped: false, quizDraft: {} }); go('#/persona'); }
      }, 260);
    },
    retake: () => { S.patch({ quizDraft: {}, skipped: false }); go('#/quiz/0'); },

    'toggle-mood': (el) => {
      const id = el.dataset.id, i = draftMoods.indexOf(id);
      if (i >= 0) draftMoods.splice(i, 1);
      else {
        draftMoods.push(id);
        if (draftMoods.length > 3) draftMoods.shift();
        const mh = Object.assign({}, S.get().moodHistory); mh[id] = (mh[id] || 0) + 1;
        S.patch({ moodHistory: mh });
      }
      $$('.mood-tile', view).forEach((b) => { const on = draftMoods.includes(b.dataset.id); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
      const err = $('#moodError'); if (err) err.hidden = true;
      // recommendations update live — no "search" button needed
      if (!applyMood(draftText.trim())) S.patch({ mood: null });
      refreshHome();
    },
    example: (el) => {
      const t = el.textContent;
      draftText = t;
      const ta = $('#moodText'); ta.value = t; ta.focus();
      const err = $('#moodError'); if (err) err.hidden = true;
    },
    find: () => {
      const ta = $('#moodText'), err = $('#moodError');
      const text = (ta.value || '').trim();
      draftText = text;
      if (!applyMood(text)) {
        err.textContent = text ? 'ยังจับ Mood จากข้อความนี้ไม่ได้ ลองเลือกจากปุ่มด้านบน หรือเล่าเพิ่มอีกนิด เช่น “อยากนั่งเงียบ ๆ อ่านหนังสือ”' : 'พิมพ์เล่าให้เราฟังสักนิด หรือเลือก Mood จากปุ่มด้านบนก่อนนะ';
        err.hidden = false;
        ta.focus();
        return;
      }
      err.hidden = true;
      refreshHome();
      $('#today').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    },
    'locate-me': (el) => locateMe(el),
    'toggle-filter': (el) => {
      const k = el.dataset.k;
      if (mapFilters.has(k)) mapFilters.delete(k); else mapFilters.add(k);
      el.classList.toggle('on', mapFilters.has(k)); el.setAttribute('aria-pressed', mapFilters.has(k));
      drawMarkers(true);
    },
    'open-weather': () => sheetWeather(),
    'fav-cafe': (el) => {
      const st = S.get(), id = el.dataset.id, list = st.favCafes || [], on = !list.includes(id);
      S.patch({ favCafes: on ? [id].concat(list) : list.filter((x) => x !== id) });
      el.classList.toggle('on', on); el.classList.remove('pop'); if (on) { void el.offsetWidth; el.classList.add('pop'); } el.setAttribute('aria-pressed', on); el.setAttribute('aria-label', on ? 'นำออกจากรายการโปรด' : 'เพิ่มในรายการโปรด');
      toast(on ? 'เพิ่มในรายการโปรดแล้ว' : 'นำออกจากรายการโปรดแล้ว');
    },
    'redeem': async () => {
      const inp = $('#codeInput'), msg = $('#codeMsg'), st = S.get(), raw = (inp.value || '').trim(), c = raw.toUpperCase(), say = (t, bad) => { msg.textContent = t; msg.classList.toggle('bad', !!bad); };
      if (!raw) { say('ใส่โค้ดก่อนนะ', true); inp.focus(); return; }
      const entry = { ts: Date.now() }, now = Date.now(), until = (u) => (u ? new Date(u - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10) : '');
      let toastMsg;
      if (/^CM1\./.test(raw.replace(/\s+/g, ''))) {   // signed code from the developer
        const res = await CM.dev.readToken(raw);
        if (res.err) { say(CM.dev.tokenError(res.err), true); return; }
        const p = res.p;
        if ((st.redeemed || []).includes(p.i)) { say('โค้ดนี้เก็บไว้แล้วในเครื่องนี้', true); return; }
        if (p.t === 'studio') { say('โค้ดนี้ใช้ที่ Café Studio → แพ็กเกจ → มีรหัสเปิดใช้งาน', true); return; }
        entry.code = p.i;
        if (p.t === 'prod') {
          const r = CM.ent.applyToken(p);
          if (!r.ok) { say(r.msg, true); return; }
          Object.assign(entry, { kind: 'dev', title: r.name, gives: r.msg, until: '' });
          S.patch({ redeemed: (st.redeemed || []).concat(p.i), redeemLog: (st.redeemLog || []).concat(entry) });
          toast(r.msg); render(true); return;
        }
        if (p.t === 'plus') {
          const u = p.u || (p.d ? now + p.d * 864e5 : 0);
          st.sub.grant = { until: u }; st.sub.plan = 'plus';
          Object.assign(entry, { kind: 'dev', title: 'สิทธิ์ Plus จากผู้พัฒนา', gives: 'ใช้ Plus ฟรี ' + (u ? 'ถึง ' + dayTh(until(u)) : 'ตลอดไป') + (p.n ? ' · ' + p.n : ''), until: until(u) });
          toastMsg = 'ได้รับสิทธิ์ Plus ฟรี';
        } else { Object.assign(entry, { kind: 'dev', title: 'จากผู้พัฒนา', gives: p.n || '', until: until(p.u) }); toastMsg = 'เก็บโค้ดแล้ว — ' + (p.n || ''); }
        S.patch({ redeemed: (st.redeemed || []).concat(p.i), redeemLog: (st.redeemLog || []).concat(entry) });
        toast(toastMsg); render(true); return;
      }
      if ((st.redeemed || []).includes(c)) { say('โค้ดนี้เก็บไว้แล้วในเครื่องนี้', true); return; }
      const hit = ST.lookupCode(c);
      entry.code = c;
      if (PROMOS[c] === 'plus7') {
        if (CM.plus.isPlus()) { say('คุณเป็นสมาชิก Plus อยู่แล้ว — เก็บโค้ดไว้ใช้ภายหลังได้', true); return; }
        const sub = st.sub; sub.plan = 'plus'; sub.period = 'month'; sub.startedAt = Date.now(); sub.trialEnd = Date.now() + 7 * 864e5; sub.cancelled = false; sub.endsAt = 0;
        entry.kind = 'promo'; toastMsg = 'เก็บโค้ดแล้ว — ทดลอง Plus ฟรี 7 วัน';
      } else if (hit) {
        if (hit.until && hit.until < ymd()) { say('โค้ดนี้หมดอายุแล้ว', true); return; }
        Object.assign(entry, { kind: 'event', cafeId: hit.cafeId, title: hit.title, gives: hit.gives, until: hit.until }); toastMsg = 'เก็บโค้ดแล้ว — ' + hit.gives;
      } else { say('ไม่พบโค้ดนี้ ตรวจตัวสะกดอีกครั้ง', true); inp.select(); return; }
      S.patch({ redeemed: (st.redeemed || []).concat(c), redeemLog: (st.redeemLog || []).concat(entry) });
      toast(toastMsg);
      render(true);
    },
    'auth-do': async (el) => {
      const up = el.dataset.mode === 'signup', msg = $('#authMsg'), v = (id) => ($('#' + id) ? $('#' + id).value : ''), bad = (t) => { msg.textContent = t; msg.classList.add('bad'); };
      const res = up ? await CM.auth.signup({ email: v('authEmail'), password: v('authPw'), password2: v('authPw2'), name: v('authName') }) : await CM.auth.login(v('authEmail'), v('authPw'));
      if (res.err) return bad(res.err === 'wait' ? 'ใส่ผิดหลายครั้ง รออีก ' + res.wait + ' วินาทีแล้วลองใหม่' : CM.auth.message(res.err));
      draftMoods = []; draftText = ''; ST.apply(W.ctx.hour); W.refresh(); toast(up ? 'สมัครสมาชิกแล้ว' : 'เข้าสู่ระบบแล้ว'); go('#/profile'); render();
    },
    'auth-logout': () => { CM.auth.logout(); draftMoods = []; draftText = ''; ST.apply(W.ctx.hour); W.refresh(); toast('ออกจากระบบแล้ว'); render(true); },
    'avatar-clear': () => { S.patch({ avatar: '' }); render(true); toast('ลบรูปโปรไฟล์แล้ว'); },
    'code-detail': (el) => sheetCode(el.dataset.code),
    'copy-text': (el) => {
      const v = el.dataset.v, ok = () => { el.textContent = 'คัดลอกแล้ว'; setTimeout(() => { el.textContent = 'คัดลอก'; }, 1600); };
      navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(v).then(ok, () => toast('คัดลอกไม่ได้ — กดค้างที่ข้อความเพื่อเลือก')) : toast('คัดลอกไม่ได้ — กดค้างที่ข้อความเพื่อเลือก');
    },
    'save-account': () => {
      const v = (id) => ($('#' + id).value || '').trim(), msg = $('#acMsg'), bad = (t) => { msg.textContent = t; msg.classList.add('bad'); };
      const email = v('acEmail'), phone = v('acPhone'), line = v('acLine');
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return bad('อีเมลดูไม่ถูกต้อง ลองตรวจอีกครั้ง'), $('#acEmail').focus();
      if (phone && !/^[0-9+\-\s]{9,16}$/.test(phone)) return bad('เบอร์โทรควรมี 9–16 หลัก'), $('#acPhone').focus();
      if (line && !/^@?[A-Za-z0-9._-]{4,20}$/.test(line)) return bad('LINE ID ใช้ได้เฉพาะ a–z ตัวเลข . _ - (4–20 ตัว)'), $('#acLine').focus();
      msg.classList.remove('bad'); msg.textContent = 'บันทึกแล้ว';
      S.patch({ name: v('acName').slice(0, 24), account: { email, phone, line } });
      toast('บันทึกข้อมูลส่วนตัวแล้ว');
    },
    'contact-ch': (el) => {
      ctCh = el.dataset.k;
      const m = CT_CH[ctCh], a = acct(), inp = $('#ctVal');
      $$('[data-act=contact-ch]').forEach((b) => { const on = b.dataset.k === ctCh; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
      $('#ctLbl').textContent = m[0]; inp.type = m[2]; inp.placeholder = m[1]; inp.value = ctCh === 'email' ? a.email : ctCh === 'phone' ? a.phone : a.line;
    },
    'save-contact': () => {
      const val = ($('#ctVal').value || '').trim(), msg = ($('#ctMsg').value || '').trim(), note = $('#ctNote'), bad = (t, f) => { note.textContent = t; note.classList.add('bad'); $(f).focus(); };
      const ok = ctCh === 'email' ? /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(val) : ctCh === 'phone' ? /^[0-9+\-\s]{9,16}$/.test(val) : /^@?[A-Za-z0-9._-]{4,20}$/.test(val);
      if (!ok) return bad('ช่องทางติดต่อดูไม่ถูกต้อง ลองตรวจอีกครั้ง', '#ctVal');
      if (msg.length < 3) return bad('เขียนข้อความสั้น ๆ ให้เราหน่อย', '#ctMsg');
      S.patch({ contactRequests: (S.get().contactRequests || []).concat({ id: 'c' + Date.now(), ts: Date.now(), topic: $('#ctTopic').value, ch: ctCh, val, msg }) });
      toast('บันทึกแล้ว (ต้นแบบ: เก็บไว้ในเครื่องนี้ ยังไม่ได้ส่งถึงทีมงาน)');
      render(true);
    },
    'del-contact': (el) => { S.patch({ contactRequests: (S.get().contactRequests || []).filter((r) => r.id !== el.dataset.id) }); render(true); },
    'set-theme': (el) => { applyTheme(el.dataset.t); $$('[data-act=set-theme]').forEach((b) => { const on = b.dataset.t === el.dataset.t; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); }); },
    'open-filter': () => sheetFilter(),
    'area-expand': (el) => { const o = el.getAttribute('aria-expanded') !== 'true'; el.setAttribute('aria-expanded', o); el.closest('li').querySelector('.dists').hidden = !o; },
    'filter-clear': () => { $$('.sheet input[type=checkbox]').forEach((i) => { i.checked = false; }); fCount(); },
    'filter-apply': () => {
      filt.areas = new Set($$('.sheet [data-d]:checked').map((i) => i.value)); filt.near = $('#nearMe').checked; filt.events = $('#evOnly').checked;
      closeSheet(); render(true);
    },
    'filter-remove': (el) => { el.dataset.k === '@near' ? (filt.near = false) : el.dataset.k === '@ev' ? (filt.events = false) : filt.areas.delete(el.dataset.k); render(true); },
    'set-weather': (el) => {
      const k = el.dataset.k;
      drinkIdx = 0;
      closeSheet();
      W.setOverride(k === 'auto' ? null : k).then(() => toast(k === 'auto' ? 'ใช้อากาศจริงแล้ว' : 'จำลองอากาศ: ' + W.ctx.label));
    },
    'use-gps': async () => {
      toast('กำลังหาตำแหน่ง…');
      const ok = await W.useLocation();
      closeSheet(true);
      toast(ok ? 'ใช้ตำแหน่งของคุณแล้ว' : 'ไม่สามารถใช้ตำแหน่งได้ — ใช้พื้นที่ตัวอย่างต่อ');
      render(true);
    },
    'close-sheet': () => { closeSheet(); render(true); },

    'reveal-secret': (el) => {
      const c = D.CAFE_BY_ID[el.dataset.id];
      $('#secretBox').innerHTML = '<p class="secret-text rise">' + I('sparkles', 18) + esc(c.secret) + '</p>';
    },
    checkin: (el) => startCheckin(el.dataset.id),
    'try-drink': (el) => startCheckin(el.dataset.cafe, el.dataset.drink),
    'toggle-ci': (el) => {
      const set = ci[el.dataset.kind], id = el.dataset.id;
      if (set.has(id)) set.delete(id); else set.add(id);
      const on = set.has(id);
      el.classList.toggle('on', on); el.setAttribute('aria-pressed', on);
    },
    'confirm-ci': () => {
      const before = E.achievementProgress(vis()).filter((a) => a.done).map((a) => a.id);
      const lvBefore = E.levelInfo(E.stats(vis()).xp);
      const r = E.makeVisit(ci.cafeId, Array.from(ci.drinks), Array.from(ci.spots), W.ctx, vis());
      const cafe0 = D.CAFE_BY_ID[ci.cafeId], q = ST.questFor(cafe0);
      r.questXp = 0; r.rewardText = null;
      if (q && !vis().some((v) => v.questDone === q.id) && (!q.drinkId || ci.drinks.has(q.drinkId)) && (!q.spotId || ci.spots.has(q.spotId))) {
        r.questXp = q.xp; r.visit.questDone = q.id; r.visit.xp += q.xp; r.xp += q.xp;
      }
      const rw0 = ST.rewardFor(cafe0), nv = vis().filter((v) => v.cafeId === ci.cafeId).length + 1;
      if (rw0 && nv === rw0.need) r.rewardText = rw0.text;
      S.addVisit(r.visit);
      r.pass = ST.passStatus(cafe0, vis().filter((v) => v.cafeId === ci.cafeId)); ST.passAward(cafe0, vis().filter((v) => v.cafeId === ci.cafeId));
      ST.track(ci.cafeId, 'checkins');
      const unlocked = E.achievementProgress(vis()).filter((a) => a.done && !before.includes(a.id));
      const lvAfter = E.levelInfo(E.stats(vis()).xp);
      const c = D.CAFE_BY_ID[ci.cafeId];
      closeSheet(true);
      sheetStampResult(r, c, unlocked, lvBefore, lvAfter);
      render(true);
    },

    'shuffle-drink': () => { drinkIdx++; render(true); },
    'pick-drink': (el) => { drinkIdx = +el.dataset.i; render(); },
    'show-hidden': () => { hiddenAll = true; render(true); },

    'confirm-reset': () => openSheet('<h2 id="sheetTitle">ล้างข้อมูลทั้งหมด?</h2><p class="muted">โปรไฟล์ Café Personality, Mood ล่าสุด และ Passport ในเบราว์เซอร์นี้จะถูกลบ ย้อนกลับไม่ได้</p>' +
      '<button class="btn danger lg" data-act="do-reset">ล้างข้อมูล</button><button class="btn text block" data-act="close-sheet">ยกเลิก</button>'),
    'do-reset': () => {
      closeSheet(true); const dv = S.get().dev; S.reset(); S.patch({ dev: dv }); draftMoods = []; draftText = ''; drinkIdx = 0; hiddenAll = false;
      ST.apply(W.ctx.hour); W.refresh(); go('#/welcome'); render(); toast('ล้างข้อมูลแล้ว');
    }
  };

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const fn = H[el.dataset.act];
    if (fn) { if (el.tagName === 'A') e.preventDefault(); fn(el, e); }
  });
  document.addEventListener('change', (e) => {
    if (!e.target.closest('.sheet .arow')) return;
    if (e.target.dataset.p !== undefined) $$('.sheet [data-d]').forEach((i) => { i.checked = e.target.checked; }); else syncProv();
    fCount();
  });
  document.addEventListener('change', (e) => {
    if (e.target.id !== 'avatarIn') return;
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    ST.readImage(f, 256, 256, 60000).then((d) => {
      const st = S.get(), prev = st.avatar; st.avatar = d;
      if (!S.save()) { st.avatar = prev; toast('พื้นที่เก็บข้อมูลเต็ม — ลองรูปที่เล็กลง'); return; }
      render(true); toast('เปลี่ยนรูปโปรไฟล์แล้ว');
    }).catch((m) => toast(String(m)));
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && /^auth(Email|Pw2?)$/.test(e.target.id)) { e.preventDefault(); H['auth-do']($('[data-act=auth-do]')); } });
  document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'codeInput') { e.preventDefault(); H.redeem(); } });
  document.addEventListener('input', (e) => {
    if (e.target.id === 'moodText') draftText = e.target.value;
    if (e.target.id === 'cafeSearch') {
      searchQ = e.target.value;
      $('#searchOut').innerHTML = searchHtml(searchQ);
    }
    if (e.target.id === 'areaSearch') {
      const q = e.target.value.trim().toLowerCase();
      $$('.dists > li').forEach((li) => { li.hidden = !!q && !li.dataset.s.includes(q); });
    }
    if (e.target.id === 'nameInput') S.patch({ name: e.target.value.trim() });
  });

  /* ---------- boot ---------- */
  ST.install({ H, toast, openSheet, closeSheet, render });
  CM.plus.install({ H, toast, openSheet, closeSheet, render, backBtn });
  CM.dev.install({ H, toast, openSheet, closeSheet, render, backBtn });
  CM.ent.install({ H, toast, openSheet, closeSheet, render, backBtn });
  ST.apply(W.ctx.hour);
  if (!location.hash) location.replace('#/home');
  stack.push(location.hash);
  trackView();
  applyAmbient();
  applyTheme(theme(), true);
  render();
  W.refresh();
})();
