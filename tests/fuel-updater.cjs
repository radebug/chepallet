const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const {update, retrieve, PublicationUnavailable} = require('../scripts/update-fuel.cjs');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const context = vm.createContext({});
vm.runInContext(html.slice(html.indexOf('const FUEL_REGION_NAMES='), html.indexOf('function fuelPriceFmt(')), context);
const regions = vm.runInContext('FUEL_REGION_NAMES', context);
const csv = date => `Aggiornamento ${date}\nRegione;Tipologia;Erogazione;Prezzo\n` + regions.flatMap(r => [`${r};Gasolio;SELF;1,650`, `${r};Benzina;SELF;1,700`]).join('\n');
const page = `<p>Aggiornamento 02-11-2026</p>` + regions.map(r => `<h2>${r}</h2><table><tr><td>Gasolio</td><td>SELF</td><td>1.650</td></tr><tr><td>Benzina</td><td>SELF</td><td>1.700</td></tr></table>`).join('');
const now = Date.parse('2026-11-02T12:00:00Z');
const unavailable = async () => { throw new PublicationUnavailable('test connection timeout'); };
(async () => {
  // A transport failure or stale/invalid CSV must still try the HTML publication.
  for (const first of [unavailable, async () => '<html>Error</html>', async () => csv('01-09-2026')]) {
    const result = await retrieve({now, warn() {}, get: url => url.includes('.csv') ? first() : Promise.resolve(page)});
    assert.equal(result.date, '02-11-2026');
  }
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'chepallet-fuel-'));
  try {
    const empty = await update({directory, now, get: unavailable});
    assert.equal(empty.state, 'unavailable');
    assert.equal(fs.existsSync(path.join(directory, 'fuel-prices.json')), false);
    const fresh = await update({directory, now, get: async () => csv('02-11-2026')});
    assert.equal(fresh.state, 'updated');
    const before = fs.readFileSync(path.join(directory, 'fuel-prices.json'), 'utf8');
    const offline = await update({directory, now, get: unavailable});
    assert.equal(offline.state, 'cached');
    assert.equal(fs.readFileSync(path.join(directory, 'fuel-prices.json'), 'utf8'), before);
    const regressed = await update({directory, now, get: async () => csv('01-11-2026')});
    assert.equal(regressed.state, 'cached');
    assert.equal(fs.readFileSync(path.join(directory, 'fuel-prices.json'), 'utf8'), before);
    await assert.rejects(update({directory, now, get: async () => { throw Error('programming bug'); }}), /programming bug/);
    const status = JSON.parse(fs.readFileSync(path.join(directory, 'fuel-status.json')));
    assert.equal(status.date, '02-11-2026');
    assert.equal(status.state, 'cached');
  } finally { fs.rmSync(directory, {recursive: true, force: true}); }
  console.log('Passed: updater format fallback, stale/invalid rejection, empty state, cached data preservation, date regression and real-error propagation.');
})().catch(error => { console.error(error); process.exitCode = 1; });
