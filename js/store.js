/* Café Mood — tiny persisted store (localStorage, with in-memory fallback). */
(function () {
  window.CM = window.CM || {};
  const KEY = 'cafemood.v1', SHARED_KEY = 'cafemood.shared', SESSION = 'cafemood.session';
  // What belongs to the device (café owner side, developer overlay, purchases), not to the signed-in customer
  const SHARED = ['studio', 'dev', 'ent', 'entPending', 'entUsed', 'authLocks'];

  const defaults = () => ({
    studio: { cafeId: null, plan: 'free', period: 'year', trialEnd: 0, paid: false, trialUsed: false, byCafe: {} },   // Café Studio (owner side) demo state
    sub: { plan: 'free', period: 'year', startedAt: 0, trialEnd: 0, cancelled: false, endsAt: 0 },   // customer subscription (Plus)
    reminders: { events: false, rain: false },
    favCafes: [],           // café ids the user hearted (newest first)
    ent: [],                // products bought or received: [{pid, at, m|d|u}] (see js/ent.js)
    entPending: {},         // purchases waiting for the developer to confirm the transfer
    entUsed: [],            // activation codes already used on this device
    authLocks: {},          // wrong-password counters for customer sign-in
    stamps: {},             // café id → time the café's passport stamp was earned (conditions met at check-in)
    avatar: '',             // customer profile photo (small JPEG data URL, this device only)
    dev: { salt: '', hash: '', cafes: [], news: [], gone: [], owners: {}, locks: {}, shops: {}, removed: [], drafts: [], issued: [], revoked: [], proofs: {}, payments: [], pay: null, signPriv: null, signPub: null, gkey: '' },   // developer console overlay on js/content.js (this device only)
    redeemed: [],           // codes already collected on this device
    redeemLog: [],          // collected codes: [{code, ts, kind:'promo'|'event', cafeId, title, gives, until}]
    account: { email: '', phone: '', line: '' },   // personal info (this device only)
    contactRequests: [],    // contact details the user left for us (kept on this device in the prototype)
    savedEvents: [],        // event ids the user wants a reminder for
    name: '',             // what we call the user
    moodHistory: {},        // { moodId: timesPicked } → Favorite Mood
    profile: null,          // result of engine.buildProfile
    skipped: false,         // user skipped the quiz
    quizDraft: {},          // { questionIndex: optionIndex }
    mood: null,             // today's mood { moods, boosts, hidden, drink, night, labels, text }
    weatherOverride: null,  // null | 'sunny' | 'cloudy' | 'rain' | 'hot' | 'night'
    location: { lat: 13.7563, lon: 100.5018, source: 'default' },
    visits: []              // passport log
  });

  const rd = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const userKey = (id) => (id ? 'cafemood.u.' + id : KEY);
  let sid = ''; try { sid = localStorage.getItem(SESSION) || ''; } catch (e) { /* private mode */ }
  let state;
  function load() {
    const legacy = rd(KEY) || {}, sh = rd(SHARED_KEY) || legacy;   // first run after the upgrade: the device part comes from the old single record
    state = Object.assign(defaults(), rd(userKey(sid)) || {});
    SHARED.forEach((k) => { if (sh[k] !== undefined) state[k] = sh[k]; });
  }
  load();

  function save() {
    try {
      const sh = {}, u = {};
      Object.keys(state).forEach((k) => { (SHARED.includes(k) ? sh : u)[k] = state[k]; });
      localStorage.setItem(SHARED_KEY, JSON.stringify(sh)); localStorage.setItem(userKey(sid), JSON.stringify(u));
      return true;
    } catch (e) { return false; /* quota / private mode */ }
  }

  CM.store = {
    get: () => state,
    save,
    patch(p) { Object.assign(state, p); save(); },
    reset() { state = defaults(); save(); },
    sessionId: () => sid,
    // Sign in / out: customer data lives under the account; adopt = start the new account from what this device holds now
    switchUser(id, adopt) {
      save();
      if (adopt) { const u = {}; Object.keys(state).forEach((k) => { if (!SHARED.includes(k)) u[k] = state[k]; }); try { localStorage.setItem(userKey(id), JSON.stringify(u)); } catch (e) { /* full */ } }
      sid = id; try { id ? localStorage.setItem(SESSION, id) : localStorage.removeItem(SESSION); } catch (e) { /* private mode */ }
      load();
    },
    addVisit(v) { state.visits.push(v); save(); },
    live: () => state.visits.filter((v) => CM.data.CAFE_BY_ID[v.cafeId])   // ignore visits to cafés the developer removed
  };
})();
