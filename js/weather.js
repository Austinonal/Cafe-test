/* Café Mood — weather context layer.
   Real data from Open-Meteo (free, no API key). Can be overridden to simulate any weather. */
(function () {
  window.CM = window.CM || {};
  const store = CM.store;

  const KIND_LABEL = { sunny: 'แดดดี', cloudy: 'ครึ้มฟ้า', rain: 'ฝนตก', hot: 'ร้อนจัด' };
  const SIM = {
    sunny:  { kind: 'sunny',  night: false, hour: 14 },
    cloudy: { kind: 'cloudy', night: false, hour: 15 },
    rain:   { kind: 'rain',   night: false, hour: 16 },
    hot:    { kind: 'hot',    night: false, hour: 13 },
    night:  { kind: 'cloudy', night: true,  hour: 21 },
    haze:   { kind: 'cloudy', night: false, hour: 14, pm: 68 }   // v23: simulate a PM2.5 day (Thai "orange" band)
  };

  const nowHour = () => { const d = new Date(); return d.getHours() + d.getMinutes() / 60; };

  function make(o) {
    const night = !!o.night;
    const kind = o.kind;
    let label = KIND_LABEL[kind];
    let icon = { sunny: 'sun', cloudy: 'cloud', rain: 'cloud-rain', hot: 'thermometer' }[kind];
    if (night && kind !== 'rain') { label = 'ค่ำแล้ว'; icon = 'moon'; }
    return {
      kind, night, hour: o.hour, temp: o.temp == null ? null : Math.round(o.temp), pm: o.pm == null ? null : Math.round(o.pm * 10) / 10,
      label, icon, source: o.source,
      ambient: kind === 'rain' ? 'rain' : (night ? 'night' : kind)
    };
  }

  function fromTime() {
    const h = nowHour();
    const night = h >= 18.5 || h < 5.5;
    return make({ kind: night ? 'cloudy' : 'sunny', night, hour: h, source: 'time' });
  }

  // WMO weather code → our kinds
  function kindFromCode(code, temp) {
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95) return 'rain';
    if (temp != null && temp >= 33) return 'hot';
    if (code <= 1) return 'sunny';
    return 'cloudy';
  }

  // Last live reading (≤30 min old, same place) lets the app start with real weather instantly.
  function fromCache() {
    const st = store.get(), c = st.weatherCache;
    if (!c || st.weatherOverride || Date.now() - c.ts > 30 * 60 * 1000) return null;
    if (c.lat !== st.location.lat || c.lon !== st.location.lon) return null;
    return make({ kind: c.kind, night: c.night, temp: c.temp, pm: c.pm, hour: nowHour(), source: 'live' });
  }

  function initial() {
    const o = store.get().weatherOverride;
    if (o && SIM[o]) return make(Object.assign({ source: 'sim' }, SIM[o]));
    return fromCache() || fromTime();
  }

  // Current PM2.5 (µg/m³) from Open-Meteo's air-quality API (free, no key). Modelled data, not a ground station —
  // shortcut: for the official number use Air4Thai (PCD) once there is a backend to proxy it.
  async function airQuality(lat, lon) {
    try {
      const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 6000);
      const res = await fetch('https://air-quality-api.open-meteo.com/v1/air-quality?latitude=' + lat + '&longitude=' + lon + '&current=pm2_5&timezone=auto', { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) return null;
      const v = (await res.json()).current;
      return v && typeof v.pm2_5 === 'number' ? v.pm2_5 : null;
    } catch (e) { return null; }
  }

  const W = {
    ctx: initial(),
    listeners: [],
    onChange(fn) { W.listeners.push(fn); },
    emit() { W.listeners.forEach((fn) => fn(W.ctx)); },

    async refresh() {
      const st = store.get();
      if (st.weatherOverride && SIM[st.weatherOverride]) {
        W.ctx = make(Object.assign({ source: 'sim' }, SIM[st.weatherOverride]));
        W.emit();
        return;
      }
      W.ctx = fromCache() || fromTime();
      W.emit();
      if (W.ctx.source === 'live' && st.weatherCache && Date.now() - st.weatherCache.ts < 5 * 60 * 1000) return;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const { lat, lon } = st.location;
          const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon +
            '&current=temperature_2m,weather_code,is_day&timezone=auto';
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 8000);
          const res = await fetch(url, { signal: ctrl.signal });
          clearTimeout(t);
          if (!res.ok) throw new Error('weather ' + res.status);
          const c = (await res.json()).current;
          // the user may have switched to a simulated weather while we were waiting
          if (store.get().weatherOverride) return;
          const kind = kindFromCode(c.weather_code, c.temperature_2m);
          const pm = await airQuality(lat, lon);   // null when the air-quality service is unreachable
          if (store.get().weatherOverride) return;
          store.patch({ weatherCache: { ts: Date.now(), kind, night: c.is_day === 0, temp: c.temperature_2m, pm, lat, lon } });
          W.ctx = make({ kind, night: c.is_day === 0, temp: c.temperature_2m, pm, hour: nowHour(), source: 'live' });
          W.emit();
          return;
        } catch (e) {
          /* offline / blocked — keep the estimate; retry once */
          await new Promise((r) => setTimeout(r, 2500));
        }
      }
    },

    setOverride(key) {
      store.patch({ weatherOverride: key });
      return W.refresh();
    },

    useLocation() {
      return new Promise((resolve) => {
        if (!navigator.geolocation) return resolve(false);
        navigator.geolocation.getCurrentPosition(
          (p) => {
            store.patch({ location: { lat: p.coords.latitude, lon: p.coords.longitude, source: 'gps' }, weatherOverride: null });
            W.refresh().then(() => resolve(true));
          },
          () => resolve(false),
          { timeout: 8000, maximumAge: 600000 }
        );
      });
    },

    describe() {
      const c = W.ctx;
      const src = { live: 'จากสภาพอากาศจริง', sim: 'โหมดจำลอง', time: 'ประมาณจากเวลา' }[c.source];
      return c.label + (c.temp != null ? ' · ' + c.temp + '°C' : '') + (c.pm != null ? ' · PM2.5 ' + Math.round(c.pm) : '') + ' (' + src + ')';
    }
  };

  CM.weather = W;
})();
