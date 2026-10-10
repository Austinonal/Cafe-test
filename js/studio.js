/* Café Studio — the owner side of the platform (prototype).
   Same engine, same data: whatever an owner changes here is what customers see in the app.
   Principles baked in:
     • Owners can't buy rank. Owner signals (mood, status) add a small, capped nudge only when they
       actually match what the customer asked for.
     • Owner claims about the café's character (DNA) are clamped to ±2/10 of community/system data.
     • Facility facts show a confidence score built from 3 sources: Owner · Community · Review mentions. */
(function () {
  window.CM = window.CM || {};
  const D = CM.data, E = CM.engine, S = CM.store, A = CM.art, I = CM.icon;
  const clamp = E.clamp, hash = E.hash;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const day = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };   // local date (not UTC)
  const uniq = (a) => Array.from(new Set(a));
  let api = null;   // injected by app.js (sheet helpers, render, handlers)

  const OFFICIAL = new Set(['third-floor-roasters', 'kuri-matcha-lab', 'tiger-bean', 'cloud-nine']);
  const FACILITIES = [['wifi', 'Wi-Fi'], ['plug', 'ปลั๊กไฟ'], ['pet', 'Pet friendly'], ['parking', 'ที่จอดรถ'], ['outdoor', 'โซนกลางแจ้ง'], ['access', 'Accessibility (ทางลาด/ห้องน้ำ)']];
  const DNA_KEYS = ['nature', 'photo', 'coffee', 'quiet', 'work', 'cozy'];
  const STATUS = { quiet: 'Quiet', moderate: 'Moderate', busy: 'Busy' };
  const STATUS_TH = { quiet: 'เงียบ', moderate: 'ปานกลาง', busy: 'คนเยอะ' };
  const TYPE_COLORS = { coffee: ['#5B3A22', '#C79A68'], latte: ['#C79A68', '#F3E6D2'], matcha: ['#8DB255', '#3F6B26'], tea: ['#C9B26B', '#8E7A3A'], signature: ['#E8A0C0', '#9CCB8B'] };
  const TYPE_TH = { coffee: 'กาแฟ', latte: 'ลาเต้', matcha: 'มัทฉะ', tea: 'ชา', signature: 'ซิกเนเจอร์' };

  const SEED_MOMENTS = [
    { id: 'sm1', cafeId: 'dusk-society', title: 'Tonight at Dusk Society', body: 'Live acoustic · 18:00–20:00', tags: ['social', 'cozy'], weather: null },
    { id: 'sm2', cafeId: 'moss-and-mist', title: 'Rainy Day Special', body: 'Jasmine Rain Tea ร้อน ฿99 · วันนี้เท่านั้น', tags: ['cozy', 'relax'], weather: 'rain' },
    { id: 'sm3', cafeId: 'plant-parlour', title: 'Golden Hour in the Greenhouse', body: 'โต๊ะริมเรือนกระจก 16:00–17:30 แสงสวยที่สุดของวัน', tags: ['photo'], weather: 'sunny' },
    { id: 'sm4', cafeId: 'kuri-matcha-lab', title: 'Matcha Tasting Flight', body: 'ชิมมัทฉะ 3 เกรด ฿199', tags: ['coffee', 'relax'], weather: null }
  ];

  /* ---------- state ---------- */
  const blank = () => ({ mood: null, moodDay: '', status: null, seats: null, statusTs: 0, pick: null, pickDay: '', claims: {}, info: null, hours: null,
    priceOver: {}, off: {}, extraDrinks: [], spotOver: {}, extraSpots: [], quest: null, reward: null, moments: [], events: [], verified: false,
    stats: { views: 0, navs: 0, checkins: 0 }, updates: 0,
    shop: { name: '', tagline: '', banner: '', open: 'auto' }, owner: null, owned: 0, passport: null, codes: [], proof: '', drinkPhoto: {}, drinkTheme: {}, ledger: {} });
  const root = () => S.get().studio;
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const pubCache = {};   // café id → published shop record (js/content.js), completed with defaults
  const pub = (id) => { if (!pubCache[id]) { const p = CM.dev && CM.dev.shop(id); if (!p) return null; pubCache[id] = Object.assign(blank(), clone(p)); } return pubCache[id]; };
  // The café you manage on this device reads your own record; everyone else reads what was published.
  const peek = (id) => { const r = root().byCafe[id]; return r && r.managed ? r : pub(id) || r || null; };
  function rec(id) {
    const r = root(), b = blank();
    if (!r.byCafe[id]) r.byCafe[id] = b;
    const x = r.byCafe[id]; for (const k in b) if (!(k in x)) x[k] = b[k];   // records saved by older versions get new fields
    return x;
  }
  const isReal = (c) => !!(CM.dev && CM.dev.isReal(c.id));   // added by the developer = real data, never seeded with demo numbers
  const myCafe = () => D.CAFE_BY_ID[root().cafeId] || null;
  const isOfficial = (c) => OFFICIAL.has(c.id);
  const isVerified = (c) => { const r = peek(c.id); return !!(r && r.verified) || isOfficial(c) || (!isReal(c) && c.id !== root().cafeId && hash(c.id + 'ver') < .6); };
  const seededFor = (c) => !isReal(c) && c.id !== root().cafeId && isVerified(c);

  /* ---------- facilities with 3-source confidence ---------- */
  function defaultInfo(c) {
    return { wifi: hash(c.id + 'wifi') > .15, plug: c.attr.work >= 5 || hash(c.id + 'plug') > .6, pet: hash(c.id + 'pet') > .7,
      parking: hash(c.id + 'park') > .5, outdoor: c.base ? c.base.outdoor >= 5 : c.attr.outdoor >= 5, access: hash(c.id + 'acc') > .4 };
  }
  const infoOf = (c) => { const r = peek(c.id); return (r && r.info) || defaultInfo(c); };
  function facility(c, key) {
    const owner = !!infoOf(c)[key];
    const community = Math.round(hash(c.id + key + 'c') * 14);
    const mentions = Math.round(hash(c.id + key + 'm') * 60);
    const support = Math.min(community, 10) / 10 * .35 + Math.min(mentions, 50) / 50 * .25;
    return { owner, community, mentions, conf: owner ? Math.min(99, Math.round((.4 + support) * 100)) : null };
  }

  /* ---------- live data + effective café data ---------- */
  function liveFor(c, hour) {
    const r = peek(c.id), t = day(), out = {};
    if (r && r.mood && r.moodDay === t) out.mood = r.mood;
    else if (seededFor(c) && hash(c.id + t + 'm') > .45) out.mood = D.OWNER_MOODS[Math.floor(hash(c.id + t + 'mm') * D.OWNER_MOODS.length)][0];
    if (!E.openInfo(c, hour).open) return out;
    if (r && r.status && Date.now() - r.statusTs < 3 * 3600e3) { out.status = r.status; out.seats = r.seats; }
    else if (seededFor(c)) {
      const h = hash(c.id + t + Math.floor(hour));
      out.status = h < .4 ? 'quiet' : h < .75 ? 'moderate' : 'busy';
      out.seats = out.status === 'quiet' ? 8 + Math.floor(h * 12) : out.status === 'moderate' ? 3 + Math.floor(h * 6) : Math.floor(h * 3);
    }
    if (r && r.pick && r.pickDay === t) out.pick = r.pick;
    else if (seededFor(c) && hash(c.id + t + 'p') > .5) {
      const d = c.drinks[Math.floor(hash(c.id + t) * c.drinks.length)];
      out.pick = { drinkId: d.id, price: d.price - (hash(c.id + t + 'x') > .5 ? 10 : 0), note: 'เมนูที่ร้านอยากให้ลองวันนี้' };
    }
    return out;
  }

  // Rebuild every café's effective data from base data + owner edits. Safe to call repeatedly.
  function apply(hour) {
    D.CAFES.forEach((c) => {
      if (!c.base) { c.name0 = c.name; c.tagline0 = c.tagline; c.base = Object.assign({}, c.attr); c.banner0 = c.banner || ''; c.hours0 = c.hours.slice(); c.drinks0 = c.drinks.slice(); c.spots0 = c.spots.map((s) => Object.assign({}, s)); }
      const r = peek(c.id) || blank(), sh = Object.assign({}, SHOP0, r.shop);
      c.name = sh.name.trim() || c.name0; c.tagline = sh.tagline.trim() || c.tagline0; c.banner = sh.banner || c.banner0; c.pass = r.passport || null; c.logo = sh.logo || ''; c.logoT = sh.logoT || null; c.force = sh.open === 'open' || sh.open === 'closed' ? sh.open : '';
      D.DIMS.forEach((d) => { c.attr[d] = c.base[d]; });
      Object.keys(r.claims).forEach((d) => { c.attr[d] = Math.round(clamp(r.claims[d] / 10, c.base[d] - 2, c.base[d] + 2) * 1) ; c.attr[d] = clamp(c.attr[d], 0, 10); });
      c.hours = r.hours ? r.hours.slice() : c.hours0.slice();
      c.drinks = c.drinks0.filter((d) => !r.off[d.id]).map((d) => Object.assign({}, d, { price: r.priceOver[d.id] != null ? r.priceOver[d.id] : d.price }))
        .concat(r.extraDrinks.filter((d) => !r.off[d.id]));
      c.drinks = c.drinks.map((d) => { const ph = (r.drinkPhoto || {})[d.id], th = (r.drinkTheme || {})[d.id]; return ph || th ? Object.assign({}, d, { photo: ph || '', colors: th && DRINK_THEMES[th] ? DRINK_THEMES[th][1] : d.colors }) : d; });
      c.drinks.forEach((d) => { D.DRINK_BY_ID[d.id] = d; });
      c.spots = c.spots0.map((s) => Object.assign({}, s, { best: r.spotOver[s.id] || s.best, owner: !!r.spotOver[s.id] })).concat(r.extraSpots);
      c.spots.forEach((s) => { D.SPOT_BY_ID[s.id] = s; });
    });
    D.CAFES.forEach((c) => { c.live = liveFor(c, hour == null ? 12 : hour); });
  }
  const save = () => { S.save(); apply(CM.weather.ctx.hour); };

  /* ---------- quests / rewards / moments ---------- */
  function questFor(c) {
    const r = peek(c.id);
    if (r && r.quest) return r.quest.on && c.drinks.length ? { id: c.id + ':q', drinkId: r.quest.drinkId, spotId: r.quest.spotId, xp: r.quest.xp } : null;
    if (seededFor(c) && c.drinks.length && c.spots.length) return { id: c.id + ':q', drinkId: c.drinks[0].id, spotId: c.spots[0].id, xp: 50 };
    return null;
  }
  function rewardFor(c) {
    const r = peek(c.id);
    if (r && r.reward) return r.reward.on ? r.reward : null;
    if (seededFor(c)) return { need: 3, text: hash(c.id + 'rw') > .5 ? 'Free topping' : 'ลด ฿20' };
    return null;
  }
  /* ---------- Passport stamp: the owner designs the stamp and sets the conditions; no setup = basic (one check-in) ---------- */
  const PASS0 = { label: '', color: '', shape: 'circle', icon: '', visits: 1, drinkId: '', spotId: '' };
  const PASS_ICONS = ['coffee', 'leaf', 'camera', 'moon', 'heart', 'star', 'sparkles', 'gem'];
  const PASS_SHAPES = [['circle', 'วงกลม'], ['square', 'สี่เหลี่ยม'], ['hex', 'หกเหลี่ยม']];
  const passOf = (c) => Object.assign({}, PASS0, (peek(c.id) || {}).passport);
  // visits = this customer's visits to café c
  function passStatus(c, visits) {
    const d = passOf(c), drink = d.drinkId && c.drinks.find((x) => x.id === d.drinkId), spot = d.spotId && c.spots.find((x) => x.id === d.spotId);
    const parts = [{ t: d.visits > 1 ? 'Check-in ครบ ' + d.visits + ' ครั้ง (' + Math.min(visits.length, d.visits) + '/' + d.visits + ')' : 'Check-in ที่ร้าน', done: visits.length >= d.visits }];
    if (drink) parts.push({ t: 'ลองเมนู ' + drink.name, done: visits.some((v) => v.drinks.includes(drink.id)) });
    if (spot) parts.push({ t: 'ถ่ายรูปที่ ' + spot.name, done: visits.some((v) => v.spots.includes(spot.id)) });
    return { parts, met: parts.every((p) => p.done), custom: !!(peek(c.id) && peek(c.id).passport) };
  }
  const passEarned = (c, visits) => !!S.get().stamps[c.id] || passStatus(c, visits).met;
  function passAward(c, visits) {   // call right after a check-in; true = stamp earned just now
    if (S.get().stamps[c.id] || !passStatus(c, visits).met) return false;
    S.get().stamps[c.id] = Date.now(); S.save(); return true;
  }
  function passportCard(c, visits) {
    const st = passStatus(c, visits);
    if (!st.custom) return '';
    const got = passEarned(c, visits);
    return '<div class="card pass-card"><span class="pass-art">' + A.stamp(c, { locked: !got }) + '</span><div><small class="kicker">' + I('stamp', 14) + ' Passport ของร้าน</small><ul class="pp-conds">' +
      st.parts.map((p) => '<li class="' + (p.done || got ? 'done' : '') + '">' + I(p.done || got ? 'check' : 'target', 15) + esc(p.t) + '</li>').join('') + '</ul>' +
      '<p class="small">' + (got ? 'ได้ stamp นี้แล้ว — ดูที่หน้า Passport' : 'ทำครบแล้ว Check-in เพื่อเก็บ stamp') + '</p></div></div>';
  }
  function momentsFor(ses) {
    const all = SEED_MOMENTS.filter((m) => m.cafeId !== root().cafeId && D.CAFE_BY_ID[m.cafeId]).concat(
      D.CAFES.reduce((a, c) => { const r = peek(c.id); return r ? a.concat(r.moments.map((m) => Object.assign({ cafeId: c.id }, m))) : a; }, []));
    const ms = ses.mood ? ses.mood.moods : [];
    const top = all.map((m) => {
      let s = m.tags.filter((t) => ms.includes(t)).length * 2;
      if (m.weather && m.weather === ses.ctx.kind) s += 2;
      if (ses.profile) s += E.persScore(D.CAFE_BY_ID[m.cafeId], ses.profile);
      return { m, s: s + hash(m.id) * .1 };
    }).filter((o) => o.s >= (ms.length ? 1 : .6)).sort((a, b) => b.s - a.s).slice(0, 2).map((o) => o.m);
    // At most ONE clearly-labelled sponsored slot, and only if it genuinely matches the customer's mood/weather. Never affects ranking.
    const spon = D.CAFES.map((c) => ({ c, r: peek(c.id) })).filter((x) => x.r && x.r.boost > Date.now() && planNow() !== 'free')
      .map((x) => x.r.moments.map((m) => Object.assign({ cafeId: x.c.id, sponsored: true }, m))).reduce((a, b) => a.concat(b), [])
      .filter((m) => m.tags.some((t) => ms.includes(t)) || (m.weather && m.weather === ses.ctx.kind))[0];
    return spon && !top.some((m) => m.cafeId === spon.cafeId) ? top.concat([spon]) : top;
  }
  const trackKey = (id, k) => { rec(id).stats[k]++; S.save(); };

  /* ---------- Events ---------- */
  const EVENT_TYPES = [['live', 'Live music', 'ดนตรีสด'], ['workshop', 'Workshop', 'เวิร์กช็อป'], ['tasting', 'Tasting', 'ชิม/เทสติ้ง'], ['popup', 'Pop-up', 'Pop-up'], ['seasonal', 'Seasonal', 'ตามฤดูกาล'], ['other', 'Other', 'อื่น ๆ']];
  const typeLabel = (k) => { const t = EVENT_TYPES.find((x) => x[0] === k) || EVENT_TYPES[5]; return t[1]; };
  const localDay = (off) => { const d = new Date(); d.setDate(d.getDate() + (off || 0)); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const toMin = (t) => { const p = (t || '00:00').split(':'); return +p[0] * 60 + +p[1]; };

  function eventStatus(ev) {
    const t = localDay(0), n = new Date(), m = n.getHours() * 60 + n.getMinutes();
    if (ev.endDate < t || (ev.endDate === t && m > toMin(ev.endTime))) return 'ended';
    if (ev.startDate > t) return 'upcoming';
    if (m >= toMin(ev.startTime) && m <= toMin(ev.endTime)) return 'live';
    if (m < toMin(ev.startTime)) return 'today';
    return 'upcoming';   // today's session is over but the event continues on later days
  }

  const SEED_CODES = { se1: { code: 'ACOUSTIC', codeGives: 'ลด ฿20 เมนูในงาน' }, se2: { code: 'MATCHA2', codeGives: 'ฟรีขนมญี่ปุ่น 1 ชิ้น เมื่อสั่ง Tasting Flight' } };   // demo event codes
  // Demo events so the customer side has content before any real owner posts. Dates are relative to today.
  function seededEvents() {
    const mk = (id, cafeId, title, type, s, e, st, et, tags, desc, items, sets, gives) => ({ id, cafeId, title, type, startDate: localDay(s), endDate: localDay(e), startTime: st, endTime: et, tags, desc, items, sets, gives, seeded: true });
    return [
      mk('se1', 'dusk-society', 'Acoustic Night', 'live', 0, 0, '18:00', '20:00', ['social', 'cozy'], 'ดนตรีอะคูสติกสดบนชั้นลอย นั่งฟังเพลินกับเครื่องดื่มประจำคืนนี้',
        [{ name: 'Smoked Maple Latte (ราคาอีเว้นท์)', price: 129 }, { name: 'Espresso Martini 0%', price: 149 }], [{ name: 'Date Night Set', price: 299, includes: 'เครื่องดื่ม 2 แก้ว + ของหวาน 1 ชิ้น' }],
        [{ name: 'ตั๋วฟรีงานหน้า', rule: 'ลูกค้า 10 คนแรกที่ Check-in', qty: 10 }]),
      mk('se2', 'kuri-matcha-lab', 'Matcha Tasting Weekend', 'tasting', 2, 3, '11:00', '17:00', ['coffee', 'relax', 'photo'], 'ชิมมัทฉะหลายเกรดแบบจับคู่ขนมญี่ปุ่น พร้อมมุมถ่ายรูปพิเศษ',
        [{ name: 'Ceremonial Usucha', price: 140 }], [{ name: 'Tasting Flight', price: 199, includes: 'มัทฉะ 3 เกรด + ขนมญี่ปุ่น 1 ชิ้น' }],
        [{ name: 'ถ้วยชาเซรามิก', rule: 'สุ่มแจกวันละ 5 ท่าน เมื่อโพสต์รูปติดแท็กร้าน', qty: 10 }]),
      mk('se3', 'plant-parlour', 'Garden Workshop: Terrarium', 'workshop', 5, 5, '14:00', '16:00', ['creative', 'photo', 'social'], 'ทำเทอเรียมของตัวเองในเรือนกระจก มีวิทยากรแนะนำตลอดเวลา',
        [{ name: 'Fig Fizz', price: 120 }], [{ name: 'Workshop Set', price: 650, includes: 'อุปกรณ์ทำเทอเรียม + เครื่องดื่ม 1 แก้ว' }],
        [{ name: 'ต้นไม้จิ๋ว', rule: 'ผู้เข้าร่วมทุกคน', qty: 20 }]),
      mk('se4', 'moss-and-mist', 'Rainy Season Special', 'seasonal', 0, 7, '09:00', '18:00', ['cozy', 'relax'], 'ตลอดหน้าฝน เมนูชาร้อนราคาพิเศษสำหรับคนที่มาฟังเสียงฝนบนหลังคากระจก',
        [{ name: 'Jasmine Rain Tea', price: 99 }, { name: 'Pandan Latte', price: 109 }], [], [])
    ].map((e) => Object.assign(e, SEED_CODES[e.id])).filter((e) => e.cafeId !== root().cafeId && D.CAFE_BY_ID[e.cafeId]);   // demo events vanish with their sample café
  }
  function eventsAll() {
    const own = D.CAFES.reduce((a, c) => { const r = peek(c.id); return r && r.events ? a.concat(r.events.map((e) => Object.assign({ cafeId: c.id }, e))) : a; }, []);
    return seededEvents().concat(own);
  }
  const eventById = (id) => eventsAll().find((e) => e.id === id) || null;
  const eventByCode = (code) => eventsAll().find((e) => e.code && e.code.toUpperCase() === code) || null;
  // Any code a customer can collect: from an event, or a standalone code the owner made ("โค้ดของร้าน")
  function lookupCode(code) {
    const ev = eventByCode(code);
    if (ev) return { cafeId: ev.cafeId, title: ev.title, gives: ev.codeGives, until: ev.endDate };
    for (const c of D.CAFES) {
      const x = ((peek(c.id) || {}).codes || []).find((y) => y.code === code);
      if (x) return { cafeId: c.id, title: 'โค้ดจากร้าน ' + c.name, gives: x.gives, until: x.until || '' };
    }
    return null;
  }
  const codeTaken = (code, exceptEvent) => !!(D.PROMOS[code] || eventsAll().some((x) => x.id !== exceptEvent && x.code && x.code.toUpperCase() === code) || lookupCode(code));
  const isSaved = (id) => (S.get().savedEvents || []).includes(id);
  function eventsRelevant(ses, limit) {
    const ms = ses.mood ? ses.mood.moods : [];
    return eventsAll().filter((e) => eventStatus(e) !== 'ended').map((e) => {
      const st = eventStatus(e);
      let s = (st === 'live' ? 3 : st === 'today' ? 2 : 0) + e.tags.filter((t) => ms.includes(t)).length * 2;
      if (ses.profile) s += E.persScore(D.CAFE_BY_ID[e.cafeId], ses.profile);
      return { e, s: s + hash(e.id) * .1 };
    }).sort((a, b) => b.s - a.s).slice(0, limit).map((o) => o.e);
  }
  function trackEvent(id) {
    for (const c of D.CAFES) { const r = peek(c.id); const ev = r && r.events && r.events.find((x) => x.id === id); if (ev) { ev.views = (ev.views || 0) + 1; S.save(); return; } }
  }

  /* ---------- Café level ---------- */
  function checks(c) {
    const r = rec(c.id), t = day();
    return [
      ['ยืนยัน Facilities ของร้าน', !!r.info],
      ['มีเมนูอย่างน้อย 3 รายการ', c.drinks.length >= 3],
      ['มี Photo Spot อย่างน้อย 2 จุด', c.spots.length >= 2],
      ['ตั้ง Owner Mood วันนี้', r.moodDay === t && !!r.mood],
      ['อัปเดตสถานะร้านวันนี้', !!r.status && Date.now() - r.statusTs < 6 * 3600e3],
      ['เลือก Owner’s Pick วันนี้', r.pickDay === t && !!r.pick],
      ['เปิด Café Quest', !!(r.quest && r.quest.on)],
      ['มี Reward ใน Passport', !!(r.reward && r.reward.on)]
    ];
  }
  const TIERS = [[82, 'Café Master'], [65, 'Community Favorite'], [45, 'Popular'], [25, 'Active'], [0, 'Verified']];
  function level(c) {
    const r = rec(c.id), ck = checks(c), done = ck.filter((x) => x[1]).length;
    const data = done / ck.length;
    const fresh = [ck[3][1], ck[4][1], ck[5][1]].filter(Boolean).length / 3;
    const sat = clamp((c.rating - 4) / 1), eng = ((r.quest && r.quest.on) ? .5 : 0) + ((r.reward && r.reward.on) ? .3 : 0) + (r.moments.length ? .2 : 0);
    const score = Math.round(100 * (.3 * data + .2 * fresh + .2 * sat + .15 * c.repeat + .15 * eng));
    const tier = isVerified(c) ? TIERS.find((t) => score >= t[0])[1] : 'Unverified';
    const idx = TIERS.findIndex((t) => t[1] === tier);
    return { score, lv: Math.min(clamp(Math.ceil(score / 100 * 12), 1, 12), isVerified(c) ? 12 : 3), tier, next: idx > 0 ? TIERS[idx - 1] : null, checks: ck, done, data };
  }

  /* ---------- analytics (demo numbers + real counters from this session) ---------- */
  function analytics(c) {
    const r = rec(c.id), a = c.attr;
    const views = Math.round(900 + hash(c.id + 'v') * 9000 + c.reviews * 2) + r.stats.views;
    const profile = Math.round(views * (.22 + hash(c.id + 'p') * .1));
    const navs = Math.round(profile * (.3 + hash(c.id + 'n') * .15)) + r.stats.navs;
    const checkins = Math.round(navs * (.25 + hash(c.id + 'k') * .12)) + r.stats.checkins;
    const raw = [['photo', 'Photo', 'camera', a.photo], ['coffee', 'Coffee', 'coffee', a.coffee], ['relax', 'Relax', 'wind', (a.quiet + a.cozy) / 2], ['work', 'Work', 'target', a.work], ['social', 'Social', 'users', a.social]]
      .map((x) => [x[0], x[1], x[2], Math.pow(x[3] + 1, 1.6)]).sort((x, y) => y[3] - x[3]).slice(0, 4);
    const tot = raw.reduce((s, x) => s + x[3], 0);
    let moods = raw.map((x) => ({ id: x[0], label: x[1], icon: x[2], pct: Math.round(x[3] / tot * 100) }));
    moods[0].pct += 100 - moods.reduce((s, m) => s + m.pct, 0);
    const peak = a.dark >= 7 ? [19, 22] : a.photo >= 8 ? [14, 17] : (a.coffee >= 8 || a.work >= 8) ? [9, 12] : [13, 16];
    const hours = []; for (let h = 8; h <= 21; h++) hours.push({ h, v: Math.round(100 * Math.exp(-Math.pow(h - (peak[0] + peak[1]) / 2, 2) / 8) * (.85 + hash(c.id + h) * .3)) });
    const trend = 8 + Math.round(hash(c.id + 'tr') * 26);
    return { views, profile, navs, checkins, moods, peak, hours, trend };
  }

  /* ---------- customer-facing fragments ---------- */
  const badgesHtml = (c) => (isOfficial(c) ? '<span class="badge official">' + I('award', 13) + 'Official</span>' : '') + (isVerified(c) ? '<span class="badge ver">' + I('badge-check', 13) + 'Verified</span>' : '');
  function liveChip(c) {
    const l = c.live;
    if (!l || !l.status) return '';
    return '<span class="live live-' + l.status + '"><i aria-hidden="true"></i>' + STATUS_TH[l.status] + ' · ว่าง ' + l.seats + '</span>';
  }
  function liveBanner(c) {
    const l = c.live || {};
    if (!l.status && !l.mood) return '';
    const mood = l.mood ? D.OWNER_MOODS.find((m) => m[0] === l.mood) : null;
    return '<div class="card live-card">' + (l.status ? liveChip(c) + (l.status === 'quiet' ? '<p class="good">' + I('check', 16) + 'Good time to visit</p>' : l.status === 'busy' ? '<p class="muted small">ตอนนี้คนเยอะ ลองมาอีกครั้งช่วงบ่ายแก่ ๆ</p>' : '') : '') +
      (mood ? '<p class="small">ร้านบอกว่าวันนี้บรรยากาศ <b>' + mood[1] + '</b></p>' : '') +
      '<p class="muted small">' + I('badge-check', 13) + 'อัปเดตโดยร้าน' + (isVerified(c) ? ' (Verified)' : '') + '</p></div>';
  }
  function pickCard(c) {
    const p = c.live && c.live.pick, d = p && D.DRINK_BY_ID[p.drinkId];
    if (!d) return '';
    return '<div class="card pick-card"><span class="mr-art">' + A.drinkArt(d) + '</span><div><small class="kicker">Owner’s Pick วันนี้</small><b>' + esc(d.name) + '</b> <span class="price">฿' + p.price + '</span><p class="muted small">“' + esc(p.note || 'เมนูที่ร้านอยากให้ลองวันนี้') + '”</p></div></div>';
  }
  function questCard(c, doneBefore) {
    const q = questFor(c);
    if (!q) return '';
    const d = D.DRINK_BY_ID[q.drinkId], s = D.SPOT_BY_ID[q.spotId];
    const steps = [d ? 'ลองเมนู ' + d.name : null, s ? 'ถ่ายรูปมุม ' + s.name : null, 'Check-in'].filter(Boolean).map((t) => '<li>' + I('target', 15) + esc(t) + '</li>').join('');
    return '<div class="card quest-card"><small class="kicker">' + I('bolt', 14) + ' Today’s Quest</small><ul>' + steps + '</ul>' +
      '<p class="reward">' + (doneBefore ? I('check', 16) + 'ทำ Quest นี้สำเร็จแล้ว' : '→ Passport Stamp + <b>+' + q.xp + ' XP</b>') + '</p></div>';
  }
  function rewardCard(c, visits) {
    const r = rewardFor(c);
    if (!r) return '';
    const n = Math.min(visits, r.need);
    const dots = Array.from({ length: r.need }, (_, i) => '<span class="dot' + (i < n ? ' on' : '') + '">' + (i < n ? I('check', 14) : '') + '</span>').join('');
    return '<div class="card reward-card"><small class="kicker">' + I('stamp', 14) + ' Stamp Card ของร้าน</small><div class="dots" role="img" aria-label="สะสมแล้ว ' + n + ' จาก ' + r.need + ' ครั้ง">' + dots + '</div>' +
      '<p>' + (visits >= r.need ? I('check', 16) + '<b>ปลดล็อกแล้ว:</b> ' : 'ครบ ' + r.need + ' ครั้ง รับ ') + '<b>' + esc(r.text) + '</b></p></div>';
  }
  function facilitiesHtml(c) {
    const rows = FACILITIES.map((f) => {
      const x = facility(c, f[0]);
      return '<li><span>' + f[1] + '</span>' + (x.owner
        ? '<span class="conf ' + (x.conf >= 75 ? 'hi' : 'lo') + '">' + I('check', 14) + x.conf + '%' + (x.conf < 75 ? ' · รอชุมชนยืนยัน' : '') + '</span>'
        : '<span class="conf none">ไม่มี</span>') + (x.owner ? '<small>ร้านบอก ✓ · ผู้ใช้ยืนยัน ' + x.community + ' · รีวิวพูดถึง ' + x.mentions + ' ครั้ง</small>' : '') + '</li>';
    }).join('');
    return '<ul class="fac card">' + rows + '</ul><p class="muted small">ความมั่นใจ = ข้อมูลจากร้าน + ผู้ใช้ + การวิเคราะห์รีวิว ไม่ได้มาจากร้านฝ่ายเดียว</p>';
  }
  function dnaHtml(c) {
    const r = peek(c.id) || blank();
    return '<div class="card meters">' + DNA_KEYS.map((d) => {
      const v = c.attr[d];
      return '<div class="meter"><span class="ml">' + D.DIM_TH[d] + '</span><span class="bar" aria-hidden="true"><i style="width:' + v * 10 + '%"></i></span><span class="mv">' + v + '/10</span></div>';
    }).join('') + '</div><p class="muted small">รวมจากข้อมูลร้าน ชุมชน และระบบ — ร้านปรับได้ไม่เกิน ±2 จากข้อมูลจริง' + (Object.keys(r.claims).length ? ' · ร้านนี้ปรับค่าเอง' : '') + '</p>';
  }

  /* ---------- Studio (owner) views ---------- */
  const TABS = [['', 'Today', 'home'], ['cafe', 'Café', 'coffee'], ['events', 'Events', 'star'], ['promote', 'Promote', 'bolt'], ['insights', 'Insights', 'eye']];
  const tabbar = (sub) => TABS.map((t) => '<a class="tab" href="#/studio' + (t[0] ? '/' + t[0] : '') + '"' + ((sub || '') === t[0] ? ' aria-current="page"' : '') + '>' + I(t[2], 24) + '<span>' + t[1] + '</span></a>').join('');
  // A trial that has run out drops back to Starter automatically — no card, no charge, data kept.
  const RANK = { free: 0, pro: 1, group: 2 };
  const grantNow = () => { const g = root().grant; return g && (!g.until || g.until > Date.now()) ? g : null; };
  function planNow() {
    const r = root(), now = Date.now();
    if (r.plan && r.plan !== 'free' && !r.paid && r.trialEnd && r.trialEnd < now) { r.plan = 'free'; r.trialEnd = 0; S.save(); }
    if (r.paid && r.paidUntil && r.paidUntil < now) { r.plan = 'free'; r.paid = false; r.paidUntil = 0; S.save(); }   // the paid period ran out
    return r.use === 'free' ? 'free' : heldPlan();   // the owner may choose Starter while keeping a plan from the developer
  }
  // The best plan the owner holds right now: bought / trial, a free code, or a product that includes a Studio plan
  function heldPlan() {
    const r = root(), g = grantNow(), ep = CM.ent && CM.ent.studioPlan();
    let best = r.plan || 'free';
    if (g && RANK[g.plan] > RANK[best]) best = g.plan;
    if (ep && RANK[ep] > RANK[best]) best = ep;
    return best;
  }
  // Where a plan comes from when the developer gave it: { forever, until, days, name, warn } or null
  function devSource(k) {
    const g = grantNow(), found = [];
    if (g && g.plan === k) found.push({ until: g.until, name: g.n || '' });
    ((CM.ent && CM.ent.studioSources()) || []).forEach((x) => { if (x.plan === k) found.push({ until: x.until, name: x.name }); });
    if (!found.length) return null;
    const best = found.reduce((a, b) => (!a.until ? a : !b.until || b.until > a.until ? b : a));
    const days = best.until ? Math.max(0, Math.ceil((best.until - Date.now()) / DAYMS)) : 0;
    return { forever: !best.until, until: best.until, days, name: best.name, warn: !!best.until && days <= 7 };
  }
  const srcText = (s) => (s.forever ? 'ใช้ได้ถาวร' : 'เหลือ ' + s.days + ' วัน (ถึง ' + dateTh(s.until) + ')');
  const isPro = () => planNow() !== 'free';
  const lockCard = (what) => '<div class="card lock-card">' + I('lock', 22) + '<div><b>' + what + ' อยู่ในแพ็กเกจ Pro</b><p class="muted small">ทดลองฟรี ' + OTRIAL + ' วัน ไม่ต้องผูกบัตร</p></div><a class="btn primary sm" href="#/studio/plan">ดูแพ็กเกจ</a></div>';
  /* ---------- shop / owner / ledger data (all per café, stored in the studio record) ---------- */
  const SHOP0 = { name: '', tagline: '', banner: '', open: 'auto', logo: '', logoT: null };
  const DRINK_THEMES = [['ตามประเภทเมนู', null], ['ช็อกโกแลต', ['#4A2A1A', '#B98A5B']], ['มัทฉะ', ['#8DB255', '#3F6B26']], ['ชาไทย', ['#E07B2F', '#F4D6A8']], ['เบอร์รี่', ['#C2385B', '#F2A0B8']], ['คาราเมล', ['#C98B4B', '#F3E6D2']], ['ฟ้าใส', ['#4F8BC9', '#CFE5F7']]];
  const LOGO_TPLS = [['stripe', 'ลายทาง'], ['dots', 'จุด'], ['wave', 'คลื่น'], ['bean', 'เมล็ดกาแฟ'], ['grid', 'ตาราง'], ['sun', 'แสงตะวัน']];
  const shopOf = (id) => Object.assign({}, SHOP0, (peek(id) || {}).shop);
  const sRec = (id) => { const r = rec(id); r.shop = shopOf(id); return r.shop; };
  const ownerOf = (id) => Object.assign({ name: '', role: 'เจ้าของร้าน', phone: '', email: '', line: '', bio: '', photo: '' }, (peek(id) || {}).owner);
  const ledOf = (id, d) => { const l = (peek(id) || {}).ledger; return (l && l[d]) || { customers: 0, entries: [] }; };
  const ledW = (id, d) => { const r = rec(id); r.ledger = r.ledger || {}; return r.ledger[d] || (r.ledger[d] = { customers: 0, entries: [] }); };
  const sums = (l) => { let i = 0, o = 0; l.entries.forEach((e) => { if (e.t === 'in') i += e.amt; else o += e.amt; }); return { inc: i, out: o, profit: i - o }; };
  const baht = (n) => (n < 0 ? '−' : '') + '฿' + Math.abs(Math.round(n * 100) / 100).toLocaleString('en-US');
  const WD = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
  const wd = (d) => WD[new Date(d + 'T00:00:00').getDay()];
  const dayTh = (d) => new Date(d + 'T00:00:00').toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long' });
  const openNow = (c) => E.openInfo(c, CM.weather.ctx.hour);
  let ledDay = '', ledType = 'in';
  const openF = new Set(['menu']);   // which <details> folds stay open across re-renders

  const openPill = (c) => { const o = openNow(c); return '<a class="st-pill ' + (o.open ? 'on' : 'off') + '" href="#/studio/shop"><i aria-hidden="true"></i>' + (o.open ? 'เปิดอยู่' : 'ปิดอยู่') + (c.force ? ' · ตั้งเอง' : '') + '</a>'; };
  const stHead = (c, title, sub) => {
    const lv = level(c);
    return '<header class="hero-top ambient st-head"><div class="topbar between"><span class="brand">' + I('coffee', 20) + 'Café Studio</span><a class="wchip" href="#/home">' + I('user', 18) + 'โหมดลูกค้า</a></div>' +
      '<div class="st-id"><span class="st-av">' + (A.logoArt(c) || A.coverArt(c)) + '</span><div class="st-idt"><b>' + esc(c.name) + '</b><span class="st-meta">' + openPill(c) + '<a class="st-lv" href="#/studio/plan">Lv.' + lv.lv + ' · ' + planLabel() + '</a></span></div></div>' +
      '<h1 class="display sm">' + esc(title) + '</h1>' + (sub ? '<p class="lead sm">' + sub + '</p>' : '') + '</header>';
  };
  const fold = (k, ic, title, meta, body) => '<details class="card fold pf st" data-fold="' + k + '"' + (openF.has(k) ? ' open' : '') + '><summary>' + I(ic, 20) + '<b>' + title + '</b>' + (meta ? '<small>' + meta + '</small>' : '') + I('chevron-down', 18) + '</summary><div class="fold-b">' + body + '</div></details>';
  const lrow = (ic, t, small, href) => '<a class="mrow" href="' + href + '"><span class="mi">' + I(ic, 20) + '</span><span class="mt"><b>' + t + '</b><small>' + small + '</small></span>' + I('chevron-right', 18) + '</a>';
  const INS = [['insights', 'ภาพรวม', 'eye'], ['ledger', 'ลูกค้า & เงิน', 'wallet'], ['shop', 'โปรไฟล์ร้าน', 'building'], ['owner', 'เจ้าของร้าน', 'user']];
  const insNav = (k) => '<nav class="ins-nav" aria-label="เมนูย่อยของ Insights">' + INS.map((x) => '<a class="ins-pill' + (x[0] === k ? ' on' : '') + '" href="#/studio/' + x[0] + '"' + (x[0] === k ? ' aria-current="page"' : '') + '>' + I(x[2], 16) + x[1] + '</a>').join('') + '</nav>';
  const sw = (on, act, k, label) => '<button class="switch" role="switch" aria-checked="' + on + '" aria-label="' + esc(label) + '" data-act="' + act + '" data-k="' + k + '"><i></i></button>';

  function chooseCafe() {
    const list = D.CAFES.map((c) => '<button class="mini-row" data-act="st-login" data-id="' + c.id + '"><span class="mr-art thumbbox">' + A.coverArt(c) + '</span><span><b>' + esc(c.name) + '</b><small>' + esc(c.area) + '</small></span>' + I('chevron-right', 18) + '</button>').join('');
    return { nav: false, html: '<header class="hero-top ambient"><div class="topbar between"><span class="brand">' + I('coffee', 20) + 'Café Studio</span><a class="wchip" href="#/home">กลับโหมดลูกค้า</a></div>' +
      '<h1 class="display sm">สำหรับเจ้าของร้าน</h1><p class="lead sm">จัดการร้าน อัปเดตสถานะ สร้าง Quest และดู Insight — สิ่งที่ตั้งไว้ที่นี่ลูกค้าเห็นในแอปทันที</p></header>' +
      '<section class="pad stagger"><div class="card fair">' + I('lock', 18) + '<p><b>เข้าร้านด้วยรหัสเจ้าของร้าน</b> — ทีมงานออกรหัสให้หลังตรวจสอบว่าคุณเป็นเจ้าของร้านจริง เลือกร้านของคุณแล้วใส่รหัส · <a href="#/contact">ยังไม่มีรหัส? ติดต่อทีมงาน</a>' + (CM.dev.isDev() ? '<br><small class="muted">โหมดผู้พัฒนา: แตะร้านเพื่อเข้าได้เลยโดยไม่ต้องใช้รหัส</small>' : '') + '</p></div><div class="list">' + list + '</div></section>' };
  }

  function tToday(c) {
    const r = rec(c.id), t = day(), l = c.live || {}, led = ledOf(c.id, t), sm = sums(led);
    const status = r.status && Date.now() - r.statusTs < 3 * 3600e3 ? r.status : null;
    const seats = status ? r.seats : null;
    const sb = ['quiet', 'moderate', 'busy'].map((k) => '<button class="stbtn st-' + k + (status === k ? ' on' : '') + '" data-act="st-status" data-k="' + k + '" aria-pressed="' + (status === k) + '"><i aria-hidden="true"></i>' + STATUS[k] + '<small>' + STATUS_TH[k] + '</small></button>').join('');
    const moodOn = r.moodDay === t && r.mood ? D.OWNER_MOODS.find((m) => m[0] === r.mood) : null;
    const moods = D.OWNER_MOODS.map((m) => '<button class="fchip' + (r.mood === m[0] && r.moodDay === t ? ' on' : '') + '" data-act="st-mood" data-k="' + m[0] + '" aria-pressed="' + (r.mood === m[0] && r.moodDay === t) + '">' + m[1] + '</button>').join('');
    const pk = r.pickDay === t ? r.pick : null, pkD = pk && D.DRINK_BY_ID[pk.drinkId];
    const drinks = c.drinks.map((d) => '<label class="radio-card"><input type="radio" name="pickDrink" value="' + d.id + '"' + (pk && pk.drinkId === d.id ? ' checked' : '') + '><span><b>' + esc(d.name) + '</b><small>฿' + d.price + ' · ' + TYPE_TH[d.type] + '</small></span></label>').join('');
    const kpi = (ic, k, v, cls) => '<a class="kpi" href="#/studio/ledger"><span class="kpi-k">' + I(ic, 16) + k + '</span><b class="' + (cls || '') + '">' + v + '</b></a>';
    return stHead(c, 'วันนี้ที่ร้าน') + '<section class="pad stagger">' + billNote() + devNote() +
      '<div class="kpis">' + kpi('users', 'ลูกค้า', led.customers) + kpi('wallet', 'รายรับ', baht(sm.inc)) + kpi('trend', 'กำไร', baht(sm.profit), sm.profit < 0 ? 'neg' : '') + '</div>' +
      '<div class="qa"><button class="btn primary" data-act="st-cust" data-d="1">' + I('plus', 18) + 'ลูกค้า 1 คน</button><button class="btn ghost" data-act="st-inc-sheet">' + I('wallet', 18) + 'บันทึกรายรับ</button></div>' +
      '<div class="card"><div class="st-row"><h2 class="st-h">' + I('users', 18) + 'สถานะร้านตอนนี้</h2>' + (l.status ? liveChip(c) : '<small class="muted">ยังไม่ได้ตั้ง</small>') + '</div><div class="stbtns" role="group" aria-label="สถานะร้าน">' + sb + '</div>' +
      '<div class="stepper"><span>ที่นั่งว่าง</span><button class="iconbtn" data-act="st-seats" data-d="-1" aria-label="ลดที่นั่งว่าง">−</button><b aria-live="polite">' + (seats == null ? '–' : seats) + '</b><button class="iconbtn" data-act="st-seats" data-d="1" aria-label="เพิ่มที่นั่งว่าง">+</button></div></div>' +
      fold('mood', 'sparkles', 'Owner Mood', moodOn ? moodOn[1] : 'ยังไม่ได้เลือก', '<p class="muted small">ถ้าตรงกับ Mood และอากาศของลูกค้า ระบบจะดันร้านให้เล็กน้อย (ไม่ใช่การซื้ออันดับ)</p><div class="fchips" role="group" aria-label="Owner mood">' + moods + '</div>') +
      fold('pick', 'cup', 'Owner’s Pick', pkD ? esc(pkD.name) : 'ยังไม่ได้ตั้ง', '<div class="radios">' + drinks + '</div>' +
        '<div class="field two"><label for="pickPrice">ราคาวันนี้ (฿)</label><input id="pickPrice" type="number" min="0" max="999" inputmode="numeric" value="' + (pk ? pk.price : '') + '" placeholder="เช่น 145"></div>' +
        '<div class="field two"><label for="pickNote">ข้อความจากร้าน</label><input id="pickNote" type="text" maxlength="60" value="' + esc(pk ? pk.note : '') + '" placeholder="เมนูที่เจ้าของร้านอยากให้ลองวันนี้"></div>' +
        '<div class="row2"><button class="btn primary" data-act="st-pick-save">บันทึก</button>' + (pk ? '<button class="btn ghost" data-act="st-pick-clear">ยกเลิก</button>' : '') + '</div>') +
      '<div class="card menu">' + lrow('eye', 'ดูหน้าร้านแบบที่ลูกค้าเห็น', 'ตรวจว่าสิ่งที่ตั้งไว้แสดงถูกต้อง', '#/cafe/' + c.id) + lrow('building', 'โปรไฟล์ร้าน', 'ชื่อ แบนเนอร์ เปิด/ปิดร้าน', '#/studio/shop') + '</div></section>';
  }

  // photo + colour theme for one menu item (owner-chosen)
  const menuMedia = (d, r) => {
    const sid = d.id.replace(/[:]/g, '-'), has = !!(r.drinkPhoto || {})[d.id];
    return '<div class="menu-media"><label class="btn ghost sm file-btn" for="dph-' + sid + '">' + I('camera', 14) + (has ? 'เปลี่ยนรูป' : 'ใส่รูป') + '<input id="dph-' + sid + '" class="sr" type="file" accept="image/png,image/jpeg,image/webp" data-dph="' + d.id + '"></label>' +
      (has ? '<button class="btn ghost sm" data-act="st-dph-clear" data-id="' + d.id + '">ลบรูป</button>' : '') +
      '<select class="dth" data-dth="' + d.id + '" aria-label="ธีมสีเมนู ' + esc(d.name) + '">' + DRINK_THEMES.map((t, i) => '<option value="' + i + '"' + (((r.drinkTheme || {})[d.id] || 0) === i ? ' selected' : '') + '>' + t[0] + '</option>').join('') + '</select></div>';
  };
  function tCafe(c) {
    const r = rec(c.id), info = infoOf(c), lv = level(c);
    const nFac = FACILITIES.filter((f) => info[f[0]]).length;
    const fac = FACILITIES.map((f) => { const x = facility(c, f[0]); return '<div class="set-row"><div><b>' + f[1] + '</b><small>' + (info[f[0]] ? 'ความมั่นใจ ' + x.conf + '% (ร้าน + ผู้ใช้ + รีวิว)' : 'ไม่มี') + '</small></div>' + sw(!!info[f[0]], 'st-fac', f[0], f[1]) + '</div>'; }).join('');
    const menu = c.drinks0.concat(r.extraDrinks).map((d) => '<div class="menu-row' + (r.off[d.id] ? ' off' : '') + '"><div><b>' + esc(d.name) + '</b><small>' + TYPE_TH[d.type] + (r.off[d.id] ? ' · ซ่อน/หมด' : '') + '</small>' + menuMedia(d, r) + '</div>' +
      '<label class="sr" for="pr-' + d.id.replace(/[:]/g, '-') + '">ราคา ' + esc(d.name) + '</label><input class="pr" id="pr-' + d.id.replace(/[:]/g, '-') + '" type="number" min="0" max="999" data-st="price" data-id="' + d.id + '" value="' + (r.priceOver[d.id] != null ? r.priceOver[d.id] : d.price) + '">' +
      '<button class="btn ghost sm" data-act="st-drink-off" data-id="' + d.id + '">' + (r.off[d.id] ? 'แสดง' : 'หมด') + '</button></div>').join('');
    const spots = c.spots.map((s) => '<div class="menu-row"><div><b>' + esc(s.name) + '</b><small>' + (s.owner ? 'ร้านระบุเวลา' : 'ข้อมูลระบบ') + '</small></div><label class="sr" for="sp-' + s.id.replace(/[:]/g, '-') + '">เวลาที่แสงดี ' + esc(s.name) + '</label><input class="tm" id="sp-' + s.id.replace(/[:]/g, '-') + '" type="text" data-st="spot" data-id="' + s.id + '" value="' + esc(s.best) + '" placeholder="15:00–17:00"></div>').join('');
    const dna = isPro() ? DNA_KEYS.map((d) => {
      const base = c.base[d] * 10, claim = r.claims[d] != null ? r.claims[d] : Math.round(base), fin = c.attr[d] * 10;
      return '<div class="dna"><label for="dna-' + d + '"><b>' + D.DIM_TH[d] + '</b><span>ร้านบอก ' + claim + '</span></label><input id="dna-' + d + '" type="range" min="0" max="100" step="5" data-st="dna" data-k="' + d + '" value="' + claim + '"><small>ชุมชน/ระบบ ' + Math.round(base) + ' → แสดงผล <b>' + fin + '</b>' + (Math.abs(claim - base) > 20 ? ' (ระบบปรับให้อยู่ใน ±20)' : '') + '</small></div>';
    }).join('') + '<p class="muted small">ปรับได้ไม่เกิน ±20 จากข้อมูลจริง ระบบรวมกับข้อมูลชุมชนและรีวิว</p>' : lockCard('Advanced Café DNA');
    const ver = isVerified(c)
      ? '<p class="good">' + I('check', 16) + 'ร้านของคุณได้รับ Verified แล้ว</p>'
      : '<div class="progress" role="progressbar" aria-label="ข้อมูลครบ" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round(lv.data * 100) + '"><span style="width:' + Math.round(lv.data * 100) + '%"></span></div><p class="muted small">ข้อมูลครบ ' + Math.round(lv.data * 100) + '% ' + (lv.data >= .5 ? '— พร้อมยืนยัน' : '— ต้องครบอย่างน้อย 50%') + '</p><button class="btn primary" data-act="st-verify"' + (lv.data >= .5 ? '' : ' disabled') + '>ยืนยันข้อมูลร้าน</button>';
    return stHead(c, 'จัดการร้าน') + '<section class="pad stagger">' +
      '<div class="card menu">' + lrow('building', 'โปรไฟล์ร้าน', 'ชื่อ แบนเนอร์ สถานะเปิด/ปิด', '#/studio/shop') + '</div>' +
      '<div class="card"><h2 class="st-h">' + I('badge-check', 18) + 'Verified</h2>' + ver + '</div>' +
      fold('menu', 'cup', 'เมนู & ราคา', c.drinks.length + ' รายการ', menu + '<button class="btn ghost block" data-act="st-drink-add">+ เพิ่มเมนู</button>') +
      fold('hours', 'clock', 'เวลาเปิด–ปิด', fmtH(c.hours[0]) + '–' + fmtH(c.hours[1]), '<div class="hours"><div class="field"><label for="hOpen">เปิด (ชม.)</label><input id="hOpen" type="number" min="0" max="23.5" step="0.5" value="' + c.hours[0] + '"></div><div class="field"><label for="hClose">ปิด (ชม.)</label><input id="hClose" type="number" min="1" max="28" step="0.5" value="' + c.hours[1] + '"></div></div><p class="muted small">ปิดหลังเที่ยงคืน ใส่ 25 = 01:00</p><button class="btn ghost sm" data-act="st-hours-save">บันทึกเวลา</button>') +
      fold('fac', 'info', 'Facilities', nFac + '/' + FACILITIES.length, fac) +
      fold('spots', 'camera', 'Photo Spots', c.spots.length + ' จุด', spots + '<button class="btn ghost block" data-act="st-spot-add">+ เพิ่มจุดถ่ายรูป</button>') +
      fold('dna', 'sparkles', 'Café DNA', isPro() ? '' : 'Pro', dna) + '</section>';
  }
  const fmtH = (h) => E.fmtHour(h);

  function codesEditor(c) {
    const r = rec(c.id);
    const rows = r.codes.map((x) => '<li><div><b>' + esc(x.code) + '</b><small>' + esc(x.gives) + ' · ' + (x.until ? 'ถึง ' + dateTh(x.until + 'T00:00:00') : 'ไม่มีวันหมดอายุ') + '</small></div><button class="btn ghost sm" data-act="cd-del" data-id="' + x.id + '" aria-label="ลบโค้ด ' + esc(x.code) + '">ลบ</button></li>').join('');
    return '<div class="card"><h2 class="sec-title first">' + I('sparkles', 20) + 'โค้ดของร้าน</h2>' +
      '<p class="muted small">ออกโค้ดแจกลูกค้าและบอกว่าโค้ดนี้ได้อะไร เช่น ลดราคา ของแถม ลูกค้าใส่ที่ Profile → โค้ดของฉัน แล้วโค้ดจะถูกเก็บไว้ให้โชว์ที่ร้าน</p><ul class="moments">' + rows + '</ul>' +
      '<div class="field"><label for="cdCode">โค้ด (A–Z ตัวเลข - ยาว 4–16)</label><input id="cdCode" type="text" maxlength="16" autocapitalize="characters" autocomplete="off" placeholder="เช่น HELLO-CAFE"></div>' +
      '<div class="field"><label for="cdGives">โค้ดนี้ได้อะไร</label><input id="cdGives" type="text" maxlength="60" placeholder="เช่น ลด ฿20 ทุกเมนู"></div>' +
      '<div class="field"><label for="cdUntil">ใช้ได้ถึงวันที่ (ไม่บังคับ)</label><input id="cdUntil" type="date" min="' + day() + '"></div>' +
      '<button class="btn primary"' + (r.codes.length >= 10 ? ' disabled' : '') + ' data-act="cd-add">+ เพิ่มโค้ด</button></div>';
  }
  let pp = null, ppId = null;   // draft of the stamp being designed
  const ppStamp = (c) => A.stamp(Object.assign({}, c, { pass: { label: pp.label, color: pp.color, shape: pp.shape, icon: pp.icon } }));
  function passEditor(c) {
    if (!pp || ppId !== c.id) { pp = passOf(c); ppId = c.id; }
    const opt = (list, sel, none) => '<option value="">' + none + '</option>' + list.map((x) => '<option value="' + x.id + '"' + (x.id === sel ? ' selected' : '') + '>' + esc(x.name) + '</option>').join('');
    const seg = (act, list, cur, lab) => list.map((o) => '<button class="fchip' + (cur === o[0] ? ' on' : '') + '" data-act="' + act + '" data-k="' + o[0] + '" aria-pressed="' + (cur === o[0]) + '">' + o[1] + '</button>').join('');
    return '<div class="card"><h2 class="sec-title first">' + I('stamp', 20) + 'Passport Stamp ของร้าน</h2>' +
      '<div class="pp-prev" id="ppPrev">' + ppStamp(c) + '</div>' +
      '<p class="muted small">ออกแบบ stamp ที่ลูกค้าจะได้ในหน้า Passport — ถ้าไม่ตั้งอะไร ใช้แบบมาตรฐาน (Check-in 1 ครั้งก็ได้ stamp เหมือนร้านอื่น)</p>' +
      '<div class="field"><label for="ppLabel">ข้อความบน stamp (ไม่เกิน 8 ตัว)</label><input id="ppLabel" data-pp="label" type="text" maxlength="8" value="' + esc(pp.label) + '" placeholder="เว้นว่าง = ตัวย่อชื่อร้าน"></div>' +
      '<div class="field"><label for="ppColor">สี</label><input id="ppColor" data-pp="color" type="color" value="' + esc(pp.color || c.palette[0]) + '"></div>' +
      '<p class="sh-h">รูปร่าง</p><div class="fchips" role="group" aria-label="รูปร่าง stamp">' + seg('pp-shape', PASS_SHAPES, pp.shape) + '</div>' +
      '<p class="sh-h">ไอคอน</p><div class="fchips" role="group" aria-label="ไอคอน stamp">' + seg('pp-icon', [['', 'ไม่มี']].concat(PASS_ICONS.map((k) => [k, I(k, 18)])), pp.icon) + '</div>' +
      '<p class="sh-h">เงื่อนไขที่ลูกค้าต้องทำ</p>' +
      '<div class="field"><label for="ppVisits">Check-in กี่ครั้ง</label><select id="ppVisits" data-pp="visits">' + [1, 2, 3, 4, 5, 6, 8, 10].map((n) => '<option' + (n === pp.visits ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></div>' +
      '<div class="field"><label for="ppDrink">ต้องลองเมนู</label><select id="ppDrink" data-pp="drinkId">' + opt(c.drinks, pp.drinkId, 'ไม่ระบุ') + '</select></div>' +
      '<div class="field"><label for="ppSpot">ต้องถ่ายรูปที่จุด</label><select id="ppSpot" data-pp="spotId">' + opt(c.spots, pp.spotId, 'ไม่ระบุ') + '</select></div>' +
      '<p class="muted small">เงื่อนไขนับรวมทุกครั้งที่ลูกค้ามา — ไม่ต้องทำให้ครบในวันเดียว</p>' +
      '<div class="row2"><button class="btn primary" data-act="pp-save">บันทึก Passport</button><button class="btn ghost" data-act="pp-reset">ใช้แบบมาตรฐาน</button></div></div>';
  }

  function tPromote(c) {
    const r = rec(c.id);
    if (!isPro()) return stHead(c, 'Promote') + '<section class="pad stagger">' + passEditor(c) + codesEditor(c) + lockCard('Café Quest, Passport Reward และ Café Moment') + '</section>';
    const q = r.quest || { on: false, drinkId: c.drinks[0] && c.drinks[0].id, spotId: c.spots[0] && c.spots[0].id, xp: 50 };
    const opt = (list, sel, none) => (none ? '<option value="">' + none + '</option>' : '') + list.map((x) => '<option value="' + x.id + '"' + (x.id === sel ? ' selected' : '') + '>' + esc(x.name) + '</option>').join('');
    const rw = r.reward || { on: false, need: 3, text: 'ลด ฿20' };
    const moments = r.moments.map((m) => '<li><div><b>' + esc(m.title) + '</b><small>' + esc(m.body) + '</small></div><button class="btn ghost sm" data-act="st-moment-del" data-id="' + m.id + '" aria-label="ลบ ' + esc(m.title) + '">ลบ</button></li>').join('');
    return stHead(c, 'Promote', 'สร้างเหตุผลให้คนมาร้านคุณ — แบบไม่รก') + '<section class="pad stagger">' + passEditor(c) + codesEditor(c) +
      '<div class="card"><div class="set-row"><h2 class="sec-title first">' + I('bolt', 20) + 'Café Quest</h2>' + sw(q.on, 'st-quest-toggle', 'q', 'เปิด Quest') + '</div>' +
      '<div class="field"><label for="qDrink">ลองเมนู</label><select id="qDrink">' + opt(c.drinks, q.drinkId, 'ไม่ระบุ') + '</select></div>' +
      '<div class="field"><label for="qSpot">ถ่ายรูปที่จุด</label><select id="qSpot">' + opt(c.spots, q.spotId, 'ไม่ระบุ') + '</select></div>' +
      '<div class="field"><label for="qXp">รางวัล XP</label><input id="qXp" type="number" min="10" max="200" step="10" value="' + q.xp + '"></div>' +
      '<p class="muted small">ลูกค้า: ลองเมนู + ถ่ายรูป + Check-in → Passport Stamp + XP</p><button class="btn primary" data-act="st-quest-save">บันทึก Quest</button></div>' +
      '<div class="card"><div class="set-row"><h2 class="sec-title first">' + I('stamp', 20) + 'Passport Reward</h2>' + sw(rw.on, 'st-reward-toggle', 'r', 'เปิด Reward') + '</div>' +
      '<div class="field"><label for="rNeed">มาครบกี่ครั้ง</label><select id="rNeed">' + [2, 3, 4, 5, 6, 8, 10].map((n) => '<option' + (n === rw.need ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></div>' +
      '<div class="field"><label for="rText">ของรางวัล (ร้านกำหนดเอง)</label><input id="rText" type="text" maxlength="40" value="' + esc(rw.text) + '"></div><button class="btn primary" data-act="st-reward-save">บันทึก Reward</button></div>' +
      '<div class="card"><h2 class="sec-title first">' + I('sparkles', 20) + 'Café Moment</h2><p class="muted small">ระบบส่งให้เฉพาะคนที่ Mood/อากาศ/นิสัยคาเฟ่ตรงกัน ไม่ขึ้นเป็นโฆษณา</p><ul class="moments">' + moments + '</ul><button class="btn ghost block"' + (r.moments.length >= 5 ? ' disabled' : '') + ' data-act="st-moment-new">+ สร้าง Café Moment</button></div></section>';
  }

  function tInsights(c) {
    const a = analytics(c), lv = level(c);
    const stats = [['eye', 'Views', a.views], ['user', 'Profile Visits', a.profile], ['navigation', 'Navigation', a.navs], ['stamp', 'Check-ins', a.checkins]].map((s) => '<div class="stat">' + I(s[0], 18) + '<b>' + s[2].toLocaleString('en-US') + '</b><span>' + s[1] + '</span></div>').join('');
    const moods = a.moods.map((m) => '<li><span class="mlab">' + I(m.icon, 16) + m.label + '</span><span class="bar" aria-hidden="true"><i style="width:' + m.pct + '%"></i></span><b>' + m.pct + '%</b></li>').join('');
    const hrs = a.hours.map((h) => '<span class="hb" style="height:' + Math.max(6, h.v) + '%" title="' + h.h + ':00"></span>').join('');
    const top = a.moods[0];
    const insight = isPro()
      ? '<div class="card insight"><small class="kicker">' + I('sparkles', 14) + ' Today’s Insight</small><p>คนค้นหาร้านคุณ<b>เพิ่มขึ้น ' + a.trend + '%</b> จากสัปดาห์ก่อน</p><p>กลุ่มที่สนใจมากที่สุดคือ <b>' + top.label + ' Seekers</b> (' + top.pct + '%) ช่วงเวลาที่คนสนใจมากที่สุด <b>' + a.peak[0] + ':00–' + a.peak[1] + ':00</b></p><p class="rec"><b>แนะนำ:</b> ' + (top.id === 'photo' ? 'ตั้ง Photo Spot Promotion และ Café Moment ช่วงบ่าย' : top.id === 'coffee' ? 'ตั้ง Owner’s Pick เป็นกาแฟล็อตพิเศษช่วงเช้า' : top.id === 'work' ? 'อัปเดตสถานะที่นั่งว่างและปลั๊กไฟให้สม่ำเสมอ' : 'ตั้ง Owner Mood เป็น Calm/Cozy ในช่วงที่คนสนใจ') + '</p></div>'
      : lockCard('AI Insights และ Customer Trends');
    const lvl = '<div class="lv-h"><b>Café Level ' + lv.lv + ' / 12</b><span>' + lv.tier + '</span></div><div class="progress" role="progressbar" aria-label="คะแนนร้าน" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + lv.score + '"><span style="width:' + lv.score + '%"></span></div>' +
      '<p class="muted small">' + (lv.next ? 'อีก ' + (lv.next[0] - lv.score) + ' คะแนนถึง ' + lv.next[1] : 'ระดับสูงสุดแล้ว') + ' · วัดจากความถูกต้องของข้อมูล การอัปเดต ความพึงพอใจ ลูกค้ากลับมาซ้ำ และการร่วม Quest — ไม่ได้ดูแค่ Rating</p>' +
      '<ul class="checks">' + lv.checks.map((x) => '<li class="' + (x[1] ? 'done' : '') + '">' + I(x[1] ? 'check' : 'plus', 16) + esc(x[0]) + '</li>').join('') + '</ul>';
    return stHead(c, 'Insights') + '<section class="pad stagger">' + insNav('insights') +
      '<div class="stat-grid">' + stats + '</div><p class="muted small">ตัวเลขเป็นข้อมูลตัวอย่างเพื่อสาธิต (ยอดดู/นำทาง/Check-in ที่เกิดจริงในเดโมนี้ถูกนับรวมให้)</p>' +
      '<div class="card"><h2 class="st-h">Top Customer Mood</h2><ul class="mood-bars">' + moods + '</ul></div>' +
      '<div class="card"><h2 class="st-h">ช่วงเวลาที่คนสนใจ</h2><div class="hourbars" role="img" aria-label="ช่วงเวลาที่คนสนใจมากที่สุด ' + a.peak[0] + ' ถึง ' + a.peak[1] + ' นาฬิกา">' + hrs + '</div><div class="hlabels"><span>08:00</span><span>14:00</span><span>21:00</span></div></div>' +
      insight + fold('lv', 'trophy', 'Café Reputation', 'Lv.' + lv.lv, lvl) + '</section>';
  }

  /* ----- Shop profile (name, banner, open/closed) ----- */
  let lg = null, lgId = null;   // draft of the logo pattern being designed
  function logoEditor(c) {
    const sh = shopOf(c.id);
    if (!lg || lgId !== c.id) { lg = Object.assign({ tpl: 'stripe', c1: c.palette[0], c2: c.palette[1], text: String(c.name0 || c.name || '').replace(/[^A-Za-z฀-๿]/g, '').slice(0, 2).toUpperCase() }, sh.logoT || {}); lgId = c.id; }
    const now = A.logoArt(c);
    return '<div class="card"><h2 class="st-h">' + I('camera', 18) + 'โลโก้ร้าน</h2>' +
      '<div class="logo-row"><div><small class="muted">ใช้อยู่ตอนนี้</small><span class="logo-now" id="logoNow">' + (now || '<span class="logo-ph">' + I('coffee', 22) + '</span>') + '</span></div><div><small class="muted">ตัวอย่างแพตเทิร์น</small><span class="logo-now" id="logoPrev">' + A.logoFromT(lg) + '</span></div></div>' +
      '<div class="row2"><label class="btn ghost file-btn" for="shopLogo">' + I('plus', 18) + 'อัปโหลดโลโก้<input id="shopLogo" class="sr" type="file" accept="image/png,image/jpeg,image/webp"></label>' + (now ? '<button class="btn ghost" data-act="logo-clear">ลบโลโก้</button>' : '') + '</div>' +
      '<p class="muted small">ใช้ภาพสี่เหลี่ยมจัตุรัส (ระบบครอปและย่อให้) โลโก้ขึ้นที่หน้าร้านของลูกค้าและหัว Café Studio</p>' +
      '<p class="sh-h">หรือเลือกแพตเทิร์นสำเร็จรูปแล้วปรับเอง</p><div class="fchips" role="group" aria-label="แพตเทิร์นโลโก้">' + LOGO_TPLS.map((t) => '<button class="fchip' + (lg.tpl === t[0] ? ' on' : '') + '" data-act="logo-tpl" data-k="' + t[0] + '" aria-pressed="' + (lg.tpl === t[0]) + '">' + t[1] + '</button>').join('') + '</div>' +
      '<div class="field"><label for="lgText">ตัวอักษรบนโลโก้ (ไม่เกิน 3 ตัว)</label><input id="lgText" data-lg="text" type="text" maxlength="3" value="' + esc(lg.text) + '"></div>' +
      '<div class="hours"><div class="field"><label for="lgC1">สีพื้น</label><input id="lgC1" data-lg="c1" type="color" value="' + esc(lg.c1) + '"></div><div class="field"><label for="lgC2">สีลาย</label><input id="lgC2" data-lg="c2" type="color" value="' + esc(lg.c2) + '"></div></div>' +
      '<button class="btn primary" data-act="logo-save">ใช้แพตเทิร์นนี้เป็นโลโก้</button></div>';
  }
  function tShop(c) {
    const sh = shopOf(c.id), o = openNow(c);
    const opts = [['auto', 'ตามเวลา', 'clock'], ['open', 'เปิดอยู่', 'sun'], ['closed', 'ปิดชั่วคราว', 'moon']];
    return stHead(c, 'โปรไฟล์ร้าน') + '<section class="pad stagger">' + insNav('shop') +
      '<div class="card"><h2 class="st-h">' + I('camera', 18) + 'แบนเนอร์ร้าน</h2><div class="banner-prev">' + A.coverArt(c) + '</div>' +
      '<div class="row2"><label class="btn ghost file-btn" for="shopBanner">' + I('plus', 18) + (sh.banner ? 'เปลี่ยนรูป' : 'อัปโหลดแบนเนอร์') + '<input id="shopBanner" class="sr" type="file" accept="image/png,image/jpeg,image/webp"></label>' + (sh.banner ? '<button class="btn ghost" data-act="shop-banner-clear">ลบรูป</button>' : '') + '</div>' +
      '<p class="muted small">ใช้เป็นภาพปกร้านในรายการ หน้าร้าน และโปรไฟล์ — ภาพแนวนอน 16:9 (PNG/JPG/WebP ไม่เกิน 10MB) ระบบครอปและย่อให้อัตโนมัติ</p></div>' +
      logoEditor(c) +
      '<div class="card"><h2 class="st-h">' + I('building', 18) + 'ข้อมูลร้าน</h2>' +
      '<div class="field"><label for="shopName">ชื่อร้าน</label><input id="shopName" type="text" maxlength="40" value="' + esc(sh.name) + '" placeholder="' + esc(c.name0 || c.name) + '"></div>' +
      '<div class="field"><label for="shopTag">คำโปรย (สั้น ๆ)</label><input id="shopTag" type="text" maxlength="80" value="' + esc(sh.tagline) + '" placeholder="' + esc(c.tagline0 || c.tagline || '') + '"></div>' +
      '<p class="muted small">เว้นว่าง = ใช้ชื่อและคำโปรยเดิมของร้าน</p><button class="btn primary" data-act="st-shop-save">บันทึกโปรไฟล์ร้าน</button></div>' +
      '<div class="card"><h2 class="st-h">' + I('clock', 18) + 'สถานะเปิด–ปิด</h2><div class="seg three st-seg" role="group" aria-label="สถานะเปิดปิดร้าน">' +
      opts.map((x) => '<button data-act="st-open" data-k="' + x[0] + '" aria-pressed="' + (sh.open === x[0]) + '" class="' + (sh.open === x[0] ? 'on' : '') + '">' + I(x[2], 16) + x[1] + '</button>').join('') + '</div>' +
      '<p class="small st-now"><span class="badge ' + (o.open ? 'ok' : 'off') + '">' + I('clock', 13) + esc(o.text) + '</span> ลูกค้าเห็นแบบนี้ตอนนี้</p>' +
      '<p class="muted small">“ตามเวลา” ใช้เวลาเปิด–ปิดของร้าน (' + fmtH(c.hours[0]) + '–' + fmtH(c.hours[1]) + ') · “ปิดชั่วคราว” ใช้ตอนวันหยุดพิเศษหรือของหมด ลูกค้าจะไม่เห็นร้านเป็นเปิดอยู่</p><a class="btn text block" href="#/studio/cafe">แก้เวลาเปิด–ปิด</a></div>' +
      '<a class="btn ghost block" href="#/cafe/' + c.id + '">ดูหน้าร้านแบบที่ลูกค้าเห็น ' + I('chevron-right', 18) + '</a></section>';
  }

  // The part of a shop record customers may see (no ledger, stats, private owner info, or photos stored in the browser).
  const PUBK = ['shop', 'hours', 'priceOver', 'off', 'extraDrinks', 'spotOver', 'extraSpots', 'claims', 'info', 'quest', 'reward', 'moments', 'events', 'codes', 'passport', 'drinkPhoto', 'drinkTheme'];
  const smallImg = (d) => (/^data:/.test(d || '') && d.length > 40000 ? '' : d || '');   // logos and menu photos are tiny; banners are not
  function publicShop(id) {
    const r = rec(id), o = {}, blk = blank();
    PUBK.forEach((k) => { o[k] = clone(r[k] == null ? blk[k] : r[k]); });
    o.shop.banner = /^data:/.test(o.shop.banner || '') ? '' : o.shop.banner;
    o.shop.logo = smallImg(o.shop.logo);
    Object.keys(o.drinkPhoto).forEach((k) => { o.drinkPhoto[k] = smallImg(o.drinkPhoto[k]); if (!o.drinkPhoto[k]) delete o.drinkPhoto[k]; });
    o.events = o.events.map((e) => Object.assign(e, { banner: /^data:/.test(e.banner || '') ? '' : e.banner, views: 0, saves: 0 }));
    return o;
  }
  /* ----- Owner profile (private to the owner) ----- */
  function tOwner(c) {
    const ow = ownerOf(c.id), r0 = rec(c.id);
    const vb = r0.owned ? '<span class="badge ok">' + I('badge-check', 13) + 'ยืนยันความเป็นเจ้าของแล้ว</span>' : CM.dev.isDev() ? '<span class="badge">' + I('lock', 13) + 'เข้าในโหมดผู้พัฒนา</span>' : '';
    const photo = '<div class="own-photo"><span class="avatar big" id="owPhotoPrev">' + (ow.photo ? '<img src="' + esc(ow.photo) + '" alt="รูปเจ้าของร้าน">' : I('user', 34)) + '</span><div class="op-btns"><label class="btn ghost file-btn" for="ownerPhoto">' + I('camera', 18) + '<span id="owPhotoLbl">' + (ow.photo ? 'เปลี่ยนรูป' : 'เพิ่มรูปเจ้าของร้าน') + '</span><input id="ownerPhoto" class="sr" type="file" accept="image/png,image/jpeg,image/webp"></label><button class="btn ghost" id="owPhotoClr" data-act="owner-photo-clear"' + (ow.photo ? '' : ' hidden') + '>ลบรูป</button></div></div>';
    const f = (id, l, v, a) => '<div class="field"><label for="' + id + '">' + l + '</label><input id="' + id + '" value="' + esc(v) + '" ' + a + ' aria-describedby="owMsg"></div>';
    return stHead(c, 'โปรไฟล์เจ้าของร้าน') + '<section class="pad stagger">' + insNav('owner') +
      '<div class="card"><h2 class="st-h">' + I('user', 18) + 'ข้อมูลเจ้าของร้าน</h2>' + vb + photo +
      f('owName', 'ชื่อ', ow.name, 'type="text" maxlength="40" autocomplete="name" placeholder="ชื่อหรือชื่อเล่น"') +
      '<div class="field"><label for="owRole">บทบาท</label><select id="owRole">' + ['เจ้าของร้าน', 'ผู้จัดการร้าน', 'หัวหน้าบาริสต้า'].map((x) => '<option' + (ow.role === x ? ' selected' : '') + '>' + x + '</option>').join('') + '</select></div>' +
      f('owPhone', 'เบอร์โทร', ow.phone, 'type="tel" inputmode="tel" autocomplete="tel" maxlength="16" placeholder="08x-xxx-xxxx"') +
      f('owEmail', 'อีเมล', ow.email, 'type="email" inputmode="email" autocomplete="email" maxlength="60" placeholder="owner@example.com"') +
      f('owLine', 'LINE ID', ow.line, 'type="text" autocapitalize="none" autocomplete="off" maxlength="21" placeholder="@yourid"') +
      '<div class="field"><label for="owBio">แนะนำตัวสั้น ๆ</label><textarea id="owBio" rows="3" maxlength="200" placeholder="เช่น คั่วกาแฟเองมา 8 ปี">' + esc(ow.bio) + '</textarea></div>' +
      '<p id="owMsg" class="muted small" role="status">ข้อมูลนี้ลูกค้าไม่เห็น เก็บไว้ในเครื่องนี้ (ต้นแบบ) สำหรับให้ทีม Café Mood ติดต่อกลับ</p><button class="btn primary" data-act="st-owner-save">บันทึก</button></div>' +
      '<div class="card"><h2 class="st-h">' + I('refresh', 18) + 'ให้ลูกค้าทุกคนเห็นข้อมูลร้าน</h2><p class="muted small">เมนู เวลา อีเว้นท์ โค้ดของร้าน Passport และ Quest ที่คุณตั้งอยู่ในเครื่องนี้ ลูกค้าเครื่องอื่นจะเห็นเมื่อผู้พัฒนานำเข้าและเผยแพร่ — ' + (CM.dev.isDev() ? 'คุณเป็นผู้พัฒนา กดเผยแพร่ได้เลย แล้วส่งออก content.js' : 'ส่งข้อมูลให้ผู้พัฒนา แล้วรอแจ้งว่าอัปเดตแล้ว') + '</p>' +
      (CM.dev.isDev() ? '<button class="btn primary" data-act="pub-dev">เผยแพร่ข้อมูลร้านนี้</button>' : '<div class="row2"><button class="btn primary" data-act="pub-copy">คัดลอกข้อมูล</button><button class="btn ghost" data-act="pub-file">ดาวน์โหลดไฟล์</button></div>') + '</div>' +
      '<div class="card menu">' + lrow('trophy', 'แพ็กเกจ', esc(planLabel()), '#/studio/plan') + lrow('building', 'โปรไฟล์ร้าน', 'ชื่อ แบนเนอร์ เปิด/ปิด', '#/studio/shop') + '</div>' +
      '<button class="btn text block" data-act="st-switch">ออกจากร้านนี้ / เปลี่ยนร้าน</button></section>';
  }

  /* ----- Ledger: customer counter + income / expense / profit ----- */
  function tLedger(c) {
    const t = day(), days = Array.from({ length: 7 }, (_, i) => localDay(i - 6)).map((x) => ({ x, l: ledOf(c.id, x) }));
    const d = days.some((o) => o.x === ledDay) ? ledDay : t, led = ledOf(c.id, d), sm = sums(led);
    const maxC = Math.max(1, ...days.map((o) => o.l.customers));
    const tot = days.reduce((a, o) => { const s = sums(o.l); a.c += o.l.customers; a.i += s.inc; a.p += s.profit; return a; }, { c: 0, i: 0, p: 0 });
    const bars = days.map((o) => '<button class="lb' + (o.x === d ? ' on' : '') + '" data-act="st-led-pick" data-d="' + o.x + '" aria-pressed="' + (o.x === d) + '" aria-label="' + dayTh(o.x) + ' ลูกค้า ' + o.l.customers + ' คน"><span class="lbv">' + o.l.customers + '</span><span class="lbar"><i style="height:' + Math.max(4, o.l.customers / maxC * 100) + '%"></i></span><span class="lbd">' + (o.x === t ? 'วันนี้' : wd(o.x)) + '</span></button>').join('');
    const rows = led.entries.slice().reverse().map((e) => '<li class="le ' + e.t + '"><span class="le-t"><b>' + (e.t === 'in' ? '+' : '−') + baht(e.amt).replace('−', '') + '</b><small>' + (e.note ? esc(e.note) + ' · ' : '') + new Date(e.ts).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + '</small></span><button class="btn text sm" data-act="st-led-del" data-day="' + d + '" data-id="' + e.id + '" aria-label="ลบรายการ ' + baht(e.amt) + '">ลบ</button></li>').join('');
    return stHead(c, 'ลูกค้า & เงิน') + '<section class="pad stagger">' + insNav('ledger') +
      '<div class="card"><div class="st-row"><h2 class="st-h">' + I('users', 18) + (d === t ? 'ลูกค้าวันนี้' : 'ลูกค้า ' + dayTh(d)) + '</h2>' + (d === t ? '' : '<button class="btn text sm" data-act="st-led-pick" data-d="' + t + '">กลับวันนี้</button>') + '</div>' +
      '<div class="counter"><button class="iconbtn lg" data-act="st-cust" data-d="-1" data-day="' + d + '" aria-label="ลดจำนวนลูกค้า"' + (led.customers ? '' : ' disabled') + '>' + I('minus', 22) + '</button><b data-count aria-live="polite">' + led.customers + '</b><button class="iconbtn lg pri" data-act="st-cust" data-d="1" data-day="' + d + '" aria-label="เพิ่มลูกค้า 1 คน">' + I('plus', 22) + '</button></div></div>' +
      '<div class="kpis"><div class="kpi"><span class="kpi-k">รายรับ</span><b>' + baht(sm.inc) + '</b></div><div class="kpi"><span class="kpi-k">รายจ่าย</span><b>' + baht(sm.out) + '</b></div><div class="kpi"><span class="kpi-k">กำไร</span><b class="' + (sm.profit < 0 ? 'neg' : '') + '">' + baht(sm.profit) + '</b></div></div>' +
      '<div class="card"><h2 class="st-h">' + I('wallet', 18) + 'บันทึกรายการ</h2><div class="seg" role="group" aria-label="ประเภทรายการ">' + [['in', 'รายรับ'], ['out', 'รายจ่าย']].map((x) => '<button data-act="st-led-type" data-k="' + x[0] + '" aria-pressed="' + (ledType === x[0]) + '" class="' + (ledType === x[0] ? 'on' : '') + '">' + x[1] + '</button>').join('') + '</div>' +
      '<div class="field"><label for="ledAmt">จำนวนเงิน (฿)</label><input id="ledAmt" type="number" min="1" max="999999" step="any" inputmode="decimal" placeholder="เช่น 120"></div>' +
      '<div class="chips-q" role="group" aria-label="จำนวนที่ใช้บ่อย">' + [50, 100, 200, 500].map((n) => '<button class="fchip" data-act="st-led-amt" data-v="' + n + '">฿' + n + '</button>').join('') + '</div>' +
      '<div class="field"><label for="ledNote">โน้ต (ไม่บังคับ)</label><input id="ledNote" type="text" maxlength="30" placeholder="เช่น ขายหน้าร้าน / ค่านม"></div>' +
      '<input type="hidden" id="ledDayIn" value="' + d + '"><button class="btn primary" data-act="st-led-add">บันทึก</button></div>' +
      (rows ? '<div class="card"><h2 class="st-h">' + I('clock', 18) + 'รายการวันนี้' + (d === t ? '' : ' (' + dayTh(d) + ')') + '</h2><ul class="le-list">' + rows + '</ul></div>' : '') +
      '<div class="card"><h2 class="st-h">' + I('trend', 18) + '7 วันล่าสุด</h2><div class="lbars" role="group" aria-label="จำนวนลูกค้า 7 วันล่าสุด แตะเพื่อดูวัน">' + bars + '</div>' +
      '<ul class="xp-lines"><li><span>ลูกค้ารวม</span><b>' + tot.c + ' คน</b></li><li><span>รายรับรวม</span><b>' + baht(tot.i) + '</b></li><li><span>กำไรรวม</span><b class="' + (tot.p < 0 ? 'neg' : '') + '">' + baht(tot.p) + '</b></li></ul></div>' +
      '<p class="muted small">บันทึกไว้ในเครื่องนี้เพื่อใช้ดูภาพรวมเท่านั้น ไม่ใช่ระบบบัญชีหรือภาษี — กำไร = รายรับ − รายจ่ายที่คุณกรอก</p></section>';
  }

  /* ----- Plans (owner subscription) ----- */
  const OP = { pro: { month: 590, year: 5900 }, group: { month: 1490, year: 14900 } };   // yearly = pay 10, get 12
  const BOOST = 199, OTRIAL = 14, DAYMS = 864e5, MAX_EV = 2;   // MAX_EV = events running at once
  const PLAN_NAME = { free: 'Starter', pro: 'Pro', group: 'Group' };
  let opPeriod = null, opPay = 'once';
  const money = (n) => '฿' + n.toLocaleString('en-US');
  const dateTh = (ts) => new Date(ts).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
  // Same day-of-month as the start, n months later; a month without that day (e.g. the 31st) ends on its last day.
  function addMonths(ts, n) {
    const d = new Date(ts), day = d.getDate();
    d.setDate(1); d.setMonth(d.getMonth() + n);
    d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
    return d.getTime();
  }
  const lineRow = (k, v) => '<li><span>' + k + '</span><b>' + v + '</b></li>';
  function planInfo() {
    const r = root(), p = planNow(), days = p !== 'free' && !r.paid && r.trialEnd > Date.now() ? Math.ceil((r.trialEnd - Date.now()) / DAYMS) : 0;
    return { plan: p, held: heldPlan(), trialing: days > 0, days, paid: !!r.paid, period: r.period || 'year' };
  }
  // A paid plan runs until paidUntil. The cycle starts on the purchase day (not the 1st) and never drifts: always the start date + N months.
  function billing() {
    const r = root();
    if (!r.paid || !r.paidUntil) return null;
    const cad = r.pay === 'monthly' || r.period === 'month' ? 'month' : 'year', left = r.paidUntil - Date.now();
    return { cad, until: r.paidUntil, days: Math.max(0, Math.ceil(left / DAYMS)), soon: left <= (cad === 'year' ? 14 : 3) * DAYMS, amt: OP[r.plan][cad], start: r.billStart };
  }
  function devNote() {   // a plan from the developer that ends soon
    const i = planInfo(), s = i.plan !== 'free' && !i.paid ? devSource(i.plan) : null;
    if (!s || s.forever || !s.warn) return '';
    return '<div class="card bill-note" role="status">' + I('clock', 20) + '<div><b>สิทธิ์ ' + PLAN_NAME[i.plan] + ' จากผู้พัฒนาใกล้หมด</b><p class="small">เหลือ ' + s.days + ' วัน (ถึง ' + dateTh(s.until) + ') หลังจากนั้นกลับเป็น Starter</p></div><a class="btn ghost sm" href="#/studio/plan">ดูแพ็กเกจ</a></div>';
  }
  function billNote() {
    const b = billing();
    if (!b || !b.soon) return '';
    return '<div class="card bill-note" role="status">' + I('clock', 20) + '<div><b>ใกล้หมดรอบ ' + PLAN_NAME[root().plan] + '</b><p class="small">ใช้ได้ถึง ' + dateTh(b.until) + ' (อีก ' + b.days + ' วัน) · ต่ออายุ ' + money(b.amt) + '</p></div><button class="btn ghost sm" data-act="op-renew">ต่ออายุ</button></div>';
  }
  const planLabel = () => { const i = planInfo(), s = i.plan !== 'free' && !i.paid && !i.trialing ? devSource(i.plan) : null; return i.plan === 'free' ? 'Starter' : PLAN_NAME[i.plan] + (i.trialing ? ' · ทดลองเหลือ ' + i.days + ' วัน' : s ? ' · จากผู้พัฒนา ' + (s.forever ? 'ถาวร' : 'เหลือ ' + s.days + ' วัน') : ''); };
  // Turn a confirmed purchase into plan time. Renewing the same plan adds to the end of the current period.
  function activate(p) {
    const r = root(), now = Date.now(), renew = r.paid && r.plan === p.plan && r.paidUntil > now;
    if (!renew) { r.billStart = now; r.paidMonths = 0; }
    r.paidMonths = (r.paidMonths || 0) + p.months;
    r.plan = p.plan; r.period = p.per; r.pay = p.pay; r.paid = true; r.trialEnd = 0; r.trialUsed = true;
    r.paidUntil = addMonths(r.billStart, r.paidMonths); r.pending = null; r.use = null;   // use the new plan
    S.save();
  }

  function tPlan(c) {
    const pi = planInfo(), per = opPeriod || pi.period, r = rec(c.id), boosted = r.boost && r.boost > Date.now(), root0 = root(), g = grantNow();
    const trialFree = !root0.trialUsed;
    const tier = (k, name, tag, priceHtml, sub, items, extra) => {
      const cur = pi.plan === k, src = k === 'free' ? null : devSource(k), usable = k !== 'free' && RANK[pi.held] >= RANK[k] && src && !cur;   // a plan the owner holds but is not using
      const ownPlan = !!(root0.paid || pi.trialing);
      const ribbon = src ? '<div class="dev-ribbon' + (src.warn ? ' warn' : '') + (cur ? ' on' : '') + '">' + I('sparkles', 14) + '<span>ได้จากผู้พัฒนา · ' + srcText(src) + (src.name ? ' · ' + esc(src.name) : '') + '</span></div>' : '';
      const cta = cur ? '<button class="btn ghost block" disabled>แพ็กเกจปัจจุบัน</button>'
        : k === 'free' ? (pi.plan !== 'free' ? '<button class="btn text block" data-act="' + (ownPlan ? 'op-downgrade' : 'op-use') + '" data-k="free">' + (ownPlan ? 'กลับไป Starter' : 'ใช้ Starter (เก็บสิทธิ์จากผู้พัฒนาไว้)') + '</button>' : '')
        : usable ? '<button class="btn primary block" data-act="op-use" data-k="' + k + '">ใช้แพ็กเกจนี้</button>'
        : '<button class="btn ' + (k === 'pro' ? 'primary' : 'ghost') + ' block" data-act="op-choose" data-k="' + k + '">' + (trialFree ? 'ทดลองฟรี ' + OTRIAL + ' วัน' : 'สมัคร ' + name) + '</button>';
      return '<div class="card plan' + (cur ? ' cur' : '') + (k === 'pro' ? ' hl' : '') + (src ? ' dev' : '') + '">' + ribbon + (tag && !src ? '<span class="plan-tag">' + tag + '</span>' : '') +
        '<h2 class="sec-title first">' + name + '</h2><div class="pr-main"><b>' + priceHtml + '</b></div><p class="pr-sub">' + sub + '</p>' +
        '<ul>' + items.map((x) => '<li>' + I('check', 15) + x + '</li>').join('') + '</ul>' + (extra || '') + cta + '</div>';
    };
    const perTxt = (k) => (per === 'year' ? money(Math.round(OP[k].year / 12)) + '<span> / เดือน</span>' : money(OP[k].month) + '<span> / เดือน</span>');
    const perSub = (k) => (per === 'year' ? 'จ่าย ' + money(OP[k].year) + ' ต่อปี — จ่าย 10 เดือน ใช้ 12 เดือน (ประหยัด ' + money(OP[k].month * 2) + ') · ตอนชำระเลือกตัดทีเดียวหรือรายเดือนได้' : '≈ ' + money(Math.round(OP[k].month / 30)) + ' ต่อวัน · ยกเลิกเมื่อไหร่ก็ได้');
    const b = billing(), q = r.pending || root0.pending;
    const banner = pi.trialing
      ? '<div class="card"><b>Pro ทดลองฟรี — เหลือ ' + pi.days + ' วัน</b><div class="progress" role="progressbar" aria-label="วันที่ทดลองใช้" aria-valuemin="0" aria-valuemax="' + OTRIAL + '" aria-valuenow="' + (OTRIAL - pi.days) + '"><span style="width:' + (OTRIAL - pi.days) / OTRIAL * 100 + '%"></span></div><p class="muted small">หมดช่วงทดลองแล้วระบบกลับเป็น Starter อัตโนมัติ — ไม่ผูกบัตร ไม่เก็บเงิน และข้อมูลทั้งหมดอยู่ครบ</p></div>'
      : pi.paid ? '<div class="card"><b>แพ็กเกจ ' + PLAN_NAME[pi.plan] + '</b>' + (b ? '<ul class="xp-lines">' + lineRow('ใช้ได้ถึง', dateTh(b.until) + ' (อีก ' + b.days + ' วัน)') + lineRow('ต่ออายุรอบละ', money(b.amt) + (b.cad === 'year' ? ' / ปี' : ' / เดือน')) + lineRow('เริ่มนับจาก', dateTh(b.start)) + '</ul><button class="btn ghost sm" data-act="op-renew">ต่ออายุ</button>' : '') +
        '<p class="muted small">' + (root0.pay === 'monthly' ? 'ชำระทีละเดือน นับจากวันที่สมัคร ต้องต่อทุกเดือน · ' : '') + 'กลับไป Starter ได้ทุกเมื่อ</p></div>' : '';
    const grant = g ? '<div class="card"><b>ใช้ ' + PLAN_NAME[g.plan] + ' ฟรี ' + (g.until ? 'ถึง ' + dateTh(g.until) : 'ตลอดไป') + '</b><p class="muted small">' + (g.n ? esc(g.n) + ' · ' : '') + 'ได้รับจากรหัสของผู้พัฒนา</p></div>' : '';
    const pending = q ? '<div class="card"><b>รอตรวจสอบการชำระเงิน</b><ul class="xp-lines">' + lineRow('แพ็กเกจ', PLAN_NAME[q.plan] + (q.months === 12 ? ' · รายปี' : ' · รายเดือน')) + lineRow('ยอด', money(q.amt)) + lineRow('รหัสอ้างอิง', esc(q.ref)) + '</ul><p class="muted small">โอนแล้วส่งสลิปให้ผู้พัฒนา เมื่อตรวจว่าเงินเข้าแล้วจะได้รหัสเปิดใช้งาน มาใส่ด้านล่าง</p><div class="row2"><button class="btn ghost" data-act="op-pay-info">วิธีโอน</button><button class="btn text" data-act="op-pending-cancel">ยกเลิกคำขอ</button></div></div>' : '';
    const act = '<div class="card"><h2 class="sec-title first">' + I('lock', 20) + 'มีรหัสเปิดใช้งาน?</h2><div class="cc-in tok"><input id="actCode" type="text" autocomplete="off" spellcheck="false" placeholder="วางรหัสที่ผู้พัฒนาส่งให้" aria-describedby="actMsg"><button class="btn primary sm" data-act="op-activate">ใช้รหัส</button></div><p id="actMsg" class="muted small" role="status">ใช้กับรหัสยืนยันการชำระเงิน หรือรหัสให้ใช้ฟรีจากผู้พัฒนา</p></div>';
    return stHead(c, 'แพ็กเกจ', 'ใช้ Starter ฟรีได้ตลอด — อัปเกรดเมื่อพร้อมโตเท่านั้น') + '<section class="pad stagger">' + billNote() + devNote() + grant + banner + pending +
      '<div class="seg" role="radiogroup" aria-label="รอบการชำระ"><button role="radio" aria-checked="' + (per === 'year') + '" class="' + (per === 'year' ? 'on' : '') + '" data-act="op-period" data-k="year">รายปี <em>จ่าย 10 ใช้ 12</em></button><button role="radio" aria-checked="' + (per === 'month') + '" class="' + (per === 'month' ? 'on' : '') + '" data-act="op-period" data-k="month">รายเดือน</button></div>' +
      tier('free', 'Starter', '', '฿0', 'ฟรีตลอด ไม่ต้องใช้บัตร', ['Profile ร้าน เมนู ราคา Photo Spot', 'สถานะร้านสด, Owner Mood, Owner’s Pick', 'รับ Check-in + Verified', 'อีเว้นท์ได้สูงสุด 2 งานพร้อมกัน', 'ออกแบบ Passport Stamp และโค้ดของร้าน', 'สถิติพื้นฐาน']) +
      tier('pro', 'Pro', 'คุ้มที่สุดสำหรับร้านเดี่ยว', perTxt('pro'), perSub('pro'), ['ทุกอย่างใน Starter', 'Café Quest + Passport Reward', 'Café Moment ส่งตรงกลุ่ม', 'Analytics เต็ม + AI Insight', 'Advanced Café DNA']) +
      tier('group', 'Group', 'สำหรับหลายสาขา', perTxt('group'), perSub('group'), ['ทุกอย่างใน Pro', 'จัดการได้ถึง 5 สาขา', 'ทีมงาน 5 คน แยกสิทธิ์', 'ส่งออกรายงาน CSV']) + CM.ent.cardsHtml('owner') + act +
      '<div class="card boost"><div class="set-row"><div><h2 class="sec-title first">' + I('bolt', 20) + 'Café Moment Boost</h2><p class="muted small">เพิ่ม 1 ช่อง “Sponsored” ใน Café Moment ให้คนที่ Mood ตรงกับงานของคุณ</p></div>' +
      (pi.plan !== 'free' ? sw(!!boosted, 'op-boost', 'b', 'เปิด Boost') : '') + '</div><p class="small"><b>' + money(BOOST) + ' / สัปดาห์</b>' + (boosted ? ' · เปิดถึง ' + dateTh(r.boost) : '') + '</p>' +
      (pi.plan === 'free' ? '<p class="muted small">ใช้ได้กับ Pro ขึ้นไป</p>' : '') + '<p class="muted small">ติดป้าย Sponsored ชัดเจน, มีได้ไม่เกิน 1 ช่องต่อหน้า และ <b>ไม่เปลี่ยนอันดับร้านในผลแนะนำ</b></p></div>' +
      '<div class="card fair">' + I('badge-check', 18) + '<p><b>สัญญาความเป็นกลาง:</b> ไม่มีแพ็กเกจไหนซื้ออันดับได้ อันดับมาจาก Mood × Personality × Weather ของลูกค้าเท่านั้น</p></div>' +
      '<p class="muted small">' + (CM.dev.pay() ? 'ชำระด้วยการโอนเงิน — แพ็กเกจเปิดใช้เมื่อผู้พัฒนาตรวจว่าเงินเข้าแล้ว' : 'ราคาเป็นตัวอย่างในเดโม ไม่มีการเรียกเก็บเงินจริง') + '</p></section>';
  }

  /* ----- Events tab + editor ----- */
  let ev = null;   // the event being edited (draft)
  // Crop to W×H, re-encode as JPEG and shrink quality until it is under `max` characters, so it fits in browser storage.
  function readImage(file, W, H, max) {
    return new Promise((resolve, reject) => {
      if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) return reject('ใช้ไฟล์ PNG, JPG หรือ WebP นะ');
      if (file.size > 10 * 1024 * 1024) return reject('ไฟล์ใหญ่เกิน 10MB');
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        const cv = document.createElement('canvas');
        cv.width = W; cv.height = H;
        const s = Math.max(W / img.width, H / img.height), w = img.width * s, h = img.height * s;
        cv.getContext('2d').drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
        URL.revokeObjectURL(url);
        let q = .82, d = cv.toDataURL('image/jpeg', q);
        while (d.length > max && q > .4) { q -= .1; d = cv.toDataURL('image/jpeg', q); }
        resolve(d);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject('อ่านรูปนี้ไม่ได้'); };
      img.src = url;
    });
  }
  const readBanner = (f) => readImage(f, 1200, 675, 380000);
  const newDraft = () => ({ id: 'e' + Date.now(), banner: '', title: '', desc: '', type: 'live', startDate: localDay(0), endDate: localDay(0), startTime: '18:00', endTime: '20:00', tags: [], items: [], sets: [], gives: [], code: '', codeGives: '', views: 0, saves: 0 });
  const EV_LABEL = { live: 'กำลังจัดอยู่', today: 'วันนี้', upcoming: 'เร็ว ๆ นี้', ended: 'จบแล้ว' };

  function tEvents(c) {
    const r = rec(c.id);
    const list = r.events.slice().sort((a, b) => (a.startDate < b.startDate ? 1 : -1)).map((e) => {
      const st = eventStatus(e);
      return '<div class="card ev-own">' + (e.banner ? '<img class="ev-img own-thumb" src="' + e.banner + '" alt="แบนเนอร์ ' + esc(e.title) + '">' : '') + '<div class="set-row"><div><b>' + esc(e.title) + '</b><small>' + esc(typeLabel(e.type)) + ' · ' + e.startDate + (e.endDate !== e.startDate ? ' → ' + e.endDate : '') + ' · ' + e.startTime + '–' + e.endTime + '</small></div><span class="evbadge ev-' + (st === 'upcoming' ? 'up' : st === 'ended' ? 'off' : st) + ' inline">' + EV_LABEL[st] + '</span></div>' +
        '<p class="muted small">เมนู ' + e.items.length + ' · Set ' + e.sets.length + ' · Give away ' + e.gives.length + ' · เปิดดู ' + (e.views || 0) + ' · สนใจ ' + (e.saves || 0) + '</p>' +
        '<div class="row3"><a class="btn ghost sm" href="#/event/' + e.id + '">ดูแบบลูกค้า</a><button class="btn ghost sm" data-act="ev-edit" data-id="' + e.id + '">แก้ไข</button><button class="btn ghost sm" data-act="ev-delete" data-id="' + e.id + '">ลบ</button></div></div>';
    }).join('');
    const active = r.events.filter((e) => eventStatus(e) !== 'ended').length;
    return stHead(c, 'Events', 'ประกาศอีเว้นท์ของร้าน พร้อมเมนู เซ็ต และของแจก — ขึ้นใน Home / Discover / หน้าร้านของลูกค้า') + '<section class="pad stagger">' +
      '<button class="btn primary lg" data-act="ev-new">' + I('plus', 20) + 'สร้างอีเว้นท์</button>' +
      '<p class="muted small">จัดได้สูงสุด ' + MAX_EV + ' อีเว้นท์พร้อมกัน (ตอนนี้ ' + active + '/' + MAX_EV + ')</p>' +
      (list || '<div class="card empty"><p><b>ยังไม่มีอีเว้นท์</b></p><p class="muted">ลองสร้างงานแรก เช่น ดนตรีสด เวิร์กช็อป หรือเมนูหน้าฝน</p></div>') + '</section>';
  }

  function tEventEdit(c) {
    const isNew = !c || !rec(c.id).events.some((e) => e.id === ev.id);
    const get = (p) => { const v = p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), ev); return v == null ? '' : v; };
    const fld = (id, label, path, type, extra) => '<div class="field"><label for="' + id + '">' + label + '</label><input id="' + id + '" data-ev="' + path + '" type="' + type + '" value="' + esc(String(get(path))) + '" ' + (extra || '') + '></div>';
    const rows = (k, defs, addLabel) => ev[k].map((row, i) => '<div class="ev-row">' + defs.map((d) => fld('ev-' + k + i + d[0], d[1], k + '.' + i + '.' + d[0], d[2], d[3])).join('') +
      '<button class="btn ghost sm" data-act="ev-del" data-k="' + k + '" data-i="' + i + '" aria-label="ลบแถวนี้">ลบแถว</button></div>').join('') + '<button class="btn ghost block" data-act="ev-add" data-k="' + k + '">+ ' + addLabel + '</button>';
    const tags = D.MOODS.map((m) => '<button class="fchip' + (ev.tags.includes(m.id) ? ' on' : '') + '" data-act="ev-tag" data-k="' + m.id + '" aria-pressed="' + ev.tags.includes(m.id) + '">' + m.short + '</button>').join('');
    return stHead(c, isNew ? 'สร้างอีเว้นท์' : 'แก้ไขอีเว้นท์') + '<section class="pad stagger">' +
      '<div class="card"><h2 class="sec-title first">รายละเอียด</h2>' + fld('ev-title', 'ชื่ออีเว้นท์', 'title', 'text', 'maxlength="50" placeholder="เช่น Acoustic Night"') +
      '<div class="field"><label for="ev-type">ประเภท</label><select id="ev-type" data-ev="type">' + EVENT_TYPES.map((t) => '<option value="' + t[0] + '"' + (ev.type === t[0] ? ' selected' : '') + '>' + t[1] + ' · ' + t[2] + '</option>').join('') + '</select></div>' +
      '<div class="field"><label for="ev-desc">คำอธิบาย</label><textarea id="ev-desc" data-ev="desc" rows="3" maxlength="200" placeholder="บอกลูกค้าว่างานนี้มีอะไร">' + esc(ev.desc) + '</textarea></div></div>' +
      '<div class="card"><h2 class="sec-title first">' + I('camera', 20) + 'แบนเนอร์อีเว้นท์</h2>' +
      '<div class="banner-prev">' + (ev.banner ? '<img class="ev-img" src="' + ev.banner + '" alt="ตัวอย่างแบนเนอร์">' : A.coverArt(c) + '<span class="banner-ph">ยังไม่มีแบนเนอร์ — ใช้ภาพปกร้านแทน</span>') + '</div>' +
      '<div class="row2"><label class="btn ghost file-btn" for="evBanner">' + I('plus', 18) + (ev.banner ? 'เปลี่ยนรูป' : 'อัปโหลดรูปแบนเนอร์') + '<input id="evBanner" class="sr" type="file" accept="image/png,image/jpeg,image/webp"></label>' +
      (ev.banner ? '<button class="btn ghost" data-act="ev-banner-clear">ลบรูป</button>' : '') + '</div>' +
      '<p class="muted small">แนะนำภาพแนวนอนสัดส่วน 16:9 (PNG/JPG/WebP ไม่เกิน 10MB) ระบบครอปและย่อขนาดให้อัตโนมัติ</p></div>' +
      '<div class="card"><h2 class="sec-title first">' + I('clock', 20) + 'ระยะเวลา</h2><div class="hours">' + fld('ev-sd', 'วันเริ่ม', 'startDate', 'date') + fld('ev-ed', 'วันจบ', 'endDate', 'date', 'min="' + ev.startDate + '"') + fld('ev-st', 'เวลาเริ่ม (ต่อวัน)', 'startTime', 'time') + fld('ev-et', 'เวลาจบ (ต่อวัน)', 'endTime', 'time') + '</div>' +
      '<p class="muted small">จัดหลายวันได้ — เวลาเริ่ม/จบคือช่วงเวลาของแต่ละวัน</p></div>' +
      '<div class="card"><h2 class="sec-title first">' + I('sparkles', 20) + 'ส่งให้คนที่ Mood แบบ</h2><div class="fchips" role="group" aria-label="Mood ที่เหมาะกับอีเว้นท์">' + tags + '</div></div>' +
      '<div class="card"><h2 class="sec-title first">' + I('cup', 20) + 'เมนูในอีเว้นท์</h2>' + rows('items', [['name', 'ชื่อเมนู', 'text', 'maxlength="40"'], ['price', 'ราคา (฿)', 'number', 'min="0" max="9999" inputmode="numeric"']], 'เพิ่มเมนู') + '</div>' +
      '<div class="card"><h2 class="sec-title first">' + I('coffee', 20) + 'Set Menu</h2>' + rows('sets', [['name', 'ชื่อเซ็ต', 'text', 'maxlength="40"'], ['price', 'ราคาเซ็ต (฿)', 'number', 'min="0" max="9999" inputmode="numeric"'], ['includes', 'ในเซ็ตมีอะไรบ้าง', 'text', 'maxlength="80" placeholder="เครื่องดื่ม 2 แก้ว + ของหวาน"']], 'เพิ่มเซ็ตเมนู') + '</div>' +
      '<div class="card"><h2 class="sec-title first">' + I('sparkles', 20) + 'Give away</h2>' + rows('gives', [['name', 'ของแจก', 'text', 'maxlength="40"'], ['rule', 'เงื่อนไข', 'text', 'maxlength="80" placeholder="10 คนแรกที่ Check-in"'], ['qty', 'จำนวน (ชิ้น)', 'number', 'min="0" max="9999" inputmode="numeric"']], 'เพิ่มของแจก') + '</div>' +
      '<div class="card"><h2 class="sec-title first">' + I('sparkles', 20) + 'โค้ดแจกในงาน (ไม่บังคับ)</h2>' + fld('ev-code', 'โค้ดที่แจกให้ลูกค้า', 'code', 'text', 'maxlength="16" autocapitalize="characters" autocomplete="off" placeholder="เช่น ACOUSTIC"') + fld('ev-codeGives', 'ลูกค้าที่ใส่โค้ดนี้ได้อะไร', 'codeGives', 'text', 'maxlength="60" placeholder="เช่น ลด ฿20 เมนูในงาน"') +
      '<p class="muted small">แจกโค้ดให้คนที่มางาน ลูกค้าใส่ที่ Profile → โค้ดของฉัน แล้วโค้ดจะถูกเก็บไว้พร้อมของที่ได้ ใช้ได้ถึงวันจบงาน</p></div>' +
      '<button class="btn primary lg" data-act="ev-save">เผยแพร่อีเว้นท์</button><a class="btn text block" href="#/studio/events">ยกเลิก</a></section>';
  }

  function view(sub) {
    const c = myCafe();
    if (!c) return chooseCafe();
    sub = sub || '';
    let fn = { cafe: tCafe, events: tEvents, promote: tPromote, insights: tInsights, plan: tPlan, shop: tShop, owner: tOwner, ledger: tLedger }[sub], tab = /^(shop|owner|ledger)$/.test(sub) ? 'insights' : sub;
    if (sub === 'new-event' || /^edit-/.test(sub)) {
      const id = sub.replace(/^edit-/, '');
      if (sub === 'new-event' ? !ev || rec(c.id).events.some((e) => e.id === ev.id) : !ev || ev.id !== id) {
        const found = rec(c.id).events.find((e) => e.id === id);
        ev = sub === 'new-event' ? newDraft() : found ? JSON.parse(JSON.stringify(found)) : null;
      }
      if (!ev) { location.replace('#/studio/events'); return null; }
      fn = tEventEdit; tab = 'events';
    }
    return { nav: true, navHtml: tabbar(tab), html: (fn || tToday)(c) };
  }

  /* ---------- actions ---------- */
  function install(a) {
    api = a;
    const H = api.H, toast = api.toast, refresh = () => { save(); api.render(true); };
    const val = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
    const touch = (id) => { rec(id).updates++; };
    const done = (m) => { refresh(); toast(m || 'บันทึกแล้ว — ลูกค้าเห็นทันที'); };

    const enter = (id) => {
      const r = root().byCafe[id];
      if (!r || !r.managed) { const p = pub(id); root().byCafe[id] = Object.assign(p ? clone(p) : r || blank(), { managed: true }); }
      root().cafeId = id; S.save(); apply(CM.weather.ctx.hour); api.render();
    };
    CM.studio.enter = enter;
    H['st-login'] = (el) => {
      const c = D.CAFE_BY_ID[el.dataset.id];
      if (!c) return;
      if (CM.dev.isDev()) return enter(c.id);   // developer: no owner code needed
      api.openSheet('<h2 id="sheetTitle">ยืนยันความเป็นเจ้าของ ' + esc(c.name) + '</h2><p class="muted">ใส่รหัสเจ้าของร้านที่ผู้พัฒนาออกให้หลังยืนยันว่าเป็นร้านของคุณ (รหัสสั้น XXXX-XXXX-XXXX หรือรหัสยาวที่ขึ้นต้นด้วย CM1.)</p><div class="cc-in tok"><input id="ownCode" data-id="' + c.id + '" type="text" autocomplete="off" spellcheck="false" placeholder="วางรหัสเจ้าของร้านที่นี่" aria-label="รหัสเจ้าของร้าน" aria-describedby="ownMsg"></div><p id="ownMsg" class="muted small" role="status">' + (CM.dev.hasOwnerCode(c.id) ? '' : 'ร้านนี้ยังไม่มีรหัสแบบสั้น — ถ้าผู้พัฒนาส่งรหัสยาว (CM1.…) ให้ วางได้เลย') + '</p><button class="btn primary lg" data-act="st-login-do">ยืนยันและเข้าสู่ร้าน</button><a class="btn text block" href="#/contact">ยังไม่มีรหัส? ติดต่อผู้พัฒนา</a><button class="btn text block" data-act="close-sheet">ยกเลิก</button>');
      const i = document.getElementById('ownCode'); if (i) i.focus();
    };
    H['st-login-do'] = async () => {
      const inp = document.getElementById('ownCode'), msg = document.getElementById('ownMsg');
      if (!inp) return;
      const say = (t) => { msg.textContent = t; msg.classList.add('bad'); };
      const res = await CM.dev.checkOwner(inp.dataset.id, inp.value);
      if (res === 'ok') { const id0 = inp.dataset.id, proof = await CM.dev.proofKey(id0, inp.value); enter(id0); const r = rec(id0); if (!r.owned) r.owned = Date.now(); r.proof = proof; S.save(); api.closeSheet(true); toast('ยืนยันความเป็นเจ้าของแล้ว'); }
      else if (res.wait) say('ใส่ผิดหลายครั้ง รออีก ' + res.wait + ' วินาทีแล้วลองใหม่');
      else if (res === 'nocrypto') say('เบราว์เซอร์นี้ตรวจรหัสไม่ได้ — เปิดผ่าน https หรือ localhost');
      else if (res === 'nokey') say('ยังตรวจรหัสยาวไม่ได้ — ผู้พัฒนายังไม่ได้เผยแพร่กุญแจตรวจรหัส');
      else if (res === 'none') say('ร้านนี้ยังไม่มีรหัสแบบสั้น — ขอรหัสจากผู้พัฒนา');
      else { say('รหัสไม่ถูกต้อง ตรวจตัวสะกดอีกครั้ง'); inp.select(); }
    };
    document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'ownCode') { e.preventDefault(); H['st-login-do'](); } });
    // Owner photo: updated in place so unsaved text in the form below is not lost.
    const showOwnerPhoto = (d) => {
      document.getElementById('owPhotoPrev').innerHTML = d ? '<img src="' + esc(d) + '" alt="รูปเจ้าของร้าน">' : I('user', 34);
      document.getElementById('owPhotoLbl').textContent = d ? 'เปลี่ยนรูป' : 'เพิ่มรูปเจ้าของร้าน';
      document.getElementById('owPhotoClr').hidden = !d;
    };
    const setOwnerPhoto = (id, d) => { const r = rec(id), prev = r.owner; r.owner = Object.assign(ownerOf(id), { photo: d }); if (!S.save()) { r.owner = prev; toast('พื้นที่เก็บข้อมูลเต็ม — ลบรูปหรืออีเว้นท์เก่าก่อน'); return false; } showOwnerPhoto(d); return true; };
    const pubText = async () => { const id = root().cafeId; return CM.dev.makeSubmission(id, publicShop(id), rec(id).proof); };
    H['pub-copy'] = async () => {
      const t = await pubText(), ok = () => toast('คัดลอกแล้ว (' + Math.round(t.length / 1024) + ' KB) — ส่งให้ผู้พัฒนา');
      navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(t).then(ok, () => toast('คัดลอกไม่ได้ — ใช้ปุ่มดาวน์โหลดไฟล์แทน')) : toast('คัดลอกไม่ได้ — ใช้ปุ่มดาวน์โหลดไฟล์แทน');
    };
    H['pub-file'] = async () => {
      const t = await pubText(), a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([t], { type: 'text/plain' })); a.download = 'cafe-' + root().cafeId + '.txt';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast('ดาวน์โหลดแล้ว — ส่งไฟล์ให้ผู้พัฒนา');
    };
    H['pub-dev'] = () => { CM.dev.publishShop(root().cafeId, publicShop(root().cafeId)); toast('เผยแพร่แล้ว — ลูกค้าในเครื่องนี้เห็นทันที ส่งออก content.js เพื่อให้ทุกเครื่องเห็น'); };
    /* logo + menu photos */
    const lgPreview = () => { const p = document.getElementById('logoPrev'); if (p && lg) p.innerHTML = A.logoFromT(lg); };
    H['logo-tpl'] = (el) => { lg.tpl = el.dataset.k; document.querySelectorAll('[data-act=logo-tpl]').forEach((b) => { const on = b.dataset.k === lg.tpl; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); }); lgPreview(); };
    const lgField = (e) => { const k = e.target.dataset && e.target.dataset.lg; if (!k || !lg) return; lg[k] = e.target.value; lgPreview(); };
    document.addEventListener('input', lgField); document.addEventListener('change', lgField);
    H['logo-save'] = () => { const sh = sRec(root().cafeId); sh.logo = ''; sh.logoT = { tpl: lg.tpl, c1: lg.c1, c2: lg.c2, text: String(lg.text || '').trim().slice(0, 3) }; touch(root().cafeId); done('บันทึกโลโก้แล้ว — ลูกค้าเห็นที่หน้าร้าน'); };
    H['logo-clear'] = () => { const sh = sRec(root().cafeId); sh.logo = ''; sh.logoT = null; lg = null; touch(root().cafeId); done('ลบโลโก้แล้ว'); };
    document.addEventListener('change', (e) => {
      const t = e.target, c = myCafe();
      if (!c) return;
      if (t.id === 'shopLogo') {
        const f = t.files && t.files[0]; if (!f) return;
        readImage(f, 160, 160, 14000).then((d) => { const sh = sRec(c.id), prev = [sh.logo, sh.logoT]; sh.logo = d; sh.logoT = null; if (!S.save()) { sh.logo = prev[0]; sh.logoT = prev[1]; return toast('พื้นที่เก็บข้อมูลเต็ม'); } touch(c.id); refresh(); toast('เปลี่ยนโลโก้แล้ว'); }).catch((m) => toast(String(m)));
      }
      if (t.dataset && t.dataset.dph) {
        const f = t.files && t.files[0], id = t.dataset.dph; if (!f) return;
        readImage(f, 240, 240, 26000).then((d) => { const r = rec(c.id), prev = r.drinkPhoto[id]; r.drinkPhoto[id] = d; if (!S.save()) { if (prev) r.drinkPhoto[id] = prev; else delete r.drinkPhoto[id]; return toast('พื้นที่เก็บข้อมูลเต็ม'); } touch(c.id); refresh(); toast('เปลี่ยนรูปเมนูแล้ว'); }).catch((m) => toast(String(m)));
      }
      if (t.dataset && t.dataset.dth !== undefined) { const r = rec(c.id), i = +t.value || 0; if (i) r.drinkTheme[t.dataset.dth] = i; else delete r.drinkTheme[t.dataset.dth]; touch(c.id); done('เปลี่ยนธีมสีเมนูแล้ว'); }
    });
    H['st-dph-clear'] = (el) => { const r = rec(root().cafeId); delete r.drinkPhoto[el.dataset.id]; touch(root().cafeId); done('ลบรูปเมนูแล้ว'); };
    H['owner-photo-clear'] = () => { if (setOwnerPhoto(root().cafeId, '')) toast('ลบรูปแล้ว'); };
    document.addEventListener('change', (e) => {
      if (!e.target || e.target.id !== 'ownerPhoto') return;
      const f = e.target.files && e.target.files[0], c = myCafe();
      if (!f || !c) return;
      readImage(f, 256, 256, 60000).then((d) => { if (setOwnerPhoto(c.id, d)) toast('เปลี่ยนรูปเจ้าของร้านแล้ว'); }).catch((m) => toast(String(m)));
    });
    H['st-switch'] = () => { root().cafeId = null; S.save(); api.render(); };
    H['st-status'] = (el) => { const r = rec(root().cafeId); r.status = el.dataset.k; r.statusTs = Date.now(); if (r.seats == null) r.seats = { quiet: 12, moderate: 6, busy: 1 }[r.status]; touch(r === null ? '' : root().cafeId); done(); };
    H['st-seats'] = (el) => { const r = rec(root().cafeId); r.seats = clamp((r.seats == null ? 5 : r.seats) + +el.dataset.d, 0, 99, 0); r.statusTs = Date.now(); if (!r.status) r.status = r.seats > 8 ? 'quiet' : r.seats > 2 ? 'moderate' : 'busy'; touch(root().cafeId); done(); };
    H['st-mood'] = (el) => { const r = rec(root().cafeId), t = day(); if (r.mood === el.dataset.k && r.moodDay === t) r.mood = null; else { r.mood = el.dataset.k; r.moodDay = t; } touch(root().cafeId); done(); };
    H['st-pick-save'] = () => {
      const r = rec(root().cafeId), sel = document.querySelector('input[name="pickDrink"]:checked');
      if (!sel) { toast('เลือกเมนูก่อนนะ'); return; }
      const d = D.DRINK_BY_ID[sel.value], price = parseInt(val('pickPrice'), 10);
      r.pick = { drinkId: sel.value, price: price > 0 ? price : d.price, note: val('pickNote').trim() || 'เมนูที่เจ้าของร้านอยากให้ลองวันนี้' }; r.pickDay = day();
      touch(root().cafeId); done('ตั้ง Owner’s Pick แล้ว — ขึ้นในหน้า Today’s Drink');
    };
    H['st-pick-clear'] = () => { const r = rec(root().cafeId); r.pick = null; r.pickDay = ''; done('ยกเลิก Owner’s Pick แล้ว'); };
    H['st-fac'] = (el) => { const c = myCafe(), r = rec(c.id); if (!r.info) r.info = Object.assign({}, defaultInfo(c)); r.info[el.dataset.k] = !r.info[el.dataset.k]; touch(c.id); done(); };
    H['st-hours-save'] = () => {
      const o = parseFloat(val('hOpen')), cl = parseFloat(val('hClose'));
      if (!(o >= 0 && cl > o && cl <= 28)) { toast('เวลาไม่ถูกต้อง (ปิดต้องหลังเปิด)'); return; }
      rec(root().cafeId).hours = [o, cl]; touch(root().cafeId); done();
    };
    H['st-drink-off'] = (el) => { const r = rec(root().cafeId); r.off[el.dataset.id] = !r.off[el.dataset.id]; if (!r.off[el.dataset.id]) delete r.off[el.dataset.id]; refresh(); };
    H['st-drink-add'] = () => api.openSheet('<h2 id="sheetTitle">เพิ่มเมนู</h2><div class="field"><label for="nName">ชื่อเมนู</label><input id="nName" type="text" maxlength="40"></div>' +
      '<div class="field"><label for="nType">ประเภท</label><select id="nType">' + Object.keys(TYPE_TH).map((k) => '<option value="' + k + '">' + TYPE_TH[k] + '</option>').join('') + '</select></div>' +
      '<div class="field"><label for="nTemp">อุณหภูมิ</label><select id="nTemp"><option value="hot">ร้อน</option><option value="iced">เย็น</option></select></div>' +
      '<div class="field"><label for="nPrice">ราคา (฿)</label><input id="nPrice" type="number" min="0" max="999"></div>' +
      '<button class="btn primary lg" data-act="st-drink-save">เพิ่มเมนู</button><button class="btn text block" data-act="close-sheet">ยกเลิก</button>');
    H['st-drink-save'] = () => {
      const name = val('nName').trim(), price = parseInt(val('nPrice'), 10);
      if (!name || !(price > 0)) { toast('ใส่ชื่อและราคาให้ครบ'); return; }
      const c = myCafe(), r = rec(c.id), type = val('nType');
      r.extraDrinks.push({ id: c.id + ':x' + (r.extraDrinks.length + 1) + Date.now() % 1000, cafeId: c.id, name, type, temp: val('nTemp'), price, note: 'เมนูใหม่จากร้าน', colors: TYPE_COLORS[type] });
      touch(c.id); api.closeSheet(true); done();
    };
    H['st-spot-add'] = () => api.openSheet('<h2 id="sheetTitle">เพิ่มจุดถ่ายรูป</h2><div class="field"><label for="sName">ชื่อจุด</label><input id="sName" type="text" maxlength="40" placeholder="เช่น หน้าต่างบานโค้ง"></div>' +
      '<div class="field"><label for="sTime">ช่วงเวลาที่แสงดี</label><input id="sTime" type="text" maxlength="11" placeholder="15:00–17:00"></div><div class="field"><label for="sTip">เคล็ดลับ</label><input id="sTip" type="text" maxlength="80"></div>' +
      '<button class="btn primary lg" data-act="st-spot-save">เพิ่มจุด</button><button class="btn text block" data-act="close-sheet">ยกเลิก</button>');
    H['st-spot-save'] = () => {
      const name = val('sName').trim(), time = val('sTime').trim();
      if (!name || !/^\d{1,2}:\d{2}[–-]\d{1,2}:\d{2}$/.test(time)) { toast('ใส่ชื่อและเวลาแบบ 15:00–17:00'); return; }
      const c = myCafe(), r = rec(c.id);
      r.extraSpots.push({ id: c.id + ':o' + (r.extraSpots.length + 1), cafeId: c.id, name, best: time.replace('-', '–'), light: 3, bg: 3, tip: val('sTip').trim() || 'จุดที่ร้านแนะนำ (รอผู้ใช้ให้คะแนนแสง)', outdoor: false, owner: true });
      touch(c.id); api.closeSheet(true); done();
    };
    H['st-verify'] = () => { const r = rec(root().cafeId); r.verified = true; done('ร้านของคุณได้รับ Verified แล้ว'); };
    H['st-quest-toggle'] = () => { const c = myCafe(), r = rec(c.id); r.quest = r.quest || { on: false, drinkId: c.drinks[0] && c.drinks[0].id, spotId: c.spots[0] && c.spots[0].id, xp: 50 }; r.quest.on = !r.quest.on; done(); };
    H['st-quest-save'] = () => { const r = rec(root().cafeId); r.quest = { on: true, drinkId: val('qDrink') || null, spotId: val('qSpot') || null, xp: clamp(parseInt(val('qXp'), 10) || 50, 10, 200, 0) }; touch(root().cafeId); done('เปิด Quest แล้ว — ขึ้นในหน้าร้านและตอน Check-in'); };
    H['st-reward-toggle'] = () => { const r = rec(root().cafeId); r.reward = r.reward || { on: false, need: 3, text: 'ลด ฿20' }; r.reward.on = !r.reward.on; done(); };
    H['st-reward-save'] = () => { const r = rec(root().cafeId); r.reward = { on: true, need: parseInt(val('rNeed'), 10) || 3, text: val('rText').trim() || 'ของรางวัลจากร้าน' }; touch(root().cafeId); done('บันทึก Reward แล้ว'); };
    let momentTags = new Set();
    H['st-moment-new'] = () => {
      momentTags = new Set();
      api.openSheet('<h2 id="sheetTitle">สร้าง Café Moment</h2><div class="field"><label for="mTitle">หัวข้อ</label><input id="mTitle" type="text" maxlength="40" placeholder="Tonight at Café X"></div>' +
        '<div class="field"><label for="mBody">รายละเอียด / เวลา</label><input id="mBody" type="text" maxlength="70" placeholder="Live acoustic 18:00–20:00"></div>' +
        '<p class="sh-h">ส่งให้คนที่ Mood แบบ</p><div class="fchips" role="group" aria-label="Mood ที่ต้องการ">' + D.MOODS.map((m) => '<button class="fchip" data-act="st-tag" data-k="' + m.id + '" aria-pressed="false">' + m.short + '</button>').join('') + '</div>' +
        '<div class="field"><label for="mWeather">เหมาะกับอากาศ</label><select id="mWeather"><option value="">ไม่ระบุ</option><option value="rain">ฝนตก</option><option value="sunny">แดดดี</option><option value="cloudy">ครึ้มฟ้า</option></select></div>' +
        '<button class="btn primary lg" data-act="st-moment-save">เผยแพร่</button><button class="btn text block" data-act="close-sheet">ยกเลิก</button>');
    };
    H['st-tag'] = (el) => { const k = el.dataset.k; if (momentTags.has(k)) momentTags.delete(k); else momentTags.add(k); el.classList.toggle('on', momentTags.has(k)); el.setAttribute('aria-pressed', momentTags.has(k)); };
    H['st-moment-save'] = () => {
      const title = val('mTitle').trim();
      if (!title || !momentTags.size) { toast('ใส่หัวข้อและเลือก Mood อย่างน้อย 1 อย่าง'); return; }
      const r = rec(root().cafeId);
      r.moments.push({ id: 'm' + Date.now(), title, body: val('mBody').trim(), tags: Array.from(momentTags), weather: val('mWeather') || null });
      touch(root().cafeId); api.closeSheet(true); done('เผยแพร่ Café Moment แล้ว — แสดงในหน้า Home ของลูกค้าที่ตรงกลุ่ม');
    };
    H['st-moment-del'] = (el) => { const r = rec(root().cafeId); r.moments = r.moments.filter((m) => m.id !== el.dataset.id); refresh(); };
    const orow = (k, v) => '<li><span>' + k + '</span><b>' + v + '</b></li>';
    // Checkout. First time = free trial (no card). After that: a yearly plan can be paid once, or month by month.
    const payPlan = () => { const r = root(), per = opPeriod || r.period || 'year', once = per === 'year' && opPay !== 'monthly'; return { per, once, months: once ? 12 : 1, pay: once ? 'once' : 'monthly' }; };
    const untilAfter = (k, months) => { const r = root(); return r.paid && r.plan === k && r.paidUntil > Date.now() ? addMonths(r.billStart, (r.paidMonths || 0) + months) : addMonths(Date.now(), months); };
    const opSheet = (k) => {
      const r = root(), trial = !r.trialUsed, pp = payPlan(), amt = pp.once ? OP[k].year : OP[k].month;
      const pick = (v, title, price, note) => '<button class="pay-opt' + (opPay === v ? ' on' : '') + '" role="radio" aria-checked="' + (opPay === v) + '" data-act="op-pay" data-k="' + k + '" data-v="' + v + '"><b>' + title + '</b><span>' + price + '</span><small>' + note + '</small></button>';
      api.openSheet('<h2 id="sheetTitle">' + (trial ? 'ทดลอง ' + PLAN_NAME[k] + ' ฟรี ' + OTRIAL + ' วัน' : 'สมัคร ' + PLAN_NAME[k]) + '</h2>' +
        (!trial && pp.per === 'year' ? '<div class="pay-opts" role="radiogroup" aria-label="วิธีตัดเงิน">' +
          pick('once', 'ตัดทีเดียวรายปี', money(OP[k].year) + ' ครั้งเดียว', 'จ่าย 10 เดือน ใช้ 12 เดือน — ประหยัด ' + money(OP[k].month * 2)) +
          pick('monthly', 'ตัดรายเดือนทีละเดือน', money(OP[k].month) + ' / เดือน', 'ราคารายเดือน จ่ายทีละเดือนนับจากวันที่สมัคร ไม่ต้องจ่ายก้อนใหญ่') + '</div>' : '') +
        '<ul class="xp-lines">' + lineRow('วันนี้', trial ? '฿0' : money(amt)) +
        (trial ? lineRow('หลังครบ ' + OTRIAL + ' วัน', 'กลับ Starter อัตโนมัติ') : lineRow('รอบ', pp.per === 'year' ? (pp.once ? 'รายปี · ตัดทีเดียว' : 'รายปี · ตัดรายเดือน') : 'รายเดือน') + lineRow('ใช้ได้ถึง', dateTh(untilAfter(k, pp.months)))) +
        lineRow(trial ? 'บัตรเครดิต' : 'วิธีชำระ', trial ? 'ไม่ต้องใช้' : CM.dev.pay() ? 'โอนเงิน — เปิดใช้เมื่อตรวจว่าเงินเข้า' : 'เดโม ไม่เก็บเงินจริง') + '</ul>' +
        '<p class="muted small">' + (trial ? 'ถ้าชอบ ค่อยสมัครต่อเอง — เราไม่เก็บเงินอัตโนมัติ' : (pp.months === 1 ? 'ต้องต่อทุกเดือน (เตือนก่อนหมดรอบ 3 วัน) ถ้าไม่ต่อกลับเป็น Starter · ' : 'เตือนก่อนหมดรอบ 14 วัน · ') + 'กลับไป Starter ได้ทุกเมื่อ ข้อมูลไม่หาย') + '</p>' +
        '<button class="btn primary lg" data-act="op-confirm" data-k="' + k + '">' + (trial ? 'เริ่มทดลองฟรี' : CM.dev.pay() ? 'ไปขั้นตอนโอนเงิน' : 'ยืนยันสมัคร') + '</button><button class="btn text block" data-act="close-sheet">ยังไม่ตอนนี้</button>');
    };
    H['op-period'] = (el) => { opPeriod = el.dataset.k; api.render(true); };
    H['op-choose'] = (el) => { opPay = 'once'; opSheet(el.dataset.k); };
    H['op-renew'] = () => { const r = root(); opPeriod = r.period || 'year'; opPay = r.pay || 'once'; opSheet(r.plan); };
    H['op-pay'] = (el) => { opPay = el.dataset.v; opSheet(el.dataset.k); };
    const rand = (n) => { let t = ''; crypto.getRandomValues(new Uint8Array(n)).forEach((x) => { t += 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[x % 31]; }); return t; };
    function paySheet() {
      const q = root().pending, pi = CM.dev.pay(), c = myCafe();
      const code = CM.dev.payCode({ r: q.ref, c: c.id, k: q.plan, m: q.months, a: q.amt, p: q.per, t: q.ts });
      const msg = 'ขอเปิดใช้ ' + PLAN_NAME[q.plan] + (q.months === 12 ? ' (รายปี)' : ' (รายเดือน)') + ' ร้าน ' + c.name + ' ยอด ' + money(q.amt) + ' รหัสอ้างอิง ' + q.ref + '\n' + code;
      api.openSheet('<h2 id="sheetTitle">โอนเงินเพื่อเปิดใช้ ' + PLAN_NAME[q.plan] + '</h2><ul class="xp-lines">' + lineRow('ยอดที่ต้องโอน', money(q.amt)) + lineRow('รหัสอ้างอิง', esc(q.ref)) + '</ul>' + CM.dev.payBox() +
        '<ol class="pay-steps"><li>โอนยอดตามด้านบน</li><li>กด “คัดลอกข้อความ” แล้วส่งให้ผู้พัฒนาพร้อมสลิป' + (pi.contact ? ' ทาง ' + esc(pi.contact) : '') + '</li><li>ผู้พัฒนาตรวจว่าเงินเข้าแล้วจะส่ง <b>รหัสเปิดใช้งาน</b> ให้ — นำมาใส่ที่หน้าแพ็กเกจ</li></ol>' +
        '<button class="btn primary lg" data-act="copy-text" data-v="' + esc(msg) + '">คัดลอกข้อความส่งผู้พัฒนา</button><a class="btn ghost block" href="#/studio/plan">ไปใส่รหัสเปิดใช้งาน</a><button class="btn text block" data-act="close-sheet">ปิด</button>');
    }
    H['op-confirm'] = (el) => {
      const k = el.dataset.k, r = root();
      if (!r.trialUsed) { r.plan = k; r.period = opPeriod || r.period || 'year'; r.trialUsed = true; r.paid = false; r.trialEnd = Date.now() + OTRIAL * DAYMS; r.use = null; S.save(); api.closeSheet(true); refresh(); return toast('เปิดใช้ ' + PLAN_NAME[k] + ' แล้ว'); }
      const pp = payPlan(), req = { plan: k, per: pp.per, pay: pp.pay, months: pp.months, amt: pp.once ? OP[k].year : OP[k].month };
      if (!CM.dev.pay()) { activate(req); api.closeSheet(true); refresh(); return toast('เปิดใช้ ' + PLAN_NAME[k] + ' แล้ว (เดโม ไม่เก็บเงินจริง)'); }
      r.pending = Object.assign({ ref: 'CM-' + rand(5), ts: Date.now() }, req); S.save(); paySheet();
    };
    H['op-use'] = (el) => { const r = root(); r.use = el.dataset.k === 'free' ? 'free' : null; S.save(); refresh(); toast(el.dataset.k === 'free' ? 'ใช้ Starter แล้ว — สิทธิ์จากผู้พัฒนายังอยู่ กดเปลี่ยนกลับได้' : 'ใช้ ' + PLAN_NAME[heldPlan()] + ' แล้ว'); };
    H['op-pay-info'] = () => { if (root().pending) paySheet(); };
    H['op-pending-cancel'] = () => { root().pending = null; S.save(); api.render(true); toast('ยกเลิกคำขอแล้ว'); };
    // A code from the developer: payment confirmed (paid) or free access (grant)
    H['op-activate'] = async () => {
      const inp = document.getElementById('actCode'), msg = document.getElementById('actMsg'), r = root();
      const say = (t, bad) => { msg.textContent = t; msg.classList.toggle('bad', !!bad); };
      const res = await CM.dev.readToken(inp.value);
      if (res.err) return say(CM.dev.tokenError(res.err), true);
      const p = res.p, now = Date.now();
      if (p.t === 'prod') { const rr = CM.ent.applyToken(p); if (!rr.ok) return say(rr.msg, true); r.use = null; refresh(); return toast(rr.msg); }
      if (p.t !== 'studio') return say('รหัสนี้ใช้ที่ Profile → โค้ดของฉัน', true);
      if (p.c && p.c !== r.cafeId) return say('รหัสนี้ผูกกับร้านอื่น', true);
      if ((r.tok || []).includes(p.i)) return say('รหัสนี้ใช้ไปแล้วในเครื่องนี้', true);
      if (p.k === 'paid') activate({ plan: p.p, months: p.m, per: p.m >= 12 ? 'year' : 'month', pay: p.m >= 12 ? 'once' : 'monthly' });
      else if (p.k === 'grant') { r.grant = { plan: p.p, until: p.u || (p.d ? now + p.d * DAYMS : 0), id: p.i, n: p.n || '' }; r.use = null; }
      else return say(p.n || 'รหัสนี้ไม่มีผลกับแพ็กเกจ', true);
      r.tok = (r.tok || []).concat(p.i); S.save(); refresh(); toast(p.k === 'paid' ? 'ยืนยันการชำระเงินแล้ว — เปิดใช้ ' + PLAN_NAME[p.p] : 'ได้รับสิทธิ์ ' + PLAN_NAME[p.p] + ' ฟรีแล้ว');
    };
    H['op-downgrade'] = () => api.openSheet('<h2 id="sheetTitle">กลับไป Starter?</h2><ul class="xp-lines">' + orow('ข้อมูลร้าน เมนู อีเว้นท์', 'อยู่ครบ') + orow('Quest / Reward / Moment', 'พักไว้ (เปิดคืนได้)') + orow('การตัดเงินรอบถัดไป', 'ยกเลิก') + '</ul><button class="btn danger lg" data-act="op-downgrade-do">ยืนยัน</button><button class="btn text block" data-act="close-sheet">เก็บแพ็กเกจไว้</button>');
    H['op-downgrade-do'] = () => { const r = root(); r.plan = 'free'; r.paid = false; r.trialEnd = 0; r.paidUntil = 0; r.pending = null; if (heldPlan() !== 'free') r.use = 'free'; D.CAFES.forEach((c) => { const x = peek(c.id); if (x) x.boost = 0; }); S.save(); api.closeSheet(true); refresh(); toast('กลับเป็น Starter แล้ว — ข้อมูลอยู่ครบ'); };
    H['op-boost'] = () => { const r = rec(root().cafeId); r.boost = r.boost > Date.now() ? 0 : Date.now() + 7 * DAYMS; S.save(); api.render(true); toast(r.boost ? 'เปิด Boost 7 วัน (เดโม ไม่เก็บเงินจริง)' : 'ปิด Boost แล้ว'); };
    /* passport stamp editor: edits a draft, preview updates in place, "บันทึก" saves */
    const ppPreview = () => { const p = document.getElementById('ppPrev'); if (p && myCafe()) p.innerHTML = ppStamp(myCafe()); };
    const ppPress = (act, k) => document.querySelectorAll('[data-act=' + act + ']').forEach((b) => { const on = b.dataset.k === k; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    H['pp-shape'] = (el) => { pp.shape = el.dataset.k; ppPress('pp-shape', pp.shape); ppPreview(); };
    H['pp-icon'] = (el) => { pp.icon = el.dataset.k; ppPress('pp-icon', pp.icon); ppPreview(); };
    const ppField = (e) => { const k = e.target.dataset && e.target.dataset.pp; if (!k || !pp) return; pp[k] = k === 'visits' ? parseInt(e.target.value, 10) || 1 : e.target.value; ppPreview(); };
    document.addEventListener('input', ppField); document.addEventListener('change', ppField);
    H['pp-save'] = () => {
      const c = myCafe(), label = String(pp.label || '').trim().slice(0, 8);
      rec(c.id).passport = { label, color: pp.color && pp.color !== c.palette[0] ? pp.color : '', shape: pp.shape, icon: pp.icon, visits: pp.visits, drinkId: pp.drinkId || '', spotId: pp.spotId || '' };
      pp = null; touch(c.id); done('บันทึก Passport แล้ว — ลูกค้าเห็น stamp แบบใหม่ทันที');
    };
    H['pp-reset'] = () => { rec(root().cafeId).passport = null; pp = null; done('กลับไปใช้ stamp แบบมาตรฐานแล้ว'); };
    H['cd-add'] = () => {
      const r = rec(root().cafeId), code = val('cdCode').trim().toUpperCase(), gives = val('cdGives').trim(), until = val('cdUntil');
      if (!/^[A-Z0-9-]{4,16}$/.test(code)) return toast('โค้ดใช้ได้เฉพาะ A–Z ตัวเลข และ - (4–16 ตัว)');
      if (!gives) return toast('บอกด้วยว่าโค้ดนี้ได้อะไร');
      if (until && until < day()) return toast('วันหมดอายุต้องไม่ก่อนวันนี้');
      if (codeTaken(code)) return toast('โค้ดนี้ถูกใช้แล้ว ลองตั้งโค้ดอื่น');
      r.codes.push({ id: 'c' + Date.now(), code, gives, until: until || '' }); touch(root().cafeId); done('เพิ่มโค้ดแล้ว');
    };
    H['cd-del'] = (el) => { const r = rec(root().cafeId); r.codes = r.codes.filter((x) => x.id !== el.dataset.id); refresh(); };
    /* events */
    H['ev-new'] = () => { const c = myCafe(); if (rec(c.id).events.filter((e) => eventStatus(e) !== 'ended').length >= MAX_EV) { toast('จัดได้สูงสุด ' + MAX_EV + ' อีเว้นท์พร้อมกัน — รอให้งานเดิมจบหรือลบก่อน'); return; } ev = newDraft(); location.hash = '#/studio/new-event'; };
    H['ev-edit'] = (el) => { const e = rec(root().cafeId).events.find((x) => x.id === el.dataset.id); if (!e) return; ev = JSON.parse(JSON.stringify(e)); location.hash = '#/studio/edit-' + e.id; };
    H['ev-delete'] = (el) => { const r = rec(root().cafeId); r.events = r.events.filter((x) => x.id !== el.dataset.id); S.save(); api.render(true); toast('ลบอีเว้นท์แล้ว'); };
    H['ev-add'] = (el) => { ev[el.dataset.k].push(el.dataset.k === 'items' ? { name: '', price: '' } : el.dataset.k === 'sets' ? { name: '', price: '', includes: '' } : { name: '', rule: '', qty: '' }); api.render(true); };
    H['ev-del'] = (el) => { ev[el.dataset.k].splice(+el.dataset.i, 1); api.render(true); };
    H['ev-tag'] = (el) => { const k = el.dataset.k, i = ev.tags.indexOf(k); if (i >= 0) ev.tags.splice(i, 1); else ev.tags.push(k); el.classList.toggle('on', i < 0); el.setAttribute('aria-pressed', i < 0); };
    H['ev-save'] = () => {
      const c = myCafe(), r = rec(c.id);
      const num = (v) => { const n = parseInt(v, 10); return n > 0 ? n : 0; };
      const e = { id: ev.id, banner: ev.banner || '', title: ev.title.trim(), desc: ev.desc.trim(), type: ev.type, startDate: ev.startDate, endDate: ev.endDate, startTime: ev.startTime, endTime: ev.endTime, tags: ev.tags.slice(),
        items: ev.items.filter((x) => String(x.name).trim()).map((x) => ({ name: String(x.name).trim(), price: num(x.price) })),
        sets: ev.sets.filter((x) => String(x.name).trim()).map((x) => ({ name: String(x.name).trim(), price: num(x.price), includes: String(x.includes || '').trim() })),
        gives: ev.gives.filter((x) => String(x.name).trim()).map((x) => ({ name: String(x.name).trim(), rule: String(x.rule || '').trim(), qty: num(x.qty) })),
        code: String(ev.code || '').trim().toUpperCase(), codeGives: String(ev.codeGives || '').trim(), views: ev.views || 0, saves: ev.saves || 0 };
      if (!e.title) return toast('ใส่ชื่ออีเว้นท์ก่อนนะ');
      if (!e.startDate || !e.endDate || e.endDate < e.startDate) return toast('วันจบต้องไม่ก่อนวันเริ่ม');
      if (!e.startTime || !e.endTime || (e.startDate === e.endDate && toMin(e.endTime) <= toMin(e.startTime))) return toast('เวลาจบต้องหลังเวลาเริ่ม');
      if (!e.tags.length) return toast('เลือก Mood ที่เหมาะอย่างน้อย 1 อย่าง จะได้ส่งถึงคนที่ใช่');
      if (e.items.concat(e.sets).some((x) => !x.price)) return toast('เมนูและเซ็ตต้องใส่ราคา');
      if (e.code && !/^[A-Z0-9-]{4,16}$/.test(e.code)) return toast('โค้ดใช้ได้เฉพาะ A–Z ตัวเลข และ - (4–16 ตัว)');
      if (e.code && !e.codeGives) return toast('บอกด้วยว่าลูกค้าที่ใส่โค้ดนี้จะได้อะไร');
      if (e.code && codeTaken(e.code, e.id)) return toast('โค้ดนี้ถูกใช้แล้ว ลองตั้งโค้ดอื่น');
      const i = r.events.findIndex((x) => x.id === e.id), ev0 = i >= 0 ? r.events[i] : null;
      if (eventStatus(e) !== 'ended' && r.events.filter((x) => x.id !== e.id && eventStatus(x) !== 'ended').length >= MAX_EV) return toast('จัดได้สูงสุด ' + MAX_EV + ' อีเว้นท์พร้อมกัน — รอให้งานเดิมจบหรือลบก่อน');
      if (i >= 0) r.events[i] = e; else r.events.push(e);
      r.updates++;
      if (!S.save()) { if (i >= 0) r.events[i] = ev0; else r.events.pop(); toast('พื้นที่เก็บข้อมูลเต็ม — ลบรูปหรืออีเว้นท์เก่าก่อน (แอปจริงจะเก็บรูปบนเซิร์ฟเวอร์)'); return; }
      ev = null; location.hash = '#/studio/events'; toast('เผยแพร่แล้ว — ลูกค้าเห็นใน Events ทันที');
    };
    H['ev-fav'] = (el) => {
      const id = el.dataset.id, st = S.get(); st.savedEvents = st.savedEvents || [];
      const i = st.savedEvents.indexOf(id), on = i < 0;
      if (on) st.savedEvents.push(id); else st.savedEvents.splice(i, 1);
      for (const c of D.CAFES) { const r = peek(c.id), e = r && r.events && r.events.find((x) => x.id === id); if (e) e.saves = Math.max(0, (e.saves || 0) + (on ? 1 : -1)); }
      S.save(); api.render(true); toast(on ? 'บันทึกแล้ว เราจะเตือนก่อนงานเริ่ม' : 'เอาออกแล้ว');
    };
    H['ev-banner-clear'] = () => { ev.banner = ''; api.render(true); };
    document.addEventListener('change', (e) => {
      if (!e.target || e.target.id !== 'evBanner' || !ev) return;
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      readBanner(f).then((d) => { ev.banner = d; api.render(true); toast('ใส่แบนเนอร์แล้ว'); }).catch((m) => toast(String(m)));
    });
    document.addEventListener('input', (e) => {
      const t = e.target, path = t.dataset && t.dataset.ev;
      if (!path || !ev) return;
      const p = path.split('.'), val = t.type === 'number' ? t.value : t.value;
      if (p.length === 1) ev[p[0]] = val; else ev[p[0]][+p[1]][p[2]] = val;
      if (path === 'startDate' && ev.endDate < val) { ev.endDate = val; const ed = document.getElementById('ev-ed'); if (ed) ed.value = val; }
      if (path === 'startDate') { const ed = document.getElementById('ev-ed'); if (ed) ed.min = val; }
    });
    /* shop / owner / ledger */
    const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, PHONE = /^[0-9+\-\s]{9,16}$/, LINEID = /^@?[A-Za-z0-9._-]{4,20}$/;
    const bump = () => { S.save(); api.render(true); const n = document.querySelector('[data-count]'); if (n) { n.classList.remove('bump'); void n.offsetWidth; n.classList.add('bump'); } };
    H['st-cust'] = (el) => { const l = ledW(root().cafeId, el.dataset.day || day()); l.customers = Math.max(0, Math.min(99999, l.customers + +el.dataset.d)); bump(); };
    H['st-led-pick'] = (el) => { ledDay = el.dataset.d === day() ? '' : el.dataset.d; api.render(true); };
    H['st-led-type'] = (el) => { ledType = el.dataset.k; document.querySelectorAll('[data-act=st-led-type]').forEach((b) => { const on = b.dataset.k === ledType; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); }); };
    H['st-led-amt'] = (el) => { const i = document.getElementById('ledAmt'); i.value = el.dataset.v; i.focus(); };
    const addEntry = (day0, t, amtId, noteId) => {
      const amt = Math.round(parseFloat(val(amtId)) * 100) / 100;
      if (!(amt > 0) || amt > 999999) { toast('ใส่จำนวนเงินระหว่าง 1 – 999,999 บาท'); document.getElementById(amtId).focus(); return false; }
      const l = ledW(root().cafeId, day0);
      if (l.entries.length >= 200) { toast('วันนี้บันทึกครบ 200 รายการแล้ว'); return false; }
      l.entries.push({ id: 'l' + Date.now() + l.entries.length, t, amt, note: noteId ? val(noteId).trim().slice(0, 30) : '', ts: Date.now() });
      return true;
    };
    H['st-led-add'] = () => { if (addEntry(val('ledDayIn') || day(), ledType, 'ledAmt', 'ledNote')) { S.save(); api.render(true); toast(ledType === 'in' ? 'บันทึกรายรับแล้ว' : 'บันทึกรายจ่ายแล้ว'); } };
    H['st-led-del'] = (el) => { const l = ledW(root().cafeId, el.dataset.day); l.entries = l.entries.filter((e) => e.id !== el.dataset.id); S.save(); api.render(true); toast('ลบรายการแล้ว'); };
    H['st-inc-sheet'] = () => api.openSheet('<h2 id="sheetTitle">บันทึกรายรับวันนี้</h2><div class="field"><label for="qiAmt">จำนวนเงิน (฿)</label><input id="qiAmt" type="number" min="1" max="999999" step="any" inputmode="decimal" placeholder="เช่น 120"></div>' +
      '<div class="chips-q" role="group" aria-label="จำนวนที่ใช้บ่อย">' + [50, 100, 200, 500].map((n) => '<button class="fchip" data-act="st-qi-amt" data-v="' + n + '">฿' + n + '</button>').join('') + '</div>' +
      '<button class="btn primary lg" data-act="st-inc-save">บันทึกรายรับ</button><button class="btn text block" data-act="close-sheet">ยกเลิก</button>');
    H['st-qi-amt'] = (el) => { const i = document.getElementById('qiAmt'); i.value = el.dataset.v; i.focus(); };
    H['st-inc-save'] = () => { if (addEntry(day(), 'in', 'qiAmt', null)) { api.closeSheet(true); S.save(); api.render(true); toast('บันทึกรายรับแล้ว'); } };
    H['st-open'] = (el) => { sRec(root().cafeId).open = el.dataset.k; touch(root().cafeId); done(el.dataset.k === 'closed' ? 'ตั้งเป็นปิดชั่วคราวแล้ว — ลูกค้าเห็นทันที' : el.dataset.k === 'open' ? 'ตั้งเป็นเปิดอยู่แล้ว — ลูกค้าเห็นทันที' : 'ใช้เวลาเปิด–ปิดปกติแล้ว'); };
    H['st-shop-save'] = () => { const sh = sRec(root().cafeId); sh.name = val('shopName').trim().slice(0, 40); sh.tagline = val('shopTag').trim().slice(0, 80); touch(root().cafeId); done('บันทึกโปรไฟล์ร้านแล้ว — ลูกค้าเห็นทันที'); };
    H['shop-banner-clear'] = () => { sRec(root().cafeId).banner = ''; done('ลบแบนเนอร์แล้ว'); };
    H['st-owner-save'] = () => {
      const msg = document.getElementById('owMsg'), bad = (t, id) => { msg.textContent = t; msg.classList.add('bad'); document.getElementById(id).focus(); };
      const email = val('owEmail').trim(), phone = val('owPhone').trim(), line = val('owLine').trim();
      if (phone && !PHONE.test(phone)) return bad('เบอร์โทรควรมี 9–16 หลัก', 'owPhone');
      if (email && !EMAIL.test(email)) return bad('อีเมลดูไม่ถูกต้อง ลองตรวจอีกครั้ง', 'owEmail');
      if (line && !LINEID.test(line)) return bad('LINE ID ใช้ได้เฉพาะ a–z ตัวเลข . _ - (4–20 ตัว)', 'owLine');
      rec(root().cafeId).owner = Object.assign(ownerOf(root().cafeId), { name: val('owName').trim().slice(0, 40), role: val('owRole'), phone, email, line, bio: val('owBio').trim().slice(0, 200) });
      touch(root().cafeId); S.save(); api.render(true); toast('บันทึกโปรไฟล์เจ้าของร้านแล้ว');
    };
    document.addEventListener('change', (e) => {
      if (!e.target || e.target.id !== 'shopBanner') return;
      const f = e.target.files && e.target.files[0], c = myCafe();
      if (!f || !c) return;
      readBanner(f).then((d) => {
        const sh = sRec(c.id), prev = sh.banner; sh.banner = d;
        if (!S.save()) { sh.banner = prev; toast('พื้นที่เก็บข้อมูลเต็ม — ลบรูปหรืออีเว้นท์เก่าก่อน'); return; }
        touch(c.id); refresh(); toast('เปลี่ยนแบนเนอร์แล้ว — ลูกค้าเห็นทันที');
      }).catch((m) => toast(String(m)));
    });
    document.addEventListener('toggle', (e) => { const d = e.target; if (d && d.dataset && d.dataset.fold) { if (d.open) openF.add(d.dataset.fold); else openF.delete(d.dataset.fold); } }, true);
    H['nav-go'] = (el) => { const c = D.CAFE_BY_ID[el.dataset.id]; trackKey(c.id, 'navs'); window.open('https://www.google.com/maps/dir/?api=1&destination=' + c.lat + ',' + c.lon + (c.gid ? '&destination_place_id=' + encodeURIComponent(c.gid) : '') + '&travelmode=driving', '_blank', 'noopener'); };   // opens Google Maps with the café as the destination, ready to start

    document.addEventListener('change', (e) => {
      const t = e.target, k = t.dataset && t.dataset.st;
      if (!k) return;
      const c = myCafe(); if (!c) return;
      const r = rec(c.id);
      if (k === 'price') { const p = parseInt(t.value, 10); if (p > 0) { r.priceOver[t.dataset.id] = p; r.extraDrinks.forEach((d) => { if (d.id === t.dataset.id) d.price = p; }); touch(c.id); done('อัปเดตราคาแล้ว'); } }
      if (k === 'spot') { if (/^\d{1,2}:\d{2}[–-]\d{1,2}:\d{2}$/.test(t.value.trim())) { r.spotOver[t.dataset.id] = t.value.trim().replace('-', '–'); r.extraSpots.forEach((s) => { if (s.id === t.dataset.id) s.best = r.spotOver[s.id]; }); touch(c.id); done('อัปเดตเวลาแสงแล้ว'); } else toast('ใช้รูปแบบ 15:00–17:00'); }
      if (k === 'dna') { r.claims[t.dataset.k] = +t.value; touch(c.id); done('บันทึก DNA แล้ว — ระบบรวมกับข้อมูลชุมชน'); }
    });
  }

  CM.studio = { install, apply, view, track: trackKey, badgesHtml, liveChip, liveBanner, pickCard, questCard, rewardCard, facilitiesHtml, dnaHtml,
    questFor, rewardFor, momentsFor, isVerified, myCafe,
    eventsAll, eventById, eventByCode, eventStatus, eventsRelevant, isSaved, trackEvent, typeLabel, passStatus, passEarned, passAward, passportCard, lookupCode, resetUse: () => { root().use = null; S.save(); }, pubReset: () => { Object.keys(pubCache).forEach((k) => delete pubCache[k]); }, readImage, TYPE_COLORS, TYPE_TH };
})();
