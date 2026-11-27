const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');
const { join } = require('node:path');

test('a late air-quality response cannot replace weather for the new location', async () => {
  const state = { location: { lat: 13, lon: 100 } };
  const CM = { store: { get: () => state, patch: (update) => Object.assign(state, update) } };
  let finishOldAir, markAirStarted;
  const oldAirStarted = new Promise((resolve) => { markAirStarted = resolve; });
  const reply = (current) => ({ ok: true, json: async () => ({ current }) });
  const fetch = async (url) => {
    const old = new URL(url).searchParams.get('latitude') === '13';
    if (url.includes('/forecast')) {
      return reply({ temperature_2m: old ? 32 : 24, weather_code: 0, is_day: 1 });
    }
    if (!old) return reply({ pm2_5: 9 });
    markAirStarted();
    return new Promise((resolve) => { finishOldAir = () => resolve(reply({ pm2_5: 45 })); });
  };
  const source = readFileSync(join(__dirname, '../js/weather.js'), 'utf8');
  runInNewContext(source, { window: { CM }, CM, fetch, AbortController, setTimeout, clearTimeout });

  const first = CM.weather.refresh();
  await oldAirStarted;
  state.location = { lat: 18, lon: 99 };
  await CM.weather.refresh();
  finishOldAir();
  await first;

  assert.equal(CM.weather.ctx.temp, 24);
  assert.equal(CM.weather.ctx.pm, 9);
  assert.equal(state.weatherCache.lat, 18);
});
