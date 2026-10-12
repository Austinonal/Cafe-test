/* Café Mood — recommendation engine (pure functions, no DOM).
   Portable: this file can move as-is into a React Native / Flutter-JS / backend project.

   session = { profile, mood, ctx }
     profile : from buildProfile()   (Café Personality — "you overall")
     mood    : from analyzeText()+tiles (Café Mood — "today")
     ctx     : from CM.weather.ctx   (Café Weather — context layer, never asked from the user)
*/
(function () {
  window.CM = window.CM || {};
  const D = CM.data;

  const clamp = (x, a, b) => Math.max(a === undefined ? 0 : a, Math.min(b === undefined ? 1 : b, x));
  const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const uniq = (a) => Array.from(new Set(a));

  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) / 4294967295;
  }

  function distKm(a, b) {
    const R = 6371, rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  }

  /* ---------- Personality ---------- */
  function buildProfile(answers) {
    const sum = {};
    let drinkPref = 'coffee', hiddenAff = .4, weatherLove = null;
    D.QUIZ.forEach((q, qi) => {
      const oi = answers[qi];
      if (oi == null) return;
      const o = q.options[oi];
      Object.keys(o.fx || {}).forEach((d) => { sum[d] = (sum[d] || 0) + o.fx[d]; });
      if (o.drink) drinkPref = o.drink;
      if (o.hidden != null) hiddenAff = o.hidden;
      if (o.weather) weatherLove = o.weather;
    });
    const p = {};
    D.DIMS.forEach((d) => { p[d] = clamp((sum[d] || 0) / 3, -1, 1); });

    let best = D.ARCHETYPES[0], bs = -Infinity;
    D.ARCHETYPES.forEach((a) => {
      let s = 0;
      Object.keys(a.w).forEach((d) => { s += (p[d] || 0) * a.w[d]; });
      if (a.hid) s += hiddenAff * a.hid;
      if (s > bs) { bs = s; best = a; }
    });
    return { p, drinkPref, hiddenAff, weatherLove, archetype: best.id, ts: Date.now() };
  }

  function likes(profile) {
    if (!profile) return [];
    const out = Object.keys(profile.p)
      .filter((d) => Math.abs(profile.p[d]) >= .3)
      .sort((a, b) => Math.abs(profile.p[b]) - Math.abs(profile.p[a]))
      .map((d) => (profile.p[d] > 0 ? D.LIKE_POS[d] : D.LIKE_NEG[d]))
      .filter(Boolean);
    if (profile.hiddenAff >= .7) out.splice(2, 0, 'Hidden cafés');
    return uniq(out).slice(0, 6);
  }

  function persScore(cafe, profile) {
    if (!profile) return .5;
    let num = 0, den = 0;
    D.DIMS.forEach((d) => {
      const p = profile.p[d] || 0;
      num += p * (cafe.attr[d] / 10 - .5);
      den += Math.abs(p);
    });
    return den ? clamp(num / den + .5) : .5;
  }

  /* ---------- Mood (free text → structured) ---------- */
  function analyzeText(raw) {
    const t = (raw || '').toLowerCase();
    const moods = [], labels = [], boosts = {};
    let hidden = false, drink = null, night = false, local = false, indoor = false, air = false, first = false;
    D.KEYWORDS.forEach((r) => {
      if (!r.k.some((k) => t.includes(k))) return;
      labels.push(r.label);
      (r.moods || []).forEach((m) => { if (!moods.includes(m)) moods.push(m); });
      if (r.boosts) Object.keys(r.boosts).forEach((d) => { boosts[d] = (boosts[d] || 0) + r.boosts[d]; });
      if (r.hidden) hidden = true;
      if (r.drink) drink = r.drink;
      if (r.night) night = true;
      if (r.local) local = true;
      if (r.indoor) indoor = true;
      if (r.air) air = true;
      if (r.first) first = true;
    });
    return { moods, boosts, hidden, drink, night, local, indoor, air, first, labels: uniq(labels) };
  }

  function moodHeadline(mood, ctx) {
    const adjs = mood.moods.map((id) => D.MOOD_BY_ID[id].adj);
    Object.keys(mood.boosts || {}).forEach((d) => {
      if (mood.boosts[d] >= .4 && D.BOOST_ADJ[d]) adjs.push(D.BOOST_ADJ[d]);
    });
    let list = uniq(adjs);
    if (list.length < 2) {
      const w = D.WEATHER_ADJ[ctx.night && ctx.kind !== 'rain' ? 'night' : ctx.kind];
      if (w && !list.includes(w)) list.push(w);
    }
    return list.slice(0, 2).join(' & ') || 'Easygoing';
  }

  /* ---------- Weather fit & opening hours ---------- */
  function weatherFit(cafe, ctx) {
    const a = cafe.attr;
    const fit = {
      rain: (.4 * a.cozy + .3 * a.window + .3 * (10 - a.outdoor)) / 10,
      sunny: (.35 * a.bright + .35 * a.outdoor + .3 * a.photo) / 10,
      hot: (.7 * (10 - a.outdoor) + .3 * a.bright) / 10,
      cloudy: clamp((.5 * a.cozy + .5 * a.bright) / 10 + .1),
      night: (.5 * a.dark + .3 * a.cozy + .2 * (cafe.hours[1] >= 22 ? 10 : 3)) / 10
    };
    let f = ctx.night ? (ctx.kind === 'rain' ? .6 * fit.rain + .4 * fit.night : fit.night) : fit[ctx.kind];
    if (ctx.pm >= PM_HIGH) f = .45 * f + .55 * airFit(cafe);   // haze: indoor + air-cleaner cafés matter most
    return f;
  }

  /* ---------- Air quality (PM2.5, µg/m³). Thai PCD 2023 bands: ≤15 / ≤25 / ≤37.5 / ≤75 / >75 ---------- */
  const PM_HIGH = 37.5;   // Thailand's 24-h PM2.5 standard (since 1 Jun 2023). Open-Meteo gives the current hour, so treat it as an indicator.
  const PM_BANDS = [[15, 'ดีมาก', '#3E9AA6'], [25, 'ดี', '#3C5E2F'], [37.5, 'ปานกลาง', '#B7791F'], [75, 'เริ่มมีผลต่อสุขภาพ', '#C65B3A'], [1e9, 'มีผลต่อสุขภาพ', '#B3261E']];
  const pmBand = (pm) => PM_BANDS.find((b) => pm <= b[0]);
  // has an air cleaner: owner's Facilities toggle (Studio) when there is one, else the café record
  const hasAir = (c) => (CM.studio && CM.studio.facilityOn ? CM.studio.facilityOn(c, 'air') : !!c.air);
  const airFit = (c) => (.55 * (10 - c.attr.outdoor) + .45 * (hasAir(c) ? 10 : 0)) / 10;

  function isOpen(cafe, hour) {
    if (cafe.force) return cafe.force === 'open';   // owner override from Café Studio ('open' | 'closed')
    const [o, c] = cafe.hours;
    return (hour >= o && hour < c) || (hour + 24 >= o && hour + 24 < c);
  }

  function fmtHour(h) {
    const hh = Math.floor(h % 24), mm = h % 1 ? '30' : '00';
    return String(hh).padStart(2, '0') + ':' + mm;
  }

  function openInfo(cafe, hour) {
    const open = isOpen(cafe, hour);
    if (cafe.force) return open ? { open: true, text: 'เปิดอยู่ · ร้านอัปเดตเอง' } : { open: false, text: 'ปิดชั่วคราว' };
    return open
      ? { open: true, text: 'เปิดอยู่ · ปิด ' + fmtHour(cafe.hours[1]) }
      : { open: false, text: 'ปิดอยู่ · เปิด ' + fmtHour(cafe.hours[0]) };
  }

  /* ---------- Hidden Café ---------- */
  function hiddenInfo(cafe) {
    const eligible = cafe.reviews < 400 && cafe.rating >= 4.5;
    const q = clamp((cafe.rating - 3.8) / 1.2);
    const o = 1 - clamp(Math.log10(cafe.reviews / 10) / 2);
    const x = .4 * q + .3 * o + .3 * cafe.repeat;
    const score = Math.round(100 * Math.pow(x, .6));
    return {
      eligible, score,
      why: 'รีวิวแค่ ' + cafe.reviews + ' รีวิว แต่ได้คะแนน ' + cafe.rating.toFixed(1) +
        ' และลูกค้า ' + Math.round(cafe.repeat * 100) + '% กลับมาซ้ำ'
    };
  }

  /* ---------- Scoring ---------- */
  function weightsScore(attr, w) {
    let s = 0, min = 0, max = 0;
    Object.keys(w).forEach((d) => {
      const v = w[d];
      s += v * (attr[d] / 10);
      if (v > 0) max += v; else min += v;
    });
    return clamp((s - min) / ((max - min) || 1));
  }

  /* ---------- "อื่นๆ": what the customer typed vs what an owner wrote ----------
     Thai has no spaces, so: (1) words that mean the same thing are folded into one concept (เงียบ ≈ สงบ, ดนตรี ≈ แจ๊ส …),
     (2) leftover text is compared as character pairs. A match is a *hit* at ≥ .5. Small, explainable, no model needed. */
  const SYN = [['ดนตรี', 'เพลง', 'แจ๊ส', 'แจ๊ซ', 'jazz', 'live', 'อะคูสติก', 'acoustic', 'เล่นสด', 'คอนเสิร์ต'], ['หนังสือ', 'อ่าน', 'book', 'read'], ['เงียบ', 'สงบ', 'quiet', 'calm', 'ไม่วุ่นวาย'],
    ['ต้นไม้', 'สวน', 'garden', 'plant', 'เขียว', 'ธรรมชาติ'], ['ทะเล', 'ริมน้ำ', 'แม่น้ำ', 'คลอง', 'sea', 'river', 'beach'], ['สัตว์เลี้ยง', 'หมา', 'แมว', 'สุนัข', 'pet', 'dog', 'cat'],
    ['ทำงาน', 'ปลั๊ก', 'วายฟาย', 'wifi', 'laptop', 'โน้ตบุ๊ก', 'โน๊ตบุ๊ค'], ['เด็ก', 'ครอบครัว', 'kid', 'family'], ['ถ่ายรูป', 'ถ่ายภาพ', 'photo', 'ฟิล์ม'],
    ['เวิร์กช็อป', 'เวิร์คช็อป', 'workshop', 'ปั้น', 'เซรามิก', 'วาดรูป', 'คราฟต์', 'craft'], ['มัทฉะ', 'matcha', 'ชาเขียว'], ['ของหวาน', 'เค้ก', 'ขนม', 'dessert', 'bakery', 'เบเกอรี่'],
    ['ฟรี', 'แจก', 'free'], ['ปาร์ตี้', 'party', 'วันเกิด', 'เลี้ยง', 'กลุ่มใหญ่'], ['เดต', 'แฟน', 'date', 'โรแมนติก', 'romantic']];
  const STOP = ['บรรยากาศ', 'อยาก', 'ได้', 'ร้าน', 'ที่', 'มี', 'ให้', 'ไป', 'หา', 'วันนี้', 'หน่อย', 'แบบ', 'ครับ', 'ค่ะ', 'คะ', 'นะ', 'และ', 'กับ', 'หรือ', 'ของ', 'เป็น', 'ใน', 'ชั้น', 'มุม'];
  const PAIRS = SYN.map((g, i) => g.map((w) => [w, String.fromCharCode(0xE000 + i)])).reduce((a, b) => a.concat(b), []).sort((a, b) => b[0].length - a[0].length);
  function fold(raw) {
    let t = String(raw || '').toLowerCase().replace(/[ๆ\s]+/g, '').replace(/[^\p{L}\p{M}\p{N}]/gu, '')   // keep Thai vowel/tone marks (they are \p{M});
    STOP.forEach((w) => { t = t.split(w).join(''); });
    const c = new Set(); PAIRS.forEach((p) => { if (t.includes(p[0])) { c.add(p[1]); t = t.split(p[0]).join(p[1]); } });
    return { c, rest: t.replace(/[\uE000-\uF8FF]/g, '') };
  }
  const bigrams = (s) => { const o = new Set(); for (let i = 0; i < s.length - 1; i++) o.add(s.slice(i, i + 2)); return o; };
  function textMatch(a, b) {
    const x = fold(a), y = fold(b); let s = 0;
    if (x.c.size && y.c.size) { let k = 0; x.c.forEach((v) => { if (y.c.has(v)) k++; }); if (k) s = .55 + .45 * k / Math.min(x.c.size, y.c.size); }
    const p = bigrams(x.rest), q = bigrams(y.rest);
    if (Math.min(p.size, q.size) >= 3) { let k = 0; p.forEach((v) => { if (q.has(v)) k++; }); s = Math.max(s, .9 * k / Math.min(p.size, q.size)); }
    return Math.min(1, s);
  }
  // best owner note (today's mood, Café Moments, events) for what the customer typed; null when nothing is close enough
  function otherHit(text, cafe) {
    const notes = text && CM.studio && CM.studio.otherNotes ? CM.studio.otherNotes(cafe) : [];
    let best = null; notes.forEach((n) => { const sim = textMatch(text, n); if (sim >= .5 && (!best || sim > best.sim)) best = { sim, note: n }; });
    return best;
  }

  function moodScore(cafe, mood) {
    if (!mood) return null;
    let s = mood.moods.length ? avg(mood.moods.map((id) => weightsScore(cafe.attr, D.MOOD_W[id]))) : null;
    if (mood.boosts && Object.keys(mood.boosts).length) {
      const b = weightsScore(cafe.attr, mood.boosts);
      s = s == null ? b : .72 * s + .28 * b;
    }
    return s;
  }

  function reasonsFor(cafe, session, parts) {
    const { mood, ctx, profile } = session;
    const out = [];
    if (mood) {
      const cand = [];
      const ws = mood.moods.map((id) => D.MOOD_W[id]).concat(mood.boosts ? [mood.boosts] : []);
      ws.forEach((w) => Object.keys(w).forEach((d) => {
        const a = cafe.attr[d] / 10;
        if (w[d] > 0 && a >= .7) cand.push({ d, v: w[d] * a, text: D.REASON_HI[d] });
        if (w[d] < 0 && a <= .3 && D.REASON_LOW[d]) cand.push({ d, v: -w[d] * (1 - a), text: D.REASON_LOW[d] });
      }));
      const seen = {};
      cand.sort((x, y) => y.v - x.v).forEach((c) => {
        if (seen[c.d] || out.length >= 2) return;
        seen[c.d] = 1;
        out.push(c.text);
      });
    }
    if (parts.weather >= .62) {
      const k = ctx.night && ctx.kind !== 'rain' ? 'night' : ctx.kind;
      out.push({
        rain: 'ที่นั่งในร่ม ริมกระจก เหมาะกับวันฝนตก',
        sunny: 'แสงสวย รับแดดดี ๆ ได้วันนี้',
        night: 'บรรยากาศยามค่ำกำลังดี',
        hot: 'เย็นสบาย หลบร้อนได้ดี',
        cloudy: 'วันครึ้ม ๆ แบบนี้นั่งสบายมาก'
      }[k]);
    }
    if (ctx.pm >= PM_HIGH && hasAir(cafe) && out.length < 3) out.push('มีเครื่องฟอกอากาศ — วันนี้ฝุ่น PM2.5 สูง');
    else if (mood && mood.local && cafe.local && out.length < 3) out.push('ร้านท้องถิ่น ตรงกับที่คุณมองหา');
    const oh = mood && otherHit(mood.text, cafe);
    if (oh) out.unshift('ตรงกับที่ร้านบอก: “' + oh.note + '”');   // escaped where reasons are rendered
    const lv = cafe.live;
    if (lv && mood && out.length < 3) {
      if (lv.status === 'quiet' && mood.moods.some((m) => ['relax', 'focus', 'alone'].includes(m))) out.push('ตอนนี้ร้านเงียบ ที่นั่งว่าง ' + lv.seats + ' ที่');
      else if (lv.mood && mood.moods.some((m) => (D.OWNER_MOOD_MAP[lv.mood] || []).includes(m))) out.push('ร้านบอกว่าวันนี้บรรยากาศ ' + lv.mood.charAt(0).toUpperCase() + lv.mood.slice(1));
    }
    if (profile && parts.pers >= .72 && out.length < 3) {
      out.push('เข้ากับสไตล์ ' + D.ARCHETYPE_BY_ID[profile.archetype].name + ' ของคุณ');
    }
    const h = hiddenInfo(cafe);
    if (h.eligible && h.score >= 85 && out.length < 3) out.push('Hidden gem: รีวิวน้อยแต่คนกลับมาซ้ำ');
    if (!out.length) out.push(cafe.tagline);
    return out.slice(0, 3);
  }

  function scoreCafe(cafe, session) {
    const { mood, ctx, profile } = session;
    const m = moodScore(cafe, mood);
    const pers = persScore(cafe, profile);
    const weather = weatherFit(cafe, ctx);
    const info = openInfo(cafe, ctx.hour);
    let f = m == null ? .6 * pers + .4 * weather : .5 * m + .3 * pers + .2 * weather;

    const h = hiddenInfo(cafe);
    const hidPref = mood && mood.hidden ? 1 : (profile ? profile.hiddenAff : 0);
    if (h.eligible) f += .05 * hidPref;
    const lv = cafe.live;
    if (lv) {
      const ms = mood ? mood.moods : [];
      let b = 0;
      if (lv.mood) {
        if (ms.some((m) => (D.OWNER_MOOD_MAP[lv.mood] || []).includes(m))) b += .03;
        if ((lv.mood === 'cozy' && ctx.kind === 'rain') || (lv.mood === 'bright' && ctx.kind === 'sunny' && !ctx.night)) b += .02;
      }
      if (lv.status && ms.some((m) => ['relax', 'focus', 'alone'].includes(m))) b += lv.status === 'quiet' ? .02 : lv.status === 'busy' ? -.03 : 0;
      f += Math.min(b, .05);   // capped: owners signal what's true today, they can't buy rank
    }
    if (mood) {   // v23: asked-for context only, small and capped like the owner nudges
      if (mood.local && cafe.local) f += .06;
      if (mood.indoor) f += .04 * (10 - cafe.attr.outdoor) / 10;
      if (mood.air && hasAir(cafe)) f += .04;
    }
    const oh = mood && otherHit(mood.text, cafe);
    if (oh) f += .08 * oh.sim;   // the customer's own words matched the owner's own words — not purchasable, capped
    if (!info.open) f *= .78;

    const match = clamp(Math.round(40 + 58 * f), 0, 99, 0);
    const parts = { mood: m, pers, weather };
    return { cafe, match, parts, open: info, hidden: h, reasons: reasonsFor(cafe, session, parts) };
  }

  function rank(session) {
    return D.CAFES.map((c) => scoreCafe(c, session)).sort((a, b) => b.match - a.match);
  }

  /* ---------- Today's Drink ---------- */
  function drinkRank(session) {
    const { mood, ctx, profile } = session;
    const now0 = new Date(), day = now0.getFullYear() + '-' + (now0.getMonth() + 1) + '-' + now0.getDate();
    const cafeScore = {};
    rank(session).forEach((s) => { cafeScore[s.cafe.id] = s; });
    const out = [];
    D.CAFES.forEach((c) => {
      c.drinks.forEach((d) => {
        let moodFit = .5;
        if (mood && mood.moods.length) moodFit = avg(mood.moods.map((id) => (D.DRINK_MOOD[id] || {})[d.type] ?? .5));
        if (mood && mood.drink && mood.drink === d.type) moodFit = Math.max(moodFit, 1);

        let wFit;
        if (ctx.night && ctx.kind !== 'rain') wFit = d.temp === 'hot' ? .8 : .45;
        else if (ctx.kind === 'rain') wFit = d.temp === 'hot' ? 1 : .3;
        else if (ctx.kind === 'sunny' || ctx.kind === 'hot') wFit = d.temp === 'iced' ? 1 : .4;
        else wFit = .6;

        let pref = .4;
        if (profile) {
          if (profile.drinkPref === d.type) pref = 1;
          else if ((profile.drinkPref === 'coffee' && d.type === 'latte') || (profile.drinkPref === 'latte' && d.type === 'coffee')) pref = .7;
        }
        const cs = cafeScore[c.id];
        const ownerPick = !!(c.live && c.live.pick && c.live.pick.drinkId === d.id);
        const score = .35 * moodFit + .3 * wFit + .2 * pref + .15 * (cs.match / 100) + hash(day + d.id) * .02 + (ownerPick ? .03 : 0);
        const open = cs.open.open;
        out.push({
          cafe: c, drink: d, ownerPick, score: open ? score : score * .8, open: cs.open,
          rating: Math.min(4.9, Math.round((c.rating + (hash(d.id) - .5) * .3) * 10) / 10),
          reasons: drinkReasons(d, { moodFit, wFit, pref }, session)
        });
      });
    });
    return out.sort((a, b) => b.score - a.score);
  }

  function drinkReasons(d, f, session) {
    const { mood, ctx, profile } = session;
    const r = [];
    if (ctx.kind === 'rain' && d.temp === 'hot') r.push('แก้วอุ่น ๆ เข้ากับวันฝนตก');
    else if ((ctx.kind === 'sunny' || ctx.kind === 'hot') && !ctx.night && d.temp === 'iced') r.push('เย็นชื่นใจรับแดดวันนี้');
    else if (ctx.night && d.temp === 'hot') r.push('อุ่น ๆ รับบรรยากาศยามค่ำ');
    if (mood && mood.moods.length && f.moodFit >= .8) {
      const m = D.MOOD_BY_ID[mood.moods[0]];
      r.push('เหมาะกับ mood “' + m.th + '” ของวันนี้');
    }
    if (profile && f.pref >= 1) r.push('ตรงกับเมนูที่คุณชอบ');
    if (!r.length) r.push('เมนูแนะนำจากร้านที่เหมาะกับคุณ');
    return r.slice(0, 2);
  }

  /* ---------- Passport ---------- */
  function stats(visits) {
    const cafes = uniq(visits.map((v) => v.cafeId));
    const drinks = uniq([].concat.apply([], visits.map((v) => v.drinks)));
    const spots = uniq([].concat.apply([], visits.map((v) => v.spots)));
    const hidden = cafes.filter((id) => hiddenInfo(D.CAFE_BY_ID[id]).eligible);
    const xp = visits.reduce((s, v) => s + (v.xp || 0), 0);
    return { cafes, drinks, spots, hidden, xp };
  }

  function achievementProgress(visits) {
    const s = stats(visits);
    const typeCount = (types) => s.drinks.filter((id) => types.includes(D.DRINK_BY_ID[id].type)).length;
    const val = {
      'first-sip': s.cafes.length,
      rainy: uniq(visits.filter((v) => v.weather && v.weather.kind === 'rain').map((v) => v.cafeId)).length,
      matcha: typeCount(['matcha']),
      photographer: s.spots.length,
      hidden: s.hidden.length,
      night: visits.filter((v) => v.weather && v.weather.night).length,
      bean: typeCount(['coffee', 'latte']),
      collector: s.cafes.length
    };
    return D.ACHIEVEMENTS.map((a) => {
      const v = val[a.id] || 0;
      return Object.assign({}, a, { value: Math.min(v, a.goal), done: v >= a.goal });
    });
  }

  function levelInfo(xp) {
    let i = 0;
    D.LEVELS.forEach((l, idx) => { if (xp >= l.xp) i = idx; });
    const cur = D.LEVELS[i], next = D.LEVELS[i + 1];
    return {
      level: i + 1, name: cur.name, xp,
      next: next ? next.xp : null,
      pct: next ? Math.round(((xp - cur.xp) / (next.xp - cur.xp)) * 100) : 100
    };
  }

  // Build a visit record + XP, given what the user did.
  function makeVisit(cafeId, drinkIds, spotIds, ctx, prevVisits) {
    const s = stats(prevVisits);
    const cafe = D.CAFE_BY_ID[cafeId];
    const isNewCafe = !s.cafes.includes(cafeId);
    const newDrinks = drinkIds.filter((id) => !s.drinks.includes(id)).length;
    const newSpots = spotIds.filter((id) => !s.spots.includes(id)).length;
    const hiddenFirst = isNewCafe && hiddenInfo(cafe).eligible;
    const xp = 20 + (isNewCafe ? 40 : 0) + newDrinks * 10 + newSpots * 10 + (hiddenFirst ? 30 : 0);
    return {
      visit: { id: Date.now() + '-' + cafeId, ts: Date.now(), cafeId, drinks: drinkIds, spots: spotIds, weather: { kind: ctx.kind, night: ctx.night }, xp },
      xp, isNewCafe, hiddenFirst, newDrinks, newSpots
    };
  }

  CM.engine = {
    clamp, hash, distKm, buildProfile, likes, analyzeText, moodHeadline, weatherFit, openInfo, fmtHour,
    hiddenInfo, textMatch, otherHit, scoreCafe, rank, drinkRank, stats, PM_HIGH, pmBand, hasAir, airFit, achievementProgress, levelInfo, makeVisit, persScore
  };
})();
