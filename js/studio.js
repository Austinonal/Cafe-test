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
    stats: { views: 0, navs: 0, checkins: 0 }, updates: 0 });
  const root = () => S.get().studio;
  const peek = (id) => root().byCafe[id] || null;
  function rec(id) { const r = root(); if (!r.byCafe[id]) r.byCafe[id] = blank(); return r.byCafe[id]; }
  const myCafe = () => D.CAFE_BY_ID[root().cafeId] || null;
  const isOfficial = (c) => OFFICIAL.has(c.id);
  const isVerified = (c) => { const r = peek(c.id); return !!(r && r.verified) || isOfficial(c) || (c.id !== root().cafeId && hash(c.id + 'ver') < .6); };
  const seededFor = (c) => c.id !== root().cafeId && isVerified(c);

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
      if (!c.base) { c.base = Object.assign({}, c.attr); c.hours0 = c.hours.slice(); c.drinks0 = c.drinks.slice(); c.spots0 = c.spots.map((s) => Object.assign({}, s)); }
      const r = peek(c.id) || blank();
      D.DIMS.forEach((d) => { c.attr[d] = c.base[d]; });
      Object.keys(r.claims).forEach((d) => { c.attr[d] = Math.round(clamp(r.claims[d] / 10, c.base[d] - 2, c.base[d] + 2) * 1) ; c.attr[d] = clamp(c.attr[d], 0, 10); });
      c.hours = r.hours ? r.hours.slice() : c.hours0.slice();
      c.drinks = c.drinks0.filter((d) => !r.off[d.id]).map((d) => Object.assign({}, d, { price: r.priceOver[d.id] != null ? r.priceOver[d.id] : d.price }))
        .concat(r.extraDrinks.filter((d) => !r.off[d.id]));
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
  function momentsFor(ses) {
    const all = SEED_MOMENTS.filter((m) => m.cafeId !== root().cafeId).concat(
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
    ].filter((e) => e.cafeId !== root().cafeId);
  }
  function eventsAll() {
    const own = D.CAFES.reduce((a, c) => { const r = peek(c.id); return r && r.events ? a.concat(r.events.map((e) => Object.assign({ cafeId: c.id }, e))) : a; }, []);
    return seededEvents().concat(own);
  }
  const eventById = (id) => eventsAll().find((e) => e.id === id) || null;
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
    return '<span class="live live-' + l.status + '"><i aria-hidden="true"></i>' + STATUS[l.status] + ' · ว่าง ' + l.seats + ' ที่นั่ง</span>';
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
  function planNow() {
    const r = root();
    if (r.plan && r.plan !== 'free' && !r.paid && r.trialEnd && r.trialEnd < Date.now()) { r.plan = 'free'; r.trialEnd = 0; S.save(); }
    return r.plan || 'free';
  }
  const isPro = () => planNow() !== 'free';
  const lockCard = (what) => '<div class="card lock-card">' + I('lock', 22) + '<div><b>' + what + ' อยู่ในแพ็กเกจ Pro</b><p class="muted small">ทดลองฟรี ' + OTRIAL + ' วัน ไม่ต้องผูกบัตร</p></div><a class="btn primary sm" href="#/studio/plan">ดูแพ็กเกจ</a></div>';
  const stHead = (c, title, sub) => {
    const lv = level(c);
    return '<header class="hero-top ambient"><div class="topbar between"><span class="brand">' + I('coffee', 20) + 'Café Studio</span><a class="wchip" href="#/home">' + I('user', 18) + 'โหมดลูกค้า</a></div>' +
      '<h1 class="display sm">' + esc(title) + '</h1>' + (sub ? '<p class="lead sm">' + sub + '</p>' : '') +
      '<div class="badges">' + badgesHtml(c) + '<span class="badge">' + I('trophy', 13) + 'Lv.' + lv.lv + ' · ' + lv.tier + '</span><a class="badge" href="#/studio/plan">' + planLabel() + ' · แพ็กเกจ</a></div></header>';
  };
  const sw = (on, act, k, label) => '<button class="switch" role="switch" aria-checked="' + on + '" aria-label="' + esc(label) + '" data-act="' + act + '" data-k="' + k + '"><i></i></button>';

  function chooseCafe() {
    const list = D.CAFES.map((c) => '<button class="mini-row" data-act="st-login" data-id="' + c.id + '"><span class="mr-art thumbbox">' + A.coverArt(c) + '</span><span><b>' + esc(c.name) + '</b><small>' + esc(c.area) + '</small></span>' + I('chevron-right', 18) + '</button>').join('');
    return { nav: false, html: '<header class="hero-top ambient"><div class="topbar between"><span class="brand">' + I('coffee', 20) + 'Café Studio</span><a class="wchip" href="#/home">กลับโหมดลูกค้า</a></div>' +
      '<h1 class="display sm">สำหรับเจ้าของร้าน</h1><p class="lead sm">จัดการร้าน อัปเดตสถานะ สร้าง Quest และดู Insight — สิ่งที่ตั้งไว้ที่นี่ลูกค้าเห็นในแอปทันที</p></header>' +
      '<section class="pad rise"><div class="card"><b>เดโม:</b> ยังไม่มีระบบล็อกอิน เลือกร้านที่ต้องการลองจัดการได้เลย (ในแอปจริงจะผูกกับบัญชีและต้องยืนยันความเป็นเจ้าของ)</div><div class="list">' + list + '</div></section>' };
  }

  function tToday(c) {
    const r = rec(c.id), t = day(), l = c.live || {};
    const status = r.status && Date.now() - r.statusTs < 3 * 3600e3 ? r.status : null;
    const seats = status ? r.seats : null;
    const sb = ['quiet', 'moderate', 'busy'].map((k) => '<button class="stbtn st-' + k + (status === k ? ' on' : '') + '" data-act="st-status" data-k="' + k + '" aria-pressed="' + (status === k) + '"><i aria-hidden="true"></i>' + STATUS[k] + '<small>' + STATUS_TH[k] + '</small></button>').join('');
    const moods = D.OWNER_MOODS.map((m) => '<button class="fchip' + (r.mood === m[0] && r.moodDay === t ? ' on' : '') + '" data-act="st-mood" data-k="' + m[0] + '" aria-pressed="' + (r.mood === m[0] && r.moodDay === t) + '">' + m[1] + '</button>').join('');
    const pk = r.pickDay === t ? r.pick : null;
    const drinks = c.drinks.map((d) => '<label class="radio-card"><input type="radio" name="pickDrink" value="' + d.id + '"' + (pk && pk.drinkId === d.id ? ' checked' : '') + '><span><b>' + esc(d.name) + '</b><small>฿' + d.price + ' · ' + TYPE_TH[d.type] + '</small></span></label>').join('');
    return stHead(c, c.name, 'อัปเดตสิ่งที่เกิดขึ้นที่ร้านตอนนี้ — ลูกค้าเห็นทันที') +
      '<section class="pad rise">' +
      '<div class="card"><h2 class="sec-title first">' + I('users', 20) + 'สถานะร้านตอนนี้</h2><div class="stbtns" role="group" aria-label="สถานะร้าน">' + sb + '</div>' +
      '<div class="stepper"><span>ที่นั่งว่าง</span><button class="iconbtn" data-act="st-seats" data-d="-1" aria-label="ลดที่นั่งว่าง">−</button><b aria-live="polite">' + (seats == null ? '–' : seats) + '</b><button class="iconbtn" data-act="st-seats" data-d="1" aria-label="เพิ่มที่นั่งว่าง">+</button></div>' +
      '<p class="muted small">ลูกค้าเห็น: ' + (l.status ? liveChip(c) : 'ยังไม่ได้ตั้งสถานะ') + '</p></div>' +
      '<div class="card"><h2 class="sec-title first">' + I('sparkles', 20) + 'Owner Mood วันนี้</h2><p class="muted small">ร้านของคุณวันนี้เป็นยังไง? ถ้าตรงกับ Mood และอากาศของลูกค้า ระบบจะดันร้านให้เล็กน้อย (ไม่ใช่การซื้ออันดับ)</p><div class="fchips" role="group" aria-label="Owner mood">' + moods + '</div></div>' +
      '<div class="card"><h2 class="sec-title first">' + I('cup', 20) + 'Owner’s Pick — Today’s Special</h2><div class="radios">' + drinks + '</div>' +
      '<div class="field two"><label for="pickPrice">ราคาวันนี้ (฿)</label><input id="pickPrice" type="number" min="0" max="999" inputmode="numeric" value="' + (pk ? pk.price : '') + '" placeholder="เช่น 145"></div>' +
      '<div class="field two"><label for="pickNote">ข้อความจากร้าน</label><input id="pickNote" type="text" maxlength="60" value="' + esc(pk ? pk.note : '') + '" placeholder="เมนูที่เจ้าของร้านอยากให้ลองวันนี้"></div>' +
      '<div class="row2"><button class="btn primary" data-act="st-pick-save">บันทึก</button>' + (pk ? '<button class="btn ghost" data-act="st-pick-clear">ยกเลิก</button>' : '') + '</div></div>' +
      '<a class="btn ghost block" href="#/cafe/' + c.id + '">ดูหน้าร้านแบบที่ลูกค้าเห็น ' + I('chevron-right', 18) + '</a>' +
      '<button class="btn text block" data-act="st-switch">เปลี่ยนร้านที่จัดการ</button></section>';
  }

  function tCafe(c) {
    const r = rec(c.id), info = infoOf(c);
    const fac = FACILITIES.map((f) => { const x = facility(c, f[0]); return '<div class="set-row"><div><b>' + f[1] + '</b><small>' + (info[f[0]] ? 'ความมั่นใจ ' + x.conf + '% (ร้าน + ผู้ใช้ + รีวิว)' : 'ไม่มี') + '</small></div>' + sw(!!info[f[0]], 'st-fac', f[0], f[1]) + '</div>'; }).join('');
    const menu = c.drinks0.concat(r.extraDrinks).map((d) => '<div class="menu-row' + (r.off[d.id] ? ' off' : '') + '"><div><b>' + esc(d.name) + '</b><small>' + TYPE_TH[d.type] + (r.off[d.id] ? ' · ซ่อน/หมด' : '') + '</small></div>' +
      '<label class="sr" for="pr-' + d.id.replace(/[:]/g, '-') + '">ราคา ' + esc(d.name) + '</label><input class="pr" id="pr-' + d.id.replace(/[:]/g, '-') + '" type="number" min="0" max="999" data-st="price" data-id="' + d.id + '" value="' + (r.priceOver[d.id] != null ? r.priceOver[d.id] : d.price) + '">' +
      '<button class="btn ghost sm" data-act="st-drink-off" data-id="' + d.id + '">' + (r.off[d.id] ? 'แสดง' : 'หมด') + '</button></div>').join('');
    const spots = c.spots.map((s) => '<div class="menu-row"><div><b>' + esc(s.name) + '</b><small>' + (s.owner ? 'ร้านระบุเวลา' : 'ข้อมูลระบบ') + '</small></div><label class="sr" for="sp-' + s.id.replace(/[:]/g, '-') + '">เวลาที่แสงดี ' + esc(s.name) + '</label><input class="tm" id="sp-' + s.id.replace(/[:]/g, '-') + '" type="text" data-st="spot" data-id="' + s.id + '" value="' + esc(s.best) + '" placeholder="15:00–17:00"></div>').join('');
    const dna = isPro() ? DNA_KEYS.map((d) => {
      const base = c.base[d] * 10, claim = r.claims[d] != null ? r.claims[d] : Math.round(base), fin = c.attr[d] * 10;
      return '<div class="dna"><label for="dna-' + d + '"><b>' + D.DIM_TH[d] + '</b><span>ร้านบอก ' + claim + '</span></label><input id="dna-' + d + '" type="range" min="0" max="100" step="5" data-st="dna" data-k="' + d + '" value="' + claim + '"><small>ชุมชน/ระบบ ' + Math.round(base) + ' → แสดงผล <b>' + fin + '</b>' + (Math.abs(claim - base) > 20 ? ' (ระบบปรับให้อยู่ใน ±20)' : '') + '</small></div>';
    }).join('') : lockCard('Advanced Café DNA');
    const lv = level(c);
    return stHead(c, 'จัดการข้อมูลร้าน') + '<section class="pad rise">' +
      '<div class="card"><h2 class="sec-title first">' + I('badge-check', 20) + 'Verified</h2><p class="small">ข้อมูลครบ ' + Math.round(lv.data * 100) + '%</p>' +
      (isVerified(c) ? '<p class="good">' + I('check', 16) + 'ร้านของคุณได้รับ Verified แล้ว</p>' : '<button class="btn primary" data-act="st-verify"' + (lv.data >= .5 ? '' : ' disabled') + '>ยืนยันข้อมูลร้าน</button>' + (lv.data >= .5 ? '' : '<p class="muted small">ต้องกรอกข้อมูลให้ครบอย่างน้อย 50% (ดูรายการที่ Insights)</p>')) + '</div>' +
      '<h2 class="sec-title">Facilities</h2><div class="card settings">' + fac + '</div>' +
      '<h2 class="sec-title">เวลาเปิด–ปิด</h2><div class="card"><div class="hours"><div class="field"><label for="hOpen">เปิด (ชม.)</label><input id="hOpen" type="number" min="0" max="23.5" step="0.5" value="' + c.hours[0] + '"></div><div class="field"><label for="hClose">ปิด (ชม.)</label><input id="hClose" type="number" min="1" max="28" step="0.5" value="' + c.hours[1] + '"></div></div><p class="muted small">ปิดหลังเที่ยงคืน ใส่ 25 = 01:00</p><button class="btn ghost sm" data-act="st-hours-save">บันทึกเวลา</button></div>' +
      '<h2 class="sec-title">เมนู & ราคา</h2><div class="card">' + menu + '<button class="btn ghost block" data-act="st-drink-add">+ เพิ่มเมนู</button></div>' +
      '<h2 class="sec-title">Photo Spots & เวลาแสงสวย</h2><div class="card">' + spots + '<button class="btn ghost block" data-act="st-spot-add">+ เพิ่มจุดถ่ายรูป</button></div>' +
      '<h2 class="sec-title">Café DNA</h2><p class="muted small">ร้านกำหนดได้ แต่ระบบรวมกับข้อมูลชุมชนและรีวิว — ปรับได้ไม่เกิน ±20 จากข้อมูลจริง</p>' + dna +
      '<p class="muted small">รูปภาพร้าน: ยังไม่มีในเดโม (แอปจริงอัปโหลดได้)</p></section>';
  }

  function tPromote(c) {
    const r = rec(c.id);
    if (!isPro()) return stHead(c, 'Promote') + '<section class="pad">' + lockCard('Café Quest, Passport Reward และ Café Moment') + '</section>';
    const q = r.quest || { on: false, drinkId: c.drinks[0] && c.drinks[0].id, spotId: c.spots[0] && c.spots[0].id, xp: 50 };
    const opt = (list, sel, none) => (none ? '<option value="">' + none + '</option>' : '') + list.map((x) => '<option value="' + x.id + '"' + (x.id === sel ? ' selected' : '') + '>' + esc(x.name) + '</option>').join('');
    const rw = r.reward || { on: false, need: 3, text: 'ลด ฿20' };
    const moments = r.moments.map((m) => '<li><div><b>' + esc(m.title) + '</b><small>' + esc(m.body) + '</small></div><button class="btn ghost sm" data-act="st-moment-del" data-id="' + m.id + '" aria-label="ลบ ' + esc(m.title) + '">ลบ</button></li>').join('');
    return stHead(c, 'Promote', 'สร้างเหตุผลให้คนมาร้านคุณ — แบบไม่รก') + '<section class="pad rise">' +
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
    const stats = [['Views', a.views], ['Profile Visits', a.profile], ['Navigation', a.navs], ['Check-ins', a.checkins]].map((s) => '<div class="stat"><b>' + s[1].toLocaleString('en-US') + '</b><span>' + s[0] + '</span></div>').join('');
    const moods = a.moods.map((m) => '<li><span class="mlab">' + I(m.icon, 16) + m.label + '</span><span class="bar" aria-hidden="true"><i style="width:' + m.pct + '%"></i></span><b>' + m.pct + '%</b></li>').join('');
    const hrs = a.hours.map((h) => '<span class="hb" style="height:' + Math.max(6, h.v) + '%" title="' + h.h + ':00"></span>').join('');
    const top = a.moods[0];
    const insight = isPro()
      ? '<div class="card insight"><small class="kicker">' + I('sparkles', 14) + ' Today’s Insight</small><p>คนค้นหาร้านคุณ<b>เพิ่มขึ้น ' + a.trend + '%</b> จากสัปดาห์ก่อน</p><p>กลุ่มที่สนใจมากที่สุดคือ <b>' + top.label + ' Seekers</b> (' + top.pct + '%) ช่วงเวลาที่คนสนใจมากที่สุด <b>' + a.peak[0] + ':00–' + a.peak[1] + ':00</b></p><p class="rec"><b>แนะนำ:</b> ' + (top.id === 'photo' ? 'ตั้ง Photo Spot Promotion และ Café Moment ช่วงบ่าย' : top.id === 'coffee' ? 'ตั้ง Owner’s Pick เป็นกาแฟล็อตพิเศษช่วงเช้า' : top.id === 'work' ? 'อัปเดตสถานะที่นั่งว่างและปลั๊กไฟให้สม่ำเสมอ' : 'ตั้ง Owner Mood เป็น Calm/Cozy ในช่วงที่คนสนใจ') + '</p></div>'
      : lockCard('AI Insights และ Customer Trends');
    const lvl = '<div class="card"><div class="lv-h"><b>Café Level ' + lv.lv + ' / 12</b><span>' + lv.tier + '</span></div><div class="progress" role="progressbar" aria-label="คะแนนร้าน" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + lv.score + '"><span style="width:' + lv.score + '%"></span></div>' +
      '<p class="muted small">' + (lv.next ? 'อีก ' + (lv.next[0] - lv.score) + ' คะแนนถึง ' + lv.next[1] : 'ระดับสูงสุดแล้ว') + ' · วัดจากความถูกต้องของข้อมูล การอัปเดต ความพึงพอใจ ลูกค้ากลับมาซ้ำ และการร่วม Quest — ไม่ได้ดูแค่ Rating</p>' +
      '<ul class="checks">' + lv.checks.map((x) => '<li class="' + (x[1] ? 'done' : '') + '">' + I(x[1] ? 'check' : 'plus', 16) + esc(x[0]) + '</li>').join('') + '</ul></div>';
    return stHead(c, 'Café Analytics') + '<section class="pad rise"><p class="muted small">ตัวเลขเป็นข้อมูลตัวอย่างเพื่อสาธิต (ยอดดู/นำทาง/Check-in ที่เกิดจริงในเดโมนี้ถูกนับรวมให้)</p><div class="stat-grid">' + stats + '</div>' +
      '<h2 class="sec-title">Top Customer Mood</h2><ul class="mood-bars card">' + moods + '</ul>' +
      '<h2 class="sec-title">ช่วงเวลาที่คนสนใจ</h2><div class="card"><div class="hourbars" role="img" aria-label="ช่วงเวลาที่คนสนใจมากที่สุด ' + a.peak[0] + ' ถึง ' + a.peak[1] + ' นาฬิกา">' + hrs + '</div><div class="hlabels"><span>08:00</span><span>14:00</span><span>21:00</span></div></div>' +
      '<h2 class="sec-title">AI Insight</h2>' + insight + '<h2 class="sec-title">Café Reputation</h2>' + lvl + '</section>';
  }

  /* ----- Plans (owner subscription) ----- */
  const OP = { pro: { month: 590, year: 5900 }, group: { month: 1490, year: 14900 } };   // yearly = pay 10, get 12
  const BOOST = 199, OTRIAL = 14, DAYMS = 864e5;
  const PLAN_NAME = { free: 'Starter', pro: 'Pro', group: 'Group' };
  let opPeriod = null;
  const money = (n) => '฿' + n.toLocaleString('en-US');
  const dateTh = (ts) => new Date(ts).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
  function planInfo() {
    const r = root(), p = planNow(), days = p !== 'free' && !r.paid && r.trialEnd > Date.now() ? Math.ceil((r.trialEnd - Date.now()) / DAYMS) : 0;
    return { plan: p, trialing: days > 0, days, paid: !!r.paid, period: r.period || 'year' };
  }
  const planLabel = () => { const i = planInfo(); return i.plan === 'free' ? 'Starter' : PLAN_NAME[i.plan] + (i.trialing ? ' · ทดลองเหลือ ' + i.days + ' วัน' : ''); };

  function tPlan(c) {
    const pi = planInfo(), per = opPeriod || pi.period, r = rec(c.id), boosted = r.boost && r.boost > Date.now();
    const trialFree = !root().trialUsed;
    const tier = (k, name, tag, priceHtml, sub, items, extra) => {
      const cur = pi.plan === k;
      const cta = cur ? '<button class="btn ghost block" disabled>แพ็กเกจปัจจุบัน</button>'
        : k === 'free' ? (pi.plan !== 'free' ? '<button class="btn text block" data-act="op-downgrade">กลับไป Starter</button>' : '')
        : '<button class="btn ' + (k === 'pro' ? 'primary' : 'ghost') + ' block" data-act="op-choose" data-k="' + k + '">' + (trialFree ? 'ทดลองฟรี ' + OTRIAL + ' วัน' : 'สมัคร ' + name) + '</button>';
      return '<div class="card plan' + (cur ? ' cur' : '') + (k === 'pro' ? ' hl' : '') + '">' + (tag ? '<span class="plan-tag">' + tag + '</span>' : '') +
        '<h2 class="sec-title first">' + name + '</h2><div class="pr-main"><b>' + priceHtml + '</b></div><p class="pr-sub">' + sub + '</p>' +
        '<ul>' + items.map((x) => '<li>' + I('check', 15) + x + '</li>').join('') + '</ul>' + (extra || '') + cta + '</div>';
    };
    const perTxt = (k) => (per === 'year' ? money(Math.round(OP[k].year / 12)) + '<span> / เดือน</span>' : money(OP[k].month) + '<span> / เดือน</span>');
    const perSub = (k) => (per === 'year' ? 'จ่าย ' + money(OP[k].year) + ' ต่อปี — จ่าย 10 เดือน ใช้ 12 เดือน (ประหยัด ' + money(OP[k].month * 2) + ')' : '≈ ' + money(Math.round(OP[k].month / 30)) + ' ต่อวัน · ยกเลิกเมื่อไหร่ก็ได้');
    const banner = pi.trialing
      ? '<div class="card"><b>Pro ทดลองฟรี — เหลือ ' + pi.days + ' วัน</b><div class="progress" role="progressbar" aria-label="วันที่ทดลองใช้" aria-valuemin="0" aria-valuemax="' + OTRIAL + '" aria-valuenow="' + (OTRIAL - pi.days) + '"><span style="width:' + (OTRIAL - pi.days) / OTRIAL * 100 + '%"></span></div><p class="muted small">หมดช่วงทดลองแล้วระบบกลับเป็น Starter อัตโนมัติ — ไม่ผูกบัตร ไม่เก็บเงิน และข้อมูลทั้งหมดอยู่ครบ</p></div>'
      : pi.plan !== 'free' ? '<div class="card"><b>แพ็กเกจ ' + PLAN_NAME[pi.plan] + '</b><p class="muted small">ต่ออายุตามรอบ ' + (pi.period === 'year' ? 'รายปี' : 'รายเดือน') + ' · กลับไป Starter ได้ทุกเมื่อ</p></div>' : '';
    return stHead(c, 'แพ็กเกจ', 'ใช้ Starter ฟรีได้ตลอด — อัปเกรดเมื่อพร้อมโตเท่านั้น') + '<section class="pad rise">' + banner +
      '<div class="seg" role="radiogroup" aria-label="รอบการชำระ"><button role="radio" aria-checked="' + (per === 'year') + '" class="' + (per === 'year' ? 'on' : '') + '" data-act="op-period" data-k="year">รายปี <em>จ่าย 10 ใช้ 12</em></button><button role="radio" aria-checked="' + (per === 'month') + '" class="' + (per === 'month' ? 'on' : '') + '" data-act="op-period" data-k="month">รายเดือน</button></div>' +
      tier('free', 'Starter', '', '฿0', 'ฟรีตลอด ไม่ต้องใช้บัตร', ['Profile ร้าน เมนู ราคา Photo Spot', 'สถานะร้านสด, Owner Mood, Owner’s Pick', 'รับ Check-in + Verified', 'อีเว้นท์ครั้งละ 1 งาน', 'สถิติพื้นฐาน']) +
      tier('pro', 'Pro', 'คุ้มที่สุดสำหรับร้านเดี่ยว', perTxt('pro'), perSub('pro'), ['ทุกอย่างใน Starter', 'อีเว้นท์ไม่จำกัด', 'Café Quest + Passport Reward', 'Café Moment ส่งตรงกลุ่ม', 'Analytics เต็ม + AI Insight', 'Advanced Café DNA']) +
      tier('group', 'Group', 'สำหรับหลายสาขา', perTxt('group'), perSub('group'), ['ทุกอย่างใน Pro', 'จัดการได้ถึง 5 สาขา', 'ทีมงาน 5 คน แยกสิทธิ์', 'ส่งออกรายงาน CSV']) +
      '<div class="card boost"><div class="set-row"><div><h2 class="sec-title first">' + I('bolt', 20) + 'Café Moment Boost</h2><p class="muted small">เพิ่ม 1 ช่อง “Sponsored” ใน Café Moment ให้คนที่ Mood ตรงกับงานของคุณ</p></div>' +
      (pi.plan !== 'free' ? sw(!!boosted, 'op-boost', 'b', 'เปิด Boost') : '') + '</div><p class="small"><b>' + money(BOOST) + ' / สัปดาห์</b>' + (boosted ? ' · เปิดถึง ' + dateTh(r.boost) : '') + '</p>' +
      (pi.plan === 'free' ? '<p class="muted small">ใช้ได้กับ Pro ขึ้นไป</p>' : '') + '<p class="muted small">ติดป้าย Sponsored ชัดเจน, มีได้ไม่เกิน 1 ช่องต่อหน้า และ <b>ไม่เปลี่ยนอันดับร้านในผลแนะนำ</b></p></div>' +
      '<div class="card fair">' + I('badge-check', 18) + '<p><b>สัญญาความเป็นกลาง:</b> ไม่มีแพ็กเกจไหนซื้ออันดับได้ อันดับมาจาก Mood × Personality × Weather ของลูกค้าเท่านั้น</p></div>' +
      '<p class="muted small">ราคาเป็นตัวอย่างในเดโม ไม่มีการเรียกเก็บเงินจริง</p></section>';
  }

  /* ----- Events tab + editor ----- */
  let ev = null;   // the event being edited (draft)
  // Crop to 16:9, scale to 1200×675 and re-encode as JPEG so it fits in browser storage.
  function readBanner(file) {
    return new Promise((resolve, reject) => {
      if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) return reject('ใช้ไฟล์ PNG, JPG หรือ WebP นะ');
      if (file.size > 10 * 1024 * 1024) return reject('ไฟล์ใหญ่เกิน 10MB');
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        const W = 1200, H = 675, cv = document.createElement('canvas');
        cv.width = W; cv.height = H;
        const s = Math.max(W / img.width, H / img.height), w = img.width * s, h = img.height * s;
        cv.getContext('2d').drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
        URL.revokeObjectURL(url);
        let q = .82, d = cv.toDataURL('image/jpeg', q);
        while (d.length > 380000 && q > .4) { q -= .1; d = cv.toDataURL('image/jpeg', q); }
        resolve(d);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject('อ่านรูปนี้ไม่ได้'); };
      img.src = url;
    });
  }
  const newDraft = () => ({ id: 'e' + Date.now(), banner: '', title: '', desc: '', type: 'live', startDate: localDay(0), endDate: localDay(0), startTime: '18:00', endTime: '20:00', tags: [], items: [], sets: [], gives: [], views: 0, saves: 0 });
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
    return stHead(c, 'Events', 'ประกาศอีเว้นท์ของร้าน พร้อมเมนู เซ็ต และของแจก — ขึ้นใน Home / Discover / หน้าร้านของลูกค้า') + '<section class="pad rise">' +
      '<button class="btn primary lg" data-act="ev-new">' + I('plus', 20) + 'สร้างอีเว้นท์</button>' +
      (isPro() ? '' : '<p class="muted small">แพ็กเกจ Free จัดได้ครั้งละ 1 อีเว้นท์ (ตอนนี้ ' + active + '/1) — Pro จัดได้ไม่จำกัด</p>') +
      (list || '<div class="card empty"><p><b>ยังไม่มีอีเว้นท์</b></p><p class="muted">ลองสร้างงานแรก เช่น ดนตรีสด เวิร์กช็อป หรือเมนูหน้าฝน</p></div>') + '</section>';
  }

  function tEventEdit(c) {
    const isNew = !c || !rec(c.id).events.some((e) => e.id === ev.id);
    const get = (p) => { const v = p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), ev); return v == null ? '' : v; };
    const fld = (id, label, path, type, extra) => '<div class="field"><label for="' + id + '">' + label + '</label><input id="' + id + '" data-ev="' + path + '" type="' + type + '" value="' + esc(String(get(path))) + '" ' + (extra || '') + '></div>';
    const rows = (k, defs, addLabel) => ev[k].map((row, i) => '<div class="ev-row">' + defs.map((d) => fld('ev-' + k + i + d[0], d[1], k + '.' + i + '.' + d[0], d[2], d[3])).join('') +
      '<button class="btn ghost sm" data-act="ev-del" data-k="' + k + '" data-i="' + i + '" aria-label="ลบแถวนี้">ลบแถว</button></div>').join('') + '<button class="btn ghost block" data-act="ev-add" data-k="' + k + '">+ ' + addLabel + '</button>';
    const tags = D.MOODS.map((m) => '<button class="fchip' + (ev.tags.includes(m.id) ? ' on' : '') + '" data-act="ev-tag" data-k="' + m.id + '" aria-pressed="' + ev.tags.includes(m.id) + '">' + m.short + '</button>').join('');
    return stHead(c, isNew ? 'สร้างอีเว้นท์' : 'แก้ไขอีเว้นท์') + '<section class="pad rise">' +
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
      '<button class="btn primary lg" data-act="ev-save">เผยแพร่อีเว้นท์</button><a class="btn text block" href="#/studio/events">ยกเลิก</a></section>';
  }

  function view(sub) {
    const c = myCafe();
    if (!c) return chooseCafe();
    sub = sub || '';
    let fn = { cafe: tCafe, events: tEvents, promote: tPromote, insights: tInsights, plan: tPlan }[sub], tab = sub;
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

    H['st-login'] = (el) => { root().cafeId = el.dataset.id; S.save(); apply(CM.weather.ctx.hour); api.render(); };
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
    H['op-period'] = (el) => { opPeriod = el.dataset.k; api.render(true); };
    H['op-choose'] = (el) => {
      const k = el.dataset.k, r = root(), per = opPeriod || r.period || 'year', trial = !r.trialUsed, amt = OP[k][per];
      api.openSheet('<h2 id="sheetTitle">' + (trial ? 'ทดลอง ' + PLAN_NAME[k] + ' ฟรี ' + OTRIAL + ' วัน' : 'สมัคร ' + PLAN_NAME[k]) + '</h2><ul class="xp-lines">' +
        orow('วันนี้', trial ? '฿0' : money(amt)) + (trial ? orow('หลังครบ ' + OTRIAL + ' วัน', 'กลับ Starter อัตโนมัติ') : orow('รอบ', per === 'year' ? 'รายปี' : 'รายเดือน')) + orow('บัตรเครดิต', trial ? 'ไม่ต้องใช้' : 'เดโม ไม่เก็บเงินจริง') + '</ul>' +
        '<p class="muted small">' + (trial ? 'ถ้าชอบ ค่อยสมัครต่อเอง — เราไม่เก็บเงินอัตโนมัติ' : 'กลับไป Starter ได้ทุกเมื่อ ข้อมูลไม่หาย') + '</p>' +
        '<button class="btn primary lg" data-act="op-confirm" data-k="' + k + '">' + (trial ? 'เริ่มทดลองฟรี' : 'ยืนยันสมัคร') + '</button><button class="btn text block" data-act="close-sheet">ยังไม่ตอนนี้</button>');
    };
    H['op-confirm'] = (el) => {
      const r = root(), per = opPeriod || r.period || 'year';
      r.plan = el.dataset.k; r.period = per;
      if (!r.trialUsed) { r.trialUsed = true; r.paid = false; r.trialEnd = Date.now() + OTRIAL * DAYMS; } else { r.paid = true; r.trialEnd = 0; }
      S.save(); api.closeSheet(true); refresh(); toast('เปิดใช้ ' + PLAN_NAME[r.plan] + ' แล้ว');
    };
    H['op-downgrade'] = () => api.openSheet('<h2 id="sheetTitle">กลับไป Starter?</h2><ul class="xp-lines">' + orow('ข้อมูลร้าน เมนู อีเว้นท์', 'อยู่ครบ') + orow('Quest / Reward / Moment', 'พักไว้ (เปิดคืนได้)') + orow('อีเว้นท์', 'แสดงต่อเนื่อง 1 งาน') + '</ul><button class="btn danger lg" data-act="op-downgrade-do">ยืนยัน</button><button class="btn text block" data-act="close-sheet">เก็บแพ็กเกจไว้</button>');
    H['op-downgrade-do'] = () => { const r = root(); r.plan = 'free'; r.paid = false; r.trialEnd = 0; D.CAFES.forEach((c) => { const x = peek(c.id); if (x) x.boost = 0; }); S.save(); api.closeSheet(true); refresh(); toast('กลับเป็น Starter แล้ว — ข้อมูลอยู่ครบ'); };
    H['op-boost'] = () => { const r = rec(root().cafeId); r.boost = r.boost > Date.now() ? 0 : Date.now() + 7 * DAYMS; S.save(); api.render(true); toast(r.boost ? 'เปิด Boost 7 วัน (เดโม ไม่เก็บเงินจริง)' : 'ปิด Boost แล้ว'); };
    /* events */
    H['ev-new'] = () => { const c = myCafe(); if (!isPro() && rec(c.id).events.filter((e) => eventStatus(e) !== 'ended').length >= 1) { toast('แพ็กเกจ Free จัดได้ครั้งละ 1 อีเว้นท์ — ทดลอง Pro เพื่อจัดเพิ่ม'); return; } ev = newDraft(); location.hash = '#/studio/new-event'; };
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
        gives: ev.gives.filter((x) => String(x.name).trim()).map((x) => ({ name: String(x.name).trim(), rule: String(x.rule || '').trim(), qty: num(x.qty) })), views: ev.views || 0, saves: ev.saves || 0 };
      if (!e.title) return toast('ใส่ชื่ออีเว้นท์ก่อนนะ');
      if (!e.startDate || !e.endDate || e.endDate < e.startDate) return toast('วันจบต้องไม่ก่อนวันเริ่ม');
      if (!e.startTime || !e.endTime || (e.startDate === e.endDate && toMin(e.endTime) <= toMin(e.startTime))) return toast('เวลาจบต้องหลังเวลาเริ่ม');
      if (!e.tags.length) return toast('เลือก Mood ที่เหมาะอย่างน้อย 1 อย่าง จะได้ส่งถึงคนที่ใช่');
      if (e.items.concat(e.sets).some((x) => !x.price)) return toast('เมนูและเซ็ตต้องใส่ราคา');
      const i = r.events.findIndex((x) => x.id === e.id), ev0 = i >= 0 ? r.events[i] : null;
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
    H['nav-go'] = (el) => { const c = D.CAFE_BY_ID[el.dataset.id]; trackKey(c.id, 'navs'); window.open('https://www.google.com/maps/search/?api=1&query=' + c.lat + ',' + c.lon, '_blank', 'noopener'); };

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
    eventsAll, eventById, eventStatus, eventsRelevant, isSaved, trackEvent, typeLabel };
})();
