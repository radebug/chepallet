// Run with: node tests/truck-pallets.cjs (no dependencies).
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const specs=html.slice(html.indexOf('const TRUCKS='),html.indexOf("let selectedCont="));
const features=html.slice(html.indexOf('// Mixed truck pallets:'),html.indexOf('// ══════ SHARED SCENE BUILDER'));
const margin=html.slice(html.indexOf('function getPracticalMargins('),html.indexOf('function calcPalletCapacityModes('));
const fields=new Map();const alerts=[];const document={getElementById(id){if(!fields.has(id))fields.set(id,{value:'',textContent:'',innerHTML:'',style:{}});return fields.get(id);},querySelectorAll(){return []}};
const ctx=vm.createContext({console,document,alert:m=>alerts.push(m),window:{addEventListener(){}},lastT:null});
vm.runInContext(specs+margin+features,ctx);
const evaluate=s=>vm.runInContext(s,ctx);
assert.equal(evaluate("solveMixedRows(TRUCKS.std,0,0,20,1344,500,500).extraE"),33);
assert.equal(evaluate("solveMixedRows(TRUCKS.std,0,0,20,1344,500,500).extraC"),26);
assert.equal(evaluate("solveMixedRows(TRUCKS.std,33,0,20,1344,500,500).extraE"),0);
assert.equal(evaluate("solveMixedRows(TRUCKS.std,34,0,20,1344,500,500)"),null);
assert.equal(evaluate("solveMixedRows(TRUCKS.std,0,0,20,3000,500,500)"),null);
assert.equal(evaluate("solveMixedRows(TRUCKS.van,9,0,20,1344,500,500)"),null);
assert.equal(evaluate("solveMixedRows(TRUCKS.std,0,0,20,1344,2000,2000).extraE"),12);
let verified=0;
for(const key of ['std','mega','van','ref'])for(let e=0;e<=12;e++)for(let c=0;c<=12;c++){
  evaluate(`globalThis.r=solveMixedRows(TRUCKS.${key},${e},${c},20,1344,500,600)`);
  if(!ctx.r)continue;
  for(const kind of ['base','euro','chep']){
    assert.equal(evaluate(`r.${kind}.every((it,i)=>palletFitsTruck(it,r.${kind}.filter((_,j)=>i!==j),TRUCKS.${key},20))`),true,`${key} ${e}/${c} ${kind}`);
    assert.equal(evaluate(`r.${kind}.reduce((n,it)=>n+it.kg,0)<=TRUCKS.${key}.maxP`),true);
    assert.equal(evaluate(`r.${kind}.filter(it=>it.pw*it.pl===960000).length`),e+(kind==='euro'?ctx.r.extraE:0));
    assert.equal(evaluate(`r.${kind}.filter(it=>it.pw*it.pl===1200000).length`),c+(kind==='chep'?ctx.r.extraC:0));
    verified++;
  }
}
// Exercise real insert/remove/rotate handlers with lightweight DOM fields.
evaluate('refreshMixedTruck=()=>{}');
for(const [id,value] of Object.entries({truckNewPL:1200,truckNewPW:800,tpT:144,tpCH:1200,tpKg:500,tMSide:20,tMTop:50}))document.getElementById(id).value=String(value);
evaluate("lastT={spec:TRUCKS.std,mode:'pallets',items:[]};addTruckPallet()");
assert.equal(ctx.lastT.items.length,1);
document.getElementById('truckNewPW').value='1000';evaluate('addTruckPallet()');assert.equal(ctx.lastT.items.length,2);
assert.equal(evaluate('lastT.items.every((it,i)=>palletFitsTruck(it,lastT.items.filter((_,j)=>i!==j),TRUCKS.std,20))'),true);
evaluate('removeTruckPallet()');assert.equal(ctx.lastT.items.length,1);
evaluate('truckSelectedIndex=0;rotateTruckPallet()');assert.equal(ctx.lastT.items[0].pw,800);
evaluate("lastT.items=solveMixedRows(TRUCKS.std,33,0,20,1344,500,500).base;addTruckPallet()");assert.equal(ctx.lastT.items.length,33);assert.match(alerts.at(-1),/Nessuno spazio/);
document.getElementById('tpKg').value='25000';evaluate('addTruckPallet()');assert.match(alerts.at(-1),/Portata/);
// Input validation and invalidation prevent applying stale calculations.
for(const [id,value] of Object.entries({remainingTruck:'std',remainingEuro:10,remainingChep:5,remainingEuroKg:500,remainingChepKg:500,remainingHeight:1344,remainingSide:20}))document.getElementById(id).value=String(value);
evaluate('calculateRemainingPallets()');assert.match(document.getElementById('remainingResult').innerHTML,/Puoi aggiungere/);
evaluate('invalidateRemaining()');assert.equal(evaluate('remainingCalculation'),null);
document.getElementById('remainingEuro').value='-1';evaluate('calculateRemainingPallets()');assert.match(document.getElementById('remainingResult').textContent,/quantità intere/);
document.getElementById('remainingEuro').value='1.5';evaluate('calculateRemainingPallets()');assert.match(document.getElementById('remainingResult').textContent,/quantità intere/);
new Function(html.slice(html.indexOf('<script>')+8,html.lastIndexOf('</script>')));
console.log(`Passed: ${verified} reconstructed layouts across four vehicles; insertion, rotation, removal, capacity, weight, height, invalid inputs and stale-result checks.`);
