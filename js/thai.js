/* Café Mood — Thai-context layer (v23).
   Everything the Thai market asks for in one place, so app.js only needs small hooks:
     1 First-time pick · 2 Popular times (from check-ins) · 3 LINE · 4 PromptPay QR (event tickets + packages)
     5 BTS/MRT/ARL station + walk time · 6 Motorbike / car parking tags · 7 Rain / heat / PM2.5 mode
     8 Festival collections · 9 Local-café filter · 10 Thai slang (the words themselves live in data.js KEYWORDS)
   Café data is demo data like the rest of the prototype; every number that is a stand-in says so on screen. */
(function () {
  window.CM = window.CM || {};
  const D = CM.data, E = CM.engine, S = CM.store, W = CM.weather, I = CM.icon;
  const hash = E.hash, DAY = 864e5;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const today0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const dayDiff = (iso) => Math.round((new Date(iso + 'T00:00:00') - today0()) / DAY);
  const dateTh = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
  const hh = (h) => String(Math.floor(h) % 24).padStart(2, '0') + ':00';
  let api = null;   // injected by app.js

  /* ================= 5. Rail transit: station, exit, walking time ================= */
  // shortcut: coordinates are approximate and exits are demo values for the sample cafés — real data should carry
  // `transit: { sys, station, exit, walk }` on the café (or the owner sets it in Studio → Café → รถไฟฟ้า), which wins over this table.
  const STATIONS = [
    ['BTS', 'สยาม', 13.7456, 100.5341], ['BTS', 'ชิดลม', 13.7440, 100.5429], ['BTS', 'เพลินจิต', 13.7430, 100.5492], ['BTS', 'นานา', 13.7404, 100.5554],
    ['BTS', 'อโศก', 13.7370, 100.5602], ['BTS', 'พร้อมพงษ์', 13.7305, 100.5697], ['BTS', 'ทองหล่อ', 13.7241, 100.5782], ['BTS', 'เอกมัย', 13.7195, 100.5851],
    ['BTS', 'พระโขนง', 13.7150, 100.5915], ['BTS', 'อ่อนนุช', 13.7057, 100.6006], ['BTS', 'บางนา', 13.6682, 100.6047], ['BTS', 'อารีย์', 13.7796, 100.5446],
    ['BTS', 'สนามเป้า', 13.7726, 100.5464], ['BTS', 'อนุสาวรีย์ชัยฯ', 13.7650, 100.5379], ['BTS', 'พญาไท', 13.7567, 100.5342], ['BTS', 'ราชเทวี', 13.7515, 100.5316],
    ['BTS', 'สนามกีฬาแห่งชาติ', 13.7466, 100.5290], ['BTS', 'ราชดำริ', 13.7394, 100.5399], ['BTS', 'ศาลาแดง', 13.7285, 100.5340], ['BTS', 'ช่องนนทรี', 13.7230, 100.5290],
    ['BTS', 'สุรศักดิ์', 13.7210, 100.5210], ['BTS', 'สะพานตากสิน', 13.7185, 100.5141], ['BTS', 'กรุงธนบุรี', 13.7210, 100.5020], ['BTS', 'วงเวียนใหญ่', 13.7213, 100.4950],
    ['MRT', 'สีลม', 13.7292, 100.5372], ['MRT', 'ลุมพินี', 13.7257, 100.5420], ['MRT', 'คลองเตย', 13.7222, 100.5535], ['MRT', 'ศูนย์การประชุมแห่งชาติสิริกิติ์', 13.7226, 100.5602],
    ['MRT', 'สุขุมวิท', 13.7377, 100.5604], ['MRT', 'เพชรบุรี', 13.7488, 100.5617], ['MRT', 'พระราม 9', 13.7581, 100.5654], ['MRT', 'ศูนย์วัฒนธรรมฯ', 13.7656, 100.5695],
    ['MRT', 'สามย่าน', 13.7326, 100.5290], ['MRT', 'หัวลำโพง', 13.7387, 100.5170], ['MRT', 'วัดมังกร', 13.7432, 100.5098], ['MRT', 'สามยอด', 13.7465, 100.5009],
    ['MRT', 'สนามไชย', 13.7436, 100.4930], ['MRT', 'อิสรภาพ', 13.7389, 100.4894],
    ['ARL', 'พญาไท', 13.7568, 100.5340], ['ARL', 'ราชปรารภ', 13.7583, 100.5413], ['ARL', 'มักกะสัน', 13.7508, 100.5609], ['ARL', 'รามคำแหง', 13.7511, 100.6050]
  ];
  const EXIT_DEMO = { 'ratri-slow-bar': '1', 'third-floor-roasters': '2', 'paper-and-pour': '3', 'cloud-nine': '6', 'kuri-matcha-lab': '3', 'dusk-society': '4', 'neon-alley': '1', 'tiger-bean': '5' };
  const SYS_TH = { BTS: 'BTS', MRT: 'MRT', ARL: 'Airport Rail Link', SRT: 'SRT' };
  const WALK_MAX = 15, NEAR_MIN = 10;   // show up to 15 min; the "ใกล้รถไฟฟ้า" filter means ≤ 10 min

  const walkMin = (km) => Math.max(1, Math.round((km * 1.25) / 4.8 * 60));   // 1.25 = street detour, 4.8 km/h walking pace
  function transitOf(c) {
    const own = CM.studio && CM.studio.ownerTransit ? CM.studio.ownerTransit(c) : null;
    if (own && own.station) return Object.assign({ src: 'ร้านระบุ' }, own);
    if (c.transit) return Object.assign({ src: 'ข้อมูลร้าน' }, c.transit);
    if (c.local) return null;
    let best = null;
    STATIONS.forEach((s) => { const d = E.distKm(c, { lat: s[2], lon: s[3] }); if (!best || d < best.d) best = { d, s }; });
    if (!best) return null;
    const walk = walkMin(best.d);
    if (walk > WALK_MAX) return null;
    return { sys: best.s[0], station: best.s[1], exit: EXIT_DEMO[c.id] || '', walk, src: 'ประมาณจากพิกัด' };
  }
  const transitLine = (t) => SYS_TH[t.sys] === undefined ? '' : t.sys + ' ' + t.station + (t.exit ? ' · ทางออก ' + t.exit : '') + ' · เดิน ' + t.walk + ' นาที';
  const nearTransit = (c) => { const t = transitOf(c); return !!t && t.walk <= NEAR_MIN; };

  /* ================= 6. Parking + travel tags (owner toggles in Studio → Facilities) ================= */
  const fac = (c, k) => (CM.studio && CM.studio.facilityOn ? CM.studio.facilityOn(c, k) : false);
  function travelTags(c) {
    const out = [], t = transitOf(c);
    if (fac(c, 'moto')) out.push(['moto', 'จอดมอไซค์ได้']);
    if (fac(c, 'parking')) out.push(['car', 'ที่จอดรถ']);
    if (t && t.walk <= NEAR_MIN) out.push(['train', t.sys + ' ' + t.walk + ' นาที']);
    if (E.hasAir(c)) out.push(['air', 'เครื่องฟอกอากาศ']);
    if (c.local) out.push(['pin', 'ร้านท้องถิ่น']);
    return out;
  }
  const tagsHtml = (c, compact) => {
    const t = travelTags(c);
    return t.length ? '<span class="trav-tags' + (compact ? ' compact' : '') + '" data-new="6">' + t.map((x) => '<span class="badge trav">' + I(x[0], 13) + esc(x[1]) + '</span>').join('') + '</span>' : '';
  };
  function gettingThere(c) {
    const t = transitOf(c), moto = fac(c, 'moto'), car = fac(c, 'parking');
    const rail = t
      ? '<li data-new="5">' + I('train', 18) + '<span><b>' + esc(transitLine(t)) + '</b><small>' + esc(t.src) + (t.exit ? '' : ' · ร้านยังไม่ระบุทางออก') + '</small></span></li>'
      : '<li>' + I('train', 18) + '<span><b>ไม่ใกล้รถไฟฟ้า</b><small>เดินเกิน ' + WALK_MAX + ' นาที หรือไม่มีรถไฟฟ้าในพื้นที่ — ใช้ปุ่มนำทางด้านล่าง</small></span></li>';
    return '<h2 class="sec-title">' + I('train', 20) + 'การเดินทาง & ที่จอด</h2><ul class="card going">' + rail +
      '<li data-new="6">' + I('moto', 18) + '<span><b>มอเตอร์ไซค์ ' + (moto ? 'จอดได้' : 'ยังไม่มีข้อมูลที่จอด') + '</b></span></li>' +
      '<li data-new="6">' + I('car', 18) + '<span><b>รถยนต์ ' + (car ? 'มีที่จอด' : 'ยังไม่มีข้อมูลที่จอด') + '</b></span></li></ul>' +
      '<p class="muted small">ที่จอดมาจากสวิตช์ Facilities ของเจ้าของร้าน (Studio) · สถานี/เวลาเดินเป็นข้อมูลตัวอย่างจนกว่าร้านจะระบุเอง</p>';
  }

  /* ================= 2. Popular times — from check-ins ================= */
  // Anonymous check-in buckets {c: cafeId, h: hour, t: time} (no user id). In the prototype they live on this device;
  // with a backend the same function reads the aggregate. `sim` rows are demo seeds so the chart can be tried.
  const crowd = () => (S.get().crowd = S.get().crowd || []);
  function logCheckin(cafeId) {
    const a = crowd(); a.push({ c: cafeId, h: new Date().getHours(), t: Date.now() });
    if (a.length > 3000) a.splice(0, a.length - 3000);   // shortcut: keep the newest 3000; a backend would bucket by weekday too
    S.save();
  }
  const g = (x, mu, sd) => Math.exp(-((x - mu) ** 2) / (2 * sd * sd));
  const openAt = (c, h) => (h >= c.hours[0] && h < c.hours[1]) || (h + 24 >= c.hours[0] && h + 24 < c.hours[1]);
  function prior(c) {   // shape guessed from the café's own character, used only until real check-ins arrive
    const a = c.attr, out = [];
    for (let h = 0; h < 24; h++) {
      if (!openAt(c, h)) { out.push(0); continue; }
      const x = h < c.hours[0] ? h + 24 : h;
      let w = .15 + (a.work / 10) * (g(x, 10.5, 1.6) + .8 * g(x, 14.5, 1.8)) + (a.social / 10) * (.8 * g(x, 16.5, 2) + g(x, 19.5, 1.8)) +
        (a.coffee / 10) * .6 * g(x, 8.5, 1.2) + (a.dark / 10) * g(x, 21.5, 1.8) * (c.hours[1] >= 22 ? 1 : .2);
      out.push(w * (.5 + a.crowd / 10));
    }
    return out;
  }
  function popular(c) {
    const rows = crowd().filter((r) => r.c === c.id), real = rows.filter((r) => !r.sim).length, sim = rows.length - real;
    const counts = Array(24).fill(0); rows.forEach((r) => { counts[r.h] += 1; });
    const p = prior(c), sum = p.reduce((s, v) => s + v, 0) || 1, K = Math.max(0, 14 - rows.length);   // the guess fades as data arrives
    const raw = p.map((v, h) => (v / sum) * K + counts[h]), top = Math.max.apply(null, raw) || 1;
    const bars = [];
    for (let x = Math.floor(c.hours[0]); x < Math.ceil(c.hours[1]); x++) bars.push({ h: x % 24, v: Math.round(raw[x % 24] / top * 100) });
    const now = Math.floor(W.ctx.hour) % 24;
    const quiet = bars.slice().sort((a, b) => a.v - b.v)[0], busy = bars.slice().sort((a, b) => b.v - a.v)[0];
    return { bars, now, quiet, busy, real, sim, src: real >= 14 ? 'real' : rows.length ? 'mix' : 'est' };
  }
  const level = (v) => (v >= 70 ? 'คนเยอะ' : v >= 40 ? 'ปานกลาง' : 'เงียบ');
  function popularHtml(c) {
    const p = popular(c);
    if (!p.bars.length) return '';
    const cur = p.bars.find((b) => b.h === p.now);
    const src = { real: 'จาก check-in จริง ' + p.real + ' ครั้ง', mix: 'ผสม: check-in จริง ' + p.real + ' + จำลอง ' + p.sim + (p.real + p.sim < 14 ? ' · ข้อมูลยังน้อย ใช้ค่าประมาณช่วยอยู่' : ' · เมื่อ check-in จริงครบ 14 ครั้งจะใช้ของจริงล้วน'), est: 'ประมาณการ — ยังไม่มี check-in ของร้านนี้' }[p.src];
    const bars = p.bars.map((b) => '<li class="pb' + (b.h === p.now ? ' now' : '') + '" style="--v:' + Math.max(b.v, 4) + '%"><i></i>' + (b.h % 3 === 0 ? '<span>' + String(b.h).padStart(2, '0') + '</span>' : '') + '</li>').join('');
    const summary = (cur ? 'ตอนนี้ ' + level(cur.v) + ' · ' : '') + 'เงียบสุดราว ' + hh(p.quiet.h) + ' · คนเยอะสุดราว ' + hh(p.busy.h);
    return '<h2 class="sec-title">' + I('chart', 20) + 'คนไปกี่โมงบ่อย</h2><div class="card pop" data-new="2"><p class="pop-sum"><b>' + esc(summary) + '</b></p>' +
      '<ol class="pop-bars" role="img" aria-label="' + esc('ความหนาแน่นรายชั่วโมง ' + summary) + '">' + bars + '</ol>' +
      '<p class="muted small">' + I(p.src === 'real' ? 'check' : 'info', 14) + ' ' + esc(src) + ' · เทียบกับชั่วโมงที่คนเยอะที่สุดของร้านนี้เอง</p></div>';
  }
  function simulateCrowd(n) {   // demo seed: shapes follow the prior with noise so the chart visibly changes
    const a = crowd(), now = Date.now();
    D.CAFES.forEach((c) => {
      const p = prior(c), sum = p.reduce((s, v) => s + v, 0) || 1;
      for (let i = 0; i < n; i++) {
        let r = Math.random() * sum, h = 0; while (h < 23 && r > p[h]) { r -= p[h]; h++; }
        if (openAt(c, h)) a.push({ c: c.id, h, t: now - i * 36e5, sim: 1 });
      }
    });
    S.save();
  }
  const clearSim = () => { S.get().crowd = crowd().filter((r) => !r.sim); S.save(); };

  /* ================= 1. First-time pick ================= */
  const EASY = { latte: .9, signature: .8, matcha: .8, tea: .75, coffee: .45 };
  const EASY_WHY = { latte: 'นุ่ม หวานนม ดื่มง่ายที่สุดของร้าน', matcha: 'มัทฉะนุ่ม ไม่ขมจัด เหมาะกับคนยังไม่คุ้นกาแฟ', tea: 'ชาหอม ไม่ขม ไม่ต้องรู้เรื่องกาแฟก็สั่งได้', signature: 'เมนูประจำร้าน — ลองแก้วเดียวก็รู้จักร้านนี้', coffee: 'กาแฟกลาง ๆ เริ่มแก้วนี้ก่อนค่อยไปแก้วเข้ม' };
  // shortcut: a heuristic (drink type, mid price, weather, owner's pick). Let owners mark a "มือใหม่สั่งแก้วนี้" menu when Studio gets a flag for it.
  function firstPick(c) {
    const prices = c.drinks.map((d) => d.price).sort((a, b) => a - b), mid = prices[Math.floor(prices.length / 2)] || 1, ctx = W.ctx;
    let best = null;
    c.drinks.forEach((d) => {
      let s = (EASY[d.type] || .5) + .25 * (1 - Math.min(1, Math.abs(d.price - mid) / mid));
      if (ctx.kind === 'rain' ? d.temp === 'hot' : (ctx.kind === 'sunny' || ctx.kind === 'hot') && d.temp === 'iced') s += .1;
      if (c.live && c.live.pick && c.live.pick.drinkId === d.id) s += .15;
      if (!best || s > best.s) best = { d, s };
    });
    return best ? { drink: best.d, why: EASY_WHY[best.d.type] || EASY_WHY.coffee } : null;
  }
  function firstPickHtml(c, opt) {
    const f = firstPick(c);
    if (!f) return '';
    const d = f.drink;
    return '<div class="card fti" data-new="1"><small class="kicker">' + I('sparkles', 14) + ' First-time pick' + (opt && opt.kicker ? ' · ' + esc(opt.kicker) : '') + '</small>' +
      '<div class="fti-row"><span class="dr-art">' + CM.art.drinkArt(d) + '</span><div><b>' + esc(d.name) + '</b><p class="muted">' + esc(f.why) + '</p><span class="tag">฿' + d.price + '</span><span class="tag">' + (d.temp === 'hot' ? 'ร้อน' : 'เย็น') + '</span></div></div>' +
      '<button class="btn ghost block" data-act="try-drink" data-cafe="' + c.id + '" data-drink="' + d.id + '">' + I('stamp', 18) + 'สั่งแก้วนี้แล้ว Check in</button></div>';
  }
  const homeFirstTime = (c) => (S.live().length ? '' : '<h2 class="sec-title">' + I('sparkles', 20) + 'มือใหม่เริ่มตรงนี้</h2>' + firstPickHtml(c, { kicker: c.name }));

  /* ================= 7. Rain / heat / PM2.5 comfort mode ================= */
  function comfort(ctx) {
    if (ctx.pm != null && ctx.pm >= E.PM_HIGH) return { k: 'pm', icon: 'air', title: 'โหมดหลบฝุ่น PM2.5', body: 'แนะนำร้านในร่มที่มีเครื่องฟอกอากาศหรือห้องแอร์ก่อน' };
    if (ctx.kind === 'rain') return { k: 'rain', icon: 'cloud-rain', title: 'โหมดวันฝนตก', body: 'ร้านในร่ม ริมกระจก ที่นั่งไม่เปียก — เหมาะฟังเสียงฝน' };
    if (ctx.kind === 'hot') return { k: 'hot', icon: 'thermometer', title: 'โหมดหลบร้อน', body: 'ร้านแอร์เย็น ในร่ม เครื่องดื่มเย็น ๆ ก่อน' };
    return null;
  }
  function comfortHtml() {
    const ctx = W.ctx, m = comfort(ctx);
    if (!m) return '';
    const fit = (c) => (m.k === 'pm' ? E.airFit(c) : E.weatherFit(c, { kind: m.k, night: false, pm: null })) * (E.openInfo(c, ctx.hour).open ? 1 : .5);
    const top = D.CAFES.slice().sort((a, b) => fit(b) - fit(a)).slice(0, 3);
    let gauge = '';
    if (m.k === 'pm') {
      const b = E.pmBand(ctx.pm);
      gauge = '<p class="pm-read"><b style="color:' + b[2] + '">' + Math.round(ctx.pm) + ' µg/m³</b> · ' + esc(b[1]) + '</p><div class="pm-gauge" role="img" aria-label="PM2.5 ' + Math.round(ctx.pm) + ' ระดับ ' + esc(b[1]) + '"><i style="width:' + Math.min(100, ctx.pm / 100 * 100) + '%;background:' + b[2] + '"></i><u style="left:37.5%"></u></div>' +
        '<p class="muted small">เส้นแบ่ง = มาตรฐานไทย 37.5 µg/m³ (เฉลี่ย 24 ชม.) · ค่านี้เป็นค่าชั่วโมงปัจจุบันจากแบบจำลอง ไม่ใช่สถานีตรวจวัด — ดูค่าทางการที่ Air4Thai</p>';
    }
    return '<div class="card comfort k-' + m.k + '" data-new="7"><div class="cf-h"><span class="mi">' + I(m.icon, 22) + '</span><div><b>' + m.title + '</b><small>' + m.body + '</small></div></div>' + gauge +
      '<div class="cf-list">' + top.map((c) => '<a class="cf-item" href="#/cafe/' + c.id + '"><b>' + esc(c.name) + '</b><small>' + esc(c.area) + (E.hasAir(c) ? ' · ฟอกอากาศ' : c.attr.outdoor <= 3 ? ' · ในร่ม' : '') + '</small></a>').join('') + '</div></div>';
  }

  /* ================= 8. Festival collections ================= */
  // shortcut: Loy Krathong follows the lunar calendar — add each year's date here (24 Nov 2026 checked). Songkran / New Year are fixed dates.
  const FEST = [
    { id: 'loy', th: 'ลอยกระทง', icon: 'lantern', hue: '#3E9AA6', spans: [['2026-11-24', '2026-11-24']], blurb: 'คืนวันเพ็ญริมน้ำ — คาเฟ่โซนกลางแจ้ง ริมน้ำ และเวิร์กช็อปกระทงจากวัสดุธรรมชาติ' },
    { id: 'songkran', th: 'สงกรานต์', icon: 'sun', hue: '#D2833A', fixed: ['04-13', '04-15'], blurb: 'หนีร้อนหนีน้ำ — ร้านแอร์เย็นในร่ม และอีเว้นท์รดน้ำดำหัวแบบสุภาพ' },
    { id: 'ny', th: 'ปีใหม่', icon: 'sparkles', hue: '#7E6BB5', fixed: ['12-31', '01-01'], blurb: 'ส่งท้ายปีเก่า — คาเฟ่เปิดดึก ไฟสวย และงานนับถอยหลัง' }
  ];
  const FEST_BY = {}; FEST.forEach((f) => { FEST_BY[f.id] = f; });
  function spansOf(f) {
    if (f.spans) return f.spans;
    const y = today0().getFullYear(), out = [];
    [y - 1, y, y + 1].forEach((yy) => out.push([yy + '-' + f.fixed[0], (f.fixed[1] < f.fixed[0] ? yy + 1 : yy) + '-' + f.fixed[1]]));
    return out;
  }
  function occ(id) { const t = ymd(today0()), s = spansOf(FEST_BY[id]).find((x) => x[1] >= t); return s ? { start: s[0], end: s[1] } : null; }
  const festOffset = (id) => { const o = occ(id); return o ? dayDiff(o.start) : 0; };
  const nextDow = (dow) => (dow - new Date().getDay() + 7) % 7;
  function festInfo(id) {
    const f = FEST_BY[id], o = occ(id);
    if (!o) return { f, o: null, state: 'none', days: null };
    const a = dayDiff(o.start), b = dayDiff(o.end);
    return { f, o, days: a, state: a <= 0 && b >= 0 ? 'live' : a <= 45 ? 'soon' : 'later' };
  }
  const festWhen = (fi) => (!fi.o ? 'ยังไม่มีวันที่ของปีหน้า' : fi.state === 'live' ? 'กำลังเป็นช่วงเทศกาล' : 'อีก ' + fi.days + ' วัน · ' + (fi.o.start === fi.o.end ? dateTh(fi.o.start) : dateTh(fi.o.start) + ' – ' + dateTh(fi.o.end)));
  function festEvents(id) {
    const o = occ(id), ST = CM.studio;
    return ST.eventsAll().filter((e) => ST.eventStatus(e) !== 'ended' && (e.festival === id || (o && e.startDate <= o.end && e.endDate >= o.start)));
  }
  function festCafes(id, ses) {
    const W8 = {
      loy: (c) => .5 * c.attr.outdoor / 10 + .3 * c.attr.nature / 10 + .2 * (c.hours[1] >= 20 ? 1 : 0),
      songkran: (c) => .6 * E.airFit(c) + .4 * c.attr.bright / 10,
      ny: (c) => (c.hours[1] >= 22 ? .6 : 0) + .3 * c.attr.social / 10 + .1 * c.attr.dark / 10
    }[id];
    const LINE = {
      loy: (c) => 'กลางแจ้ง ' + c.attr.outdoor + '/10 · ธรรมชาติ ' + c.attr.nature + '/10',
      songkran: (c) => (E.hasAir(c) ? 'ห้องแอร์/เครื่องฟอกอากาศ' : 'โซนในร่ม') + ' · แสงสว่าง ' + c.attr.bright + '/10',
      ny: (c) => 'เปิดถึง ' + E.fmtHour(c.hours[1]) + ' · สายสังคม ' + c.attr.social + '/10'
    }[id];
    return D.CAFES.map((c) => ({ s: E.scoreCafe(c, ses), w: W8(c) })).sort((a, b) => b.w - a.w || b.s.match - a.s.match).slice(0, 6).map((o) => ({ s: o.s, line: LINE(o.s.cafe) }));
  }
  // The strip on Home (within 45 days, or during the festival) and the rows on Discover
  function festBannerHtml() {
    const list = FEST.map((f) => festInfo(f.id)).filter((x) => x.state === 'live' || x.state === 'soon').sort((a, b) => (a.days || 0) - (b.days || 0));
    if (!list.length) return '';
    const x = list[0];
    return '<a class="card fest-strip" data-new="8" href="#/fest/' + x.f.id + '" style="--h:' + x.f.hue + '"><span class="mi">' + I(x.f.icon, 24) + '</span><span class="fs-t"><small class="kicker">เทศกาล</small><b>' + x.f.th + ' · ' + esc(festWhen(x)) + '</b><small>ดู Collection ร้านและอีเว้นท์ช่วงเทศกาล</small></span>' + I('chevron-right', 20) + '</a>';
  }
  function festView(id) {
    if (!id || !FEST_BY[id]) {
      return { nav: true, html: api.subHead('lantern', 'เทศกาล', '#/discover') + '<section class="pad rise"><p class="lead sm">Collection ร้านและอีเว้นท์ตามเทศกาลไทย</p><div class="list lens">' +
        FEST.map((f) => { const fi = festInfo(f.id); return '<a class="lens-card" data-new="8" href="#/fest/' + f.id + '"><span class="lens-ic" style="color:' + f.hue + '">' + I(f.icon, 26) + '</span><span class="lc-t"><b>' + f.th + '</b><small>' + esc(festWhen(fi)) + '</small></span>' + I('chevron-right', 20) + '</a>'; }).join('') + '</div></section>' };
    }
    const fi = festInfo(id), f = fi.f, ses = api.session(), evs = festEvents(id), cafes = festCafes(id, ses);
    return { nav: true, html: api.subHead(f.icon, f.th, '#/fest') + '<section class="pad rise"><div class="card fest-hero" style="--h:' + f.hue + '"><b>' + esc(festWhen(fi)) + '</b><p class="muted">' + esc(f.blurb) + '</p></div>' +
      '<h2 class="sec-title">' + I('star', 20) + 'อีเว้นท์ช่วง' + f.th + '</h2>' + (evs.length ? evs.map(api.eventCard).join('') : '<div class="card empty"><p class="muted">ยังไม่มีร้านประกาศอีเว้นท์ช่วงนี้ — เจ้าของร้านสร้างได้ที่ Studio → Events</p></div>') +
      '<h2 class="sec-title">' + I(f.icon, 20) + 'ร้านที่เข้ากับ' + f.th + '</h2><div class="list">' + cafes.map((o) => api.rowCard(o.s, { line: o.line })).join('') + '</div></section>' };
  }

  /* ================= 4. PromptPay QR (EMVCo / Thai QR Payment) ================= */
  function crc16(str) {   // CRC-16/CCITT-FALSE
    let crc = 0xFFFF;
    for (let i = 0; i < str.length; i++) { crc ^= str.charCodeAt(i) << 8; for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF; }
    return crc.toString(16).toUpperCase().padStart(4, '0');
  }
  const tlv = (id, v) => id + String(v.length).padStart(2, '0') + v;
  function ppTarget(raw) {   // → [tag, value] or null:  mobile 0XXXXXXXXX · national / tax ID 13 digits · e-wallet 15 digits
    const d = String(raw || '').replace(/\D/g, '');
    if (d.length === 13) return ['02', d];
    if (d.length === 15) return ['03', d];
    if (/^0\d{9}$/.test(d)) return ['01', '0066' + d.slice(1)];
    if (/^66\d{9}$/.test(d)) return ['01', '00' + d];
    return null;
  }
  function ppPayload(raw, amount) {
    const t = ppTarget(raw);
    if (!t) return '';
    const amt = amount > 0 ? Number(amount).toFixed(2) : '';
    const body = tlv('00', '01') + tlv('01', amt ? '12' : '11') + tlv('29', tlv('00', 'A000000677010111') + tlv(t[0], t[1])) + tlv('58', 'TH') + tlv('53', '764') + (amt ? tlv('54', amt) : '') + '6304';
    return body + crc16(body);
  }
  function qrSvg(text, label) {
    if (!window.qrcode || !text) return '';
    const q = window.qrcode(0, 'M'); q.addData(text); q.make();
    const n = q.getModuleCount(), m = 4; let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += 'M' + (c + m) + ' ' + (r + m) + 'h1v1h-1z';
    return '<svg class="qr-svg" viewBox="0 0 ' + (n + 2 * m) + ' ' + (n + 2 * m) + '" role="img" aria-label="' + esc(label || 'QR') + '" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="' + d + '" fill="#000"/></svg>';
  }
  const money = (n) => '฿' + Number(n).toLocaleString('en-US');
  function ppQrHtml(raw, amount, opt) {
    const svg = qrSvg(ppPayload(raw, amount), 'QR พร้อมเพย์ ยอด ' + money(amount));
    if (!svg) return '';
    return '<div class="pay-qr-wrap pp" data-new="4">' + svg + '<p class="pp-cap"><b>PromptPay</b>' + (amount > 0 ? ' · ' + money(amount) : '') + '</p>' + (opt && opt.demo ? '<p class="pp-demo">ตัวอย่างเดโม — QR นี้โอนเงินจริงไม่ได้</p>' : '') + '</div>';
  }

  /* ---- event tickets ---- */
  const tickets = () => (S.get().tickets = S.get().tickets || []);
  const ticketOf = (evId) => tickets().find((t) => t.evId === evId) || null;
  const rand = (n) => { const c = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < n; i++) s += c[Math.floor(Math.random() * c.length)]; return s; };
  function ticketCardHtml(ev) {
    const tk = ev.ticket;
    if (!tk) return '';
    const mine = ticketOf(ev.id);
    const price = tk.price > 0 ? money(tk.price) : 'ฟรี';
    return '<h2 class="sec-title">' + I('ticket', 20) + 'ตั๋วเข้างาน</h2><div class="card tk-card" data-new="4"><div class="set-h"><b>' + price + ' / ที่นั่ง</b><span class="muted small">' + (tk.seats ? 'ทั้งหมด ' + tk.seats + ' ที่นั่ง' : '') + '</span></div>' +
      (mine ? '<p class="small">' + I(mine.status === 'paid' ? 'check' : 'clock', 15) + ' ' + (mine.status === 'paid' ? 'ร้านยืนยันแล้ว' : 'รอร้านตรวจยอดโอน') + ' · รหัส ' + esc(mine.ref) + '</p><a class="btn ghost block" href="#/tickets">ดูตั๋วของฉัน</a>'
        : '<button class="btn primary block" data-act="tk-buy" data-id="' + ev.id + '">' + I('qr', 18) + (tk.price > 0 ? 'ซื้อตั๋วด้วย PromptPay' : 'ลงทะเบียนเข้างาน') + '</button>') +
      '<p class="muted small">เงินโอนเข้าบัญชีพร้อมเพย์ของร้านโดยตรง แอปไม่ได้ถือเงินและยังตรวจสลิปอัตโนมัติไม่ได้ (ต้องมี backend)</p></div>';
  }
  function sheetTicket(ev) {
    const tk = ev.ticket, c = D.CAFE_BY_ID[ev.cafeId];
    if (tk.price <= 0) {
      tickets().push({ id: 't' + Date.now(), evId: ev.id, cafeId: ev.cafeId, title: ev.title, amt: 0, ref: 'CM-TK-' + rand(5), ts: Date.now(), status: 'paid' });
      S.save(); api.closeSheet(true); api.render(true); return api.toast('ลงทะเบียนแล้ว — ดูที่ตั๋วของฉัน');
    }
    const ref = (ticketOf(ev.id) || {}).ref || 'CM-TK-' + rand(5);
    api.openSheet('<h2 id="sheetTitle">ตั๋ว ' + esc(ev.title) + '</h2><p class="muted">' + esc(c.name) + '</p>' + ppQrHtml(tk.pp, tk.price, { demo: tk.demo }) +
      '<ul class="xp-lines"><li><span>ยอดโอน</span><b>' + money(tk.price) + '</b></li><li><span>รหัสอ้างอิง</span><b>' + esc(ref) + '</b></li></ul>' +
      '<ol class="pay-steps"><li>เปิดแอปธนาคาร สแกน QR (ยอดถูกใส่ให้แล้ว)</li><li>โอนแล้วเก็บสลิป แล้วกด “โอนแล้ว” ด้านล่าง</li><li>ร้านตรวจยอดแล้วตั๋วจะเปลี่ยนเป็น “ยืนยันแล้ว” — ถ้าไม่ผ่าน ส่งสลิปให้ร้านพร้อมรหัสอ้างอิง</li></ol>' +
      '<button class="btn primary lg" data-act="tk-paid" data-id="' + ev.id + '" data-ref="' + esc(ref) + '">โอนแล้ว</button><button class="btn text block" data-act="close-sheet">ยังไม่ตอนนี้</button>');
  }
  function ticketsView() {
    const list = tickets().slice().reverse();
    const card = (t) => {
      const ev = CM.studio.eventById(t.evId), paid = t.status === 'paid';
      return '<div class="card tk-stub ' + t.status + '"><div class="set-h"><b>' + esc(t.title) + '</b><span class="badge ' + (paid ? 'ok' : 'off') + '">' + (paid ? 'ยืนยันแล้ว' : 'รอร้านตรวจยอด') + '</span></div>' +
        '<p class="muted small">' + (ev ? esc(api.evWhen(ev)) + ' · ' : '') + money(t.amt) + ' · ' + esc(t.ref) + '</p>' +
        (paid ? '<div class="tk-qr">' + qrSvg('CMTK:' + t.ref, 'QR ตั๋ว ' + t.ref) + '<small class="muted">ยื่นให้ร้านสแกนตอนเข้างาน</small></div>'
          : '<button class="btn ghost sm" data-act="tk-demo-ok" data-id="' + t.id + '">(สาธิต) จำลองว่าร้านยืนยันแล้ว</button><button class="btn text sm" data-act="tk-del" data-id="' + t.id + '">ยกเลิก</button>') + '</div>';
    };
    return { nav: true, html: api.subHead('ticket', 'ตั๋วของฉัน') + '<section class="pad rise">' + (list.length ? list.map(card).join('') : '<div class="card empty"><p><b>ยังไม่มีตั๋ว</b></p><p class="muted small">เปิดอีเว้นท์ที่มีตั๋วแล้วกด “ซื้อตั๋วด้วย PromptPay”</p><a class="btn ghost sm" href="#/events">ดูอีเว้นท์</a></div>') + '</section>' };
  }

  /* ================= 3. LINE: login + notifications ================= */
  // The static site can show the flow and keep preferences, but cannot send. Pushing needs a server holding the
  // channel access token; LINE Login needs the ID token verified on a server. Fill CM.lineConfig (js/dev-config.js) to try real LIFF login.
  const LINE_TOPICS = [
    ['events', 'bell', 'อีเว้นท์ที่บันทึกไว้ใกล้เริ่ม', 'แจ้งก่อนเริ่ม 1 วัน'],
    ['air', 'air', 'ฝุ่นสูง / ฝนตก แนะนำร้านในร่ม', 'เมื่อ PM2.5 เกิน 37.5 หรือฝนมา'],
    ['fest', 'lantern', 'เทศกาล (ลอยกระทง · สงกรานต์ · ปีใหม่)', 'Collection ร้านและงานก่อนเทศกาล 1 สัปดาห์'],
    ['quiet', 'chart', 'ร้านโปรดกำลังเงียบ', 'อิงจากช่วงเวลาที่คนไปน้อย (ข้อมูล check-in)'],
    ['ticket', 'ticket', 'สถานะตั๋วและการชำระเงิน', 'ร้านยืนยันแล้ว / ใกล้วันงาน']
  ];
  const lcfg = () => Object.assign({ liffId: '', oaId: '' }, window.CM.lineConfig || {});
  const notif = () => Object.assign({ events: true, air: false, fest: false, quiet: false, ticket: true, digest: true }, S.get().lineNotify || {});
  const lineLink = () => S.get().lineLink || null;
  function loadLiff() {
    return new Promise((ok, no) => {
      if (window.liff) return ok(window.liff);
      const s = document.createElement('script'); s.src = 'https://static.line-scdn.net/liff/edge/2/sdk.js';
      s.onload = () => ok(window.liff); s.onerror = () => no(new Error('liff')); document.head.appendChild(s);
    });
  }
  function previews() {
    const n = notif(), out = [], st = S.get();
    if (n.events) { const e = (st.savedEvents || []).map((id) => CM.studio.eventById(id)).filter(Boolean)[0] || CM.studio.eventsAll()[0]; if (e) out.push(['อีเว้นท์', e.title + ' เริ่ม ' + api.evWhen(e) + ' ที่ ' + D.CAFE_BY_ID[e.cafeId].name]); }
    if (n.air) { const c = comfort(W.ctx); out.push(['หลบฝุ่น/ฝน', c ? c.title + ' — ' + c.body : 'ตอนนี้อากาศปกติ จะส่งเมื่อฝุ่นสูงหรือฝนตก']); }
    if (n.fest) { const fi = FEST.map((f) => festInfo(f.id)).filter((x) => x.o).sort((a, b) => a.days - b.days)[0]; if (fi) out.push(['เทศกาล', fi.f.th + ' ' + festWhen(fi) + ' — ดูร้านและอีเว้นท์']); }
    if (n.quiet) { const c = D.CAFES[0], p = popular(c); out.push(['ร้านเงียบ', c.name + ' เงียบประมาณ ' + hh(p.quiet.h) + ' — เหมาะนั่งยาว']); }
    if (n.ticket) out.push(['ตั๋ว', 'ร้านยืนยันตั๋วของคุณแล้ว — แสดง QR ตอนเข้างาน']);
    return out;
  }
  function lineView() {
    const lk = lineLink(), n = notif(), cfg = lcfg(), prev = previews();
    return { nav: true, html: api.subHead('message', 'LINE', '#/profile') + '<section class="pad stagger">' +
      '<div class="card line-card" data-new="3"><div class="set-h"><div><b>' + (lk ? 'เชื่อม LINE แล้ว' : 'ยังไม่ได้เชื่อม LINE') + '</b><small class="muted">' + (lk ? esc(lk.name) + ' · ' + (lk.mode === 'liff' ? 'LINE Login' : 'โหมดสาธิต') : 'รับแจ้งเตือนในแอปที่คุณใช้อยู่แล้ว') + '</small></div>' + I('message', 26) + '</div>' +
      (lk ? '<button class="btn ghost block" data-act="line-off">ยกเลิกการเชื่อม</button>' : '<button class="btn primary block" data-act="line-on">' + I('message', 18) + 'เข้าสู่ระบบด้วย LINE' + (cfg.liffId ? '' : ' (โหมดสาธิต)') + '</button>') +
      (cfg.liffId ? '' : '<p class="muted small">ยังไม่ได้ตั้ง LIFF ID ใน <code>js/dev-config.js</code> เลยจำลองการเชื่อมไว้ก่อน — ตั้งค่าแล้วปุ่มนี้จะเปิดหน้า LINE Login จริง</p>') + '</div>' +
      '<div class="card"><h2 class="sec-title first">' + I('bell', 20) + 'อยากให้แจ้งอะไร</h2>' + LINE_TOPICS.map((t) => '<div class="set-row"><div><b>' + t[2] + '</b><small>' + t[3] + '</small></div><button class="switch" role="switch" aria-checked="' + !!n[t[0]] + '" aria-label="' + esc(t[2]) + '" data-act="line-topic" data-k="' + t[0] + '"><i></i></button></div>').join('') +
      '<div class="set-row"><div><b>รวมเป็นข้อความเดียว ไม่เกินวันละ 1 ข้อความ</b><small>ไม่รบกวนคุณ และช่วยไม่ให้โควตาข้อความฟรีของ LINE OA หมดเร็ว</small></div><button class="switch" role="switch" aria-checked="' + !!n.digest + '" aria-label="รวมเป็นข้อความเดียว" data-act="line-topic" data-k="digest"><i></i></button></div></div>' +
      '<h2 class="grp-t">ตัวอย่างข้อความที่จะส่ง</h2>' + (prev.length ? prev.map((p) => '<div class="line-bubble"><small>' + esc(p[0]) + '</small><p>' + esc(p[1]) + '</p></div>').join('') : '<p class="muted small">เปิดหัวข้อด้านบนเพื่อดูตัวอย่าง</p>') +
      '<div class="card"><h2 class="sec-title first">' + I('info', 20) + 'ก่อนใช้งานจริง</h2><ul class="note-list"><li>ส่งข้อความหาผู้ใช้ต้องมี <b>backend</b> ถือ channel access token (Messaging API) — เว็บล้วนอย่างนี้ส่งเองไม่ได้</li>' +
      '<li>LINE Login ต้องให้ backend ตรวจ ID token ก่อนเชื่อว่าเป็นผู้ใช้คนนั้นจริง</li>' +
      '<li>โควตาข้อความฟรีและค่าบริการ LINE OA <b>เปลี่ยนตามประเทศ/แพ็กเกจ/ช่วงเวลา</b> และนับตามจำนวนผู้รับ — ตรวจหน้าราคาทางการของ LINE ประเทศไทยก่อนเปิดตัว</li></ul>' + (cfg.oaId ? '<a class="btn ghost block" href="https://line.me/R/ti/p/' + esc(cfg.oaId) + '" target="_blank" rel="noopener">เพิ่มเพื่อน ' + esc(cfg.oaId) + '</a>' : '') + '</div></section>' };
  }

  /* ================= guided tour: "what was added, and where" ================= */
  let hl = false;
  const TOUR = [
    [1, 'First-time pick', 'หน้าร้าน (บนสุด ถ้ายังไม่เคยไป) และหน้า Home สำหรับมือใหม่', 'baby', () => api.go('#/cafe/kuri-matcha-lab')],
    [2, 'คนไปกี่โมงบ่อย', 'หน้าร้าน → การ์ด “คนไปกี่โมงบ่อย” (ใช้ check-in) — กดจำลอง check-in เพื่อดูกราฟเปลี่ยน', 'chart', () => api.go('#/cafe/third-floor-roasters')],
    [3, 'LINE Login & แจ้งเตือน', 'Profile → แจ้งเตือนผ่าน LINE (และใน “ข้อมูลส่วนตัว”)', 'message', () => api.go('#/line')],
    [4, 'PromptPay QR', 'อีเว้นท์ที่มีตั๋ว → ซื้อตั๋ว · แพ็กเกจ (ต้องตั้งพร้อมเพย์ที่หลังบ้าน)', 'qr', () => api.go('#/event/se1')],
    [5, 'สถานีรถไฟฟ้า + ทางออก + เวลาเดิน', 'หน้าร้าน → “การเดินทาง & ที่จอด” · ตัวกรอง “ใกล้รถไฟฟ้า”', 'train', () => api.go('#/cafe/ratri-slow-bar')],
    [6, 'ที่จอดมอไซค์ / รถยนต์ เป็นแท็กหลัก', 'การ์ดร้านทุกใบ · ตัวกรอง · เจ้าของร้านเปิด/ปิดที่ Studio → Café → Facilities', 'moto', () => api.go('#/search')],
    [7, 'โหมดฝน / ร้อน / PM2.5', 'Home (การ์ดโหมด) · แตะชิปอากาศ → “ฝุ่น PM2.5” จำลองวันฝุ่น', 'air', () => { S.patch({ weatherOverride: 'haze' }); W.refresh().then(() => api.go('#/home')); }],
    [8, 'เทศกาล (ลอยกระทง/สงกรานต์/ปีใหม่)', 'Home (แถบเทศกาล) · Discover → เทศกาล', 'lantern', () => api.go('#/fest')],
    [9, 'ร้านท้องถิ่น (เหนือ/ใต้) + ตลาดนัดคาเฟ่', 'Discover → ร้านท้องถิ่น · ตัวกรอง “ร้านท้องถิ่น”', 'pin', () => api.go('#/lens/local')],
    [10, 'ภาษาท้องถิ่น/คำแสลงในช่อง Mood', 'Home → “หรือเล่าให้ฟังเป็นประโยค” (เติมตัวอย่างให้แล้ว)', 'sparkles', () => { api.say('แอ่วชิว ๆ นั่งยาว ฟีลบ้านสวน'); api.go('#/home'); }]
  ];
  function tourView() {
    const real = crowd().filter((r) => !r.sim).length, sim = crowd().length - real;
    return { nav: true, html: api.subHead('sparkles', 'ฟีเจอร์ใหม่ v23', '#/profile') + '<section class="pad stagger">' +
      '<div class="card tour-head"><b>กดเล่นได้ทุกข้อ</b><p class="muted">เปิด “ไฮไลต์ของใหม่” แล้วเลขสีส้มจะโผล่ตรงตำแหน่งที่เพิ่มในแอปจริง ทุกหน้าที่คุณเปิดต่อจากนี้</p>' +
      '<div class="set-row"><div><b>ไฮไลต์ของใหม่</b><small>กรอบประ + เลขข้อ บนของที่เพิ่ม</small></div><button class="switch" role="switch" aria-checked="' + hl + '" aria-label="ไฮไลต์ของใหม่" data-act="tour-hl"><i></i></button></div></div>' +
      TOUR.map((t) => '<div class="card tour-item"><span class="new-n">' + t[0] + '</span><div><b>' + t[1] + '</b><small class="muted">' + esc(t[2]) + '</small></div><button class="btn ghost sm" data-act="tour-run" data-i="' + (t[0] - 1) + '">ลองเลย</button></div>').join('') +
      '<div class="card"><h2 class="sec-title first">' + I('chart', 20) + 'ทดลองข้อมูล check-in</h2><p class="muted small">ตอนนี้มี check-in จริง ' + real + ' ครั้ง · จำลอง ' + sim + ' ครั้ง ในเครื่องนี้</p><div class="row2"><button class="btn ghost" data-act="crowd-sim">จำลอง 40 ครั้ง/ร้าน</button><button class="btn text" data-act="crowd-clear">ล้างข้อมูลจำลอง</button></div></div>' +
      '<div class="card"><h2 class="sec-title first">' + I('info', 20) + 'ส่วนที่ยังเป็นตัวอย่าง (พูดตรง ๆ)</h2><ul class="note-list"><li>กราฟ “คนไปกี่โมงบ่อย” ใช้ค่าประมาณจนกว่าจะมี check-in พอ — ตอนนี้ check-in เก็บในเครื่องนี้เท่านั้น จนกว่าจะมี backend</li>' +
      '<li>สถานีรถไฟฟ้า/เวลาเดินคำนวณจากพิกัดร้านสมมติ ทางออกเป็นค่าตัวอย่าง — ร้านจริงระบุเองที่ Studio</li><li>QR PromptPay สร้างถูกรูปแบบจริง แต่ตั๋วตัวอย่างใช้เลขพร้อมเพย์ปลอมที่โอนไม่ได้</li>' +
      '<li>LINE ส่งข้อความจริงไม่ได้จนกว่าจะมี backend · ค่า PM2.5 มาจากแบบจำลอง Open-Meteo ไม่ใช่สถานีตรวจวัด</li></ul></div></section>' };
  }
  function afterRender() {
    document.body.classList.toggle('cm-hl', hl);
    let pill = document.getElementById('hlPill');
    if (hl && !pill) { pill = document.createElement('a'); pill.id = 'hlPill'; pill.className = 'hl-pill'; pill.href = '#/new'; pill.textContent = 'ไฮไลต์ของใหม่ · ดูรายการ'; document.body.appendChild(pill); }
    if (!hl && pill) pill.remove();
  }

  /* ================= install ================= */
  function install(a) {
    api = a;
    const H = api.H, toast = api.toast;
    H['tour-hl'] = () => { hl = !hl; api.render(true); };
    H['tour-run'] = (el) => { hl = true; TOUR[+el.dataset.i][4](); };
    H['crowd-sim'] = () => { simulateCrowd(40); toast('เพิ่ม check-in จำลองแล้ว — เปิดหน้าร้านดูกราฟ'); api.render(true); };
    H['crowd-clear'] = () => { clearSim(); toast('ล้างข้อมูลจำลองแล้ว'); api.render(true); };
    H['tk-buy'] = (el) => { const ev = CM.studio.eventById(el.dataset.id); if (ev && ev.ticket) sheetTicket(ev); };
    H['tk-paid'] = (el) => {
      const ev = CM.studio.eventById(el.dataset.id);
      if (!ev || !ev.ticket || ticketOf(ev.id)) return api.closeSheet();
      tickets().push({ id: 't' + Date.now(), evId: ev.id, cafeId: ev.cafeId, title: ev.title, amt: ev.ticket.price, ref: el.dataset.ref, ts: Date.now(), status: 'pending' });
      S.save(); api.closeSheet(true); api.go('#/tickets'); toast('บันทึกแล้ว — รอร้านตรวจยอดโอน');
    };
    H['tk-demo-ok'] = (el) => { const t = tickets().find((x) => x.id === el.dataset.id); if (t) { t.status = 'paid'; S.save(); api.render(true); toast('ร้านยืนยันแล้ว (จำลอง)'); } };
    H['tk-del'] = (el) => { S.get().tickets = tickets().filter((x) => x.id !== el.dataset.id); S.save(); api.render(true); };
    H['line-topic'] = (el) => { const n = notif(); n[el.dataset.k] = !n[el.dataset.k]; S.patch({ lineNotify: n }); api.render(true); };
    H['line-off'] = () => { S.patch({ lineLink: null }); api.render(true); toast('ยกเลิกการเชื่อม LINE แล้ว'); };
    H['line-on'] = async () => {
      const cfg = lcfg();
      if (!cfg.liffId) { S.patch({ lineLink: { name: S.get().name || 'ผู้ใช้สาธิต', mode: 'demo', at: Date.now() } }); api.render(true); return toast('เชื่อม LINE แล้ว (โหมดสาธิต)'); }
      try {
        const liff = await loadLiff(); await liff.init({ liffId: cfg.liffId });
        if (!liff.isLoggedIn()) { liff.login({ redirectUri: location.href }); return; }
        const p = await liff.getProfile();
        S.patch({ lineLink: { name: p.displayName, mode: 'liff', at: Date.now() } }); api.render(true); toast('เชื่อม LINE แล้ว');
      } catch (e) { toast('เปิด LINE Login ไม่สำเร็จ — เช็ก LIFF ID และ Endpoint URL'); }
    };
  }
  const view = (n, arg) => (n === 'fest' ? festView(arg) : n === 'tickets' ? ticketsView() : n === 'line' ? lineView() : tourView());

  CM.thai = {
    install, view, afterRender,
    transitOf, transitLine, nearTransit, travelTags, tagsHtml, gettingThere, WALK_MAX, NEAR_MIN,
    popular, popularHtml, logCheckin, simulateCrowd, firstPick, firstPickHtml, homeFirstTime,
    comfort, comfortHtml, festBannerHtml, festInfo, festOffset, nextDow, festEvents, FEST,
    ppTarget, ppPayload, ppQrHtml, qrSvg, crc16, ticketCardHtml, ticketOf, FEST_NAMES: FEST.map((f) => f.th)
  };
})();
