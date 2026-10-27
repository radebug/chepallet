const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const fields=new Map(),cache=new Map();let fetchCount=0,requests=[],interval;
const document={visibilityState:'visible',addEventListener(){},getElementById(id){if(!fields.has(id))fields.set(id,{value:'',innerHTML:'',textContent:'',style:{}});return fields.get(id);}};
const context=vm.createContext({console,Date,Intl,AbortController,setTimeout,clearTimeout,setInterval:fn=>{interval=fn},document,localStorage:{getItem:k=>cache.get(k),setItem:(k,v)=>cache.set(k,v)},fetch:async url=>{fetchCount++;return requests.shift()(url);}});
const run=s=>vm.runInContext(s,context);
run(html.slice(html.indexOf('let FUEL_DATA ='),html.indexOf('function fuelPriceFmt(')));
run(html.slice(html.indexOf('async function fetchWithTimeout('),html.indexOf('// Init\ntoggleOvhField();')));
run('function renderFuelCards(){}');
const regions=run('FUEL_REGION_NAMES.slice()');
const fixture=(date='27-10-2026',price='1,650')=>'\uFEFFAggiornamento '+date+'\r\nRegione;Tipologia;Erogazione;Prezzo\r\n'+regions.flatMap(name=>[`${name};Gasolio;SELF;${price}`,`${name};Benzina;SELF;1,700`,`${name};Gasolio;SERVITO;9,000`,`${name};GPL;SERVITO;0,800`]).join('\r\n');
let parsed=context.parseFuelCSV(fixture());assert.ok(parsed);assert.equal(parsed.data.length,21);assert.equal(parsed.data[0].fuels.Gasolio.price,1.65);
assert.equal(context.parseFuelCSV(fixture('31-02-2026')),null);assert.equal(context.parseFuelCSV(fixture().replaceAll(';SELF;',';BOGUS;')),null);assert.equal(context.parseFuelCSV('<html>Error</html>'),null);
assert.equal(context.parseFuelCSV(fixture().split('\r\n').slice(0,20).join('\r\n')),null);
const page='<p>Aggiornamento 27-10-2026</p>'+regions.map(name=>`<h2>${name}</h2><table><tr><th>TIPOLOGIA</th><th>EROGAZIONE</th><th>PREZZO MEDIO</th></tr><tr><td>Gasolio</td><td>SELF</td><td>1.650</td></tr><tr><td>Benzina</td><td>SELF</td><td>1.700</td></tr></table>`).join('');
assert.ok(context.parseFuelHTML(page));assert.equal(context.parseFuelHTML('<html>error</html>'),null);
assert.equal(context.fuelPublicationStatus('09-03-2026'),'non aggiornati a oggi');
const response=value=>async()=>({ok:true,text:async()=>value});
const failed=async()=>{throw Error('Offline')};
(async()=>{
  // Snapshot is newer than direct CSV; concurrent callers share one request pair.
  requests=[response(JSON.stringify(parsed)),response(fixture('26-10-2026'))];
  await Promise.all([context.loadFuelData(true),context.loadFuelData(true)]);
  assert.equal(fetchCount,2);assert.equal(run('FUEL_SOURCE'),'snapshot');assert.match(document.getElementById('fuelUpdateLabel').textContent,/27-10-2026/);
  // Offline refresh retains latest verified copy, never the removed March fallback.
  requests=[failed,failed];await context.loadFuelData(true);assert.equal(run('FUEL_SOURCE'),'cache');assert.match(document.getElementById('fuelUpdateLabel').textContent,/copia salvata/);assert.equal(document.getElementById('fuelRefreshBtn').disabled,false);
  run('FUEL_LAST_VALID=null;FUEL_LOADED=false;FUEL_DATA=[];');cache.clear();requests=[failed,failed];await context.loadFuelData(true);assert.match(document.getElementById('fuelUpdateLabel').textContent,/non disponibili/);assert.equal(run('FUEL_DATA.length'),0);assert.equal(document.getElementById('fuelRefreshBtn').disabled,false);
  assert.ok(interval);console.log('Passed: MIMIT CSV/HTML validation, Italian decimals, dates, incomplete responses, latest-source selection, deduplicated refresh, offline cache and empty state.');
})().catch(error=>{console.error(error);process.exitCode=1;});
