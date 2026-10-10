/* Café Mood — products & entitlements (prototype).
   The developer defines products in the back office (js/content.js → products): subscriptions, one-time purchases
   (for a period or for good) and pre-orders of features that are not ready yet. A buyer pays by transfer, the developer
   confirms the money arrived and sends an activation code, and the code records an entitlement on this device.
   An entitlement is "pre-ordered" until the developer releases the product, then it starts counting. */
(function () {
  window.CM = window.CM || {};
  const S = CM.store, I = CM.icon, DAY = 864e5;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => '฿' + Number(n).toLocaleString('en-US');
  const dateTh = (ts) => new Date(ts).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
  const ymd = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  const row = (k, v) => '<li><span>' + k + '</span><b>' + v + '</b></li>';
  let api = null, buy = null;   // buy = { pid, opt } while the purchase sheet is open

  function addMonths(ts, n) {   // same day-of-month, n months later (a short month ends on its last day)
    const d = new Date(ts), day = d.getDate();
    d.setDate(1); d.setMonth(d.getMonth() + n);
    d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
    return d.getTime();
  }
  const prods = () => (CM.dev ? CM.dev.products() : []);
  const byId = (id) => prods().find((p) => p.id === id) || null;
  const mine = () => (S.get().ent = S.get().ent || []);
  const entOf = (pid) => mine().find((e) => e.pid === pid) || null;
  const pend = () => (S.get().entPending = S.get().entPending || {});

  // When an entitlement ends: 0 = never, null = pre-order not started. A pre-order starts counting when the product is released.
  function untilOf(e, p) {
    if (p && p.status === 'pre') return null;
    const base = Math.max(e.at, (p && p.releasedAt) || 0);
    return e.u ? e.u : e.m ? addMonths(base, e.m) : e.d ? base + e.d * DAY : 0;
  }
  function state(p) {
    const e = entOf(p.id);
    if (!e) return { k: 'none' };
    if (p.status === 'pre') return { k: 'pre' };
    const u = untilOf(e, p);
    return u === 0 || u > Date.now() ? { k: 'active', until: u } : { k: 'expired', until: u };
  }
  const openFor = (p, aud) => p.status === 'sale' && (p.openTo === 'both' || p.openTo === aud);   // released to everyone for free
  const live = (p, aud) => state(p).k === 'active' || openFor(p, aud);
  const has = (key, aud) => prods().some((p) => (p.id === key || p.flag === key) && live(p, aud));
  const RANK = { pro: 1, group: 2 };
  function studioPlan() { let best = ''; prods().forEach((p) => { if (p.grants && p.grants.studio && live(p, 'owner') && (RANK[p.grants.studio] || 0) > (RANK[best] || 0)) best = p.grants.studio; }); return best; }
  function studioSources() {   // plans from products, for the "from the developer" badge: [{ plan, until (0 = no end), name }]
    return prods().filter((p) => p.grants && p.grants.studio && live(p, 'owner')).map((p) => ({ plan: p.grants.studio, name: p.name, until: openFor(p, 'owner') ? 0 : state(p).until || 0 }));
  }
  function plusUntil() {   // null = no Plus from products · 0 = forever · timestamp
    let out = null;
    prods().forEach((p) => {
      if (!(p.grants && p.grants.plus && live(p, 'customer'))) return;
      const st = state(p), u = openFor(p, 'customer') || st.k !== 'active' ? 0 : st.until;
      if (out === null || u === 0 || (out !== 0 && u > out)) out = u;
    });
    return out;
  }

  /* ---------- what the buyer can pick ---------- */
  function options(p) {
    const o = [];
    if (p.kind === 'sub') { if (p.price.month > 0) o.push({ o: 'month', label: 'รายเดือน', amt: p.price.month, m: 1, note: 'ตัดทีละเดือน ต้องต่อทุกเดือน' }); if (p.price.year > 0) o.push({ o: 'year', label: 'รายปี', amt: p.price.year, m: 12, note: 'จ่ายครั้งเดียว ใช้ 12 เดือน' }); }
    else if (p.price.once > 0) o.push({ o: 'once', label: 'ซื้อครั้งเดียว', amt: p.price.once, note: p.dur.t === 'forever' ? 'ใช้ได้ตลอดไป' : p.dur.t === 'days' ? 'ใช้ได้ ' + p.dur.d + ' วัน' : 'ใช้ได้ถึง ' + dateTh(p.dur.u) });
    return o;
  }
  // the duration an option gives, in the same shape as a code from the developer
  const spec = (p, opt) => (opt.m ? { m: opt.m } : p.dur.t === 'days' ? { d: p.dur.d } : p.dur.t === 'until' ? { u: p.dur.u } : {});
  const inWindow = (p) => { const t = ymd(); return (!p.sale || !p.sale.from || p.sale.from <= t) && (!p.sale || !p.sale.to || p.sale.to >= t); };
  const shown = (p, aud) => (p.aud === aud || p.aud === 'both') && p.status !== 'draft' && ((['sale', 'pre'].includes(p.status) && inWindow(p)) || state(p).k !== 'none' || openFor(p, aud));

  function applyToken(t) {   // t = verified payload of a "prod" code → { ok, msg }
    const p = byId(t.pr), st = S.get(), used = (st.entUsed = st.entUsed || []);
    if (!p) return { ok: false, msg: 'ไม่พบรายการนี้ — ผู้พัฒนายังไม่ได้เผยแพร่รายการล่าสุด ลองใหม่ภายหลัง' };
    if (used.includes(t.i)) return { ok: false, msg: 'รหัสนี้ใช้ไปแล้วในเครื่องนี้' };
    const cur = entOf(p.id), keep = cur && ['active', 'pre'].includes(state(p).k);
    if (t.m && keep && cur.m) cur.m += t.m;   // renewing adds months to the current period
    else { st.ent = mine().filter((e) => e.pid !== p.id).concat({ pid: p.id, at: Date.now(), m: t.m || 0, d: t.d || 0, u: t.u || 0 }); }
    delete pend()[p.id]; used.push(t.i); S.save();
    if (CM.studio && CM.studio.resetUse) CM.studio.resetUse();   // an owner who had chosen Starter moves to what was just activated
    return { ok: true, msg: p.status === 'pre' ? 'สั่งจอง “' + p.name + '” แล้ว — จะเปิดใช้เมื่อฟีเจอร์พร้อม' : 'เปิดใช้ “' + p.name + '” แล้ว', name: p.name, p };
  }

  /* ---------- cards ---------- */
  function card(p, aud) {
    const st = state(p), open = openFor(p, aud), opts = options(p), q = pend()[p.id];
    const badge = p.status === 'pre' ? '<span class="badge gem">พรีออเดอร์' + (p.eta ? ' · ' + esc(p.eta) : '') + '</span>' : p.status === 'off' ? '<span class="badge off">ปิดขาย</span>' : '<span class="badge ok">ขายอยู่</span>';
    const line = open ? 'เปิดให้ทุกคนใช้ฟรี' : st.k === 'active' ? 'ใช้งานอยู่ ' + (st.until ? 'ถึง ' + dateTh(st.until) : 'ตลอดไป') : st.k === 'pre' ? 'สั่งจองไว้แล้ว — จะเปิดใช้เมื่อฟีเจอร์พร้อม' : st.k === 'expired' ? 'หมดอายุเมื่อ ' + dateTh(st.until) : '';
    const canBuy = !open && opts.length && p.status !== 'off' && !(st.k === 'active' && p.kind === 'once') && st.k !== 'pre';
    return '<div class="card plan prod"><div class="set-row"><h2 class="sec-title first">' + esc(p.name) + '</h2>' + badge + '</div>' + (p.desc ? '<p class="pr-sub">' + esc(p.desc) + '</p>' : '') +
      (p.feats && p.feats.length ? '<ul>' + p.feats.map((x) => '<li>' + I('check', 15) + esc(x) + '</li>').join('') + '</ul>' : '') +
      (opts.length ? '<p class="small"><b>' + opts.map((x) => money(x.amt) + (x.o === 'month' ? ' / เดือน' : x.o === 'year' ? ' / ปี' : '')).join(' หรือ ') + '</b></p>' : '') +
      (line ? '<p class="small ' + (st.k === 'expired' ? 'bad' : '') + '">' + I(st.k === 'active' || open ? 'check' : 'clock', 15) + ' ' + line + '</p>' : '') +
      (q ? '<p class="small">รอตรวจสอบการชำระเงิน · รหัสอ้างอิง ' + esc(q.ref) + '</p><div class="row2"><button class="btn ghost" data-act="ent-pay-info" data-id="' + p.id + '">วิธีโอน</button><button class="btn text" data-act="ent-pend-cancel" data-id="' + p.id + '">ยกเลิกคำขอ</button></div>' : '') +
      (canBuy && !q ? '<button class="btn ' + (p.status === 'pre' ? 'ghost' : 'primary') + ' block" data-act="ent-buy" data-id="' + p.id + '">' + (p.status === 'pre' ? 'พรีออเดอร์' : st.k === 'active' ? 'ต่ออายุ' : 'สั่งซื้อ') + '</button>' : '') + '</div>';
  }
  const visible = (aud) => prods().filter((p) => shown(p, aud));
  function cardsHtml(aud) {
    const v = visible(aud);
    if (!v.length) return '';
    return '<h2 class="sec-title">' + I('sparkles', 20) + (aud === 'owner' ? 'ฟีเจอร์เสริมและแพ็กเกจพิเศษ' : 'ฟีเจอร์พิเศษและแพ็กเกจ') + '</h2>' + v.map((p) => card(p, aud)).join('') +
      '<div class="card"><h2 class="sec-title first">' + I('lock', 20) + 'มีรหัสเปิดใช้งาน?</h2><div class="cc-in tok"><input id="entCode" type="text" autocomplete="off" spellcheck="false" placeholder="วางรหัสที่ผู้พัฒนาส่งให้" aria-describedby="entMsg"><button class="btn primary sm" data-act="ent-activate">ใช้รหัส</button></div><p id="entMsg" class="muted small" role="status">ได้หลังโอนเงินและผู้พัฒนาตรวจว่าเงินเข้าแล้ว</p></div>';
  }
  const profileRow = (mrow) => (visible('customer').length ? mrow('sparkles', 'ฟีเจอร์พิเศษและแพ็กเกจ', 'พรีออเดอร์ ฟีเจอร์ใหม่ และแพ็กเกจเสริม', visible('customer').length + ' รายการ', 'href="#/store"') : '');

  /* ---------- purchase ---------- */
  function install(a) {
    api = a;
    const H = api.H, toast = api.toast, audOf = () => (location.hash.indexOf('#/studio') === 0 ? 'owner' : 'customer');
    function sheet(p) {
      const opts = options(p), opt = opts.find((x) => x.o === buy.opt) || opts[0], pi = CM.dev.pay();
      buy.opt = opt.o;
      api.openSheet('<h2 id="sheetTitle">' + (p.status === 'pre' ? 'พรีออเดอร์ ' : 'สั่งซื้อ ') + esc(p.name) + '</h2>' +
        (opts.length > 1 ? '<div class="pay-opts" role="radiogroup" aria-label="รอบการชำระ">' + opts.map((x) => '<button class="pay-opt' + (x.o === opt.o ? ' on' : '') + '" role="radio" aria-checked="' + (x.o === opt.o) + '" data-act="ent-opt" data-id="' + p.id + '" data-o="' + x.o + '"><b>' + x.label + '</b><span>' + money(x.amt) + '</span><small>' + x.note + '</small></button>').join('') + '</div>' : '') +
        '<ul class="xp-lines">' + row('ยอดที่ต้องจ่าย', money(opt.amt)) + row('ได้รับ', esc(opt.note)) + (p.status === 'pre' ? row('สถานะ', 'จองไว้ — เปิดใช้เมื่อฟีเจอร์พร้อม' + (p.eta ? ' (' + esc(p.eta) + ')' : '')) : '') + row('วิธีชำระ', pi ? 'โอนเงิน — เปิดใช้เมื่อตรวจว่าเงินเข้า' : 'เดโม ไม่เก็บเงินจริง') + '</ul>' +
        '<button class="btn primary lg" data-act="ent-confirm" data-id="' + p.id + '">' + (pi ? 'ไปขั้นตอนโอนเงิน' : 'ยืนยัน') + '</button><button class="btn text block" data-act="close-sheet">ยังไม่ตอนนี้</button>');
    }
    function paySheet(p) {
      const q = pend()[p.id], pi = CM.dev.pay(), cafe = CM.studio && CM.studio.myCafe ? CM.studio.myCafe() : null;
      const code = CM.dev.payCode({ r: q.ref, pr: p.id, o: q.opt, a: q.amt, t: q.ts, c: cafe ? cafe.id : '', u: q.aud });
      const msg = 'ขอ' + (p.status === 'pre' ? 'พรีออเดอร์ ' : 'สั่งซื้อ ') + p.name + ' ยอด ' + money(q.amt) + ' รหัสอ้างอิง ' + q.ref + '\n' + code;
      api.openSheet('<h2 id="sheetTitle">โอนเงิน ' + money(q.amt) + '</h2>' + CM.dev.payBox() + '<ul class="xp-lines">' + row('รหัสอ้างอิง', esc(q.ref)) + '</ul>' +
        '<ol class="pay-steps"><li>โอนยอดตามด้านบน (สแกน QR หรือโอนตามเลขบัญชี)</li><li>กด “คัดลอกข้อความ” แล้วส่งให้ผู้พัฒนาพร้อมสลิป' + (pi && pi.contact ? ' ทาง ' + esc(pi.contact) : '') + '</li><li>ผู้พัฒนาตรวจว่าเงินเข้าแล้วจะส่ง <b>รหัสเปิดใช้งาน</b> ให้ — ใส่ในช่อง “มีรหัสเปิดใช้งาน?”</li></ol>' +
        '<button class="btn primary lg" data-act="copy-text" data-v="' + esc(msg) + '">คัดลอกข้อความส่งผู้พัฒนา</button><button class="btn text block" data-act="close-sheet">ปิด</button>');
    }
    H['ent-buy'] = (el) => { const p = byId(el.dataset.id); if (!p) return; buy = { pid: p.id, opt: '' }; sheet(p); };
    H['ent-opt'] = (el) => { const p = byId(el.dataset.id); buy.opt = el.dataset.o; sheet(p); };
    H['ent-confirm'] = (el) => {
      const p = byId(el.dataset.id), opt = options(p).find((x) => x.o === buy.opt) || options(p)[0];
      if (!p || !opt) return;
      if (!CM.dev.pay()) {   // demo: no payment account set up → open at once
        const r = applyToken(Object.assign({ pr: p.id, i: 'demo' + Date.now() }, spec(p, opt)));
        api.closeSheet(true); api.render(true); return toast(r.msg + ' (เดโม ไม่เก็บเงินจริง)');
      }
      pend()[p.id] = { ref: 'CM-' + CM.dev.rand(5), opt: opt.o, amt: opt.amt, ts: Date.now(), aud: audOf() }; S.save(); paySheet(p); api.render(true);
    };
    H['ent-pay-info'] = (el) => { const p = byId(el.dataset.id); if (p && pend()[p.id]) paySheet(p); };
    H['ent-pend-cancel'] = (el) => { delete pend()[el.dataset.id]; S.save(); api.render(true); toast('ยกเลิกคำขอแล้ว'); };
    H['ent-activate'] = async () => {
      const inp = document.getElementById('entCode'), msg = document.getElementById('entMsg'), say = (t, bad) => { msg.textContent = t; msg.classList.toggle('bad', !!bad); };
      const res = await CM.dev.readToken(inp.value);
      if (res.err) return say(CM.dev.tokenError(res.err), true);
      if (res.p.t !== 'prod') return say('รหัสนี้ใช้ที่อื่น — แพ็กเกจร้านใส่ที่ Café Studio → แพ็กเกจ ส่วนโค้ดทั่วไปใส่ที่ Profile → โค้ดของฉัน', true);
      const r = applyToken(res.p);
      if (!r.ok) return say(r.msg, true);
      api.render(true); toast(r.msg);
    };
  }

  CM.ent = { install, cardsHtml, profileRow, applyToken, studioPlan, studioSources, plusUntil, has, state, byId, visible };
})();
