/* Café Mood — customer sign-up and sign-in (prototype).
   No server: accounts live in this browser (password kept as a PBKDF2 hash), and each account has its own Passport, codes and
   settings on this device. Swap this module for a real backend (same four functions) to make accounts work across devices. */
(function () {
  window.CM = window.CM || {};
  const S = CM.store, AK = 'cafemood.accounts', enc = new TextEncoder();
  const accts = () => { try { return JSON.parse(localStorage.getItem(AK) || '[]'); } catch (e) { return []; } };
  const put = (a) => { try { localStorage.setItem(AK, JSON.stringify(a)); return true; } catch (e) { return false; } };
  const canCrypto = () => !!(window.crypto && crypto.subtle);
  const hex = (b) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, '0')).join('');
  async function kdf(secret, salt) {
    const k = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveBits']);
    return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' }, k, 256));
  }
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const current = () => { const id = S.sessionId(); return id ? accts().find((a) => a.id === id) || null : null; };
  // 5 wrong passwords in a row → wait a minute (kept on this device; slows guessing, it is not server security)
  const wait = (k) => { const l = S.get().authLocks[k]; return l && l.until > Date.now() ? Math.ceil((l.until - Date.now()) / 1000) : 0; };
  const miss = (k) => { const m = S.get().authLocks, l = m[k] || (m[k] = { n: 0, until: 0 }); l.n++; if (l.n % 5 === 0) l.until = Date.now() + 60000; S.save(); };

  async function signup(f) {
    const email = String(f.email || '').trim().toLowerCase(), name = String(f.name || '').trim().slice(0, 24);
    if (!EMAIL.test(email)) return { err: 'email' };
    if (String(f.password || '').length < 8) return { err: 'short' };
    if (f.password !== f.password2) return { err: 'match' };
    if (!canCrypto()) return { err: 'nocrypto' };
    const all = accts();
    if (all.some((a) => a.email === email)) return { err: 'dup' };
    const salt = hex(crypto.getRandomValues(new Uint8Array(16))), id = 'a' + hex(crypto.getRandomValues(new Uint8Array(6)));
    all.push({ id, email, name, salt, hash: await kdf(f.password, salt), created: Date.now() });
    if (!put(all)) return { err: 'full' };
    S.switchUser(id, true);
    const st = S.get(); if (name) st.name = name; st.account = Object.assign({}, st.account, { email }); S.save();
    return { ok: true };
  }
  async function login(email, password) {
    email = String(email || '').trim().toLowerCase();
    const w = wait(email); if (w) return { err: 'wait', wait: w };
    if (!canCrypto()) return { err: 'nocrypto' };
    const a = accts().find((x) => x.email === email);
    if (a && (await kdf(String(password || ''), a.salt)) === a.hash) { delete S.get().authLocks[email]; S.save(); S.switchUser(a.id, false); return { ok: true }; }
    miss(email); return { err: 'bad' };   // same answer for a wrong password and an unknown email
  }
  const logout = () => S.switchUser('', false);
  const message = (e) => ({ email: 'อีเมลดูไม่ถูกต้อง', short: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร', match: 'รหัสผ่านสองช่องไม่ตรงกัน', dup: 'อีเมลนี้สมัครไว้แล้วในเครื่องนี้ — เข้าสู่ระบบแทน', nocrypto: 'เบราว์เซอร์นี้ใช้ระบบรหัสผ่านไม่ได้ — เปิดผ่าน https หรือ localhost', full: 'พื้นที่เก็บข้อมูลเต็ม', bad: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' }[e] || 'ทำรายการไม่สำเร็จ');

  CM.auth = { current, signup, login, logout, message, wait };
})();
