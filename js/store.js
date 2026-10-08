/* Café Mood — tiny persisted store (localStorage, with in-memory fallback). */
(function () {
  window.CM = window.CM || {};
  const KEY = 'cafemood.v1';

  const defaults = () => ({
    studio: { cafeId: null, plan: 'free', period: 'year', trialEnd: 0, paid: false, trialUsed: false, byCafe: {} },   // Café Studio (owner side) demo state
    sub: { plan: 'free', period: 'year', startedAt: 0, trialEnd: 0, cancelled: false, endsAt: 0 },   // customer subscription (Plus)
    reminders: { events: false, rain: false },
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

  let state;
  try {
    state = Object.assign(defaults(), JSON.parse(localStorage.getItem(KEY) || '{}'));
  } catch (e) {
    state = defaults();
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); return true; } catch (e) { return false; /* quota / private mode */ }
  }

  CM.store = {
    get: () => state,
    save,
    patch(p) { Object.assign(state, p); save(); },
    reset() { state = defaults(); save(); },
    addVisit(v) { state.visits.push(v); save(); }
  };
})();
