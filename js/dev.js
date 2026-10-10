/* Café Mood — developer console (prototype).
   Add/edit/remove cafés (same shape as RAW in data.js), import from Google Maps, post announcements, issue owner codes and
   activation codes, check transfers, take shop data from owners, export js/content.js.
   There is no server: everything made here shows on THIS device at once; to publish it for everyone, export
   js/content.js and upload it to the repository — the repository permission is the real gate.
   Passcodes and codes only keep casual users out; they are not server security. */
(function () {
  window.CM = window.CM || {};
  const D = CM.data, S = CM.store, I = CM.icon;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const content = Object.assign({ dev: null, cafes: [], announcements: [], owners: {}, shops: {}, pay: null, signPub: null, revoked: [], removed: [], contact: null, products: [] }, CM.content);
  const rawIds = new Set(D.CAFES.map((c) => c.id));   // the sample cafés that ship in data.js
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const DEF = { cafes: [], news: [], gone: [], owners: {}, locks: {}, shops: {}, removed: [], drafts: [], issued: [], revoked: [], proofs: {}, payments: [], products: [], pgone: [] };
  const L = () => { const d = S.get().dev; for (const k in DEF) if (d[k] == null) d[k] = clone(DEF[k]); return d; };   // this device's overlay on content
  let api = null, issued = null, issuedTok = null;   // issued = a fresh owner code · issuedTok = a fresh activation/free code (both shown once)

  const merge = (a, b) => { const m = new Map(); a.concat(b).forEach((x) => m.set(x.id, x)); return Array.from(m.values()); };
  const removedIds = () => Array.from(new Set(content.removed.concat(L().removed)));
  const allCafes = () => merge(content.cafes, L().cafes).filter((c) => !removedIds().includes(c.id));
  const allNews = () => merge(content.announcements, L().news).filter((n) => !L().gone.includes(n.id));
  const shops = () => Object.assign({}, content.shops, L().shops);
  const revokedIds = () => content.revoked.concat(L().revoked);
  const isAdded = (id) => allCafes().some((c) => c.id === id);
  const ymd = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  const endOfDay = (d) => new Date(d + 'T23:59:59').getTime();
  removedIds().forEach((id) => D.removeCafe(id));   // boot: sample cafés the developer removed
  allCafes().forEach((c) => D.upsertCafe(clone(c)));   // …and cafés added or edited by the developer join / replace the sample ones
  const isReal = (id) => isAdded(id) && !rawIds.has(id);   // real data: never mixed with demo numbers

  /* ---------- crypto ---------- */
  const enc = new TextEncoder();
  const canCrypto = () => !!(window.crypto && crypto.subtle);
  const b64u = (bytes) => { let s = ''; new Uint8Array(bytes).forEach((b) => { s += String.fromCharCode(b); }); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const unb64u = (t) => Uint8Array.from(atob(String(t).replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
  const jb = (o) => b64u(enc.encode(JSON.stringify(o)));
  const bj = (t) => JSON.parse(new TextDecoder().decode(unb64u(t)));
  // PBKDF2, so a leaked hash in content.js is slow to brute-force
  async function kdf(secret, salt) {
    const k = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' }, k, 256);
    return Array.from(new Uint8Array(bits), (x) => x.toString(16).padStart(2, '0')).join('');
  }
  const CH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // no 0/O/1/I so a code can be read aloud
  const rnd = (n) => { let s = ''; crypto.getRandomValues(new Uint8Array(n)).forEach((x) => { s += CH[x % CH.length]; }); return s; };
  const newCode = () => rnd(12).replace(/(.{4})(?=.)/g, '$1-');
  const norm = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  // After 5 wrong tries in a row: wait a minute. (Kept in localStorage — slows guessing, does not stop someone editing it.)
  const waitSec = (k) => { const l = L().locks[k]; return l && l.until > Date.now() ? Math.ceil((l.until - Date.now()) / 1000) : 0; };
  const miss = (k) => { const m = L().locks, l = m[k] || (m[k] = { n: 0, until: 0 }); l.n++; if (l.n % 5 === 0) l.until = Date.now() + 60000; S.save(); };
  const hit = (k) => { delete L().locks[k]; S.save(); };

  /* ---------- signed codes: the developer signs, every device verifies with the public key (no server, no republish per code) ---------- */
  const ES = { name: 'ECDSA', namedCurve: 'P-256' }, SG = { name: 'ECDSA', hash: 'SHA-256' };
  const pubKey = () => L().signPub || content.signPub;
  async function genKeys() {
    const k = await crypto.subtle.generateKey(ES, true, ['sign', 'verify']);
    L().signPriv = await crypto.subtle.exportKey('jwk', k.privateKey); L().signPub = await crypto.subtle.exportKey('jwk', k.publicKey); S.save();
  }
  async function signToken(p) {
    const key = await crypto.subtle.importKey('jwk', L().signPriv, ES, false, ['sign']), body = jb(p);
    return 'CM1.' + body + '.' + b64u(await crypto.subtle.sign(SG, key, enc.encode(body)));
  }
  async function readToken(tok) {
    const m = /^CM1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(String(tok || '').replace(/\s+/g, ''));
    if (!m) return { err: 'format' };
    if (!canCrypto()) return { err: 'nocrypto' };
    if (!pubKey()) return { err: 'nokey' };
    let ok = false, p;
    try { ok = await crypto.subtle.verify(SG, await crypto.subtle.importKey('jwk', pubKey(), ES, false, ['verify']), unb64u(m[2]), enc.encode(m[1])); p = bj(m[1]); } catch (e) { ok = false; }
    if (!ok) return { err: 'bad' };
    if (revokedIds().includes(p.i)) return { err: 'revoked' };
    if (p.x && p.x < Date.now()) return { err: 'expired' };
    return { p };
  }
  const tokenError = (e) => ({ format: 'รูปแบบรหัสไม่ถูกต้อง — วางรหัสทั้งชุดที่ขึ้นต้นด้วย CM1.', nocrypto: 'เบราว์เซอร์นี้ตรวจรหัสไม่ได้ — เปิดผ่าน https หรือ localhost', nokey: 'ยังตรวจรหัสไม่ได้ — ผู้พัฒนายังไม่ได้เผยแพร่กุญแจตรวจรหัส', bad: 'รหัสไม่ถูกต้องหรือถูกแก้ไข', revoked: 'รหัสนี้ถูกยกเลิกแล้ว', expired: 'รหัสนี้หมดอายุแล้ว (ต้องใช้ภายในเวลาที่กำหนด)' }[e] || 'รหัสไม่ถูกต้อง');
  const payCode = (o) => 'PAY1.' + jb(o);   // what a buyer sends with the slip

  /* ---------- owner codes (a café owner proves the café is theirs) + proof of origin for what an owner sends back ---------- */
  const ownerHash = (id) => L().owners[id] || content.owners[id] || '';
  const isTok = (c) => /^CM1\./.test(String(c || '').replace(/\s+/g, ''));
  // An owner's proof key: the random key inside a signed owner code, or derived from the short code
  const proofKey = async (id, code) => (isTok(code) ? bj(String(code).replace(/\s+/g, '').split('.')[1]).pk : kdf(norm(code), 'cm-proof:' + id));
  async function issue(id) {
    const code = newCode();
    L().owners[id] = await kdf(norm(code), 'cm-owner:' + id);
    L().proofs[id] = await proofKey(id, code);   // stays on this device: lets the developer recognise a submission from this owner
    S.save(); issued = { id, code };
  }
  // A signed owner code (works on every device as soon as the public key is published — no per-café republish)
  async function issueOwnerToken(id) {
    const c = D.CAFE_BY_ID[id], p = { i: rnd(8), a: Date.now(), k: 'owner', t: 'owner', c: id, pk: rnd(16) }, label = 'รหัสเจ้าของร้าน · ' + (c ? c.name : id);
    L().proofs[id] = p.pk;
    issuedTok = { label, token: await signToken(p) }; L().issued.push({ i: p.i, ts: p.a, label }); S.save();
  }
  async function checkOwner(id, code) {
    if (isTok(code)) {
      if (!canCrypto()) return 'nocrypto';
      const w0 = waitSec('own:' + id); if (w0) return { wait: w0 };
      const res = await readToken(code);
      if (!res.err && res.p.t === 'owner' && res.p.c === id) { hit('own:' + id); return 'ok'; }
      miss('own:' + id); return res.err === 'nokey' ? 'nokey' : 'bad';
    }
    if (!ownerHash(id)) return 'none';
    if (!canCrypto()) return 'nocrypto';
    const w = waitSec('own:' + id);
    if (w) return { wait: w };
    if (norm(code) && (await kdf(norm(code), 'cm-owner:' + id)) === ownerHash(id)) { hit('own:' + id); return 'ok'; }
    miss('own:' + id);
    return 'bad';
  }
  async function hmac(keyHex, text) {
    const k = await crypto.subtle.importKey('raw', enc.encode(keyHex), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return b64u(await crypto.subtle.sign('HMAC', k, enc.encode(text)));
  }
  async function makeSubmission(id, data, proof) { const body = jb({ c: id, t: Date.now(), d: data }); return 'PUB1.' + body + '.' + (proof ? await hmac(proof, body) : '-'); }
  const shop = (id) => shops()[id] || null;
  function publishShop(id, data) { L().shops[id] = data; S.save(); CM.studio.pubReset(); CM.studio.apply(CM.weather.ctx.hour); }
  const pay = () => { const p = L().pay || content.pay; return p && (p.promptpay || p.bank || p.qr) ? p : null; };
  const contact = () => L().contact || content.contact || null;
  const products = () => merge(content.products, L().products).filter((p) => !L().pgone.includes(p.id));
  // What a buyer sees when asked to transfer: the PromptPay QR and the account lines
  function payBox() {
    const p = pay() || {}, li = (k, v) => (v ? '<li><span>' + k + '</span><b>' + esc(v) + '</b></li>' : '');
    return (p.qr ? '<div class="pay-qr-wrap"><img class="pay-qr" src="' + esc(p.qr) + '" alt="QR พร้อมเพย์สำหรับโอนเงิน"></div>' : '') + '<ul class="xp-lines">' + li('พร้อมเพย์', p.promptpay) + li('ชื่อบัญชี', p.name) + li('บัญชีธนาคาร', p.bank) + '</ul>';
  }
  // The PromptPay QR image: scaled to fit, PNG so the code stays sharp
  function readQr(file) {
    return new Promise((resolve, reject) => {
      if (!/^image\//.test(file.type) || file.size > 8e6) return reject('ใช้ไฟล์รูปไม่เกิน 8MB');
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        const sc = Math.min(1, 520 / Math.max(img.width, img.height)), cv = document.createElement('canvas'), x = cv.getContext('2d');
        cv.width = Math.round(img.width * sc); cv.height = Math.round(img.height * sc); x.fillStyle = '#fff'; x.fillRect(0, 0, cv.width, cv.height); x.drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url); let d = cv.toDataURL('image/png'); if (d.length > 220000) d = cv.toDataURL('image/jpeg', .9); resolve(d);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject('อ่านรูปนี้ไม่ได้'); };
      img.src = url;
    });
  }

  /* ---------- developer session ---------- */
  let mem = false;
  const cfg = CM.devConfig || {};   // js/dev-config.js
  // The passcode lives in js/dev-config.js (plain, or a scrambled salt+hash from tools/dev-key.html). It cannot be created inside the app.
  const devAuth = () => (cfg.passcode ? { plain: String(cfg.passcode) } : cfg.hash && cfg.salt ? { salt: cfg.salt, hash: cfg.hash } : content.dev);
  const isDev = () => { try { return mem || sessionStorage.getItem('cafemood.dev') === '1'; } catch (e) { return mem; } };
  const setDev = (on) => { mem = on; try { on ? sessionStorage.setItem('cafemood.dev', '1') : sessionStorage.removeItem('cafemood.dev'); } catch (e) { /* private mode: lasts until reload */ } };

  /* ---------- announcements ---------- */
  const newsActive = () => allNews().filter((n) => !n.until || n.until >= ymd()).sort((a, b) => b.ts - a.ts);
  const newsHtml = () => newsActive().slice(0, 2).map((n) => '<div class="moment announce" role="note"><small class="kicker">' + I('bolt', 14) + ' ประกาศ</small><b>' + esc(n.title) + '</b><span>' + esc(n.body) + '</span></div>').join('');

  /* ---------- Google Maps ---------- */
  // Reads a full Google Maps link (or "lat, lon"): name from /place/NAME/, coordinates from the pin (!3d!4d) or the map centre (@lat,lon).
  function parseMaps(line) {
    const t = String(line).trim();
    if (!t) return null;
    if (/(maps\.app\.goo\.gl|goo\.gl\/maps)/.test(t)) return { err: 'ลิงก์สั้นอ่านไม่ได้ — เปิดลิงก์ในเบราว์เซอร์ แล้วคัดลอก URL เต็มจากแถบที่อยู่' };
    const m = /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/.exec(t) || /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(t) || /[?&](?:q|query|ll|center)=(-?\d+\.\d+)(?:,|%2C)(-?\d+\.\d+)/.exec(t) || /^(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)$/.exec(t);
    if (!m) return { err: 'ไม่พบพิกัดในลิงก์นี้' };
    const n = /\/maps\/place\/([^/@?]+)/.exec(t);
    let name = ''; try { name = n ? decodeURIComponent(n[1].replace(/\+/g, ' ')) : ''; } catch (e) { name = n ? n[1] : ''; }
    return { name, lat: +m[1], lon: +m[2] };
  }
  const CAFE_TYPES = ['cafe', 'coffee_shop', 'coffee_roastery', 'coffee_stand', 'tea_house'];
  // Places API (New) text search → café-only results.
  async function searchPlaces(q, key) {
    const r = await fetch('https://places.googleapis.com/v1/places:searchText', { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.types,places.primaryType,places.regularOpeningHours,places.addressComponents' },
      body: JSON.stringify({ textQuery: q, includedType: 'cafe', languageCode: 'th' }) });
    const j = await r.json();
    if (!r.ok) throw new Error((j.error && j.error.message) || 'HTTP ' + r.status);
    const all = j.places || [], cafes = all.filter((p) => (p.types || []).concat(p.primaryType || []).some((t) => CAFE_TYPES.includes(t)));
    return { cafes, dropped: all.length - cafes.length };
  }
  function placeToDraft(p) {
    const comp = (t) => { const c = (p.addressComponents || []).find((x) => (x.types || []).includes(t)); return c ? c.longText : ''; };
    const district = (comp('sublocality_level_1') || comp('administrative_area_level_2')).replace(/^เขต\s*/, ''), sub2 = comp('sublocality_level_2').replace(/^แขวง\s*/, '');
    const d = { name: (p.displayName && p.displayName.text) || '', area: sub2 || district, district, province: comp('administrative_area_level_1') || 'กรุงเทพมหานคร',
      lat: p.location.latitude, lon: p.location.longitude, rating: p.rating ? Math.round(p.rating * 10) / 10 : '', reviews: p.userRatingCount || '', gid: p.id };
    const per = ((p.regularOpeningHours || {}).periods || [])[0];
    if (per && per.open && per.close) { const o = per.open.hour + per.open.minute / 60; let c = per.close.hour + per.close.minute / 60; if (c <= o) c += 24; d.hours = [o, c]; }
    d.tagline = d.area ? 'คาเฟ่ย่าน' + d.area : '';
    return d;
  }
  // A sample café as the form needs it (the runtime object also carries derived fields)
  const authored = (c) => ({ id: c.id, name: c.name0 || c.name, area: c.area, district: c.district || '', province: c.province || 'กรุงเทพมหานคร', lat: c.lat, lon: c.lon, mapUrl: c.mapUrl || '', rating: c.rating, reviews: c.reviews, repeat: c.repeat, hours: (c.hours0 || c.hours).slice(), palette: c.palette.slice(), attr: clone(c.base || c.attr), tagline: c.tagline0 || c.tagline, secret: c.secret, banner: c.banner0 != null ? c.banner0 : c.banner || '',
    drinks: (c.drinks0 || c.drinks).map((d) => ({ name: d.name, type: d.type, temp: d.temp, price: d.price, note: d.note, colors: d.colors })), spots: (c.spots0 || c.spots).map((s) => ({ name: s.name, best: s.best, light: s.light, bg: s.bg, tip: s.tip, outdoor: s.outdoor })) });
  const MAPS_URL = /^https:\/\/((www\.)?google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl\/maps)/i;
  const knownPlace = (d) => allCafes().concat(L().drafts).some((c) => (d.gid && c.gid === d.gid) || (c.name && d.name && c.name.toLowerCase() === d.name.toLowerCase() && Math.abs(c.lat - d.lat) < .002 && Math.abs(c.lon - d.lon) < .002));

  /* ---------- views ---------- */
  const th = (a, b) => a.localeCompare(b, 'th');
  const head = (title, back) => '<header class="hero-top ambient compact"><div class="topbar between"><div class="topbar">' + api.backBtn(back || '#/profile') + '<span class="brand">' + I('lock', 20) + esc(title) + '</span></div></div></header>';
  const fld = (id, label, v, attrs, hint) => '<div class="field"><label for="' + id + '">' + label + '</label><input id="' + id + '" value="' + esc(v == null ? '' : v) + '" ' + (attrs || '') + '>' + (hint ? '<small class="muted">' + hint + '</small>' : '') + '</div>';
  const sel = (id, label, opts, v, attrs) => '<div class="field"><label for="' + id + '">' + label + '</label><select id="' + id + '" ' + (attrs || '') + '>' + opts.map((o) => '<option value="' + o[0] + '"' + (o[0] === v ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select></div>';
  const tokCard = () => issuedTok ? '<div class="card codecard issued"><small class="cc-k">รหัสที่ออกให้ · ' + esc(issuedTok.label) + '</small><textarea class="tok-out" readonly rows="4" aria-label="รหัส" onfocus="this.select()">' + issuedTok.token + '</textarea><div class="row2"><button class="btn ghost sm" data-act="copy-text" data-v="' + issuedTok.token + '">คัดลอกรหัส</button><button class="btn text sm" data-act="dv-tok-dismiss">ปิด</button></div><p class="muted small">ส่งรหัสนี้ให้ผู้รับ ใช้ได้ครั้งเดียวต่อเครื่อง · ตรวจได้ทุกเครื่องหลังเผยแพร่ content.js (มีกุญแจตรวจรหัสอยู่ในนั้น)</p></div>' : '';

  let codeType = 'studio', codeProd = '', formFor = '', photoData = '', prefill = null, draftId = '', linkText = '', found = null, places = null, query = '', inbox = { text: '', res: null };
  const openG = new Set(), tx = (t) => document.getElementById(t);

  function view(sub) {
    if (!isDev()) return { nav: true, html: gate() };
    if (sub === 'add') return { nav: true, html: form(null) };
    if (/^edit-/.test(sub || '')) return { nav: true, html: form(sub.slice(5)) };
    if (/^product-/.test(sub || '')) return { nav: true, html: productForm(sub.slice(8)) };
    const pages = { news: newsPage, codes: codesPage, inbox: inboxPage, 'import': importPage, settings: settingsPage, products: productsPage };
    return { nav: true, html: (pages[sub] || dash)() };
  }

  function gate() {
    const has = !!devAuth();
    return head('ผู้พัฒนา') + '<section class="pad stagger">' + (has
      ? '<div class="card"><h2 class="sec-title first">' + I('lock', 20) + 'เข้าสู่ระบบผู้พัฒนา</h2>' + fld('dvPass', 'รหัสผู้พัฒนา', '', 'type="password" autocomplete="current-password" maxlength="64"') +
        '<p id="dvMsg" class="muted small" role="status"></p><button class="btn primary lg" data-act="dv-login">เข้าสู่ระบบ</button></div>'
      : '<div class="card fair">' + I('lock', 18) + '<p><b>ยังไม่ได้ตั้งรหัสผู้พัฒนา</b> — หลังบ้านปิดอยู่จนกว่าจะตั้งรหัสในไฟล์ <b>js/dev-config.js</b> (เปิดไฟล์แล้วทำตามคำอธิบายในไฟล์ จากนั้นอัปโหลดขึ้น GitHub) แอปไม่ให้สร้างรหัสตรงนี้ เพื่อไม่ให้คนอื่นตั้งรหัสแล้วเข้ามาเองได้</p></div>') +
      '<p class="muted small">รหัสนี้กันคนทั่วไปไม่ให้เปิดหลังบ้านบนเครื่องนี้ ส่วนการเผยแพร่ให้ทุกคนเห็นขึ้นอยู่กับสิทธิ์อัปโหลดไฟล์ใน GitHub ของคุณ</p></section>';
  }

  const det = (key, title, n, body) => '<details class="card fold pf dvg" data-g="' + esc(key) + '"' + (openG.has(key) ? ' open' : '') + '><summary><b>' + title + '</b><small>' + n + ' ร้าน</small>' + I('chevron-down', 18) + '</summary><div class="fold-b">' + body + '</div></details>';
  function cafeRow(c) {
    const added = isAdded(c.id), has = !!ownerHash(c.id);
    return '<div class="mrow static"><span class="mt"><b>' + esc(c.name) + '</b><small>' + esc(c.area) + ' · ' + (rawIds.has(c.id) ? (added ? 'ร้านตัวอย่าง (แก้ไขแล้ว)' : 'ร้านตัวอย่าง') : 'เพิ่มโดยผู้พัฒนา') + ' · ' + (has ? 'มีรหัสเจ้าของแล้ว' : 'ยังไม่มีรหัสเจ้าของ') + '</small></span>' +
      '<div class="dv-btns"><button class="btn ghost sm" data-act="dv-code" data-id="' + c.id + '">' + (has ? 'รหัสใหม่' : 'ออกรหัส') + '</button><button class="btn ghost sm" data-act="dv-enter" data-id="' + c.id + '">จัดการ</button>' +
      '<a class="btn ghost sm" href="#/dev/edit-' + c.id + '">แก้ไข</a><button class="btn ghost sm" data-act="dv-del" data-id="' + c.id + '">ลบ</button></div></div>';
  }
  // province → district → cafés
  function grouped() {
    const g = {};
    D.CAFES.forEach((c) => { const pv = c.province || 'กรุงเทพมหานคร', ds = D.districtOf ? D.districtOf(c) : c.area; ((g[pv] = g[pv] || {})[ds] = g[pv][ds] || []).push(c); });
    return Object.keys(g).sort(th).map((pv) => {
      const dists = Object.keys(g[pv]).sort(th), n = dists.reduce((s, d) => s + g[pv][d].length, 0);
      return det('p:' + pv, I('map', 18) + ' ' + esc(pv), n, dists.map((ds) => det('d:' + pv + '/' + ds, esc(ds), g[pv][ds].length, g[pv][ds].slice().sort((a, b) => th(a.name, b.name)).map(cafeRow).join(''))).join(''));
    }).join('');
  }

  const samplesLeft = () => D.CAFES.filter((c) => rawIds.has(c.id) && !isAdded(c.id)).length;
  function dash() {
    const l = L(), ic = issued && D.CAFE_BY_ID[issued.id];
    const issuedCard = ic ? '<div class="card codecard issued"><small class="cc-k">รหัสเจ้าของร้าน · ' + esc(ic.name) + '</small><div class="cc-row"><b class="mycode" id="dvIssued">' + issued.code + '</b><button class="btn ghost sm" data-act="copy-text" data-v="' + issued.code + '">คัดลอก</button></div>' +
      '<p class="muted small">ส่งรหัสนี้ให้เจ้าของร้านหลังยืนยันตัวตนแล้ว (เช่น โทรกลับเบอร์ร้านหรือทัก LINE ร้าน) รหัสนี้แสดงครั้งเดียว ระบบเก็บแค่ค่าเข้ารหัส ถ้าทำหายให้ออกรหัสใหม่ · ส่งออก content.js ด้วย รหัสถึงจะใช้ได้บนเครื่องอื่น</p><button class="btn text sm" data-act="dv-dismiss">ปิด</button></div>' : '';
    const drafts = l.drafts.length ? '<h2 class="grp-t">ร่างจาก Google Maps (' + l.drafts.length + ')</h2><div class="card menu">' + l.drafts.map((d) => '<div class="mrow static"><span class="mt"><b>' + esc(d.name || '(ไม่มีชื่อ)') + '</b><small>' + esc(d.area || '') + ' · ยังต้องใส่เมนูและจุดถ่ายรูป</small></span><div class="dv-btns"><button class="btn ghost sm" data-act="dv-draft-open" data-id="' + d.id + '">เปิดในฟอร์ม</button><button class="btn ghost sm" data-act="dv-draft-del" data-id="' + d.id + '">ลบร่าง</button></div></div>').join('') + '</div>' : '';
    const pending = l.cafes.length + l.news.length + Object.keys(l.owners).length + Object.keys(l.shops).length + l.removed.length + l.revoked.length;
    return head('หลังบ้านผู้พัฒนา') + '<section class="pad stagger">' + issuedCard + tokCard() +
      '<div class="row2"><a class="btn primary" href="#/dev/add">' + I('plus', 18) + 'เพิ่มร้าน</a><a class="btn ghost" href="#/dev/import">' + I('pin', 18) + 'จาก Google Maps</a></div>' +
      '<div class="row2"><a class="btn ghost" href="#/dev/codes">' + I('sparkles', 18) + 'ออกโค้ด</a><a class="btn ghost" href="#/dev/inbox">' + I('wallet', 18) + 'รับเรื่องจากร้าน</a></div>' +
      '<div class="row2"><a class="btn ghost" href="#/dev/products">' + I('trophy', 18) + 'แพ็กเกจและฟีเจอร์</a><a class="btn ghost" href="#/dev/news">' + I('bolt', 18) + 'ประกาศ (' + newsActive().length + ')</a></div>' +
      '<a class="btn ghost block" href="#/dev/settings">' + I('sliders', 18) + 'ตั้งค่า (รับเงิน ติดต่อ กุญแจ)</a>' + drafts +
      '<div class="card"><h2 class="sec-title first">' + I('refresh', 20) + 'เผยแพร่ให้ทุกคนเห็น</h2>' +
      '<p class="muted small">ร้าน ประกาศ รหัสเจ้าของ และข้อมูลร้านที่ทำที่นี่เห็นในเครื่องนี้ทันที ถ้าจะให้ทุกคนเห็น: กดดาวน์โหลด content.js แล้วอัปโหลดทับไฟล์ <b>js/content.js</b> ใน GitHub (Add file → Upload files) รอ 1–2 นาที</p>' +
      '<p class="muted small">ในเครื่องนี้ยังไม่ได้เผยแพร่: ร้าน ' + l.cafes.length + ' · ประกาศ ' + l.news.length + ' · รหัสเจ้าของ ' + Object.keys(l.owners).length + ' · ข้อมูลร้าน ' + Object.keys(l.shops).length + (pending ? '' : ' (ยังไม่มีอะไรใหม่)') + '</p>' +
      '<button class="btn primary" data-act="dv-export">ดาวน์โหลด content.js</button></div>' +
      '<h2 class="grp-t">ร้านทั้งหมด (' + D.CAFES.length + ')</h2>' + (samplesLeft() ? '<button class="btn ghost block" data-act="dv-del-samples">ลบร้านตัวอย่างทั้งหมด (' + samplesLeft() + ' ร้าน)</button>' : '') + grouped() +
      '<div class="card menu danger-zone"><button class="mrow" data-act="dv-logout"><span class="mi">' + I('lock', 20) + '</span><span class="mt"><b>ออกจากระบบผู้พัฒนา</b><small>ปิดหลังบ้านบนเครื่องนี้</small></span></button></div></section>';
  }

  function form(id) {
    const old = id ? allCafes().find((c) => c.id === id) || (D.CAFE_BY_ID[id] ? authored(D.CAFE_BY_ID[id]) : null) : null;
    if (id && !old) return head('ไม่พบร้าน', '#/dev') + '<section class="pad"><div class="card empty"><p><b>ไม่พบร้านนี้</b></p><a class="btn ghost" href="#/dev">กลับ</a></div></section>';
    const key = id || (prefill ? 'draft:' + draftId : 'new');
    const c = Object.assign({ name: '', area: '', district: '', province: 'กรุงเทพมหานคร', lat: '', lon: '', rating: '', reviews: '', hours: [9, 18], palette: ['#5B3A22', '#C79A68'], attr: {}, tagline: '', secret: '', banner: '', drinks: [], spots: [], gid: '' }, old || prefill || {});
    if (formFor !== key) { formFor = key; photoData = /^data:image\//.test(c.banner || '') ? c.banner : ''; }
    const types = Object.keys(CM.studio.TYPE_TH).map((k) => [k, CM.studio.TYPE_TH[k]]);
    const sliders = D.DIMS.map((d) => { const v = c.attr[d] == null ? 5 : c.attr[d]; return '<div class="field"><label for="dvA_' + d + '">' + D.DIM_TH[d] + ' <output id="dvO_' + d + '">' + v + '</output>/10</label><input id="dvA_' + d + '" type="range" min="0" max="10" step="1" value="' + v + '"></div>'; }).join('');
    const drinks = [0, 1, 2].map((i) => { const d = c.drinks[i] || {}; return '<div class="dv-row"><b>เมนู ' + (i + 1) + (i ? ' (ไม่บังคับ)' : '') + '</b>' + fld('dvDn' + i, 'ชื่อเมนู', d.name || '', 'maxlength="40"') +
      '<div class="row2">' + sel('dvDt' + i, 'ประเภท', types, d.type || 'coffee') + sel('dvDh' + i, 'ร้อน/เย็น', [['hot', 'ร้อน'], ['iced', 'เย็น']], d.temp || 'hot') + '</div>' +
      fld('dvDp' + i, 'ราคา (฿)', d.price || '', 'type="number" min="1" max="9999" inputmode="numeric"') + fld('dvDo' + i, 'คำอธิบายสั้น ๆ', d.note || '', 'maxlength="60"') + '</div>'; }).join('');
    const spots = [0, 1, 2].map((i) => { const s = c.spots[i] || {}; return '<div class="dv-row"><b>จุดถ่ายรูป ' + (i + 1) + (i ? ' (ไม่บังคับ)' : '') + '</b>' + fld('dvSn' + i, 'ชื่อจุด', s.name || '', 'maxlength="40"') +
      fld('dvSb' + i, 'ช่วงเวลาที่แสงดี', s.best || '', 'maxlength="13" placeholder="15:00–17:00"') + fld('dvSt' + i, 'เคล็ดลับ', s.tip || '', 'maxlength="80"') +
      '<label class="chk"><input type="checkbox" id="dvSo' + i + '"' + (s.outdoor ? ' checked' : '') + '> โซนกลางแจ้ง</label></div>'; }).join('');
    return head(old ? 'แก้ไขร้าน' : 'เพิ่มร้านคาเฟ่', '#/dev') + '<section class="pad stagger">' + (prefill && !old ? '<div class="card fair">' + I('pin', 18) + '<p>กรอกจากข้อมูลที่ดึงมาแล้ว — ใส่เมนู จุดถ่ายรูป ความลับของร้าน และตรวจลักษณะร้านให้ครบก่อนบันทึก</p></div>' : '') +
      '<div class="card"><h2 class="sec-title first">' + I('building', 20) + 'ข้อมูลร้าน</h2>' +
      fld('dvName', 'ชื่อร้าน', c.name, 'type="text" maxlength="40"') + fld('dvArea', 'ย่าน', c.area, 'type="text" maxlength="30" placeholder="เช่น อารีย์"') +
      '<div class="row2">' + fld('dvDistrict', 'เขต (ไม่บังคับ)', c.district, 'type="text" maxlength="30" placeholder="เช่น พญาไท"') + fld('dvProvince', 'จังหวัด', c.province, 'type="text" maxlength="30"') + '</div><p class="muted small">เขตและจังหวัดใช้จัดกลุ่มร้านในหลังบ้านและตัวกรองของลูกค้า เว้นเขตว่าง = แอปเดาจากย่าน</p>' +
      fld('dvGeo', 'ที่ตั้ง — ลิงก์ Google Maps ของร้าน', c.mapUrl || (c.lat === '' ? '' : c.lat + ', ' + c.lon), 'type="text" placeholder="https://www.google.com/maps/place/…"', 'เปิดร้านใน Google Maps บนคอม คัดลอก URL เต็มจากแถบที่อยู่มาวาง (ลิงก์สั้น maps.app.goo.gl อ่านพิกัดไม่ได้) หรือวางพิกัด 13.7795, 100.5440 ก็ได้ — ลูกค้ากดนำทางแล้วเปิด Google Maps ไปที่พิกัดนี้') +
      fld('dvTag', 'คำโปรย', c.tagline, 'type="text" maxlength="80"') + fld('dvSecret', 'ความลับของร้าน / ทริปเด็ด', c.secret, 'type="text" maxlength="160"', 'โชว์เมื่อลูกค้ากด “เปิดดูความลับ” ที่หน้าร้าน') + '</div>' +
      '<div class="card"><h2 class="sec-title first">' + I('camera', 20) + 'รูปปกร้าน (ไม่บังคับ)</h2><div class="banner-prev" id="dvPhotoPrev">' + (photoData ? '<img class="cover" alt="ตัวอย่างรูปปก" src="' + esc(photoData) + '">' : '<span class="banner-ph">ยังไม่มีรูป — ใช้ภาพวาดอัตโนมัติ</span>') + '</div>' +
      '<div class="row2"><label class="btn ghost file-btn" for="dvPhoto">' + I('plus', 18) + 'อัปโหลดรูป<input id="dvPhoto" class="sr" type="file" accept="image/png,image/jpeg,image/webp"></label><button class="btn ghost" id="dvPhotoClr" data-act="dv-photo-clear"' + (photoData ? '' : ' hidden') + '>ลบรูป</button></div>' +
      fld('dvBanner', 'หรือใส่ลิงก์/path รูป', /^data:/.test(c.banner || '') ? '' : c.banner || '', 'type="text" maxlength="200" placeholder="img/cafes/ชื่อร้าน.jpg"', 'รูปที่อัปโหลดถูกย่อเป็น 640×360 และฝังใน content.js (ร้านละไม่เกิน ~70KB) · ถ้ามีรูปจำนวนมากให้อัปโหลดไว้ใน GitHub แล้วใส่ path แทน') + '</div>' +
      '<div class="card"><h2 class="sec-title first">' + I('clock', 20) + 'เวลา คะแนน และสี</h2><div class="hours">' +
      fld('dvOpen', 'เปิด (ชม.)', c.hours[0], 'type="number" min="0" max="23.5" step="0.5"') + fld('dvClose', 'ปิด (ชม.)', c.hours[1], 'type="number" min="1" max="28" step="0.5"') + '</div><p class="muted small">ปิดหลังเที่ยงคืนใส่ 25 = 01:00</p><div class="hours">' +
      fld('dvRating', 'คะแนน (1–5)', c.rating, 'type="number" min="1" max="5" step="0.1" inputmode="decimal"') + fld('dvReviews', 'จำนวนรีวิว', c.reviews, 'type="number" min="1" max="999999" inputmode="numeric"') + '</div>' +
      '<p class="muted small">ใส่ตามคะแนนและจำนวนรีวิวจริง (เช่น จาก Google Maps) — ใช้คำนวณ Hidden Café</p><div class="hours">' +
      fld('dvP1', 'สีหลักของภาพปก', c.palette[0], 'type="color"') + fld('dvP2', 'สีรอง', c.palette[1], 'type="color"') + '</div></div>' +
      '<details class="card fold pf" open><summary>' + I('sparkles', 20) + 'ลักษณะร้าน (0–10)' + I('chevron-down', 18) + '</summary><div class="fold-b"><p class="muted small">ตัวเลขยิ่งสูงยิ่งมีลักษณะนั้นมาก เช่น ความคึกคัก 10 = คนเยอะมาก, ความเล็ก/ส่วนตัว 10 = ร้านเล็กและส่วนตัวมาก — ใช้จับคู่กับ Mood ของลูกค้า</p>' + sliders + '</div></details>' +
      '<div class="card"><h2 class="sec-title first">' + I('cup', 20) + 'เมนูแนะนำ</h2>' + drinks + '</div>' +
      '<div class="card"><h2 class="sec-title first">' + I('camera', 20) + 'Photo Spots</h2>' + spots + '</div>' +
      '<input type="hidden" id="dvGid" value="' + esc(c.gid || '') + '"><button class="btn primary lg" data-act="dv-save" data-id="' + (old ? old.id : '') + '">' + (old ? 'บันทึกการแก้ไข' : 'เพิ่มร้านนี้') + '</button><a class="btn text block" href="#/dev" data-act="dv-form-cancel">ยกเลิก</a></section>';
  }

  function newsPage() {
    const rows = allNews().sort((a, b) => b.ts - a.ts).map((n) => '<div class="mrow static"><span class="mt"><b>' + esc(n.title) + '</b><small>' + esc(n.body) + '</small><small>' + (n.until ? 'แสดงถึง ' + n.until + (n.until < ymd() ? ' · หมดอายุแล้ว' : '') : 'แสดงไม่มีกำหนด') + '</small></span><button class="btn ghost sm" data-act="dv-news-del" data-id="' + n.id + '" aria-label="ลบประกาศ ' + esc(n.title) + '">ลบ</button></div>').join('');
    return head('ประกาศ', '#/dev') + '<section class="pad stagger"><div class="card"><h2 class="sec-title first">' + I('bolt', 20) + 'เพิ่มประกาศ</h2>' +
      fld('dvNTitle', 'หัวข้อ', '', 'type="text" maxlength="60"') + '<div class="field"><label for="dvNBody">รายละเอียด</label><textarea id="dvNBody" rows="3" maxlength="200"></textarea></div>' +
      fld('dvNUntil', 'แสดงถึงวันที่ (ไม่บังคับ)', '', 'type="date" min="' + ymd() + '"', 'เว้นว่าง = แสดงจนกว่าจะลบ') +
      '<button class="btn primary lg" data-act="dv-news-add">เผยแพร่ประกาศ</button><p class="muted small">ขึ้นที่หน้า Home (สูงสุด 2 รายการล่าสุด)</p></div>' +
      '<h2 class="grp-t">ประกาศทั้งหมด</h2>' + (rows ? '<div class="card menu">' + rows + '</div>' : '<div class="card empty"><p class="muted">ยังไม่มีประกาศ</p></div>') + '</section>';
  }

  /* ----- products: subscriptions, one-time purchases, pre-orders of coming features ----- */
  const ST_TH = { draft: 'ร่าง (ซ่อน)', sale: 'ขายอยู่', pre: 'พรีออเดอร์', off: 'ปิดขาย' }, AUD_TH = { owner: 'เจ้าของร้าน', customer: 'ลูกค้า', both: 'ทั้งคู่' };
  const priceTxt = (p) => (p.kind === 'sub' ? [p.price.month > 0 ? '฿' + p.price.month + '/เดือน' : '', p.price.year > 0 ? '฿' + p.price.year + '/ปี' : ''].filter(Boolean).join(' · ') : p.price.once > 0 ? '฿' + p.price.once + ' ครั้งเดียว' : '—');
  function productsPage() {
    const rows = products().map((p) => '<div class="mrow static"><span class="mt"><b>' + esc(p.name) + '</b><small>' + AUD_TH[p.aud] + ' · ' + (p.kind === 'sub' ? 'สมัครสมาชิก' : 'ซื้อครั้งเดียว') + ' · ' + priceTxt(p) + '</small><small>' + ST_TH[p.status] + (p.status === 'pre' && p.eta ? ' · ' + esc(p.eta) : '') + (p.openTo ? ' · เปิดฟรีให้' + AUD_TH[p.openTo] : '') + '</small></span>' +
      '<div class="dv-btns"><a class="btn ghost sm" href="#/dev/product-' + p.id + '">แก้ไข</a><button class="btn ghost sm" data-act="dv-prod-release" data-id="' + p.id + '">' + (p.status === 'pre' ? 'ปล่อยฟีเจอร์' : 'ส่งให้ผู้ใช้') + '</button><button class="btn ghost sm" data-act="dv-prod-send" data-id="' + p.id + '">ออกโค้ดให้</button><button class="btn ghost sm" data-act="dv-prod-del" data-id="' + p.id + '">ลบ</button></div></div>').join('');
    return head('แพ็กเกจและฟีเจอร์', '#/dev') + '<section class="pad stagger"><a class="btn primary lg" href="#/dev/product-new">' + I('plus', 20) + 'สร้างแพ็กเกจ/ฟีเจอร์ใหม่</a>' +
      '<p class="muted small">สร้างรายการที่ขายได้เอง: สมัครรายเดือน/รายปี ซื้อครั้งเดียว (ตามวันที่กำหนดหรือถาวร) หรือพรีออเดอร์ฟีเจอร์ที่ยังไม่เสร็จ — เมื่อฟีเจอร์พร้อมกด “ปล่อยฟีเจอร์” ผู้ที่สั่งจองไว้จะเริ่มใช้ได้ และเลือกเปิดให้เจ้าของร้านหรือลูกค้าทุกคนใช้ฟรีได้ รายการขึ้นที่หน้าแพ็กเกจของร้าน (เจ้าของ) และ Profile (ลูกค้า) หลังส่งออก content.js</p>' +
      (rows ? '<div class="card menu">' + rows + '</div>' : '<div class="card empty"><p class="muted">ยังไม่มีรายการ</p></div>') + '</section>';
  }
  function productForm(id) {
    const old = id === 'new' ? null : products().find((p) => p.id === id);
    if (id !== 'new' && !old) return head('ไม่พบรายการ', '#/dev/products') + '<section class="pad"><div class="card empty"><p><b>ไม่พบรายการนี้</b></p><a class="btn ghost" href="#/dev/products">กลับ</a></div></section>';
    const p = Object.assign({ name: '', desc: '', aud: 'owner', kind: 'sub', status: 'draft', price: { month: '', year: '', once: '' }, dur: { t: 'forever', d: 30, u: '' }, sale: { from: '', to: '' }, eta: '', grants: { studio: '', plus: false }, feats: [], flag: '' }, old || {});
    const dur = p.dur.t, kindOn = (k) => (p.kind === k ? '' : ' hidden');
    return head(old ? 'แก้ไขรายการ' : 'สร้างรายการ', '#/dev/products') + '<section class="pad stagger">' +
      '<div class="card"><h2 class="sec-title first">' + I('trophy', 20) + 'รายละเอียด</h2>' + fld('dvPrN', 'ชื่อ', p.name, 'type="text" maxlength="40" placeholder="เช่น Studio Insights+"') +
      '<div class="field"><label for="dvPrD">อธิบายให้ผู้ซื้อเข้าใจ</label><textarea id="dvPrD" rows="3" maxlength="200">' + esc(p.desc) + '</textarea></div>' +
      sel('dvPrA', 'ขายให้ใคร', [['owner', 'เจ้าของร้าน'], ['customer', 'ลูกค้า'], ['both', 'ทั้งสองกลุ่ม']], p.aud) +
      '<div class="field"><label for="dvPrF">สิ่งที่ผู้ซื้อได้ (บรรทัดละข้อ)</label><textarea id="dvPrF" rows="4" maxlength="400" placeholder="เช่น รายงานลูกค้าย้อนหลัง 90 วัน">' + esc(p.feats.join('\n')) + '</textarea></div></div>' +
      '<div class="card"><h2 class="sec-title first">' + I('wallet', 20) + 'ราคาและระยะเวลา</h2>' + sel('dvPrK', 'รูปแบบ', [['sub', 'สมัครสมาชิก (รายเดือน/รายปี ต่อทีละรอบ)'], ['once', 'ซื้อครั้งเดียว']], p.kind) +
      '<div data-pk="sub"' + kindOn('sub') + '><div class="row2">' + fld('dvPrM', 'ราคา/เดือน (฿)', p.price.month, 'type="number" min="0" inputmode="numeric"') + fld('dvPrY', 'ราคา/ปี (฿)', p.price.year, 'type="number" min="0" inputmode="numeric"') + '</div><p class="muted small">ใส่ราคาเดียวหรือทั้งสองอย่างก็ได้ เว้นว่าง = ไม่มีตัวเลือกนั้น</p></div>' +
      '<div data-pk="once"' + kindOn('once') + '>' + fld('dvPrO', 'ราคา (฿)', p.price.once, 'type="number" min="0" inputmode="numeric"') + sel('dvPrDur', 'ใช้ได้นานแค่ไหน', [['forever', 'ถาวร'], ['days', 'กี่วันนับจากวันที่เปิดใช้'], ['until', 'ถึงวันที่กำหนด']], dur) +
      '<div data-pd="days"' + (dur === 'days' ? '' : ' hidden') + '>' + fld('dvPrDays', 'จำนวนวัน', p.dur.d, 'type="number" min="1" max="3650" inputmode="numeric"') + '</div><div data-pd="until"' + (dur === 'until' ? '' : ' hidden') + '>' + fld('dvPrUntil', 'ใช้ได้ถึงวันที่', p.dur.u ? new Date(p.dur.u - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10) : '', 'type="date"') + '</div></div>' +
      sel('dvPrS', 'สถานะ', [['draft', 'ร่าง (ยังไม่ขึ้นให้เห็น)'], ['sale', 'ขายอยู่ (ซื้อแล้วใช้ได้ทันที)'], ['pre', 'พรีออเดอร์ (ซื้อจองไว้ ยังใช้ไม่ได้จนกว่าจะปล่อยฟีเจอร์)'], ['off', 'ปิดขาย (คนที่ซื้อแล้วยังใช้ต่อได้)']], p.status) +
      fld('dvPrE', 'คาดว่าจะเปิดใช้ (สำหรับพรีออเดอร์)', p.eta, 'type="text" maxlength="30" placeholder="เช่น ไตรมาส 1/2027"') +
      '<div class="row2">' + fld('dvPrFrom', 'เปิดขายตั้งแต่ (ไม่บังคับ)', p.sale.from, 'type="date"') + fld('dvPrTo', 'ปิดขายวันที่ (ไม่บังคับ)', p.sale.to, 'type="date"') + '</div></div>' +
      '<div class="card"><h2 class="sec-title first">' + I('bolt', 20) + 'ผลที่ได้ในแอป</h2><p class="muted small">เลือกสิ่งที่แอปทำให้ทันที หรือใช้ชื่อสิทธิ์ไว้ให้ฟีเจอร์ใหม่ที่คุณจะเขียนเพิ่มภายหลังตรวจ (CM.ent.has(\'ชื่อสิทธิ์\')) — ไม่เลือกอะไรก็ขายเป็นรายการให้ผู้ซื้อดูได้</p>' +
      sel('dvPrG', 'ให้แพ็กเกจ Café Studio', [['', 'ไม่ให้'], ['pro', 'Pro'], ['group', 'Group']], p.grants.studio || '') + '<label class="chk"><input type="checkbox" id="dvPrP"' + (p.grants.plus ? ' checked' : '') + '> ให้ Café Mood Plus (ลูกค้า)</label>' +
      fld('dvPrFlag', 'ชื่อสิทธิ์สำหรับฟีเจอร์ใหม่ (ไม่บังคับ)', p.flag, 'type="text" maxlength="30" placeholder="เช่น insights-plus"') + '</div>' +
      '<button class="btn primary lg" data-act="dv-prod-save" data-id="' + (old ? old.id : '') + '">' + (old ? 'บันทึก' : 'สร้างรายการ') + '</button><a class="btn text block" href="#/dev/products">ยกเลิก</a></section>';
  }

  /* ----- codes the developer issues: free access until a date / forever / other, or a payment confirmation ----- */
  function codesPage() {
    const l = L(), hasKey = !!l.signPriv;
    const ct = codeType, vis = (types) => (types.split(' ').includes(ct) ? '' : ' hidden');
    const cafeOpts = [['', 'ใช้ได้ทุกร้าน']].concat(D.CAFES.slice().sort((a, b) => th(a.name, b.name)).map((c) => [c.id, c.name]));
    const rows = l.issued.slice().reverse().map((x) => { const rv = revokedIds().includes(x.i); return '<div class="mrow static"><span class="mt"><b>' + esc(x.label) + '</b><small>' + new Date(x.ts).toLocaleDateString('th-TH') + ' · ' + esc(x.i) + (rv ? ' · ยกเลิกแล้ว' : '') + '</small></span>' + (rv ? '' : '<button class="btn ghost sm" data-act="dv-revoke" data-id="' + x.i + '">ยกเลิกรหัส</button>') + '</div>'; }).join('');
    return head('ออกโค้ด', '#/dev') + '<section class="pad stagger">' + tokCard() +
      (hasKey ? '' : '<div class="card fair">' + I('lock', 18) + '<p><b>ยังไม่มีกุญแจออกรหัส</b> — ไปที่ <a href="#/dev/settings">ตั้งค่า</a> กด “สร้างกุญแจ” ก่อน แล้วส่งออก content.js เพื่อให้ทุกเครื่องตรวจรหัสได้</p></div>') +
      '<div class="card"><h2 class="sec-title first">' + I('sparkles', 20) + 'ออกโค้ดให้ใช้ฟรีหรือสิทธิ์พิเศษ</h2>' +
      sel('dvT', 'โค้ดนี้ใช้กับ', [['studio', 'แพ็กเกจ Café Studio (ร้านค้า)'], ['plus', 'Café Mood Plus (ลูกค้า)'], ['prod', 'แพ็กเกจ/ฟีเจอร์ที่สร้างไว้ (ส่งให้ผู้ใช้)'], ['note', 'อื่น ๆ (ข้อความอย่างเดียว เช่น ส่วนลด)']], ct) +
      '<div data-for="studio"' + vis('studio') + '>' + sel('dvPlan', 'แพ็กเกจที่ให้', [['pro', 'Pro'], ['group', 'Group']], 'pro') + sel('dvBind', 'ผูกกับร้าน', cafeOpts, '') + '</div>' +
      '<div data-for="prod"' + vis('prod') + '>' + sel('dvProd', 'เลือกรายการ', [['', '— เลือก —']].concat(products().map((x) => [x.id, x.name + (x.status === 'pre' ? ' (พรีออเดอร์)' : '')])), codeProd) + '</div>' +
      '<div data-for="studio plus prod"' + vis('studio plus prod') + '>' + sel('dvDur', 'ใช้ฟรีได้นานแค่ไหน', [['until', 'ถึงวันที่กำหนด'], ['days', 'กี่วันนับจากวันที่ใช้โค้ด'], ['forever', 'ฟรีถาวร']], 'until') +
      '<div data-for2="until">' + fld('dvUntil', 'ใช้ฟรีถึงวันที่', '', 'type="date" min="' + ymd() + '"') + '</div><div data-for2="days" hidden>' + fld('dvDays', 'จำนวนวัน', 30, 'type="number" min="1" max="3650" inputmode="numeric"') + '</div></div>' +
      fld('dvNote', 'รายละเอียดที่ผู้ใช้เห็น', '', 'type="text" maxlength="80" placeholder="เช่น พาร์ทเนอร์ร้านกาแฟ ใช้ Pro ฟรีถึงสิ้นปี"', 'ถ้าเลือก “อื่น ๆ” ข้อความนี้คือสิ่งที่โค้ดให้ (เช่น ลด 20%) — ต้องกรอก') +
      fld('dvExp', 'ต้องใช้โค้ดภายในวันที่ (ไม่บังคับ)', '', 'type="date" min="' + ymd() + '"', 'เว้นว่าง = ใช้โค้ดเมื่อไหร่ก็ได้') +
      '<button class="btn primary lg" data-act="dv-code-make"' + (hasKey ? '' : ' disabled') + '>ออกโค้ด</button></div>' +
      (rows ? '<h2 class="grp-t">โค้ดที่เคยออก</h2><div class="card menu">' + rows + '</div><p class="muted small">การยกเลิกรหัสมีผลบนเครื่องอื่นหลังส่งออก content.js (ในเครื่องนี้มีผลทันที)</p>' : '') + '</section>';
  }

  /* ----- what an owner or buyer sends the developer ----- */
  function inboxPage() {
    const r = inbox.res;
    let body = '';
    if (r && r.err) body = '<div class="card fair">' + I('badge-check', 18) + '<p>' + esc(r.err) + '</p></div>';
    else if (r && r.kind === 'pay') {
      const q = r.q, c = D.CAFE_BY_ID[q.c], dup = L().payments.find((x) => x.ref === q.r), when = new Date(q.t).toLocaleString('th-TH'), pr = q.pr ? products().find((x) => x.id === q.pr) : null;
      body = '<div class="card"><h2 class="sec-title first">' + I('wallet', 20) + 'ตรวจการชำระเงิน</h2><ul class="xp-lines"><li><span>ร้าน/ผู้ซื้อ</span><b>' + esc(c ? c.name : q.c || 'ลูกค้าทั่วไป') + '</b></li><li><span>รายการ</span><b>' + esc(pr ? pr.name : q.pr ? q.pr + ' (ไม่พบในรายการ)' : q.k) + (q.pr ? ' · ' + ({ month: 'รายเดือน', year: 'รายปี', once: 'ซื้อครั้งเดียว' }[q.o] || '') : q.m === 12 ? ' · รายปี' : ' · รายเดือน') + '</b></li><li><span>ยอดที่ต้องโอน</span><b>฿' + q.a.toLocaleString('en-US') + '</b></li><li><span>รหัสอ้างอิง</span><b>' + esc(q.r) + '</b></li><li><span>ขอเมื่อ</span><b>' + when + '</b></li></ul>' +
        (dup ? '<p class="bad small">รหัสอ้างอิงนี้ออกรหัสไปแล้วเมื่อ ' + new Date(dup.ts).toLocaleString('th-TH') + ' — ไม่ออกซ้ำ</p>' : '<p class="muted small">เปิดแอปธนาคารหรือ statement ตรวจว่ามียอดเข้าจริง ตรงยอดและตรงเวลาที่ลูกค้าส่งสลิปมา แล้วใส่ยอดที่ได้รับ</p>' +
        fld('dvGot', 'ยอดที่เงินเข้าจริง (฿)', '', 'type="number" min="1" inputmode="decimal"') + '<label class="chk"><input type="checkbox" id="dvOk"> เงินเข้าบัญชีแล้วจริง (ตรวจจากแอปธนาคาร/statement ไม่ใช่แค่ดูสลิป)</label><button class="btn primary lg" data-act="dv-pay-issue">ออกรหัสเปิดใช้งาน</button>') + '</div>';
    } else if (r && r.kind === 'pub') {
      const d = r.d, c = D.CAFE_BY_ID[r.c], n = (k) => (d[k] || []).length;
      body = '<div class="card"><h2 class="sec-title first">' + I('building', 20) + 'ข้อมูลร้านที่ส่งมา · ' + esc(c ? c.name : r.c) + '</h2>' +
        '<p class="' + (r.proof === 'ok' ? 'small' : 'bad small') + '">' + ({ ok: '✓ ตรงกับเจ้าของที่คุณออกรหัสให้ในเครื่องนี้', none: '⚠ ตรวจต้นทางไม่ได้ (เครื่องนี้ไม่ได้เป็นเครื่องที่ออกรหัสให้ร้านนี้) — โทรกลับหรือทักร้านยืนยันก่อน', bad: '✗ ลายเซ็นไม่ตรง — ไม่ใช่เจ้าของที่ออกรหัสให้ ห้ามนำเข้า', unsigned: '⚠ ไม่มีลายเซ็นเจ้าของ' }[r.proof]) + '</p>' +
        '<ul class="xp-lines"><li><span>ส่งเมื่อ</span><b>' + new Date(r.t).toLocaleString('th-TH') + '</b></li><li><span>ชื่อร้าน / คำโปรย</span><b>' + esc((d.shop && d.shop.name) || '—') + '</b></li><li><span>อีเว้นท์</span><b>' + n('events') + '</b></li><li><span>โค้ดของร้าน</span><b>' + n('codes') + '</b></li><li><span>เมนูเพิ่ม</span><b>' + n('extraDrinks') + '</b></li><li><span>Passport</span><b>' + (d.passport ? 'ตั้งไว้' : 'มาตรฐาน') + '</b></li><li><span>Quest / Reward / Moment</span><b>' + (d.quest ? 'Q ' : '') + (d.reward ? 'R ' : '') + n('moments') + '</b></li></ul>' +
        (r.proof === 'bad' ? '' : '<p class="muted small">ตรวจเนื้อหาแล้วค่อยนำเข้า — นำเข้าแล้วลูกค้าในเครื่องนี้เห็นทันที ส่งออก content.js เพื่อให้ทุกเครื่องเห็น</p><button class="btn primary lg" data-act="dv-pub-apply">นำเข้าข้อมูลร้านนี้</button>') + '</div>';
    }
    return head('รับเรื่องจากร้าน', '#/dev') + '<section class="pad stagger">' + tokCard() + '<div class="card"><h2 class="sec-title first">' + I('message', 20) + 'วางรหัสที่ร้านส่งมา</h2>' +
      '<p class="muted small">รองรับ 2 แบบ: <b>PAY1…</b> (คำขอเปิดแพ็กเกจ พร้อมสลิป) และ <b>PUB1…</b> (ข้อมูลร้านที่เจ้าของส่งให้เผยแพร่) วางข้อความหรือเลือกไฟล์</p>' +
      '<div class="field"><label for="dvIn" class="sr">รหัสที่ได้รับ</label><textarea id="dvIn" rows="4" spellcheck="false" placeholder="วางที่นี่">' + esc(inbox.text) + '</textarea></div>' +
      '<div class="row2"><label class="btn ghost file-btn" for="dvInFile">เลือกไฟล์<input id="dvInFile" class="sr" type="file" accept=".txt,text/plain"></label><button class="btn primary" data-act="dv-inbox-read">ตรวจ</button></div></div>' + body + '</section>';
  }

  function importPage() {
    const lines = found ? '<div class="card menu">' + found.map((x, i) => x.err ? '<div class="mrow static"><span class="mt"><small class="bad">' + esc(x.err) + '</small></span></div>' : '<div class="mrow static"><span class="mt"><b>' + esc(x.name || '(ไม่พบชื่อในลิงก์)') + '</b><small>' + x.lat + ', ' + x.lon + (knownPlace(x) ? ' · มีในระบบแล้ว' : '') + '</small></span><div class="dv-btns"><button class="btn ghost sm" data-act="dv-found-form" data-i="' + i + '">เปิดในฟอร์ม</button><button class="btn ghost sm" data-act="dv-found-draft" data-i="' + i + '">เก็บเป็นร่าง</button></div></div>').join('') + '</div>' : '';
    const pl = places ? '<p class="muted small">พบคาเฟ่ ' + places.cafes.length + ' ร้าน' + (places.dropped ? ' · ตัดที่ไม่ใช่คาเฟ่ออก ' + places.dropped + ' ร้าน' : '') + '</p>' + (places.cafes.length ? '<div class="card menu">' + places.cafes.map((p, i) => { const d = placeToDraft(p); return '<div class="mrow static"><span class="mt"><b>' + esc(d.name) + '</b><small>' + esc(p.formattedAddress || '') + (d.rating ? ' · ★' + d.rating + ' (' + d.reviews + ')' : '') + (knownPlace(d) ? ' · มีในระบบแล้ว' : '') + '</small></span><div class="dv-btns"><button class="btn ghost sm" data-act="dv-place-form" data-i="' + i + '">เปิดในฟอร์ม</button><button class="btn ghost sm" data-act="dv-place-draft" data-i="' + i + '">เก็บเป็นร่าง</button></div></div>'; }).join('') + '</div><button class="btn primary block" data-act="dv-place-all">เก็บเป็นร่างทั้งหมดที่ยังไม่มีในระบบ</button>' : '') : '';
    return head('นำเข้าจาก Google Maps', '#/dev') + '<section class="pad stagger">' +
      '<div class="card"><h2 class="sec-title first">' + I('pin', 20) + 'วางลิงก์ Google Maps</h2><p class="muted small">เปิดร้านใน Google Maps บนคอมแล้วคัดลอก URL จากแถบที่อยู่ (ขึ้นต้น google.com/maps/place/…) วางได้หลายร้าน บรรทัดละร้าน — ลิงก์สั้นจากปุ่มแชร์ (maps.app.goo.gl) อ่านไม่ได้ ระบบดึงได้เฉพาะชื่อกับพิกัด ที่เหลือกรอกในฟอร์ม</p>' +
      '<div class="field"><label for="dvLinks" class="sr">ลิงก์</label><textarea id="dvLinks" rows="4" spellcheck="false" placeholder="https://www.google.com/maps/place/…">' + esc(linkText) + '</textarea></div><button class="btn primary" data-act="dv-links-read">อ่านลิงก์</button></div>' + lines +
      '<div class="card"><h2 class="sec-title first">' + I('search', 20) + 'ค้นหาจาก Google Maps (Places API)</h2>' + (L().gkey ? '' : '<p class="bad small">ยังไม่ได้ใส่ API key — ไปที่ <a href="#/dev/settings">ตั้งค่า</a></p>') +
      '<p class="muted small">พิมพ์คำค้นเหมือนใน Google Maps เช่น “คาเฟ่ อารีย์” หรือ “coffee shop ทองหล่อ” ระบบกรองเอาเฉพาะคาเฟ่และเตรียมข้อมูลให้ (ชื่อ ย่าน เขต พิกัด คะแนน เวลาเปิด) เก็บเป็นร่าง แล้วเปิดในฟอร์มเพื่อเติมเมนูกับจุดถ่ายรูป</p>' +
      fld('dvQuery', 'คำค้น', query, 'type="text" maxlength="80" placeholder="คาเฟ่ อารีย์"') + '<button class="btn primary" data-act="dv-search">ค้นหา</button><p id="dvSMsg" class="muted small" role="status"></p></div>' + pl + '</section>';
  }

  function settingsPage() {
    const l = L(), p = l.pay || content.pay || {}, pubd = l.signPub && JSON.stringify(l.signPub) === JSON.stringify(content.signPub);
    return head('ตั้งค่า', '#/dev') + '<section class="pad stagger">' +
      '<div class="card"><h2 class="sec-title first">' + I('wallet', 20) + 'รับเงินค่าแพ็กเกจ</h2><p class="muted small">แสดงให้คนที่สมัครแพ็กเกจเห็นตอนโอนเงิน (เผยแพร่ใน content.js — ใส่เฉพาะข้อมูลที่ให้คนอื่นโอนเข้าได้) ถ้าเว้นว่าง แอปอยู่โหมดเดโม สมัครแล้วเปิดใช้ทันทีโดยไม่เก็บเงิน</p>' +
      fld('dvPp', 'พร้อมเพย์ (เบอร์โทรหรือเลขบัตร)', p.promptpay || '', 'type="text" maxlength="20" inputmode="numeric"') + fld('dvPn', 'ชื่อบัญชี', p.name || '', 'type="text" maxlength="60"') +
      fld('dvPb', 'ธนาคาร/เลขบัญชี (ไม่บังคับ)', p.bank || '', 'type="text" maxlength="60"') + fld('dvPc', 'ช่องทางส่งสลิป', p.contact || '', 'type="text" maxlength="60" placeholder="เช่น LINE @cafemood"') +
      '<p class="sh-h">QR พร้อมเพย์</p><div class="pay-qr-wrap" id="dvQrPrev">' + (p.qr ? '<img class="pay-qr" src="' + esc(p.qr) + '" alt="QR พร้อมเพย์">' : '<span class="muted small">ยังไม่ได้แปะ QR</span>') + '</div>' +
      '<div class="row2"><label class="btn ghost file-btn" for="dvQr">' + I('plus', 18) + 'แปะรูป QR<input id="dvQr" class="sr" type="file" accept="image/*"></label><button class="btn ghost" id="dvQrClr" data-act="dv-qr-clear"' + (p.qr ? '' : ' hidden') + '>ลบ QR</button></div>' +
      '<p class="muted small">ใช้รูป QR พร้อมเพย์จากแอปธนาคาร (ตั้งยอดว่างให้คนกรอกเอง) ลูกค้าเห็นตอนโอนเงิน</p><button class="btn primary" data-act="dv-pay-save">บันทึก</button></div>' +
      '<div class="card"><h2 class="sec-title first">' + I('message', 20) + 'ข้อมูลติดต่อผู้พัฒนา</h2><p class="muted small">แสดงที่หน้า Profile → ติดต่อเรา ของทุกคนหลังส่งออก content.js</p>' +
      fld('dvCe', 'อีเมล', (contact() || {}).email || '', 'type="email" maxlength="60"') + fld('dvCl', 'LINE', (contact() || {}).line || '', 'type="text" maxlength="40" placeholder="@cafemood"') + fld('dvCp', 'เบอร์โทร', (contact() || {}).phone || '', 'type="tel" maxlength="20"') +
      fld('dvCs', 'Facebook / Instagram (ไม่บังคับ)', (contact() || {}).social || '', 'type="text" maxlength="60"') + fld('dvCn', 'หมายเหตุ เช่น เวลาทำการ (ไม่บังคับ)', (contact() || {}).note || '', 'type="text" maxlength="80"') + '<button class="btn primary" data-act="dv-contact-save">บันทึก</button></div>' +
      '<div class="card"><h2 class="sec-title first">' + I('lock', 20) + 'กุญแจออกรหัส</h2><p class="muted small">ใช้เซ็นรหัสเปิดใช้งาน/รหัสให้ใช้ฟรี ทุกเครื่องตรวจรหัสด้วยกุญแจสาธารณะ (อยู่ใน content.js) โดยไม่ต้องเผยแพร่ใหม่ทุกครั้งที่ออกรหัส</p>' +
      '<p class="small">สถานะ: ' + (l.signPriv ? 'มีกุญแจในเครื่องนี้ · ' + (pubd ? 'เผยแพร่แล้ว' : 'ยังไม่ได้เผยแพร่ — ส่งออก content.js') : content.signPub ? 'มีกุญแจสาธารณะเผยแพร่แล้ว แต่เครื่องนี้ไม่มีกุญแจส่วนตัว (ออกรหัสไม่ได้ — นำเข้าไฟล์สำรอง)' : 'ยังไม่มี') + '</p>' +
      '<div class="row2"><button class="btn ghost" data-act="dv-key-gen">' + (l.signPriv ? 'สร้างใหม่' : 'สร้างกุญแจ') + '</button><button class="btn ghost" data-act="dv-key-backup"' + (l.signPriv ? '' : ' disabled') + '>ดาวน์โหลดไฟล์สำรอง</button></div>' +
      '<p class="muted small">เก็บไฟล์สำรองไว้ที่ปลอดภัย ห้ามส่งให้ใคร — คนที่มีไฟล์นี้ออกรหัสแทนคุณได้ ถ้าหาย รหัสที่ออกไปแล้วยังใช้ได้แต่ออกรหัสใหม่ไม่ได้ (สร้างกุญแจใหม่จะทำให้รหัสเก่าทั้งหมดใช้ไม่ได้)</p>' +
      '<div class="field"><label for="dvKeyIn">นำเข้ากุญแจจากไฟล์สำรอง</label><textarea id="dvKeyIn" rows="3" spellcheck="false" placeholder="วางข้อความในไฟล์สำรอง"></textarea></div><button class="btn ghost" data-act="dv-key-import">นำเข้า</button></div>' +
      '<div class="card"><h2 class="sec-title first">' + I('search', 20) + 'Google Places API key</h2><p class="muted small">ใช้ค้นหาคาเฟ่จาก Google Maps เก็บในเครื่องนี้เท่านั้น ไม่ส่งออกใน content.js สร้างที่ Google Cloud Console เปิด “Places API (New)” แล้วจำกัด key ให้ใช้ได้เฉพาะเว็บของคุณ (HTTP referrer) Google คิดค่าบริการตามการใช้งาน</p>' +
      fld('dvGkey', 'API key', l.gkey || '', 'type="password" autocomplete="off" spellcheck="false"') + '<button class="btn primary" data-act="dv-gkey-save">บันทึก</button></div></section>';
  }

  /* ---------- actions ---------- */
  function install(a) {
    api = a;
    const H = api.H, toast = api.toast;
    const val = (id) => { const e = document.getElementById(id); return e ? e.value : ''; };
    const say = (t) => { const m = document.getElementById('dvMsg'); if (m) { m.textContent = t; m.classList.add('bad'); } };
    const noCrypto = 'เบราว์เซอร์นี้ใช้ระบบรหัสไม่ได้ — เปิดผ่าน https หรือ localhost';
    const download = (name, text) => { const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' })); link.download = name; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(link.href), 4000); };

    H['dv-login'] = async () => {
      const a0 = devAuth(), w = waitSec('dev');
      if (!a0) return;
      if (w) return say('ใส่ผิดหลายครั้ง รออีก ' + w + ' วินาทีแล้วลองใหม่');
      if (!a0.plain && !canCrypto()) return say(noCrypto);
      if (a0 && val('dvPass') && (a0.plain ? val('dvPass') === a0.plain : (await kdf(val('dvPass'), a0.salt)) === a0.hash)) { hit('dev'); setDev(true); api.render(); toast('เข้าสู่ระบบผู้พัฒนาแล้ว'); }
      else { miss('dev'); say('รหัสไม่ถูกต้อง'); }
    };
    document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'dvPass') { e.preventDefault(); H['dv-login'](); } });
    document.addEventListener('input', (e) => {
      if (/^dvA_/.test(e.target.id)) document.getElementById('dvO_' + e.target.id.slice(4)).textContent = e.target.value;
      if (e.target.id === 'dvLinks') linkText = e.target.value;
      if (e.target.id === 'dvQuery') query = e.target.value;
      if (e.target.id === 'dvIn') inbox.text = e.target.value;
    });
    // show only the fields that matter for the chosen code type / duration
    document.addEventListener('change', (e) => {
      if (e.target.id === 'dvT' || e.target.id === 'dvDur') {
        const t = val('dvT'), d = val('dvDur'); codeType = t;
        document.querySelectorAll('[data-for]').forEach((g) => { g.hidden = !g.dataset.for.split(' ').includes(t); });
        document.querySelectorAll('[data-for2]').forEach((g) => { g.hidden = g.dataset.for2 !== d; });
      }
    });
    document.addEventListener('toggle', (e) => { const d = e.target; if (d && d.dataset && d.dataset.g) { if (d.open) openG.add(d.dataset.g); else openG.delete(d.dataset.g); } }, true);
    H['dv-logout'] = () => { setDev(false); issued = null; issuedTok = null; api.render(); toast('ออกจากระบบผู้พัฒนาแล้ว'); };
    H['dv-dismiss'] = () => { issued = null; api.render(true); };
    H['dv-tok-dismiss'] = () => { issuedTok = null; api.render(true); };
    H['dv-enter'] = (el) => { CM.studio.enter(el.dataset.id); location.hash = '#/studio'; };
    H['dv-code'] = async (el) => {
      if (!canCrypto()) return toast(noCrypto);
      if (L().signPriv) await issueOwnerToken(el.dataset.id); else await issue(el.dataset.id);   // signed code when the signing key exists
      api.render(true); window.scrollTo(0, 0);
    };
    H['dv-form-cancel'] = () => { prefill = null; draftId = ''; formFor = ''; };

    /* ----- cafés: photo, save, delete ----- */
    const setPhoto = (d) => {
      photoData = d;
      document.getElementById('dvPhotoPrev').innerHTML = d ? '<img class="cover" alt="ตัวอย่างรูปปก" src="' + esc(d) + '">' : '<span class="banner-ph">ยังไม่มีรูป — ใช้ภาพวาดอัตโนมัติ</span>';
      document.getElementById('dvPhotoClr').hidden = !d;
    };
    document.addEventListener('change', (e) => {
      if (e.target.id === 'dvGeo') { const g = parseMaps(e.target.value); if (g && g.name && !val('dvName').trim()) document.getElementById('dvName').value = g.name; }
      if (e.target.id === 'dvPhoto') { const f = e.target.files && e.target.files[0]; if (f) CM.studio.readImage(f, 640, 360, 70000).then(setPhoto).catch((m) => toast(String(m))); }
      if (e.target.id === 'dvInFile') { const f = e.target.files && e.target.files[0]; if (f) f.text().then((t) => { inbox.text = t.trim(); api.render(true); }); }
    });
    H['dv-photo-clear'] = () => setPhoto('');

    H['dv-save'] = async (el) => {
      const err = (m, id) => { toast(m); const e = document.getElementById(id); if (e) e.focus(); };
      const num = (id) => parseFloat(val(id));
      const old = el.dataset.id ? allCafes().find((c) => c.id === el.dataset.id) || (D.CAFE_BY_ID[el.dataset.id] ? authored(D.CAFE_BY_ID[el.dataset.id]) : null) : null;
      const name = val('dvName').trim(), area = val('dvArea').trim(), tagline = val('dvTag').trim(), secret = val('dvSecret').trim();
      if (!name) return err('ใส่ชื่อร้านก่อนนะ', 'dvName');
      if (!area) return err('ใส่ย่านของร้าน', 'dvArea');
      const geoText = val('dvGeo').trim(), isUrl = /^https?:\/\//i.test(geoText), g = parseMaps(geoText);
      if (isUrl && !MAPS_URL.test(geoText)) return err('ลิงก์ต้องเป็นลิงก์ Google Maps (https://www.google.com/maps/…)', 'dvGeo');
      if (!g || g.err) return err((g && g.err) || 'ใส่ลิงก์ Google Maps หรือพิกัดของร้าน', 'dvGeo');
      const lat = g.lat, lon = g.lon, mapUrl = isUrl ? geoText : '';
      if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return err('พิกัดไม่ถูกต้อง', 'dvGeo');
      if (!tagline) return err('ใส่คำโปรยสั้น ๆ ของร้าน', 'dvTag');
      if (!secret) return err('ใส่ความลับหรือทริปเด็ดของร้าน', 'dvSecret');
      const open = num('dvOpen'), close = num('dvClose');
      if (!(open >= 0 && open <= 23.5) || !(close > open && close <= 28)) return err('เวลาเปิด–ปิดไม่ถูกต้อง (ปิดหลังเที่ยงคืนใส่ 25 = 01:00)', 'dvOpen');
      const rating = num('dvRating'), reviews = parseInt(val('dvReviews'), 10);
      if (!(rating >= 1 && rating <= 5)) return err('คะแนนต้องอยู่ระหว่าง 1–5', 'dvRating');
      if (!(reviews >= 1 && reviews <= 999999)) return err('จำนวนรีวิวต้องเป็นตัวเลข 1 ขึ้นไป', 'dvReviews');
      const url = val('dvBanner').trim();
      if (url && !/^(https:\/\/[^\s"'<>]+|[\w\-./]+\.(png|jpe?g|webp|avif|gif))$/i.test(url)) return err('รูปปกต้องเป็นลิงก์ https:// หรือ path ไฟล์รูป เช่น img/cafes/a.jpg', 'dvBanner');
      const banner = photoData || url;
      const drinks = [], spots = [];
      for (let i = 0; i < 3; i++) {
        const dn = val('dvDn' + i).trim(), dp = parseInt(val('dvDp' + i), 10);
        if (dn || val('dvDp' + i)) {
          if (!dn || !(dp > 0)) return err('เมนูที่ ' + (i + 1) + ' ใส่ชื่อและราคาให้ครบ', 'dvDn' + i);
          const type = val('dvDt' + i);
          const od = old && old.drinks[i]; drinks.push({ name: dn, type, temp: val('dvDh' + i), price: dp, note: val('dvDo' + i).trim() || 'เมนูแนะนำของร้าน', colors: od && od.type === type && od.colors ? od.colors : CM.studio.TYPE_COLORS[type] });
        }
        const sn = val('dvSn' + i).trim(), sb = val('dvSb' + i).trim();
        if (sn || sb) {
          if (!sn || !/^\d{1,2}:\d{2}\s*[–-]\s*\d{1,2}:\d{2}$/.test(sb)) return err('จุดถ่ายรูปที่ ' + (i + 1) + ' ใส่ชื่อและเวลาแสงดี เช่น 15:00–17:00', 'dvSn' + i);
          const os = old && old.spots[i]; spots.push({ name: sn, best: sb.replace(/\s*[–-]\s*/, '–'), light: os && os.light != null ? os.light : 3, bg: os && os.bg != null ? os.bg : 3, tip: val('dvSt' + i).trim() || 'จุดถ่ายรูปแนะนำของร้าน', outdoor: document.getElementById('dvSo' + i).checked });
        }
      }
      if (!drinks.length) return err('ใส่เมนูอย่างน้อย 1 รายการ', 'dvDn0');
      if (!spots.length) return err('ใส่จุดถ่ายรูปอย่างน้อย 1 จุด', 'dvSn0');
      let id = old && old.id;
      if (!id) {
        const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'cafe-' + Date.now().toString(36);
        id = base; for (let n = 2; D.CAFE_BY_ID[id]; n++) id = base + '-' + n;
      }
      const attr = {}; D.DIMS.forEach((d) => { attr[d] = Math.max(0, Math.min(10, parseInt(val('dvA_' + d), 10) || 0)); });
      const raw = { id, name, area, district: val('dvDistrict').trim(), province: val('dvProvince').trim() || 'กรุงเทพมหานคร', lat, lon, mapUrl, rating: Math.round(rating * 10) / 10, reviews, repeat: old ? old.repeat : .3, hours: [open, close], palette: [val('dvP1'), val('dvP2')], attr, tagline, secret, banner, drinks, spots };
      if (val('dvGid')) raw.gid = val('dvGid');
      const l = L(), i = l.cafes.findIndex((x) => x.id === id), prev = i >= 0 ? l.cafes[i] : null;
      if (i >= 0) l.cafes[i] = raw; else l.cafes.push(raw);
      if (!S.save()) { if (prev) l.cafes[i] = prev; else l.cafes.pop(); return toast('พื้นที่เก็บข้อมูลเต็ม — ลดรูปปกหรือใช้ลิงก์รูปแทน'); }
      D.upsertCafe(clone(raw));
      CM.studio.apply(CM.weather.ctx.hour);
      if (draftId) { l.drafts = l.drafts.filter((x) => x.id !== draftId); S.save(); }
      prefill = null; draftId = ''; formFor = '';
      if (!old) { if (canCrypto()) { if (L().signPriv) await issueOwnerToken(id); else await issue(id); } else toast(noCrypto); }
      location.hash = '#/dev';
      toast(old ? 'บันทึกร้านแล้ว' : 'เพิ่มร้านแล้ว — ลูกค้าเห็นในเครื่องนี้ทันที');
    };
    H['dv-del'] = (el) => { const c = D.CAFE_BY_ID[el.dataset.id]; if (!c) return; api.openSheet('<h2 id="sheetTitle">ลบ ' + esc(c.name) + '?</h2><p class="muted">ร้านนี้จะหายจากแอปในเครื่องนี้ทันที และหายจากทุกเครื่องหลังส่งออก content.js แล้วอัปโหลดใหม่ (ใช้ได้กับร้านตัวอย่างด้วย) Passport/รายการโปรดของลูกค้าที่เกี่ยวกับร้านนี้จะถูกข้ามไป ย้อนกลับไม่ได้</p><button class="btn danger lg" data-act="dv-del-do" data-id="' + c.id + '">ลบร้านนี้</button><button class="btn text block" data-act="close-sheet">ยกเลิก</button>'); };
    H['dv-del-samples'] = () => api.openSheet('<h2 id="sheetTitle">ลบร้านตัวอย่างทั้งหมด?</h2><p class="muted">ร้านตัวอย่างที่ยังไม่ได้แก้ไข ' + samplesLeft() + ' ร้านจะหายจากแอป (ร้านที่คุณเพิ่มเองหรือแก้ไขแล้วไม่ถูกลบ) ใช้ตอนจะเปิดแอปจริง ส่งออก content.js เพื่อให้มีผลทุกเครื่อง ย้อนกลับไม่ได้</p><button class="btn danger lg" data-act="dv-del-samples-do">ลบทั้งหมด</button><button class="btn text block" data-act="close-sheet">ยกเลิก</button>');
    H['dv-del-samples-do'] = () => {
      const st = S.get(), l = L();
      D.CAFES.filter((c) => rawIds.has(c.id) && !isAdded(c.id)).map((c) => c.id).forEach((id) => { if (!l.removed.includes(id)) l.removed.push(id); D.removeCafe(id); delete l.owners[id]; delete l.proofs[id]; delete l.shops[id]; delete st.stamps[id]; });
      st.favCafes = (st.favCafes || []).filter((x) => D.CAFE_BY_ID[x]); if (st.studio.cafeId && !D.CAFE_BY_ID[st.studio.cafeId]) st.studio.cafeId = null;
      CM.studio.pubReset(); S.save(); api.closeSheet(true); api.render(true); toast('ลบร้านตัวอย่างแล้ว');
    };
    H['dv-del-do'] = (el) => {
      const id = el.dataset.id, l = L(), st = S.get();
      if (!D.CAFE_BY_ID[id]) return;
      l.cafes = l.cafes.filter((c) => c.id !== id); if (!l.removed.includes(id)) l.removed.push(id);
      delete l.owners[id]; delete l.proofs[id]; delete l.shops[id];
      D.removeCafe(id); CM.studio.pubReset();
      st.favCafes = (st.favCafes || []).filter((x) => x !== id); delete st.stamps[id]; if (st.studio.cafeId === id) st.studio.cafeId = null;
      S.save(); api.closeSheet(true); api.render(true); toast('ลบร้านแล้ว');
    };

    /* ----- Google Maps import ----- */
    H['dv-links-read'] = () => { linkText = val('dvLinks'); found = linkText.split('\n').map(parseMaps).filter(Boolean); api.render(true); };
    const openForm = (d) => { prefill = d; draftId = d.id || ''; formFor = ''; location.hash = '#/dev/add'; };
    const addDraft = (d) => { d.id = 'd' + Date.now() + Math.floor(Math.random() * 1000); L().drafts.push(d); return d; };
    H['dv-found-form'] = (el) => { const x = found[+el.dataset.i]; openForm({ name: x.name, lat: x.lat, lon: x.lon }); };
    H['dv-found-draft'] = (el) => { const x = found[+el.dataset.i]; if (knownPlace(x)) return toast('มีร้านนี้ในระบบหรือในร่างแล้ว'); addDraft({ name: x.name, lat: x.lat, lon: x.lon }); S.save(); api.render(true); toast('เก็บเป็นร่างแล้ว'); };
    H['dv-search'] = async () => {
      query = val('dvQuery').trim();
      const key = L().gkey, msg = document.getElementById('dvSMsg');
      if (!query) return toast('พิมพ์คำค้นก่อนนะ');
      if (!key) return toast('ใส่ Google Places API key ที่หน้าตั้งค่าก่อน');
      msg.textContent = 'กำลังค้นหา…';
      try { places = await searchPlaces(query, key); api.render(true); }
      catch (e) { msg.textContent = 'ค้นหาไม่สำเร็จ: ' + (e.message || e) + ' (ตรวจ API key / เปิด Places API (New) / ใช้ได้เฉพาะบนเว็บที่ key อนุญาต)'; msg.classList.add('bad'); }
    };
    H['dv-place-form'] = (el) => openForm(placeToDraft(places.cafes[+el.dataset.i]));
    H['dv-place-draft'] = (el) => { const d = placeToDraft(places.cafes[+el.dataset.i]); if (knownPlace(d)) return toast('มีร้านนี้ในระบบหรือในร่างแล้ว'); addDraft(d); S.save(); api.render(true); toast('เก็บเป็นร่างแล้ว'); };
    H['dv-place-all'] = () => { let n = 0; places.cafes.forEach((p) => { const d = placeToDraft(p); if (!knownPlace(d)) { addDraft(d); n++; } }); S.save(); api.render(true); toast('เก็บเป็นร่าง ' + n + ' ร้าน — เปิดจากหน้าหลังบ้านเพื่อเติมเมนูและจุดถ่ายรูป'); };
    H['dv-draft-open'] = (el) => { const d = L().drafts.find((x) => x.id === el.dataset.id); if (d) openForm(clone(d)); };
    H['dv-draft-del'] = (el) => { L().drafts = L().drafts.filter((x) => x.id !== el.dataset.id); S.save(); api.render(true); };

    /* ----- announcements ----- */
    H['dv-news-add'] = () => {
      const title = val('dvNTitle').trim(), body = val('dvNBody').trim(), until = val('dvNUntil');
      if (!title || !body) return toast('ใส่หัวข้อและรายละเอียดก่อนนะ');
      if (until && until < ymd()) return toast('วันที่แสดงถึงต้องไม่ก่อนวันนี้');
      L().news.push({ id: 'n' + Date.now(), ts: Date.now(), title, body, until });
      if (!S.save()) { L().news.pop(); return toast('พื้นที่เก็บข้อมูลเต็ม'); }
      api.render(true); toast('เผยแพร่ประกาศแล้ว — ขึ้นที่หน้า Home');
    };
    H['dv-news-del'] = (el) => {
      const l = L(); l.news = l.news.filter((n) => n.id !== el.dataset.id);
      if (!l.gone.includes(el.dataset.id)) l.gone.push(el.dataset.id);   // also hides a published one
      S.save(); api.render(true); toast('ลบประกาศแล้ว');
    };

    /* ----- settings: payment account, signing key, Google key ----- */
    const setQr = (d) => { L().pay = Object.assign({}, L().pay || content.pay || {}, { qr: d }); S.save(); document.getElementById('dvQrPrev').innerHTML = d ? '<img class="pay-qr" src="' + esc(d) + '" alt="QR พร้อมเพย์">' : '<span class="muted small">ยังไม่ได้แปะ QR</span>'; document.getElementById('dvQrClr').hidden = !d; };
    document.addEventListener('change', (e) => { if (e.target.id === 'dvQr') { const f = e.target.files && e.target.files[0]; if (f) readQr(f).then((d) => { setQr(d); toast('แปะ QR แล้ว — ส่งออก content.js ให้ทุกเครื่องเห็น'); }).catch((m) => toast(String(m))); } });
    H['dv-qr-clear'] = () => setQr('');
    H['dv-contact-save'] = () => { L().contact = { email: val('dvCe').trim(), line: val('dvCl').trim(), phone: val('dvCp').trim(), social: val('dvCs').trim(), note: val('dvCn').trim() }; S.save(); toast('บันทึกแล้ว — ขึ้นที่หน้าติดต่อเรา (ส่งออก content.js ให้ทุกเครื่องเห็น)'); };
    H['dv-pay-save'] = () => { L().pay = Object.assign({}, L().pay || content.pay || {}, { promptpay: val('dvPp').trim(), name: val('dvPn').trim(), bank: val('dvPb').trim(), contact: val('dvPc').trim() }); S.save(); toast(pay() ? 'บันทึกแล้ว — แพ็กเกจต้องโอนเงินและรอตรวจสอบ (ส่งออก content.js ให้ทุกเครื่องเห็น)' : 'บันทึกแล้ว — ยังเป็นโหมดเดโม (ไม่มีบัญชีรับเงิน)'); };
    H['dv-gkey-save'] = () => { L().gkey = val('dvGkey').trim(); S.save(); toast('บันทึก API key แล้ว'); };
    H['dv-key-gen'] = async () => {
      if (!canCrypto()) return toast(noCrypto);
      if (L().signPriv) { api.openSheet('<h2 id="sheetTitle">สร้างกุญแจใหม่?</h2><p class="muted">รหัสทั้งหมดที่เคยออกจะใช้ไม่ได้ ต้องออกใหม่ และต้องส่งออก content.js เพื่อเผยแพร่กุญแจใหม่</p><button class="btn danger lg" data-act="dv-key-gen-do">สร้างใหม่</button><button class="btn text block" data-act="close-sheet">ยกเลิก</button>'); return; }
      await genKeys(); api.render(true); toast('สร้างกุญแจแล้ว — ส่งออก content.js เพื่อเผยแพร่');
    };
    H['dv-key-gen-do'] = async () => { await genKeys(); api.closeSheet(true); api.render(true); toast('สร้างกุญแจใหม่แล้ว'); };
    H['dv-key-backup'] = () => download('cafe-mood-signing-key.txt', 'CMKEY1.' + jb({ priv: L().signPriv, pub: L().signPub }));
    H['dv-key-import'] = () => {
      const t = val('dvKeyIn').trim();
      try { if (!t.startsWith('CMKEY1.')) throw 0; const k = bj(t.slice(7)); if (!k.priv || !k.pub) throw 0; L().signPriv = k.priv; L().signPub = k.pub; S.save(); api.render(true); toast('นำเข้ากุญแจแล้ว'); } catch (e) { toast('ไฟล์สำรองไม่ถูกต้อง'); }
    };

    /* ----- issue free/special codes ----- */
    /* products */
    document.addEventListener('change', (e) => {
      if (e.target.id === 'dvPrK') document.querySelectorAll('[data-pk]').forEach((g) => { g.hidden = g.dataset.pk !== e.target.value; });
      if (e.target.id === 'dvPrDur') document.querySelectorAll('[data-pd]').forEach((g) => { g.hidden = g.dataset.pd !== e.target.value; });
    });
    const saveProd = (p) => { const l = L(), i = l.products.findIndex((x) => x.id === p.id); if (i >= 0) l.products[i] = p; else l.products.push(p); l.pgone = l.pgone.filter((x) => x !== p.id); return S.save(); };
    H['dv-prod-save'] = (el) => {
      const err = (m, id) => { toast(m); const e = document.getElementById(id); if (e) e.focus(); };
      const old = el.dataset.id ? products().find((x) => x.id === el.dataset.id) : null, n = (id) => Math.max(0, parseInt(val(id), 10) || 0);
      const name = val('dvPrN').trim(), kind = val('dvPrK'), dur = val('dvPrDur'), status = val('dvPrS');
      if (!name) return err('ใส่ชื่อก่อนนะ', 'dvPrN');
      const price = { month: kind === 'sub' ? n('dvPrM') : 0, year: kind === 'sub' ? n('dvPrY') : 0, once: kind === 'once' ? n('dvPrO') : 0 };
      if (kind === 'sub' && !price.month && !price.year) return err('ใส่ราคารายเดือนหรือรายปีอย่างน้อยหนึ่งอย่าง', 'dvPrM');
      if (kind === 'once' && !price.once) return err('ใส่ราคา', 'dvPrO');
      const d = { t: dur, d: 0, u: 0 };
      if (kind === 'once' && dur === 'days') { d.d = n('dvPrDays'); if (!(d.d >= 1 && d.d <= 3650)) return err('จำนวนวันต้องอยู่ระหว่าง 1–3650', 'dvPrDays'); }
      if (kind === 'once' && dur === 'until') { const u = val('dvPrUntil'); if (!u || u < ymd()) return err('เลือกวันที่ใช้ได้ถึง (ต้องไม่ก่อนวันนี้)', 'dvPrUntil'); d.u = endOfDay(u); }
      if (kind === 'sub') d.t = 'forever';
      const id = old ? old.id : 'p-' + (name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || rnd(5).toLowerCase()) + '-' + rnd(3).toLowerCase();
      const flag = val('dvPrFlag').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').slice(0, 30);
      const p = { id, name, desc: val('dvPrD').trim(), aud: val('dvPrA'), kind, status, price, dur: d, sale: { from: val('dvPrFrom'), to: val('dvPrTo') }, eta: val('dvPrE').trim(), grants: { studio: val('dvPrG'), plus: document.getElementById('dvPrP').checked },
        feats: val('dvPrF').split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 12), flag, openTo: old ? old.openTo || '' : '', releasedAt: old ? old.releasedAt || 0 : 0, ts: old ? old.ts : Date.now() };
      if (old && old.status === 'pre' && status === 'sale' && !p.releasedAt) p.releasedAt = Date.now();
      if (!saveProd(p)) return toast('พื้นที่เก็บข้อมูลเต็ม');
      location.hash = '#/dev/products'; toast('บันทึกรายการแล้ว — ส่งออก content.js ให้ทุกเครื่องเห็น');
    };
    H['dv-prod-del'] = (el) => { const p = products().find((x) => x.id === el.dataset.id); if (p) api.openSheet('<h2 id="sheetTitle">ลบ “' + esc(p.name) + '”?</h2><p class="muted">รายการนี้หายจากหน้าซื้อ (ผู้ที่ซื้อไปแล้วจะไม่เห็นสิทธิ์นี้ในเครื่องหลังเผยแพร่ใหม่) ย้อนกลับไม่ได้</p><button class="btn danger lg" data-act="dv-prod-del-do" data-id="' + p.id + '">ลบ</button><button class="btn text block" data-act="close-sheet">ยกเลิก</button>'); };
    H['dv-prod-del-do'] = (el) => { const l = L(); l.products = l.products.filter((x) => x.id !== el.dataset.id); if (!l.pgone.includes(el.dataset.id)) l.pgone.push(el.dataset.id); S.save(); api.closeSheet(true); api.render(true); toast('ลบรายการแล้ว'); };
    H['dv-prod-send'] = (el) => { codeType = 'prod'; codeProd = el.dataset.id; location.hash = '#/dev/codes'; };
    H['dv-prod-release'] = (el) => {
      const p = products().find((x) => x.id === el.dataset.id); if (!p) return;
      api.openSheet('<h2 id="sheetTitle">' + (p.status === 'pre' ? 'ปล่อยฟีเจอร์ ' : 'ส่ง ') + esc(p.name) + ' ให้ผู้ใช้</h2><p class="muted">' + (p.status === 'pre' ? 'ผู้ที่พรีออเดอร์ไว้จะเริ่มใช้ได้ (ระยะเวลานับจากวันนี้) และรายการเปลี่ยนเป็น “ขายอยู่”' : 'เลือกว่าจะเปิดให้ใครใช้ฟรีโดยไม่ต้องซื้อ') + '</p>' +
        sel('dvOpenTo', 'เปิดให้ใช้ฟรีสำหรับ', [['', 'ไม่เปิดฟรี (เฉพาะคนที่ซื้อ/ได้รับโค้ด)'], ['owner', 'เจ้าของร้านทุกคน'], ['customer', 'ลูกค้าทุกคน'], ['both', 'ทุกคน']], p.openTo || '') +
        '<label class="chk"><input type="checkbox" id="dvAnn" checked> ลงประกาศที่หน้า Home</label>' +
        '<button class="btn primary lg" data-act="dv-prod-release-do" data-id="' + p.id + '">' + (p.status === 'pre' ? 'ปล่อยฟีเจอร์' : 'บันทึก') + '</button><button class="btn text block" data-act="close-sheet">ยกเลิก</button>');
    };
    H['dv-prod-release-do'] = (el) => {
      const p = clone(products().find((x) => x.id === el.dataset.id)); if (!p) return;
      const was = p.status; p.status = 'sale'; if (was === 'pre' || !p.releasedAt) p.releasedAt = Date.now(); p.openTo = val('dvOpenTo');
      saveProd(p);
      if (document.getElementById('dvAnn').checked) { L().news.push({ id: 'n' + Date.now(), ts: Date.now(), title: (was === 'pre' ? 'ฟีเจอร์ใหม่พร้อมแล้ว: ' : 'อัปเดต: ') + p.name, body: (p.desc || 'ดูรายละเอียดที่หน้าแพ็กเกจ').slice(0, 200), until: '' }); S.save(); }
      api.closeSheet(true); api.render(true); toast('ส่งให้ผู้ใช้แล้ว — ส่งออก content.js ให้ถึงทุกเครื่อง');
    };
    H['dv-code-make'] = async () => {
      const t = val('dvT'), dur = val('dvDur'), note = val('dvNote').trim(), exp = val('dvExp');
      if (!L().signPriv) return toast('สร้างกุญแจออกรหัสที่หน้าตั้งค่าก่อน');
      const p = { i: rnd(8), a: Date.now(), k: t === 'note' ? 'note' : 'grant', t };
      if (note) p.n = note;
      if (exp) { if (exp < ymd()) return toast('วันที่ต้องใช้โค้ดต้องไม่ก่อนวันนี้'); p.x = endOfDay(exp); }
      let label = t === 'note' ? 'อื่น ๆ: ' + note : '';
      if (t === 'note' && !note) return toast('ใส่รายละเอียดว่าโค้ดนี้ให้อะไร');
      if (t === 'prod' && !val('dvProd')) return toast('เลือกรายการที่จะส่งให้');
      if (t !== 'note') {
        let when;
        if (dur === 'until') { const u = val('dvUntil'); if (!u || u < ymd()) return toast('เลือกวันที่ใช้ฟรีถึง (ต้องไม่ก่อนวันนี้)'); p.u = endOfDay(u); when = 'ถึง ' + u; }
        else if (dur === 'days') { const d = parseInt(val('dvDays'), 10); if (!(d >= 1 && d <= 3650)) return toast('จำนวนวันต้องอยู่ระหว่าง 1–3650'); p.d = d; when = d + ' วันนับจากวันที่ใช้'; }
        else when = 'ถาวร';
        if (t === 'studio') { p.p = val('dvPlan'); if (val('dvBind')) p.c = val('dvBind'); }
        if (t === 'prod') { p.k = 'prod'; p.pr = val('dvProd'); }
        label = (t === 'studio' ? 'Studio ' + p.p + (p.c ? ' (' + p.c + ')' : '') : t === 'prod' ? (products().find((x) => x.id === p.pr) || {}).name : 'Plus') + ' ฟรี ' + when;
      }
      issuedTok = { label, token: await signToken(p) };
      L().issued.push({ i: p.i, ts: p.a, label }); S.save(); api.render(true); window.scrollTo(0, 0);
    };
    H['dv-revoke'] = (el) => { if (!L().revoked.includes(el.dataset.id)) L().revoked.push(el.dataset.id); S.save(); api.render(true); toast('ยกเลิกรหัสแล้ว — ส่งออก content.js ให้มีผลทุกเครื่อง'); };

    /* ----- inbox: payments and shop data from owners ----- */
    H['dv-inbox-read'] = async () => {
      inbox.text = val('dvIn').trim();
      const raw = inbox.text, pay0 = /PAY1\.([A-Za-z0-9_-]+)/.exec(raw), i1 = raw.indexOf('PUB1.');   // the code may sit inside a longer message
      try {
        if (pay0) { const q = bj(pay0[1]); if (!q.r || !(q.a > 0) || !(q.k || q.pr)) throw 0; inbox.res = { kind: 'pay', q }; }
        else if (i1 >= 0) {
          const t = raw.slice(i1).replace(/\s+/g, '');
          if (t.length > 1.5e6) throw new Error('ไฟล์ใหญ่เกินไป');
          const m = /^PUB1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(t); if (!m) throw 0;
          const p = bj(m[1]); if (!p.c || !p.d) throw 0;
          const key = L().proofs[p.c];
          const proof = !key ? 'none' : m[2] === '-' ? 'unsigned' : (await hmac(key, m[1])) === m[2] ? 'ok' : 'bad';
          inbox.res = { kind: 'pub', c: p.c, t: p.t, d: p.d, proof };
        } else inbox.res = { err: 'ไม่รู้จักรหัสนี้ — ต้องมี PAY1. หรือ PUB1.' };
      } catch (e) { inbox.res = { err: 'อ่านรหัสไม่ได้ — คัดลอกมาไม่ครบหรือถูกแก้ไข' + (e && e.message ? ' (' + e.message + ')' : '') }; }
      api.render(true);
    };
    H['dv-pay-issue'] = async () => {
      const q = inbox.res && inbox.res.q;
      if (!q) return;
      if (!L().signPriv) return toast('สร้างกุญแจออกรหัสที่หน้าตั้งค่าก่อน');
      if (!document.getElementById('dvOk').checked) return toast('ติ๊กยืนยันก่อนว่าเงินเข้าบัญชีแล้วจริง');
      if (parseFloat(val('dvGot')) !== q.a) return toast('ยอดที่ได้รับต้องเท่ากับ ฿' + q.a.toLocaleString('en-US') + ' ถ้าไม่ตรงให้ติดต่อผู้ซื้อก่อน');
      if (L().payments.some((x) => x.ref === q.r)) return toast('ออกรหัสให้รหัสอ้างอิงนี้ไปแล้ว');
      let p, label;
      if (q.pr) {
        const pr = products().find((x) => x.id === q.pr);
        if (!pr) return toast('ไม่พบรายการนี้ในระบบ — เผยแพร่รายการก่อน');
        const spec = q.o === 'month' ? { m: 1 } : q.o === 'year' ? { m: 12 } : pr.dur.t === 'days' ? { d: pr.dur.d } : pr.dur.t === 'until' ? { u: pr.dur.u } : {};
        p = Object.assign({ i: rnd(8), a: Date.now(), k: 'prod', t: 'prod', pr: q.pr, x: Date.now() + 30 * 864e5, n: q.r }, spec); label = 'ชำระแล้ว ' + pr.name + ' · ' + q.r;
      } else { p = { i: rnd(8), a: Date.now(), k: 'paid', t: 'studio', p: q.k, c: q.c, m: q.m, x: Date.now() + 30 * 864e5, n: q.r }; label = 'ชำระแล้ว ' + q.k + ' ' + (q.m === 12 ? 'รายปี' : 'รายเดือน') + ' · ' + q.r; }
      issuedTok = { label, token: await signToken(p) };
      L().payments.push({ ref: q.r, cafe: q.c || '', amt: q.a, ts: Date.now() }); L().issued.push({ i: p.i, ts: p.a, label: issuedTok.label }); S.save();
      inbox.res = null; inbox.text = ''; api.render(true); window.scrollTo(0, 0); toast('ออกรหัสเปิดใช้งานแล้ว — ส่งให้ผู้ซื้อ (ใช้ได้ภายใน 30 วัน)');
    };
    H['dv-pub-apply'] = () => {
      const r = inbox.res;
      if (!r || r.kind !== 'pub' || r.proof === 'bad' || !D.CAFE_BY_ID[r.c]) return toast('นำเข้าไม่ได้');
      publishShop(r.c, r.d); inbox.res = null; inbox.text = ''; api.render(true); toast('นำเข้าข้อมูลร้านแล้ว — ส่งออก content.js เพื่อให้ทุกเครื่องเห็น');
    };

    H['dv-export'] = () => {
      const a0 = devAuth(), l = L();
      const out = { dev: a0 && a0.salt ? { salt: a0.salt, hash: a0.hash } : content.dev, cafes: allCafes(), announcements: allNews(), owners: Object.assign({}, content.owners, l.owners), shops: shops(), pay: l.pay || content.pay, signPub: l.signPub || content.signPub, revoked: Array.from(new Set(revokedIds())), removed: removedIds(), contact: contact(), products: products() };
      Object.keys(out.owners).forEach((id) => { if (l.removed.includes(id)) delete out.owners[id]; });
      Object.keys(out.shops).forEach((id) => { if (l.removed.includes(id)) delete out.shops[id]; });
      download('content.js', '/* Café Mood — content published by the developer.\n   This file is generated: Profile → ผู้พัฒนา → ส่งออก content.js, then upload it over js/content.js.\n   Empty = only the sample cafés in data.js. */\nwindow.CM = window.CM || {};\nCM.content = ' + JSON.stringify(out, null, 2) + ';\n');
      toast('ดาวน์โหลด content.js แล้ว — อัปโหลดทับ js/content.js ใน GitHub');
    };
  }

  CM.dev = { install, view, isDev, isAdded, isReal, products, contact, payBox, rand: rnd, hasOwnerCode: (id) => !!ownerHash(id), checkOwner, newsHtml, shop, pay, payCode, readToken, tokenError, proofKey, makeSubmission, publishShop };
})();
