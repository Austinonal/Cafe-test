/* Café Mood Plus tools: Café Notes, Smart List, Trip Mode, Passport export.
   Rule for every tool: a free user sees a REAL preview built from their own data (never a fake one);
   Smart List and Trip Mode never touch the ranking on Home — they are separate lists. */
(function () {
  window.CM = window.CM || {};
  const D = CM.data, S = CM.store, I = CM.icon, A = CM.art, E = CM.engine;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const plus = () => CM.plus.isPlus();
  const lock = (t, s, c) => CM.plus.lockCard(t, s, c);
  const notes = () => (S.get().notes = S.get().notes || {});
  const fmt = (ts) => new Date(ts).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
  let api = null;
  const head = (eyebrow, title, lead, back) => '<header class="hero-top ambient plus-hero"><div class="topbar">' + api.backBtn(back || '#/profile') + '</div><p class="eyebrow">' + eyebrow + ' <span class="plusbadge">Plus</span></p><h1 class="display">' + title + '</h1>' + (lead ? '<p class="lead sm">' + lead + '</p>' : '') + '</header>';

  /* ---------- Café Notes ---------- */
  const rate = (id, r) => '<div class="rate" role="radiogroup" aria-label="ให้คะแนนร้าน">' + [1, 2, 3, 4, 5].map((n) => '<button role="radio" aria-checked="' + (r === n) + '" aria-label="' + n + ' ดาว" class="' + (n <= r ? 'on' : '') + '" data-act="note-rate" data-id="' + id + '" data-k="' + n + '">' + I('star', 26) + '</button>').join('') + '</div>';
  const DRINK_RATE = [['up', 'ชอบ'], ['meh', 'เฉย ๆ'], ['down', 'ไม่ถูกใจ']];

  function noteBlock(c) {
    const title = '<h2 class="sec-title">' + I('edit', 20) + 'Café Notes <span class="plusbadge">Plus</span></h2>';
    if (!plus()) return title + lock('จดโน้ตและให้คะแนนส่วนตัวของ ' + esc(c.name), 'ให้ดาวร้านและเมนู จดสิ่งที่อยากจำ — เห็นแค่คุณ');
    const n = notes()[c.id] || {}, d = n.d || {};
    return title + '<div class="card notes">' + rate(c.id, n.r || 0) +
      '<label class="sr" for="noteText">โน้ตส่วนตัวของ ' + esc(c.name) + '</label><textarea id="noteText" data-id="' + c.id + '" maxlength="400" placeholder="เช่น โต๊ะริมหน้าต่างดีสุด / มาวันธรรมดาเงียบกว่า">' + esc(n.t || '') + '</textarea>' +
      '<ul class="note-drinks">' + c.drinks.map((dr, i) => '<li><span>' + esc(dr.name) + '</span><div class="seg three" role="group" aria-label="ความรู้สึกต่อ ' + esc(dr.name) + '">' + DRINK_RATE.map((x) => '<button class="' + (d[dr.name] === x[0] ? 'on' : '') + '" aria-pressed="' + (d[dr.name] === x[0]) + '" data-act="note-drink" data-id="' + c.id + '" data-n="' + i + '" data-k="' + x[0] + '">' + x[1] + '</button>').join('') + '</div></li>').join('') + '</ul>' +
      '<p class="muted small">บันทึกในเครื่องนี้ · ไม่แสดงให้ใครเห็น และไม่เปลี่ยนอันดับร้าน</p></div>';
  }

  function vNotes() {
    const list = Object.keys(notes()).map((id) => ({ id, n: notes()[id], c: D.CAFE_BY_ID[id] })).filter((x) => x.c && (x.n.r || x.n.t || Object.keys(x.n.d || {}).length)).sort((a, b) => (b.n.at || 0) - (a.n.at || 0));
    const stars = (r) => '<span class="stars" aria-label="' + r + ' ดาว">' + [1, 2, 3, 4, 5].map((i) => '<span class="' + (i <= r ? 'on' : '') + '">' + I('star', 15) + '</span>').join('') + '</span>';
    if (!plus()) {
      const c = (S.live().map((v) => D.CAFE_BY_ID[v.cafeId]).filter(Boolean).pop()) || D.CAFES[0];
      return { nav: false, html: head('Café Notes', 'จำร้านในแบบของคุณ', 'ให้คะแนนและจดโน้ตต่อร้านและเมนู — เห็นแค่คุณ') + '<section class="pad rise">' +
        (c ? '<div class="card"><p class="eyebrow">หน้าตาเป็นแบบนี้ · ' + esc(c.name) + '</p>' + rate(c.id, 0).replace(/data-act="note-rate"/g, 'disabled') + '<textarea disabled placeholder="โน้ตของคุณจะอยู่ตรงนี้"></textarea></div>' : '') +
        lock('เปิด Café Notes', 'เป็นของ Plus — ทดลองฟรี 7 วัน') + '</section>' };
    }
    return { nav: false, html: head('Café Notes', 'โน้ตของฉัน', list.length + ' ร้าน') + '<section class="pad rise">' + (list.length
      ? '<ul class="list">' + list.map((x) => '<li><a class="card note-row" href="#/cafe/' + x.id + '"><div><b>' + esc(x.c.name) + '</b><small class="muted">' + esc(x.c.area) + (x.n.at ? ' · ' + fmt(x.n.at) : '') + '</small>' + (x.n.r ? '<div>' + stars(x.n.r) + '</div>' : '') + (x.n.t ? '<p class="small">' + esc(x.n.t) + '</p>' : '') +
        (Object.keys(x.n.d || {}).length ? '<p class="muted small">เมนู: ' + Object.keys(x.n.d).map((k) => esc(k) + ' (' + DRINK_RATE.filter((r) => r[0] === x.n.d[k])[0][1] + ')').join(' · ') + '</p>' : '') + '</div>' + I('chevron-right', 18) + '</a></li>').join('') + '</ul>'
      : '<div class="card empty"><p><b>ยังไม่มีโน้ต</b></p><p class="muted">เปิดหน้าร้านไหนก็ได้ แล้วเลื่อนไปที่ Café Notes</p><a class="btn primary" href="#/discover">ไปสำรวจคาเฟ่</a></div>') + '</section>' };
  }

  /* ---------- Smart List ---------- */
  function similar() {
    const cafes = D.CAFES, dims = D.DIMS, st = S.get(), seeds = {};
    const add = (id, w) => { if (D.CAFE_BY_ID[id]) seeds[id] = (seeds[id] || 0) + w; };
    S.live().forEach((v) => add(v.cafeId, 0.5));
    (st.favCafes || []).forEach((id) => add(id, 2));
    Object.keys(notes()).forEach((id) => { if (notes()[id].r) add(id, notes()[id].r - 3); });   // 5★ +2 … 1★ −2
    const mean = {}; dims.forEach((d) => { mean[d] = cafes.reduce((a, c) => a + c.attr[d], 0) / cafes.length; });
    const vec = (c) => dims.map((d) => c.attr[d] - mean[d]);
    const cos = (a, b) => { let x = 0, p = 0, q = 0; for (let i = 0; i < a.length; i++) { x += a[i] * b[i]; p += a[i] * a[i]; q += b[i] * b[i]; } return p && q ? x / Math.sqrt(p * q) : 0; };
    const sids = Object.keys(seeds).filter((id) => seeds[id] !== 0), norm = sids.reduce((a, id) => a + Math.abs(seeds[id]), 0);
    if (!sids.length) return { seeds: [], list: [] };
    const seen = new Set(S.live().map((v) => v.cafeId));
    const list = cafes.filter((c) => !seen.has(c.id) && !seeds[c.id]).map((c) => {
      let s = 0, best = null, bw = -9;
      sids.forEach((id) => { const k = seeds[id] * cos(vec(c), vec(D.CAFE_BY_ID[id])); s += k; if (k > bw) { bw = k; best = D.CAFE_BY_ID[id]; } });
      const shared = dims.filter((d) => c.attr[d] >= 7 && best.attr[d] >= 7).sort((a, b) => c.attr[b] - c.attr[a]).slice(0, 2).map((d) => D.DIM_TH[d]);
      return { c, best, shared, score: Math.max(0, Math.min(100, Math.round(50 + 50 * s / norm))) };
    }).sort((a, b) => b.score - a.score || (a.c.id < b.c.id ? -1 : 1));
    return { seeds: sids.filter((id) => seeds[id] > 0).map((id) => D.CAFE_BY_ID[id]), list };
  }
  const simRow = (x, i) => '<a class="card sim-row" href="#/cafe/' + x.c.id + '"><span class="rank">' + (i + 1) + '</span><div class="thumb">' + A.coverArt(x.c) + '</div><div class="rc-body"><h3>' + esc(x.c.name) + '</h3><p class="meta">' + I('pin', 13) + esc(x.c.area) + '</p>' +
    '<p class="why">คล้าย <b>' + esc(x.best.name) + '</b>' + (x.shared.length ? ' — เหมือนกันที่' + x.shared.join(' และ ') : '') + '</p></div><b class="simv">' + x.score + '%</b></a>';

  function vSmart() {
    const r = similar(), ok = plus(), top = r.list.slice(0, 6);
    return { nav: false, html: head('Smart List', 'ร้านที่น่าจะถูกใจ', r.seeds.length ? 'จากร้านที่คุณชอบ: ' + r.seeds.slice(0, 3).map((c) => esc(c.name)).join(', ') : '') + '<section class="pad rise">' +
      (!r.seeds.length ? '<div class="card empty"><p><b>ยังไม่มีร้านที่ชอบให้เรียนรู้</b></p><p class="muted">กดหัวใจที่ร้านโปรด ให้ดาวใน Café Notes หรือ Check-in สักร้าน แล้วกลับมาดู</p><a class="btn primary" href="#/discover">ไปสำรวจคาเฟ่</a></div>'
        : (ok ? top : top.slice(0, 1)).map(simRow).join('') + (ok || top.length < 2 ? '' : lock('อีก ' + (top.length - 1) + ' ร้านที่คล้ายกับร้านที่คุณชอบ', 'เห็นแล้ว 1 ร้านจากข้อมูลของคุณเอง · ที่เหลือเป็นของ Plus', 'ลองฟรี')) +
          '<p class="muted small">เปรียบเทียบบรรยากาศของร้านที่คุณให้คะแนนสูง/กดหัวใจ/ไปซ้ำ กับร้านที่ยังไม่เคยไป — ให้ดาวต่ำจะดันร้านลักษณะนั้นออก · แยกจากอันดับในหน้า Home ซึ่งใช้สูตรเดียวกันทุกคน</p>') + '</section>' };
  }

  /* ---------- Trip Mode ---------- */
  // Provinces and the demo cafés live in js/trip-data.js (all fictional, like the Bangkok samples).
  const TD = CM.tripData, PROVS = TD.PROVS, TRIP = TD.CAFES, PROV = {};
  Object.keys(PROVS).forEach((k) => { PROV[k] = PROVS[k][0]; });
  const regionOf = (p) => (TD.REGIONS.find((r) => r[2].includes(p)) || TD.REGIONS[0])[0];
  const SLOT_START = [540, 780, 1050], STAY = 75, MIN_STAY = 45, KMH = 30;   // 09:00 / 13:00 / 17:30 · minutes at a café · min. time before moving on · average driving speed
  const hm = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  const mins = (s) => { const p = String(s).split(':'); return (+p[0]) * 60 + (+p[1] || 0); };
  const partOf = (m) => (m < 720 ? 'เช้า' : m < 1020 ? 'บ่าย' : m < 1200 ? 'เย็น' : 'ค่ำ');
  const km = (a, b) => { const r = Math.PI / 180, dx = (b.lon - a.lon) * r * Math.cos((a.lat + b.lat) / 2 * r), dy = (b.lat - a.lat) * r; return Math.sqrt(dx * dx + dy * dy) * 6371; };
  let draft = { prov: 'cm', region: 'north', days: 2, moods: [], otherOn: false, other: '', times: {} };

  const words = (s) => String(s || '').toLowerCase().split(/[\s,]+/).filter((w) => w.length >= 2).slice(0, 6);
  // "อื่นๆ": the typed text is read like the sentence box on Home, and any leftover words are matched against the café's name, area and note
  const effMoods = (d) => (d.otherOn ? d.moods.concat(E.analyzeText(d.other).moods.filter((m) => !d.moods.includes(m))) : d.moods);
  const effWords = (d) => (d.otherOn ? words(d.other) : []);

  function buildPlan(prov, days, moods, ws) {
    ws = ws || [];
    const pool = TRIP.filter((c) => c.prov === prov), score = (c, i) => moods.reduce((a, m) => a + (c.tags.includes(m) ? 2 : 0), 0) + ws.reduce((a, w) => a + ((c.name + c.area + c.note).toLowerCase().includes(w) ? 1.5 : 0), 0) - i * 0.01;
    const key = (c) => c.lat + c.lon;
    const pick = pool.map((c, i) => ({ c, s: score(c, i) })).sort((a, b) => b.s - a.s).slice(0, days * 3).map((x) => x.c).sort((a, b) => key(a) - key(b));   // neighbours end up on the same day
    const size = Math.ceil(pick.length / days), out = [];
    for (let d = 0; d < days; d++) { const day = pick.slice(d * size, (d + 1) * size).sort((a, b) => a.slot - b.slot || key(a) - key(b)); if (day.length) out.push(day.map((c) => c.id)); }
    return out;
  }

  // One day → rows with a real clock time each. Auto time = the café's best slot, pushed later when the drive + a stay at the previous café needs it.
  // A time the person typed wins; rows are always listed in time order.
  function schedule(ids, over) {
    over = over || {};
    const cs = ids.map((id) => TRIP.find((x) => x.id === id)).filter(Boolean), auto = {};
    let end = 0, prev = null;
    cs.forEach((c) => { const drive = prev ? Math.ceil(km(prev, c) / KMH * 12) * 5 : 0; auto[c.id] = Math.max(SLOT_START[c.slot], prev ? end + drive : 0); end = auto[c.id] + STAY; prev = c; });
    const rows = cs.map((c) => ({ c, t: over[c.id] ? mins(over[c.id]) : auto[c.id], edited: !!over[c.id] })).sort((a, b) => a.t - b.t);
    rows.forEach((r, i) => {
      const p = rows[i - 1]; if (!p) return;
      r.km = km(p.c, r.c); r.drive = Math.max(5, Math.round(r.km / KMH * 12) * 5);
      r.need = MIN_STAY + r.drive; r.tight = r.t - p.t < r.need;
    });
    return rows;
  }

  // 24-hour hour/minute pickers (a native <input type=time> turns into 12-hour AM/PM on some phones and gets cut off)
  const timeSel = (t, c, tid) => {
    const opts = (n, step, cur) => Array.from({ length: n / step }, (_, i) => { const v = i * step; return '<option value="' + v + '"' + (v === cur ? ' selected' : '') + '>' + String(v).padStart(2, '0') + '</option>'; }).join('');
    const at = ' data-act="trip-time" data-id="' + c.id + '" data-t="' + tid + '"';
    return '<div class="ttime" role="group" aria-label="เวลาไป ' + esc(c.name) + '"><select' + at + ' aria-label="ชั่วโมง">' + opts(24, 1, Math.floor(t / 60) % 24) + '</select><span aria-hidden="true">:</span><select' + at + ' aria-label="นาที">' + opts(60, 5, t % 60) + '</select></div>';
  };
  const doneOf = (tid) => ((S.get().trips || []).find((x) => x.id === tid) || {}).done || {};
  const dayHtml = (ids, i, over, tid) => {
    const rows = schedule(ids, over);
    return '<div class="card trip-day"><h3>วันที่ ' + (i + 1) + ' <small class="muted">' + rows.length + ' ร้าน</small></h3><ol>' + rows.map((r) => {
      const c = r.c;
      return '<li><div class="tslot">' + timeSel(r.t, c, tid) + '<small>' + partOf(r.t) + (r.edited ? ' · แก้เอง' : '') + '</small></div>' +
        '<div class="tbody"><b>' + esc(c.name) + '</b><small>' + esc(c.area) + (r.km != null ? ' · ≈ ' + r.km.toFixed(1) + ' กม. จากจุดก่อนหน้า · ขับ ~' + r.drive + ' นาที' : '') + '</small><p class="small">' + esc(c.note) + '</p>' +
        (r.tight ? '<p class="ttight">' + I('clock', 14) + 'เร็วไปหน่อย — ควรห่างจากร้านก่อนหน้าอย่างน้อย ' + r.need + ' นาที</p>' : '') +
        (tid ? '<label class="chk"><input type="checkbox" data-act="trip-done" data-t="' + tid + '" data-id="' + c.id + '"' + (doneOf(tid)[c.id] ? ' checked' : '') + '> ไปแล้ว</label>' : '') + '</div></li>';
    }).join('') + '</ol></div>';
  };

  function planHtml() {
    const ok = plus(), d = draft, plan = buildPlan(d.prov, d.days, effMoods(d), effWords(d));
    return (ok ? plan : plan.slice(0, 1)).map((ids, i) => dayHtml(ids, i, d.times, '')).join('') +
      (Object.keys(d.times).length ? '<button class="btn text sm" data-act="trip-reset">' + I('clock', 16) + ' ใช้เวลาที่จัดให้อัตโนมัติ</button>' : '') +
      (ok ? '<button class="btn primary lg" data-act="trip-save">บันทึกทริปนี้</button>' : lock('ดูทั้ง ' + plan.length + ' วัน และบันทึกทริป', 'เห็นวันที่ 1 แล้ว · ที่เหลือและการบันทึกเป็นของ Plus', 'ลองฟรี'));
  }
  const readHtml = (d) => {
    if (!d.otherOn) return '';
    const a = E.analyzeText(d.other), ws = words(d.other);
    return !ws.length ? 'พิมพ์สิ่งที่อยากได้ เช่น ริมทะเล · ต้นไม้เยอะ · มีของฝาก' : a.labels.length ? 'อ่านเป็น: ' + a.labels.map(esc).join(' · ') + ' — และใช้คำของคุณค้นหาในรายละเอียดร้านด้วย' : 'ใช้คำของคุณค้นหาในชื่อ ย่าน และรายละเอียดของร้าน';
  };

  function vTrip() {
    const ok = plus(), d = draft, trips = S.get().trips || [], reg = TD.REGIONS.find((r) => r[0] === d.region) || TD.REGIONS[0];
    const seg = (act, items, cur) => '<div class="seg three" role="radiogroup">' + items.map((i) => '<button role="radio" aria-checked="' + (cur === i[0]) + '" class="' + (cur === i[0] ? 'on' : '') + '" data-act="' + act + '" data-k="' + i[0] + '">' + i[1] + '</button>').join('') + '</div>';
    const lab = (t, s) => '<h2 class="tlabel">' + t + (s ? ' <small>' + s + '</small>' : '') + '</h2>';
    const moods = D.MOODS.map((m) => '<button class="chip-toggle" aria-pressed="' + d.moods.includes(m.id) + '" data-act="trip-mood" data-k="' + m.id + '">' + I(m.icon, 16) + m.thShort + '</button>').join('') +
      '<button class="chip-toggle" aria-pressed="' + d.otherOn + '" data-act="trip-other">' + I('sparkles', 16) + 'อื่นๆ</button>';
    const saved = ok && trips.length ? '<h2 class="sec-title">ทริปที่บันทึกไว้</h2>' + trips.map((tr) => '<details class="card fold"><summary>' + I('compass', 18) + (PROV[tr.prov] || tr.prov) + ' · ' + tr.days.length + ' วัน <small class="muted">' + fmt(tr.at) + '</small>' + I('chevron-down', 18) + '</summary>' + tr.days.map((ids, i) => dayHtml(ids, i, tr.times || {}, tr.id)).join('') + '<button class="btn text sm" data-act="trip-del" data-t="' + tr.id + '">ลบทริปนี้</button></details>').join('') : '';
    return { nav: false, html: head('Trip Mode', 'เที่ยวคาเฟ่ต่างจังหวัด', 'เลือกจังหวัด จำนวนวัน และมู้ด — เราจัดเส้นทางและเวลาให้ แก้เวลาเองได้') + '<section class="pad rise trip">' +
      lab('จังหวัด', 'เลือกอยู่: ' + PROV[d.prov] + ' · ทั้งหมด ' + Object.keys(PROV).length + ' จังหวัด') +
      '<div class="regionbar" role="tablist" aria-label="ภูมิภาค">' + TD.REGIONS.map((r) => '<button role="tab" aria-selected="' + (r[0] === d.region) + '" class="' + (r[0] === d.region ? 'on' : '') + '" data-act="trip-region" data-k="' + r[0] + '">' + r[1] + '</button>').join('') + '</div>' +
      '<div class="provgrid" role="radiogroup" aria-label="จังหวัด">' + reg[2].map((p) => '<button role="radio" aria-checked="' + (p === d.prov) + '" class="' + (p === d.prov ? 'on' : '') + '" data-act="trip-prov" data-k="' + p + '">' + PROV[p] + '</button>').join('') + '</div>' +
      lab('ระยะเวลา') + seg('trip-days', [[1, '1 วัน'], [2, '2 วัน'], [3, '3 วัน']], d.days) +
      lab('มู้ดของทริป', 'เลือกได้หลายอย่าง') + '<div class="chips tripmoods" role="group" aria-label="มู้ด">' + moods + '</div>' +
      (d.otherOn ? '<div class="field tother"><label for="tripOther">อื่นๆ — บอกสิ่งที่อยากได้</label><input id="tripOther" class="name-in" maxlength="60" value="' + esc(d.other) + '" placeholder="เช่น ริมทะเล, ต้นไม้เยอะ, มีของฝาก"><small id="tripRead" class="muted">' + readHtml(d) + '</small></div>' : '') +
      '<div id="tripPlan" class="tplan">' + planHtml() + '</div>' + saved +
      '<p class="muted small">ร้านในโหมดทริปเป็นข้อมูลสมมติในเดโม · เวลาเป็นค่าประมาณ (นั่งร้านละ ~75 นาที ขับเฉลี่ย 30 กม./ชม. ระยะเป็นเส้นตรง) · แก้เวลาแล้วร้านจะเรียงใหม่ตามเวลาให้</p></section>' };
  }

  /* ---------- Passport + Wrapped export (image / PDF) ---------- */
  const THEMES = { espresso: { n: 'Espresso', bg: ['#2A1D15', '#5A3622'], ink: '#F4EADC', acc: '#E88B5B' }, matcha: { n: 'Matcha', bg: ['#1F3B2D', '#5E8466'], ink: '#F3F8EC', acc: '#CFE3B8' }, sakura: { n: 'Sakura', bg: ['#FBE6EA', '#E8AEBD'], ink: '#4A1F2B', acc: '#B04F6B' } };
  let cv = null, cvName = 'cafe-passport';
  const F = (w, s, serif) => w + ' ' + s + 'px ' + (serif ? '"Fraunces", "Noto Serif Thai", Georgia, serif' : '"IBM Plex Sans Thai", "Noto Sans Thai", sans-serif');
  const rr = (g, x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
  const fit = (g, txt, max) => { let s = String(txt); while (s.length > 2 && g.measureText(s).width > max) s = s.slice(0, -1); return s === String(txt) ? s : s + '…'; };

  // The café's own passport stamp — the same artwork as the in-app stamp (art.js stamp()), drawn on a canvas so the export matches it.
  const SH = {
    circle: ['M50 4a46 46 0 1 0 0 92a46 46 0 1 0 0-92z', 'M50 11a39 39 0 1 0 0 78a39 39 0 1 0 0-78z'],
    square: ['M24 6h52a18 18 0 0 1 18 18v52a18 18 0 0 1-18 18H24a18 18 0 0 1-18-18V24a18 18 0 0 1 18-18z', 'M25 14h50a11 11 0 0 1 11 11v50a11 11 0 0 1-11 11H25a11 11 0 0 1-11-11V25a11 11 0 0 1 11-11z'],
    hex: ['M50 4L90 27L90 73L50 96L10 73L10 27z', 'M50 14L81 32L81 68L50 86L19 68L19 32z']
  };
  const IMG = {};
  function svgImg(svg) {   // owner-designed icon stamps: the icon is an SVG, so it loads once and the page redraws when it is ready
    if (!IMG[svg]) { const im = IMG[svg] = new Image(); im.onload = () => { if (/^#\/(export|wshare)/.test(location.hash)) api.render(true); }; im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); }
    return IMG[svg].complete && IMG[svg].naturalWidth ? IMG[svg] : null;
  }
  // No paper tile: the stamp is printed straight on the card. Its own colour is kept but nudged toward the card's ink until it reads (contrast ≥ 4:1),
  // and a faint fill of the same colour inside the ring keeps it from dissolving into the background.
  const lum = (h) => { const n = parseInt(h.slice(1), 16), f = (v) => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(n >> 16 & 255) + .7152 * f(n >> 8 & 255) + .0722 * f(n & 255); };
  const mixHex = (a, b, t) => '#' + [16, 8, 0].map((s) => Math.round((parseInt(a.slice(1), 16) >> s & 255) * (1 - t) + (parseInt(b.slice(1), 16) >> s & 255) * t).toString(16).padStart(2, '0')).join('');
  function inkOn(col, th) {
    if (!/^#[0-9a-f]{6}$/i.test(col)) return col;
    const bg = lum(mixHex(th.bg[0], th.bg[1], .5)), cr = (x) => { const l = lum(x); return (Math.max(l, bg) + .05) / (Math.min(l, bg) + .05); };
    let t = 0, c = col; while (cr(c) < 4 && t < 1) { t += .1; c = mixHex(col, th.ink, t); } return c;
  }
  function drawStamp(g, c, cx, cy, size, locked, th) {
    const d = c.pass || {}, col = locked ? th.ink : inkOn(d.color || c.palette[0], th), label = String(d.label || '').trim();
    const initials = label || c.name.replace(/[^A-Za-z฀-๿ ]/g, '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
    const rot = (E.hash(c.id) - .5) * 24 * Math.PI / 180, fs = initials.length <= 3 ? 26 : initials.length <= 5 ? 19 : 14, ring = SH[d.shape] || SH.circle;
    g.save(); g.translate(cx, cy); g.rotate(rot); g.scale(size / 100, size / 100); g.translate(-50, -50);
    g.strokeStyle = col; g.fillStyle = col; g.lineCap = 'round'; g.lineJoin = 'round'; if (locked) g.globalAlpha = .32;
    if (!locked) { g.globalAlpha = .2; g.fill(new Path2D(ring[0])); g.globalAlpha = 1; }
    g.lineWidth = locked ? 3 : 4; g.stroke(new Path2D(ring[0]));
    g.lineWidth = 1.5; g.setLineDash([3, 4]); g.stroke(new Path2D(ring[1])); g.setLineDash([]);
    if (locked) { g.lineWidth = 3; g.stroke(new Path2D('M38 56v-6a12 12 0 0 1 24 0v6M34 56h32v20H34z')); }
    else if (d.icon) {
      const im = svgImg(CM.icon(d.icon, 40).replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"').replace(/currentColor/g, col));
      const x = label ? 35 : 30, y = label ? 20 : 28, sz = label ? 30 : 40; if (im) g.drawImage(im, x, y, sz, sz);
      if (label) { g.textAlign = 'center'; g.font = F(700, fs > 19 ? 15 : 13, true); g.fillText(label, 50, 76); }
    } else {
      g.textAlign = 'center'; g.font = F(700, fs, true); g.fillText(initials, 50, 58);
      g.lineWidth = 2; g.stroke(new Path2D('M26 72h48')); g.stroke(new Path2D('M30 32h40'));
    }
    g.restore();
  }
  const canvas = (W, H, th) => { const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'), bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, th.bg[0]); bg.addColorStop(1, th.bg[1]); g.fillStyle = bg; g.fillRect(0, 0, W, H); g.fillStyle = th.ink; g.textAlign = 'left'; return { c, g }; };
  const preview = (g, th, W, H) => { g.save(); g.translate(W / 2, H / 2); g.rotate(-0.5); g.fillStyle = th.ink; g.globalAlpha = .16; g.textAlign = 'center'; g.font = F(700, 150); g.fillText('PREVIEW', 0, 0); g.font = F(600, 54); g.fillText('Café Mood Plus', 0, 80); g.restore(); };

  function drawPassport(th, mark) {
    const W = 1080, H = 1350, k = canvas(W, H, th), c = k.c, g = k.g, st = S.get(), vs = S.live(), stt = E.stats(vs), lv = E.levelInfo(stt.xp), p = st.profile, a = p && D.ARCHETYPE_BY_ID[p.archetype];
    g.globalAlpha = .7; g.font = F(600, 28); g.fillText('CAFÉ PASSPORT', 80, 120); g.globalAlpha = 1;
    g.font = F(700, 76); g.fillText(st.name || 'Café Explorer', 80, 210);
    g.globalAlpha = .85; g.font = F(500, 34); g.fillText((a ? a.name + ' · ' : '') + 'Lv.' + lv.level + ' ' + lv.name, 80, 268); g.globalAlpha = 1;
    g.fillStyle = th.acc; g.font = F(700, 120); g.textAlign = 'right'; g.fillText(String(stt.cafes.length), W - 80, 250);
    g.font = F(500, 26); g.fillText('/ ' + D.CAFES.length + ' cafés visited', W - 80, 292);
    const first = {}; vs.forEach((v) => { if (!(v.cafeId in first)) first[v.cafeId] = v.ts; });
    const cafes = D.CAFES.slice().sort((x, y) => (first[x.id] ? 0 : 1) - (first[y.id] ? 0 : 1) || (first[x.id] || 0) - (first[y.id] || 0)).slice(0, 16);
    cafes.forEach((cf, i) => {
      const cx = 165 + (i % 4) * 250, cy = 440 + Math.floor(i / 4) * 215, got = first[cf.id] != null;
      drawStamp(g, cf, cx, cy, 148, !got, th);
      g.fillStyle = th.ink; g.globalAlpha = got ? .95 : .4; g.textAlign = 'center'; g.font = F(500, 22); g.fillText(fit(g, cf.name, 232), cx, cy + 120); g.globalAlpha = 1;
    });
    g.fillStyle = th.ink; g.globalAlpha = .6; g.textAlign = 'left'; g.font = F(500, 26); g.fillText('Café Mood · ' + stt.xp + ' XP · ' + new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }), 80, H - 70); g.globalAlpha = 1;
    if (mark) preview(g, th, W, H);
    return c;
  }

  // Café Wrapped as its own poster: month, big café count, four small stats, café of the month (with its stamp), favourite menu, mood and level.
  function drawWrapped(th, mark) {
    const W = 1080, H = 1350, w = CM.plus.wrappedData(), k = canvas(W, H, th), c = k.c, g = k.g, st = S.get(), p = st.profile, a = p && D.ARCHETYPE_BY_ID[p.archetype];
    const TT = { coffee: 'กาแฟ', latte: 'ลาเต้', matcha: 'มัทฉะ', tea: 'ชา', signature: 'ซิกเนเจอร์' }, tint = (al) => { g.fillStyle = th.ink; g.globalAlpha = al; };
    g.save(); g.strokeStyle = th.ink; g.globalAlpha = .07; g.lineWidth = 6; [90, 190, 290, 390].forEach((r) => { g.beginPath(); g.arc(W - 90, 150, r, 0, 7); g.stroke(); }); g.restore();   // coffee-ring motif, same as the café covers
    g.fillStyle = th.ink; g.globalAlpha = .7; g.font = F(600, 28); g.fillText('CAFÉ WRAPPED', 80, 120); g.globalAlpha = 1;
    g.font = F(700, 88, true); g.fillText(new Date().toLocaleDateString('th-TH', { month: 'long', year: 'numeric' }), 80, 222);
    g.globalAlpha = .85; g.font = F(500, 34); g.fillText((st.name || 'Café Explorer') + (a ? ' · ' + a.name : ''), 80, 280); g.globalAlpha = 1;
    // hero number
    g.fillStyle = th.acc; g.font = F(700, 270, true); g.fillText(String(w.st.cafes.length), 80, 560); const nw = g.measureText(String(w.st.cafes.length)).width;
    g.fillStyle = th.ink; g.font = F(700, 44); g.fillText('ร้านที่เคยไป', 80 + nw + 34, 470); g.globalAlpha = .8; g.font = F(500, 32); g.fillText('Check-in ' + w.vs.length + ' ครั้ง', 80 + nw + 34, 520); g.globalAlpha = 1;
    // four stats
    const stats = [[w.st.drinks.length, 'เมนูที่ลอง'], [w.st.spots.length, 'Photo Spots'], [w.rainy, 'ไปตอนฝนตก'], [w.st.hidden.length, 'Hidden Café']], tw = 215;
    stats.forEach((s, i) => { const x = 80 + i * (tw + 20); tint(.1); rr(g, x, 650, tw, 170, 30); g.fill(); g.globalAlpha = 1; g.fillStyle = th.ink; g.textAlign = 'center'; g.font = F(700, 72, true); g.fillText(String(s[0]), x + tw / 2, 735); g.font = F(500, 24); g.globalAlpha = .8; g.fillText(fit(g, s[1], tw - 20), x + tw / 2, 784); g.globalAlpha = 1; g.textAlign = 'left'; });
    // café of the month
    const top = w.topCafe && D.CAFE_BY_ID[w.topCafe], n = top ? w.vs.filter((v) => v.cafeId === top.id).length : 0;
    tint(.1); rr(g, 80, 860, 470, 360, 36); g.fill(); g.globalAlpha = .7; g.fillStyle = th.ink; g.font = F(600, 24); g.fillText('ร้านแห่งเดือน', 116, 910); g.globalAlpha = 1;
    if (top) { drawStamp(g, top, 215, 1010, 170, false, th); g.fillStyle = th.ink; g.font = F(700, 34); g.fillText(fit(g, top.name, 400), 116, 1150); g.globalAlpha = .75; g.font = F(500, 24); g.fillText('Check-in ' + n + ' ครั้ง', 116, 1190); g.globalAlpha = 1; }
    // right column
    const rows = [['เมนูโปรด', w.topType ? TT[w.topType] : '—'], ['Mood ที่เลือกบ่อยสุด', w.topMood ? D.MOOD_BY_ID[w.topMood].en : '—'], ['ระดับ Passport', 'Lv.' + w.lv.level + ' ' + w.lv.name]];
    rows.forEach((r, i) => { const y = 860 + i * 125; tint(.1); rr(g, 570, y, 430, 110, 30); g.fill(); g.fillStyle = th.ink; g.globalAlpha = .7; g.font = F(600, 22); g.fillText(r[0], 604, y + 40); g.globalAlpha = 1; g.font = F(700, 38); g.fillText(fit(g, r[1], 370), 604, y + 85); });
    g.fillStyle = th.ink; g.globalAlpha = .6; g.font = F(500, 26); g.fillText('Café Mood · Wrapped · ' + w.st.xp + ' XP', 80, H - 70); g.globalAlpha = 1;
    if (mark) preview(g, th, W, H);
    return c;
  }

  function pdfFrom(jpeg, w, h) {
    const bin = atob(jpeg.split(',')[1]), img = Uint8Array.from(bin, (ch) => ch.charCodeAt(0)), PW = 595, PH = 842, ih = Math.round(PW * h / w), y = Math.round((PH - ih) / 2);
    const enc = new TextEncoder(), parts = [], off = []; let len = 0;
    const push = (x) => { const u = typeof x === 'string' ? enc.encode(x) : x; parts.push(u); len += u.length; };
    const obj = (n, body, stream) => { off[n] = len; push(n + ' 0 obj\n' + body); if (stream) { push('\nstream\n'); push(stream); push('\nendstream'); } push('\nendobj\n'); };
    push('%PDF-1.4\n');
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    obj(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + PW + ' ' + PH + '] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>');
    obj(4, '<< /Type /XObject /Subtype /Image /Width ' + w + ' /Height ' + h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + img.length + ' >>', img);
    const cs = 'q ' + PW + ' 0 0 ' + ih + ' 0 ' + y + ' cm /Im0 Do Q';
    obj(5, '<< /Length ' + cs.length + ' >>', cs);
    const x = len;
    push('xref\n0 6\n0000000000 65535 f \n' + [1, 2, 3, 4, 5].map((n) => String(off[n]).padStart(10, '0') + ' 00000 n \n').join('') + 'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + x + '\n%%EOF');
    return new Blob(parts, { type: 'application/pdf' });
  }
  const save = (blob, name) => { const u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); };

  let fontsAsked = false;
  function shareView(kind) {
    const ok = plus(), W = kind === 'wrapped', key = THEMES[S.get().passTheme] ? S.get().passTheme : 'espresso', back = W ? '#/wrapped' : '#/profile';
    if (!fontsAsked && document.fonts) {   // canvas text only uses a web font once it has loaded
      fontsAsked = true;
      Promise.all(['700 40px "Fraunces"', '500 20px "IBM Plex Sans Thai"', '700 20px "IBM Plex Sans Thai"'].map((f) => document.fonts.load(f))).then(() => { if (/^#\/(export|wshare)/.test(location.hash)) api.render(true); }, () => {});
    }
    if (W && !S.live().length) return { nav: false, html: head('Café Wrapped', 'Wrapped ของคุณ', '', back) + '<section class="pad rise"><div class="card empty"><p><b>ยังไม่มีข้อมูลให้ทำ Wrapped</b></p><p class="muted">Check-in ที่คาเฟ่สักแห่ง แล้วกลับมาส่งออกสรุปของคุณ</p><a class="btn primary" href="#/home">หาคาเฟ่วันนี้</a></div></section>' };
    cv = W ? drawWrapped(THEMES[key], !ok) : drawPassport(THEMES[key], !ok); cvName = W ? 'cafe-wrapped' : 'cafe-passport';
    return { nav: false, html: head(W ? 'Café Wrapped' : 'ส่งออก Passport', W ? 'Wrapped ของคุณ' : 'Passport ของคุณ', ok ? 'เลือกธีม แล้วบันทึกเป็นรูปหรือ PDF' : 'นี่คือตัวอย่างจากข้อมูลจริงของคุณ', back) + '<section class="pad rise share">' +
      '<div class="seg three" role="radiogroup" aria-label="ธีม">' + Object.keys(THEMES).map((k) => '<button role="radio" aria-checked="' + (k === key) + '" class="' + (k === key ? 'on' : '') + '" data-act="pp-theme" data-k="' + k + '">' + THEMES[k].n + '</button>').join('') + '</div>' +
      '<img class="pp-export" src="' + cv.toDataURL('image/jpeg', .85) + '" alt="ตัวอย่างรูป ' + (W ? 'Wrapped' : 'Passport') + ' ของคุณ">' +
      (ok ? '<div class="row2e"><button class="btn primary" data-act="pp-png">' + I('download', 18) + ' รูป PNG</button><button class="btn ghost" data-act="pp-pdf">' + I('download', 18) + ' PDF</button></div>' : lock('บันทึกเป็นรูป PNG หรือ PDF แบบไม่มีลายน้ำ', 'ตัวอย่างข้างบนมาจากข้อมูลจริงของคุณ · ดาวน์โหลดเป็นของ Plus', 'ลองฟรี')) + '</section>' };
  }
  const vExport = () => shareView('passport'), vWShare = () => shareView('wrapped');

  /* ---------- actions ---------- */
  function install(a) {
    api = a;
    const H = a.H, toast = a.toast, redo = () => a.render(true);
    H['note-rate'] = (el) => { const n = (notes()[el.dataset.id] = notes()[el.dataset.id] || {}), k = +el.dataset.k; n.r = n.r === k ? 0 : k; n.at = Date.now(); S.save(); redo(); };
    H['note-drink'] = (el) => {
      const c = D.CAFE_BY_ID[el.dataset.id], dn = c && c.drinks[+el.dataset.n]; if (!dn) return;
      const n = (notes()[c.id] = notes()[c.id] || {}); n.d = n.d || {}; if (n.d[dn.name] === el.dataset.k) delete n.d[dn.name]; else n.d[dn.name] = el.dataset.k; n.at = Date.now(); S.save(); redo();
    };
    document.addEventListener('change', (e) => {   // fires when the textarea loses focus, so typing never re-renders the page
      if (e.target.id !== 'noteText' || !plus()) return;
      const n = (notes()[e.target.dataset.id] = notes()[e.target.dataset.id] || {}); n.t = e.target.value.trim(); n.at = Date.now(); S.save(); toast('บันทึกโน้ตแล้ว');
    });
    const clr = () => { draft.times = {}; };   // a new province / length / mood re-plans the days, so typed times no longer apply
    H['trip-region'] = (el) => { draft.region = el.dataset.k; redo(); };
    H['trip-prov'] = (el) => { draft.prov = el.dataset.k; draft.region = regionOf(draft.prov); clr(); redo(); };
    H['trip-days'] = (el) => { draft.days = +el.dataset.k; clr(); redo(); };
    H['trip-mood'] = (el) => { const m = el.dataset.k; draft.moods = draft.moods.includes(m) ? draft.moods.filter((x) => x !== m) : draft.moods.concat(m); clr(); redo(); };
    H['trip-other'] = () => { draft.otherOn = !draft.otherOn; clr(); redo(); if (draft.otherOn) setTimeout(() => { const i = document.getElementById('tripOther'); if (i) i.focus(); }, 60); };
    H['trip-reset'] = () => { clr(); redo(); };
    let tm = 0;
    document.addEventListener('input', (e) => {   // typing in "อื่นๆ" only refreshes the plan below, so the keyboard stays open
      if (e.target.id !== 'tripOther') return;
      draft.other = e.target.value; clearTimeout(tm);
      tm = setTimeout(() => { clr(); const p = document.getElementById('tripPlan'), r = document.getElementById('tripRead'); if (p) p.innerHTML = planHtml(); if (r) r.innerHTML = readHtml(draft); }, 250);
    });
    H['trip-save'] = () => {
      const st = S.get(); st.trips = (st.trips || []).concat({ id: 't' + Date.now().toString(36), prov: draft.prov, days: buildPlan(draft.prov, draft.days, effMoods(draft), effWords(draft)), times: Object.assign({}, draft.times), done: {}, at: Date.now() }).slice(-8);
      S.save(); redo(); toast('บันทึกทริปแล้ว — ดูที่ “ทริปที่บันทึกไว้”');
    };
    H['trip-del'] = (el) => { const st = S.get(); st.trips = (st.trips || []).filter((x) => x.id !== el.dataset.t); S.save(); redo(); };
    document.addEventListener('change', (e) => {
      const el = e.target;
      if (el.dataset.act === 'trip-time') {   // typed time wins; the day is re-listed in time order
        const tid = el.dataset.t, box = tid ? (S.get().trips || []).find((x) => x.id === tid) : draft; if (!box) return;
        const sl = el.closest('.ttime').querySelectorAll('select'); box.times = box.times || {}; box.times[el.dataset.id] = hm((+sl[0].value) * 60 + (+sl[1].value));
        if (tid) S.save(); redo(); return;
      }
      if (el.dataset.act !== 'trip-done') return;
      const tr = (S.get().trips || []).find((x) => x.id === el.dataset.t); if (!tr) return;
      tr.done = tr.done || {}; tr.done[el.dataset.id] = el.checked; S.save();
    });
    H['pp-theme'] = (el) => { S.get().passTheme = el.dataset.k; S.save(); redo(); };
    H['pp-png'] = () => { if (plus() && cv) cv.toBlob((b) => save(b, cvName + '.png'), 'image/png'); };
    H['pp-pdf'] = () => { if (plus() && cv) save(pdfFrom(cv.toDataURL('image/jpeg', .92), cv.width, cv.height), cvName + '.pdf'); };
    Object.assign(CM.plus.pages, { notes: vNotes, smart: vSmart, trip: vTrip, export: vExport, wshare: vWShare });
  }

  CM.plusTools = { install, noteBlock, buildPlan, schedule, similar, TRIP, pdfFrom };
})();
