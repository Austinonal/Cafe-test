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
  const vis = () => S.get().visits;

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
      '<b aria-hidden="true">' + pct + '<small>%</small></b></div>';
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
      '<p class="meta">' + I('pin', 13) + esc(c.area) + ' · ' + fmtDist(c) + ' · ' + priceText(c) + '</p>' +
      '<p class="why">' + esc(o.line || s.reasons[0]) + '</p>' + ST.liveChip(c) +
      (s.open.open ? '' : '<span class="badge off">' + I('clock', 13) + esc(s.open.text) + '</span>') + '</div>' +
      (o.hiddenScore ? ring(s.hidden.score, 52, 'gemring') : ring(s.match, 52)) + '</a>';
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
      '<p class="lead sm">' + I(W.ctx.icon, 18, 'inl') + ' ' + esc(W.ctx.label) + (W.ctx.temp != null ? ' · ' + W.ctx.temp + '°C' : '') + '</p></header>' +
      '<section class="pad rise"><h2 class="sec-title first">Your mood today?</h2>' +
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
      '<section class="pad rise"><div class="list">' + rows + '</div></section>' };
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
  let map = null, mapMarkers = [];
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
      '<div class="fchips" role="group" aria-label="ตัวกรองแผนที่">' + chips + '</div></header>' +
      '<section class="map-wrap"><div id="map" class="map"></div><p id="mapCount" class="map-count" aria-live="polite"></p><div id="mapCard" class="pad tight"></div></section>' };
  }

  function initMap() {
    const box = $('#map');
    if (!box) return;
    if (!window.L) { box.innerHTML = '<div class="map-fallback">' + I('map', 28) + '<p>ต้องต่ออินเทอร์เน็ตเพื่อโหลดแผนที่</p><a class="btn ghost" href="#/discover">ดูเป็นรายการแทน</a></div>'; return; }
    const c = center();
    map = L.map(box, { zoomControl: true, zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false }).setView([c.lat, c.lon], 12);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map);
    L.marker([c.lat, c.lon], { icon: L.divIcon({ className: '', html: '<div class="me-dot"></div>', iconSize: [18, 18] }), interactive: false, keyboard: false }).addTo(map);
    drawMarkers(true);
  }

  function drawMarkers(fit) {
    if (!map) return;
    mapMarkers.forEach((m) => m.remove());
    mapMarkers = [];
    const ses = session();
    const all = D.CAFES.map((c) => E.scoreCafe(c, ses));
    const ctx = { moodTop: new Set(all.slice().sort((a, b) => b.match - a.match).slice(0, 6).map((s) => s.cafe.id)) };
    const shown = all.filter((s) => Array.from(mapFilters).every((k) => MAP_FILTERS.find((f) => f[0] === k)[2](s, ctx)));
    shown.forEach((s) => {
      const gem = s.hidden.eligible && s.hidden.score >= 80;
      const m = L.marker([s.cafe.lat, s.cafe.lon], {
        icon: L.divIcon({ className: '', html: '<div class="pin' + (gem ? ' gem' : '') + '"><span>' + s.match + '</span></div>', iconSize: [40, 40], iconAnchor: [20, 48] }),
        title: s.cafe.name + ' — Match ' + s.match + '%', alt: s.cafe.name
      }).addTo(map);
      m.on('click', () => { $('#mapCard').innerHTML = rowCard(s); });
      mapMarkers.push(m);
    });
    $('#mapCount').textContent = 'แสดง ' + shown.length + ' จาก ' + all.length + ' ร้าน · เลขบนหมุด = Match วันนี้';
    $('#mapCard').innerHTML = shown.length ? '' : '<div class="card empty"><p><b>ไม่มีร้านที่ตรงทุกตัวกรอง</b></p><p class="muted">ลองปิดตัวกรองบางอัน</p></div>';
    if (fit && shown.length) map.fitBounds(L.latLngBounds(shown.map((s) => [s.cafe.lat, s.cafe.lon]).concat([[center().lat, center().lon]])).pad(.15), { maxZoom: 14, animate: false });
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
      '<div class="cafe-cover">' + A.coverArt(c) + '<div class="cc-top">' + backBtn('#/home') + '</div></div>' +
      '<section class="pad cafe rise">' +
      '<div class="cafe-head"><div><h1 class="cafe-name">' + esc(c.name) + '</h1>' +
      '<p class="meta">' + I('pin', 14) + esc(c.area) + ' · ' + fmtDist(c) + ' · ' + priceText(c) + '</p>' +
      '<p class="meta">' + I('star', 14, 'ic-fill gold') + c.rating.toFixed(1) + ' (' + c.reviews.toLocaleString('th-TH') + ' รีวิว)</p></div>' + ring(s.match, 64) + '</div>' +
      '<div class="badges">' + badges(s) + (visits.length ? '<span class="badge ok">' + I('stamp', 13) + 'เคยมา ' + visits.length + ' ครั้ง</span>' : '') + '</div>' +
      '<p class="tagline">“' + esc(c.tagline) + '”</p>' + ST.liveBanner(c) +
      '<h2 class="sec-title">ทำไมถึงเหมาะกับวันนี้</h2><ul class="reasons card">' + reasons + '</ul>' +
      ST.pickCard(c) + ST.questCard(c, visits.some((v) => v.questDone === c.id + ':q')) + ST.rewardCard(c, visits.length) +
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
    return '<h2 class="sec-title">' + I('star', 20) + 'Events ที่น่าสนใจ</h2>' + list.map(eventCard).join('') + '<a class="btn ghost block" href="#/events">ดูอีเว้นท์ทั้งหมด ' + I('chevron-right', 18) + '</a>';
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
    const achHtml = ach.map((a) =>
      '<li class="ach' + (a.done ? ' done' : '') + '"><span class="ach-ic">' + I(a.icon, 24) + '</span><b>' + esc(a.name) + '</b><small>' + esc(a.desc) + '</small>' +
      (a.done ? '<span class="ach-st">' + I('check', 14) + 'สำเร็จ</span>' : '<span class="ach-bar" role="progressbar" aria-valuemin="0" aria-valuemax="' + a.goal + '" aria-valuenow="' + a.value + '"><i style="width:' + a.value / a.goal * 100 + '%"></i></span><span class="ach-st">' + a.value + '/' + a.goal + '</span>') + '</li>').join('');
    const coll = D.CAFES.map((c) => {
      const n = vis().filter((v) => v.cafeId === c.id).length;
      return '<a class="coll" href="#/cafe/' + c.id + '" aria-label="' + esc(c.name) + (n ? ' เคยไป ' + n + ' ครั้ง' : ' ยังไม่เคยไป') + '">' + A.stamp(c, { locked: !n }) + '<small>' + esc(c.name) + '</small></a>';
    }).join('');
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
      '<section class="pad rise"><div class="stat-grid">' + tiles + '</div>' + CM.plus.passportTeaser() +
      (st.cafes.length ? '' : '<div class="card empty"><p><b>ยังไม่มี stamp</b></p><p class="muted">เปิดร้านที่ชอบแล้วกด “Check in” เพื่อเก็บ stamp แรก</p><a class="btn primary" href="#/home">หาคาเฟ่วันนี้</a></div>') +
      '<h2 class="sec-title">' + I('trophy', 20) + 'Achievements</h2><ul class="ach-grid">' + achHtml + '</ul>' +
      '<h2 class="sec-title">Café Collection <small>' + st.cafes.length + '/' + D.CAFES.length + '</small></h2><div class="coll-grid">' + coll + '</div>' +
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

  function vProfile() {
    const st = S.get(), p = st.profile;
    let persona;
    if (p) {
      const a = D.ARCHETYPE_BY_ID[p.archetype];
      persona = '<div class="persona-card" style="--hue:' + a.hue + '"><p class="eyebrow">Café Personality</p><div class="persona-ic">' + I(a.icon, 36) + '</div><h2 class="display sm">' + esc(a.name) + '</h2><p class="th">' + esc(a.th) + '</p><p class="blurb">' + esc(a.blurb) + '</p></div>' +
        '<h2 class="sec-title">ชอบ</h2><ul class="likes">' + E.likes(p).map((t) => '<li>' + I('check', 15) + esc(t) + '</li>').join('') + '</ul>';
    } else {
      persona = '<div class="card empty"><p><b>ยังไม่มี Café Personality</b></p><p class="muted">ทำ Quiz สั้น ๆ เพื่อให้เราแนะนำตรงใจขึ้น</p><a class="btn primary" href="#/quiz/0">เริ่ม Quiz</a></div>';
    }
    const prefs = favourites().map((f) => '<li><span class="pf-ic">' + I(f[0], 20) + '</span><span class="pf-t"><small>' + f[1] + '</small><b>' + esc(f[2]) + '</b></span></li>').join('');
    const loc = st.location.source === 'gps' ? 'ตำแหน่งของคุณ (GPS)' : D.DEMO_CENTER.name;
    return { nav: true, html:
      '<header class="hero-top ambient"><div class="topbar between"><span class="brand">' + I('user', 20) + 'Profile' + CM.plus.badge() + '</span>' + weatherChip() + '</div>' +
      '<div class="field name-field"><label for="nameInput">ชื่อที่ให้เราเรียก</label><input id="nameInput" type="text" maxlength="24" autocomplete="given-name" value="' + esc(st.name || '') + '" placeholder="ใส่ชื่อหรือชื่อเล่น"></div></header>' +
      '<section class="pad rise">' + CM.plus.profileCard() + persona +
      '<h2 class="sec-title">Preferences</h2><ul class="prefs card">' + prefs + '</ul>' +
      CM.plus.journalHtml() +
      '<h2 class="sec-title">' + I('clock', 20) + 'การเตือน</h2>' + CM.plus.remindersHtml() +
      '<h2 class="sec-title">การตั้งค่า</h2><div class="card settings">' +
      '<div class="set-row"><div><b>สภาพอากาศ</b><small>' + esc(W.describe()) + '</small></div><button class="btn ghost sm" data-act="open-weather">เปลี่ยน</button></div>' +
      '<div class="set-row"><div><b>พื้นที่</b><small>' + esc(loc) + '</small></div><button class="btn ghost sm" data-act="use-gps">ใช้ตำแหน่งฉัน</button></div>' +
      '<div class="set-row"><div><b>Quiz</b><small>ทำใหม่เมื่อรสนิยมเปลี่ยน</small></div><button class="btn ghost sm" data-act="retake">ทำใหม่</button></div>' +
      '<div class="set-row"><div><b>Café Studio</b><small>สำหรับเจ้าของร้าน — จัดการร้าน สถานะ Quest และ Insight</small></div><a class="btn ghost sm" href="#/studio">เปิด</a></div>' +
      '<div class="set-row"><div><b>ล้างข้อมูล</b><small>ลบโปรไฟล์และ Passport ในเครื่องนี้</small></div><button class="btn danger sm" data-act="confirm-reset">ล้าง</button></div></div>' +
      '<p class="muted small center">Café Mood · ต้นแบบเว็บ — ข้อมูลร้านเป็นข้อมูลสมมติเพื่อสาธิต</p></section>' };
  }

  /* ---------- nav / router ---------- */
  const TABS = [['home', 'home', 'Home'], ['discover', 'compass', 'Discover'], ['map', 'map', 'Map'], ['passport', 'stamp', 'Passport'], ['profile', 'user', 'Profile']];
  const TAB_OF = { results: 'home', hidden: 'discover', lens: 'discover', drink: 'discover', events: 'discover', event: 'discover' };
  function navHtml(route) {
    const cur = TAB_OF[route] || route;
    return TABS.map((t) => '<a class="tab" href="#/' + t[0] + '"' + (cur === t[0] ? ' aria-current="page"' : '') + '>' + I(t[1], 24) + '<span>' + t[2] + '</span></a>').join('');
  }

  function applyAmbient() { document.documentElement.dataset.ambient = W.ctx.ambient; }

  function render(keepScroll) {
    const r = parseRoute(), st = S.get();
    if (!st.profile && !st.skipped && !['welcome', 'quiz', 'persona'].includes(r.name)) { location.replace('#/welcome'); return; }
    if (map) { map.stop(); map.remove(); map = null; mapMarkers = []; }
    let v;
    switch (r.name) {
      case 'welcome': v = vWelcome(); break;
      case 'quiz': v = vQuiz(r.arg); break;
      case 'persona': v = vPersona(); break;
      case 'results': v = vResults(); break;
      case 'cafe': v = vCafe(r.arg); break;
      case 'discover': v = vDiscover(); break;
      case 'lens': v = vLens(r.arg); break;
      case 'hidden': v = vHidden(); break;
      case 'drink': v = vDrink(); break;
      case 'map': v = vMap(); break;
      case 'passport': v = vPassport(); break;
      case 'profile': v = vProfile(); break;
      case 'studio': v = ST.view(r.arg); break;
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
    if (v.mount) v.mount();
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
    openSheet('<div class="stamp-result"><div class="stamp-pop">' + A.stamp(c) + '</div>' +
      '<h2 id="sheetTitle">Stamp collected!</h2><p class="muted">' + esc(c.name) + '</p>' +
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
    'toggle-filter': (el) => {
      const k = el.dataset.k;
      if (mapFilters.has(k)) mapFilters.delete(k); else mapFilters.add(k);
      el.classList.toggle('on', mapFilters.has(k)); el.setAttribute('aria-pressed', mapFilters.has(k));
      drawMarkers(true);
    },
    'open-weather': () => sheetWeather(),
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
      closeSheet(true); S.reset(); draftMoods = []; draftText = ''; drinkIdx = 0; hiddenAll = false;
      ST.apply(W.ctx.hour); W.refresh(); go('#/welcome'); render(); toast('ล้างข้อมูลแล้ว');
    }
  };

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const fn = H[el.dataset.act];
    if (fn) { if (el.tagName === 'A') e.preventDefault(); fn(el, e); }
  });
  document.addEventListener('input', (e) => {
    if (e.target.id === 'moodText') draftText = e.target.value;
    if (e.target.id === 'nameInput') S.patch({ name: e.target.value.trim() });
  });

  /* ---------- boot ---------- */
  ST.install({ H, toast, openSheet, closeSheet, render });
  CM.plus.install({ H, toast, openSheet, closeSheet, render, backBtn });
  ST.apply(W.ctx.hour);
  if (!location.hash) location.replace('#/home');
  stack.push(location.hash);
  trackView();
  applyAmbient();
  render();
  W.refresh();
})();
