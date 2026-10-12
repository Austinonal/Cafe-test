/* Café Mood — recommendation eval (v28). Same file runs in node (tests/run-eval.js) and in the browser (eval.html).
   1) CASES      "this user + this weather should get this kind of café" — written from product intent, not copied from output
   2) INVARIANTS rules that must hold for every input (scores valid, deterministic, owner nudges stay capped …)
   3) GOLDEN     top-3 snapshot of canonical scenarios — a change is flagged so you decide "intended" or "formula drifted"
   4) FAIRNESS   do small / hidden / local / regional cafés get shown as often as the rest? (see fairness() below)
   Re-run after every change to js/engine.js or js/data.js:   node tests/run-eval.js        (add --update-golden to accept new snapshots) */
(function (root) {
  function run(CM, GOLDEN) {
    const E = CM.engine, D = CM.data, CAFE = D.CAFE_BY_ID;
    const uniq = (a) => Array.from(new Set(a));
    const name = (s) => s.cafe.name;

    /* ---------- fixtures ---------- */
    const ctx = (kind, hour, pm) => ({ kind, hour, pm: pm || null, night: hour >= 18.5 || hour < 5.5, temp: null });
    const CTX = { sunny: ctx('sunny', 14), cloudy: ctx('cloudy', 15), rain: ctx('rain', 16), hot: ctx('hot', 13), night: ctx('cloudy', 21), late: ctx('cloudy', 23), morning: ctx('sunny', 9), haze: ctx('cloudy', 14, 68), dawn: ctx('sunny', 3) };
    const persona = (id) => { const a = D.ARCHETYPE_BY_ID[id], p = {}; D.DIMS.forEach((d) => { p[d] = Math.max(-1, Math.min(1, (a.w[d] || 0) / 2)); }); return { p, drinkPref: id === 'bean-scholar' ? 'coffee' : id === 'sunlit-wanderer' ? 'matcha' : 'latte', hiddenAff: a.hid ? .8 : .3, weatherLove: null, archetype: id }; };
    const mood = (text, tiles) => { const a = E.analyzeText(text || ''); return { moods: uniq((tiles || []).concat(a.moods)).slice(0, 3), boosts: a.boosts, hidden: a.hidden, drink: a.drink, local: a.local, indoor: a.indoor, air: a.air, first: a.first, labels: a.labels, text: text || '' }; };
    const ses = (who, m, c) => ({ profile: who ? persona(who) : null, mood: m, ctx: CTX[c] });

    /* ---------- check helpers: each returns [ok, short note] ---------- */
    const inR = (c, spec) => Object.keys(spec).every((k) => c.attr[k] >= spec[k][0] && c.attr[k] <= (spec[k][1] == null ? 10 : spec[k][1]));
    const tops = (r, n) => r.slice(0, n);
    const list = (r, n) => tops(r, n).map((s) => name(s) + ' ' + s.match + (s.open.open ? '' : ' (ปิด)')).join(' · ');
    const top1 = (spec) => (r) => [inR(r[0].cafe, spec), list(r, 3)];
    const top3Some = (spec, k) => (r) => [tops(r, 3).filter((s) => inR(s.cafe, spec)).length >= (k || 1), list(r, 3)];
    const top3Every = (spec) => (r) => [tops(r, 3).every((s) => inR(s.cafe, spec)), list(r, 3)];
    const top5Fn = (fn, k) => (r) => [tops(r, 5).filter((s) => fn(s.cafe)).length >= (k || 1), list(r, 5)];
    const top3Open = () => (r) => [tops(r, 3).every((s) => s.open.open), list(r, 3)];
    const top3Fn = (fn, k) => (r) => [tops(r, 3).filter((s) => fn(s.cafe)).length >= (k || 1), list(r, 3)];
    const top3NoneFn = (fn) => (r) => [!tops(r, 3).some((s) => fn(s.cafe)), list(r, 3)];
    const and = (...f) => (r, s) => { const o = f.map((x) => x(r, s)); return [o.every((x) => x[0]), o[0][1]]; };
    const hasAir = (c) => !!c.air;

    /* ---------- 1) CASES ---------- */
    const CASES = [
      // tile moods, no profile, sunny afternoon
      ['focus ในวันแดดดี → ร้านที่ทำงานได้', null, mood('', ['focus']), 'sunny', top1({ work: [7] })],
      ['relax → เงียบและอบอุ่น', null, mood('', ['relax']), 'cloudy', top1({ quiet: [8], cozy: [6] })],
      ['social → ร้านที่ social สูง', null, mood('', ['social']), 'sunny', top1({ social: [7] })],
      ['photo ตอนแดดดี → ร้านถ่ายรูปสวย', null, mood('', ['photo']), 'sunny', top1({ photo: [8] })],
      ['coffee → ร้านกาแฟจริงจัง', null, mood('', ['coffee']), 'cloudy', top1({ coffee: [8] })],
      ['creative → ร้านสายครีเอทีฟ', null, mood('', ['creative']), 'cloudy', top3Some({ creative: [7] })],
      ['alone → ไม่แน่นคน', null, mood('', ['alone']), 'cloudy', top1({ crowd: [0, 3] })],
      ['cozy → อบอุ่นชวนซุก', null, mood('', ['cozy']), 'rain', top1({ cozy: [8] })],
      // free text (Thai)
      ['“นั่งเงียบ ๆ อ่านหนังสือ” → เงียบมาก', null, mood('อยากนั่งเงียบ ๆ คนเดียว อ่านหนังสือ แล้วอยากได้ร้านบรรยากาศดี'), 'cloudy', top1({ quiet: [8] })],
      ['“ถ่ายรูป ต้นไม้ แสงสวย” → ธรรมชาติ+รูปสวย', null, mood('นัดเพื่อนถ่ายรูป อยากได้ร้านที่มีต้นไม้และแสงสวย ๆ'), 'sunny', top3Some({ nature: [6], photo: [8] })],
      ['“มัทฉะ ร้านลับ” → ร้านลับอยู่ในสาม', null, mood('อยากหามัทฉะอร่อย ๆ ร้านลับ ไม่ค่อยมีคนรู้'), 'sunny', top3Fn((c) => c.reviews < 400 && c.rating >= 4.5, 2)],
      ['“ทำงาน ปลั๊ก” → work สูง', null, mood('ต้องทำงานทั้งวัน ขอที่มีปลั๊กกับ wifi'), 'cloudy', top3Some({ work: [8] }, 2)],
      // weather
      ['ฝนตก + relax → ไม่แนะนำร้าน outdoor จัด', null, mood('', ['relax']), 'rain', top3NoneFn((c) => c.attr.outdoor >= 8)],
      ['ฝนตก ไม่เลือก mood → ในร่ม มีกระจก/อุ่น', null, null, 'rain', top3Every({ outdoor: [0, 6] })],
      ['ร้อนจัด → เย็นสบาย (outdoor ต่ำ)', null, mood('', ['relax']), 'hot', top3Some({ outdoor: [0, 3] }, 2)],
      ['แดดดี + photo → ร้านสว่าง', null, mood('', ['photo']), 'sunny', top3Some({ bright: [7] }, 2)],
      ['กลางคืน 21:00 → ร้านที่เปิดอยู่ทั้งสาม', null, null, 'night', top3Open()],
      ['กลางคืน 21:00 → บรรยากาศมืด/อุ่นอยู่ในสาม', null, mood('', ['relax']), 'night', top3Some({ dark: [6] })],
      ['ดึก 23:00 → เปิดทั้งสาม', null, null, 'late', top3Open()],
      ['เช้า 09:00 → ร้านที่เปิดแล้วทั้งสาม', null, null, 'morning', top3Open()],
      ['ฝุ่น PM2.5 สูง → ร้านที่มีเครื่องฟอกอยู่ในห้าอันดับแรก', null, mood('', ['relax']), 'haze', top5Fn(hasAir)],
      ['ฝุ่น PM2.5 สูง → ไม่ดันร้านกลางแจ้งจัด', null, mood('', ['photo']), 'haze', top3NoneFn((c) => c.attr.outdoor >= 8)],
      // persona
      ['quiet-explorer → เงียบ', 'quiet-explorer', null, 'cloudy', top1({ quiet: [8] })],
      ['sunlit-wanderer ตอนแดดดี → สว่าง+ธรรมชาติ', 'sunlit-wanderer', null, 'sunny', top1({ bright: [6], nature: [4] })],
      ['midnight-brewer ตอนค่ำ → มืด/อุ่น', 'midnight-brewer', null, 'night', top1({ dark: [6] })],
      ['frame-hunter ตอนแดดดี → photo สูง', 'frame-hunter', null, 'sunny', top1({ photo: [8] })],
      ['social-butterfly → social สูง', 'social-butterfly', null, 'sunny', top1({ social: [7] })],
      ['bean-scholar → กาแฟจริงจัง', 'bean-scholar', null, 'cloudy', top3Some({ coffee: [9] })],
      ['dreamy-maker → ครีเอทีฟ', 'dreamy-maker', null, 'cloudy', top3Some({ creative: [6] })],
      ['ต่างคน ต่างผล: quiet-explorer ≠ social-butterfly (mood เดียวกัน)', null, null, 'sunny', (r, s) => {
        const a = E.rank(Object.assign({}, s, { profile: persona('quiet-explorer'), mood: mood('', ['relax']) }))[0], b = E.rank(Object.assign({}, s, { profile: persona('social-butterfly'), mood: mood('', ['relax']) }))[0];
        return [a.cafe.id !== b.cafe.id, name(a) + ' vs ' + name(b)];
      }],
      ['อากาศเปลี่ยน คำตอบเปลี่ยน (photo: ฝน ≠ แดด)', null, mood('', ['photo']), 'sunny', (r, s) => {
        const a = E.rank(Object.assign({}, s, { ctx: CTX.rain }))[0], b = r[0];
        return [a.cafe.id !== b.cafe.id, 'ฝน ' + name(a) + ' vs แดด ' + name(b)];
      }],
      // context asks
      ['ขอ “ร้านท้องถิ่น” → มีร้านท้องถิ่นในสาม', null, mood('อยากลองร้านท้องถิ่นของแท้'), 'sunny', top3Fn((c) => !!c.local)],
      ['ขอ “เครื่องฟอกอากาศ” ตรง ๆ → มีร้านที่มีเครื่องฟอกอยู่ในสาม', null, mood('อยากได้ร้านที่มีเครื่องฟอกอากาศ'), 'cloudy', top3Fn(hasAir), 'known'],
      ['ขอ “อยู่ในร่ม แอร์เย็น” → outdoor ต่ำ', null, mood('อยากนั่งในร่ม แอร์เย็น ๆ'), 'sunny', top3Every({ outdoor: [0, 4] })],
      ['ขอ “ร้านลับ” → มีร้านรีวิวน้อย <100 อยู่ในสาม', null, mood('อยากได้ร้านลับ ไม่ค่อยมีคนรู้จัก'), 'cloudy', top3Fn((c) => c.reviews < 100)],
    ].map((c, i) => ({ id: 'C' + String(i + 1).padStart(2, '0'), title: c[0], session: ses(c[1], c[2], c[3]), check: c[4], sev: c[5] }));

    // “อื่นๆ” text matching (owner words ↔ customer words)
    const TM = [['เงียบ ๆ', 'บรรยากาศสงบ', true], ['ดนตรีสด', 'มีแจ๊สทุกเสาร์', true], ['มัทฉะ', 'ชาเขียวญี่ปุ่น', true], ['ทะเล', 'ที่ทำงาน มีปลั๊ก', false], ['', 'สงบ', false], ['อยากถ่ายรูป', 'มุมถ่ายภาพสวย', true], ['เวิร์กช็อปเซรามิก', 'ปั้นดินเหนียวทุกวันอาทิตย์', true], ['ครอบครัว เด็กเล็ก', 'ร้านเงียบ อ่านหนังสือ', false]];
    TM.forEach((t, i) => CASES.push({ id: 'T' + (i + 1), title: 'อื่นๆ: “' + t[0] + '” ' + (t[2] ? '≈' : '≠') + ' “' + t[1] + '”', session: null, check: () => { const v = E.textMatch(t[0], t[1]); return [(v >= .5) === t[2], 'score ' + v.toFixed(2)]; } }));

    // drinks follow the weather
    const drinks = (c, m) => E.drinkRank({ profile: null, mood: m, ctx: CTX[c] });
    CASES.push({ id: 'D1', title: 'ฝนตก → เครื่องดื่มอุ่นนำ', session: null, check: () => { const r = drinks('rain', null).slice(0, 5); return [r.filter((x) => x.drink.temp === 'hot').length >= 3, r.map((x) => x.drink.name + ' (' + x.drink.temp + ')').join(' · ')]; } });
    CASES.push({ id: 'D2', title: 'แดดดี → เครื่องดื่มเย็นนำ', session: null, check: () => { const r = drinks('sunny', null).slice(0, 5); return [r.filter((x) => x.drink.temp === 'iced').length >= 3, r.map((x) => x.drink.name + ' (' + x.drink.temp + ')').join(' · ')]; } });
    CASES.push({ id: 'D3', title: '“มัทฉะ” → เมนูมัทฉะเป็นอันดับแรก', session: null, check: () => { const r = drinks('sunny', mood('อยากกินมัทฉะ')); return [r[0].drink.type === 'matcha', r[0].drink.name]; } });

    /* ---------- 2) INVARIANTS ---------- */
    const INV = [];
    const inv = (title, fn) => INV.push({ title, fn });
    const sample = () => { const out = []; ['sunny', 'rain', 'night', 'haze', 'dawn'].forEach((c) => [null, mood('', ['relax']), mood('อยากหาร้านลับ นั่งเงียบ ๆ')].forEach((m) => [null, 'quiet-explorer', 'social-butterfly'].forEach((w) => out.push(ses(w, m, c))))); return out; };
    inv('ทุกคะแนนเป็นเลขจำนวนเต็ม 0–99 และไม่มี NaN', () => { const bad = []; sample().forEach((s) => E.rank(s).forEach((x) => { if (!Number.isInteger(x.match) || x.match < 0 || x.match > 99) bad.push(name(x) + '=' + x.match); })); return [!bad.length, bad.slice(0, 3).join(', ') || sample().length + ' sessions']; });
    inv('ผลลัพธ์เรียงจากมากไปน้อย และมีครบทุกร้านไม่ซ้ำ', () => { const bad = sample().filter((s) => { const r = E.rank(s); return r.length !== D.CAFES.length || new Set(r.map((x) => x.cafe.id)).size !== r.length || r.some((x, i) => i && r[i - 1].match < x.match); }); return [!bad.length, D.CAFES.length + ' ร้าน']; });
    inv('ผลลัพธ์เหมือนเดิมทุกครั้ง (deterministic)', () => { const s = ses('quiet-explorer', mood('', ['relax']), 'rain'); return [E.rank(s).map((x) => x.cafe.id).join() === E.rank(s).map((x) => x.cafe.id).join(), '']; });
    inv('ทุกร้านมีเหตุผลอย่างน้อย 1 ข้อ ไม่เกิน 3', () => { const bad = []; sample().slice(0, 12).forEach((s) => E.rank(s).forEach((x) => { if (!x.reasons.length || x.reasons.length > 3) bad.push(name(x)); })); return [!bad.length, bad.slice(0, 3).join(', ')]; });
    inv('ร้านที่ปิดอยู่ถูกลดอันดับ แต่ยังแสดงสถานะ “ปิดอยู่” (3 นาฬิกา)', () => { const r = E.rank(ses(null, null, 'dawn')); return [r.every((x) => !x.open.open === !E.openInfo(x.cafe, 3).open) && r.length === D.CAFES.length, r.filter((x) => x.open.open).length + ' ร้านเปิดตอนตี 3']; });
    inv('สัญญาณจากเจ้าของร้าน (live) ดันได้ไม่เกิน ~3 คะแนน — ซื้ออันดับไม่ได้', () => {
      let worst = 0; sample().forEach((s) => D.CAFES.slice(0, 12).forEach((c) => {
        const base = E.scoreCafe(c, s).match, live = E.scoreCafe(Object.assign({}, c, { live: { mood: 'cozy', status: 'quiet', seats: 9 } }), s).match;
        worst = Math.max(worst, live - base);
      })); return [worst <= 3, 'สูงสุด +' + worst];
    });
    inv('“บังคับเปิด” จากเจ้าของไม่เปลี่ยนอันดับเกินที่ควร (ปิดชั่วคราว ลดลงเท่านั้น)', () => { const s = ses(null, null, 'sunny'), c = D.CAFES[0]; const a = E.scoreCafe(c, s).match, b = E.scoreCafe(Object.assign({}, c, { force: 'closed' }), s).match; return [b <= a, a + ' → ' + b]; });
    inv('ป้าย “ท้องถิ่น/ต่างจังหวัด” ไม่มีผลกับคะแนน เว้นแต่ผู้ใช้ขอเอง (และไม่เกิน 4 คะแนน)', () => {
      let off = 0, on = 0; sample().forEach((s) => D.CAFES.forEach((c) => {
        const flip = Object.assign({}, c, { local: !c.local, province: c.province ? undefined : 'x', region: c.region ? undefined : 'north' });
        off = Math.max(off, Math.abs(E.scoreCafe(flip, s).match - E.scoreCafe(c, s).match));
        const ask = Object.assign({}, s, { mood: mood('อยากลองร้านท้องถิ่น') }); on = Math.max(on, Math.abs(E.scoreCafe(flip, ask).match - E.scoreCafe(c, ask).match));
      })); return [off === 0 && on <= 4, 'ไม่ได้ขอ: ต่างสูงสุด ' + off + ' · ขอเอง: ต่างสูงสุด ' + on];
    });
    inv('จ่ายเงิน Boost / Sponsored ไม่มีผลกับอันดับแนะนำ', () => { let worst = 0; sample().forEach((s) => D.CAFES.forEach((c) => { worst = Math.max(worst, Math.abs(E.scoreCafe(Object.assign({}, c, { boost: Date.now() + 9e9, sponsored: true }), s).match - E.scoreCafe(c, s).match)); })); return [worst === 0, 'ต่างสูงสุด ' + worst]; });
    inv('ตอบ Quiz ครบ → ได้ archetype ที่มีอยู่จริง', () => { const ans = D.QUIZ.map(() => 0); const p = E.buildProfile(ans); return [!!D.ARCHETYPE_BY_ID[p.archetype] && E.likes(p).length <= 6, p.archetype]; });
    inv('Quiz: ทุกตัวเลือกให้ผลได้ ไม่ error', () => { let n = 0; try { D.QUIZ.forEach((q, qi) => q.options.forEach((o, oi) => { const a = D.QUIZ.map(() => 0); a[qi] = oi; E.buildProfile(a); n++; })); } catch (e) { return [false, String(e)]; } return [true, n + ' ตัวเลือก']; });

    /* ---------- 3) GOLDEN ---------- */
    const GOLD = [['g-relax-cloudy', null, mood('', ['relax']), 'cloudy'], ['g-focus-sunny', null, mood('', ['focus']), 'sunny'], ['g-social-hot', null, mood('', ['social']), 'hot'], ['g-photo-rain', null, mood('', ['photo']), 'rain'], ['g-photo-sunny', null, mood('', ['photo']), 'sunny'],
      ['g-coffee-morning', null, mood('', ['coffee']), 'morning'], ['g-cozy-night', null, mood('', ['cozy']), 'night'], ['g-none-haze', null, null, 'haze'], ['g-qe-cloudy', 'quiet-explorer', null, 'cloudy'], ['g-sw-sunny', 'sunlit-wanderer', null, 'sunny'],
      ['g-mb-late', 'midnight-brewer', null, 'late'], ['g-text-quiet', null, mood('อยากนั่งเงียบ ๆ อ่านหนังสือ'), 'cloudy'], ['g-text-secret-matcha', null, mood('อยากหามัทฉะ ร้านลับ'), 'sunny']]
      .map((g) => ({ id: g[0], top: E.rank(ses(g[1], g[2], g[3])).slice(0, 3).map((x) => x.cafe.id) }));

    /* ---------- 4) FAIRNESS ---------- */
    function fairness() {
      const hours = [9, 11, 13, 15, 17, 19, 21, 23], kinds = ['sunny', 'cloudy', 'rain', 'hot'];
      const ctxs = []; kinds.forEach((k) => hours.forEach((h) => ctxs.push(ctx(k === 'hot' && h >= 18 ? 'cloudy' : k, h)))); hours.forEach((h) => ctxs.push(ctx('cloudy', h, 68)));
      const moods = [null].concat(D.MOODS.map((m) => mood('', [m.id]))), who = [null].concat(D.ARCHETYPES.map((a) => a.id));
      const stat = {}; D.CAFES.forEach((c) => { stat[c.id] = { c, open: 0, top1: 0, top3: 0, top5: 0, matchSum: 0, dayOpen: 0, dayTop1: 0 }; });
      let n = 0;
      ctxs.forEach((cx) => moods.forEach((m) => who.forEach((w) => {
        const r = E.rank({ profile: w ? persona(w) : null, mood: m, ctx: cx }); n++;
        const day = cx.hour >= 9 && cx.hour <= 17 && !cx.pm;
        r.forEach((x, i) => { const s = stat[x.cafe.id]; if (x.open.open) s.open++; if (day && x.open.open) s.dayOpen++; if (day && i < 1) s.dayTop1++; if (i < 1) s.top1++; if (i < 3) s.top3++; if (i < 5) s.top5++; s.matchSum += x.match; });
      })));
      const rows = Object.values(stat).map((s) => ({ id: s.c.id, name: s.c.name, reviews: s.c.reviews, rating: s.c.rating, hidden: E.hiddenInfo(s.c).eligible, local: !!s.c.local, regional: !!s.c.province, openPct: s.open / n, dayTop1Open: s.dayOpen ? s.dayTop1 / s.dayOpen : 0, top1: s.top1 / n, top3: s.top3 / n, top5: s.top5 / n, avgMatch: s.matchSum / n,
        // exposure while open: a café that closes at 14:00 cannot be shown in the evening, so we compare only the hours it could be shown
        top3Open: s.open ? s.top3 / s.open : 0 }));
      const grp = (title, test) => { const a = rows.filter(test), b = rows.filter((x) => !test(x)); const m = (l) => (l.length ? l.reduce((t, x) => t + x.top3Open, 0) / l.length : 0); return { title, n: a.length, rate: m(a), restN: b.length, restRate: m(b), ratio: m(b) ? m(a) / m(b) : null }; };
      const groups = [grp('ร้านเล็ก (<150 รีวิว) เทียบกับร้านอื่น', (x) => x.reviews < 150), grp('ร้านใหญ่ (>600 รีวิว) เทียบกับร้านอื่น', (x) => x.reviews > 600), grp('Hidden gem (รีวิวน้อย คะแนนสูง)', (x) => x.hidden), grp('ร้านท้องถิ่น', (x) => x.local), grp('ร้านต่างจังหวัด', (x) => x.regional), grp('ร้านเปิดสั้น (<8 ชม./วัน)', (x) => { const c = CAFE[x.id]; return c.hours[1] - c.hours[0] < 8; })];
      // counterfactual: same café, only the review count changes (20 vs 3000) — does popularity move its score?
      let dSum = 0, dMax = -99, dMin = 99, k = 0;
      D.CAFES.forEach((c) => [CTX.sunny, CTX.rain, CTX.night].forEach((cx) => [null, mood('', ['relax']), mood('', ['social'])].forEach((m) => [null, 'quiet-explorer'].forEach((w) => {
        const s = { profile: w ? persona(w) : null, mood: m, ctx: cx };
        const lo = E.scoreCafe(Object.assign({}, c, { reviews: 20 }), s).match, hi = E.scoreCafe(Object.assign({}, c, { reviews: 3000 }), s).match;
        dSum += lo - hi; dMax = Math.max(dMax, lo - hi); dMin = Math.min(dMin, lo - hi); k++;
      }))));
      const never3 = rows.filter((x) => x.top3 === 0), never5 = rows.filter((x) => x.top5 === 0);
      const wins = rows.slice().sort((a, b) => b.top1 - a.top1).slice(0, 3);
      const checks = [];
      groups.filter((g) => /เล็ก|Hidden|ท้องถิ่น|ต่างจังหวัด|เปิดสั้น/.test(g.title)).forEach((g) => checks.push({ sev: 'warn', title: g.title + ': ถูกแสดงไม่น้อยกว่า 80% ของร้านอื่น (นับเฉพาะช่วงที่เปิด)', ok: g.ratio == null || g.ratio >= .8, note: 'อัตราส่วน ' + (g.ratio == null ? '–' : g.ratio.toFixed(2)) }));
      checks.push({ title: 'จำนวนรีวิวอย่างเดียวไม่ทำให้คะแนนร้านลดลง (ร้านเล็กต้องไม่ต่ำกว่าร้านเดียวกันที่รีวิวเยอะ)', ok: dMin >= 0, note: 'ส่วนต่าง 20 vs 3000 รีวิว: เฉลี่ย ' + (dSum / k).toFixed(2) + ', ต่ำสุด ' + dMin + ', สูงสุด ' + dMax + ' คะแนน' });
      checks.push({ title: 'ไม่มีร้านใดที่ “ไม่เคยติด 3 อันดับแรก” เลยในทุกสถานการณ์', ok: !never3.length, note: never3.length ? never3.map((x) => x.name).join(', ') : 'ทุกร้านมีโอกาส' });
      checks.push({ title: 'ไม่มีร้านใดที่ “ไม่เคยติด 5 อันดับแรก”', ok: !never5.length, note: never5.length ? never5.map((x) => x.name).join(', ') : 'ทุกร้านมีโอกาส' });
      const dom = rows.slice().sort((a, b) => b.dayTop1Open - a.dayTop1Open)[0];
      checks.push({ title: 'โบนัสร้านเล็ก/ร้านลับไม่เกิน 4 คะแนน (ไม่ใช่ทางลัดขึ้นที่ 1)', ok: dMax <= 4, note: 'สูงสุด +' + dMax });
      checks.push({ sev: 'warn', title: 'ไม่มีร้านใดชนะอันดับ 1 เกิน 30% ของช่วงกลางวันที่ร้านนั้นเปิด', ok: dom.dayTop1Open <= .3, note: dom.name + ' ' + Math.round(dom.dayTop1Open * 100) + '% (ร้านลับที่ attribute เด่นหลายด้าน — ไม่ใช่โบนัส)' });
      checks.forEach((c) => { if (c.ok) delete c.sev; });
      return { sessions: n, rows, groups, checks, counterfactual: { avg: dSum / k, min: dMin, max: dMax, n: k } };
    }

    /* ---------- run ---------- */
    const results = CASES.map((c) => { let o; try { o = c.check(c.session ? E.rank(c.session) : null, c.session); } catch (e) { o = [false, 'error: ' + e.message]; } return { id: c.id, title: c.title, ok: !!o[0], note: o[1], sev: c.sev }; });
    const invs = INV.map((i) => { let o; try { o = i.fn(); } catch (e) { o = [false, 'error: ' + e.message]; } return { title: i.title, ok: !!o[0], note: o[1] }; });
    const golden = GOLD.map((g) => { const was = GOLDEN && GOLDEN[g.id]; const same = was && was.join() === g.top.join(); return { id: g.id, top: g.top, was: was || null, ok: !!same, status: !was ? 'new' : same ? 'same' : 'changed' }; });
    const fair = fairness();
    return { cases: results, invariants: invs, golden, fairness: fair, goldenNow: GOLD.reduce((o, g) => { o[g.id] = g.top; return o; }, {}) };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { run }; else root.CM_EVAL = { run };
})(typeof window !== 'undefined' ? window : globalThis);
