// Run with: node tests/container-floor-mixed.cjs (no dependencies).
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const ctx=vm.createContext({});
for(const [start,end] of [['const CONTS=','let selectedCont='],['function splitFreeRect(','function packRectanglesMaxRects('],['function getPracticalMargins(','function getOperationalPalletsPerLayer('],['const MIXED_FLOOR_COLORS=','function setMixedFloorControls(']])vm.runInContext(html.slice(html.indexOf(start),html.indexOf(end)),ctx);
const run=code=>vm.runInContext(code,ctx);
const spec={name:'Test',iL:2400,iW:2400,iH:2400,doorH:2400,maxP:10000,tare:1000};
const row=(id,extra={})=>({id,name:id,length:400,width:300,height:250,kg:5,quantity:20,perPallet:24,...extra});
function pack(rows,vehicle=spec,options={}){ctx.rows=rows;ctx.vehicle=vehicle;ctx.options={side:0,top:0,rotate:true,whole:false,...options};return run('packMixedFloor(vehicle,rows,options)');}
let checked=0;
function verify(r){
  assert.equal(r.loaded,r.items.length);assert.equal(r.remaining,r.requested-r.loaded);
  assert.ok(r.weight<=ctx.vehicle.maxP+1e-7);
  assert.equal(r.weight,r.items.reduce((n,it)=>n+it.kg,0));
  assert.equal(r.volume,r.items.reduce((n,it)=>n+it.w*it.h*it.l,0));
  assert.equal(r.loaded,r.summary.reduce((n,s)=>n+s.loaded,0));
  for(const [i,it] of r.items.entries()){
    assert.ok(it.x>=r.originX&&it.z>=r.originZ&&it.y>=0);
    assert.ok(it.x+it.w<=r.originX+r.binL&&it.z+it.l<=r.originZ+r.binW&&it.y+it.h<=r.binH);
    assert.ok(it.y===0||r.items.some(p=>p.skuId===it.skuId&&p.x===it.x&&p.z===it.z&&p.w===it.w&&p.l===it.l&&p.y+p.h===it.y));
    for(let j=0;j<i;j++){const p=r.items[j];assert.ok(!(it.x<p.x+p.w&&it.x+it.w>p.x&&it.z<p.z+p.l&&it.z+it.l>p.z&&it.y<p.y+p.h&&it.y+it.h>p.y));}
  }
  for(const s of r.summary){assert.equal(s.loaded,r.items.filter(it=>it.skuId===s.id).length);assert.equal(s.pallets,s.loaded/s.perPallet);assert.equal(s.sourcePallets,Math.ceil(s.loaded/s.perPallet));if(ctx.options.whole)assert.equal(s.loaded%s.perPallet,0);}
  checked++;
}
let r=pack([row('A',{quantity:25}),row('B',{length:600,width:400,height:300,quantity:30,perPallet:15,kg:8})]);verify(r);
assert.equal(r.loaded,55);assert.equal(r.weight,365);assert.equal(r.sourcePallets,4);
assert.equal(r.summary[0].pallets,25/24);assert.notEqual(r.summary[0].color,r.summary[1].color);
r=pack([row('A',{quantity:25}),row('B',{quantity:10,perPallet:12})],spec,{whole:true});verify(r);assert.equal(r.loaded,24);assert.equal(r.remaining,11);
r=pack([row('A',{quantity:50})],{...spec,maxP:63});verify(r);assert.equal(r.loaded,12);assert.equal(r.weight,60);
// An incomplete source pallet must be rolled back, releasing capacity for the next SKU.
r=pack([row('A',{length:800,width:600,quantity:48,perPallet:24}),row('B',{quantity:10,perPallet:10,kg:1})],{...spec,maxP:63},{whole:true});verify(r);assert.equal(r.summary[0].loaded,0);assert.equal(r.summary[1].loaded,10);
r=pack([row('oversize',{height:2500}),row('fits')]);verify(r);assert.equal(r.summary[0].loaded,0);assert.equal(r.summary[1].loaded,20);
r=pack([row('A')],spec,{side:1300});verify(r);assert.equal(r.loaded,0);
r=pack([row('A')],{...spec,doorH:200});verify(r);assert.equal(r.loaded,0);
r=pack([row('A',{length:1600,width:400,height:100,quantity:1})],{...spec,iL:800,iW:2000},{rotate:false});assert.equal(r.loaded,0);
r=pack([row('A',{length:1600,width:400,height:100,quantity:1})],{...spec,iL:800,iW:2000},{rotate:true});verify(r);assert.equal(r.loaded,1);
r=pack([row('A',{quantity:0})]);verify(r);assert.equal(r.loaded,0);
for(const key of ['40dry','40ref','40hc','20dry'])for(let seed=1;seed<=12;seed++){
  const vehicle=JSON.parse(run(`JSON.stringify(CONTS['${key}'])`));
  r=pack([row('A',{length:300+seed*9,height:180+seed*3,quantity:20+seed,kg:80}),row('B',{width:230+seed*4,height:240,quantity:40+seed,perPallet:12,kg:70}),row('C',{length:600,width:400,height:300,quantity:seed,perPallet:10,kg:50})],vehicle,{side:20,top:50,whole:seed%2===0});verify(r);
}
for(const bad of [{quantity:-1},{quantity:1.5},{quantity:NaN},{quantity:Infinity},{length:0},{height:-1},{kg:-1},{kg:NaN},{perPallet:0},{perPallet:1.5}])assert.throws(()=>pack([row('bad',bad)]));
assert.throws(()=>pack([]));assert.throws(()=>pack([row('A')],{...spec,maxP:0}));
assert.throws(()=>pack([row('A')],spec,{side:-1}));
assert.equal(run(`escapeFloorText('<img onerror="x">')`),'&lt;img onerror=&quot;x&quot;&gt;');
r=pack([row('tiny',{length:10,width:10,height:1,kg:0,quantity:1000000})]);assert.equal(r.loaded,20000);assert.equal(r.limited,true);assert.equal(r.remaining,980000);
r=pack([row('tiny',{length:10,width:10,height:1,kg:0,quantity:1000000,perPallet:7000})],spec,{whole:true});assert.equal(r.loaded,14000);assert.equal(r.limited,true);assert.equal(r.remaining,986000);
new Function(html.slice(html.indexOf('<script>')+8,html.lastIndexOf('</script>')));
console.log(`Passed: ${checked} mixed loads; quantities, per-SKU pallet equivalents, payload, height, margins, rotations, support, non-overlap, whole-pallet rollback, validation and explicit simulation limit.`);
