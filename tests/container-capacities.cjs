// Run with: node tests/container-capacities.cjs
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');const ctx=vm.createContext({});
for(const [start,end] of [['const CONTS=','let selectedCont='],['function buildStripedLayout(','function buildVolumeBarHTML('],['function splitFreeRect(','function buildPalletLayout('],['function getPracticalMargins(','function buildPalletContainerPlans(']])vm.runInContext(html.slice(html.indexOf(start),html.indexOf(end)),ctx);
const run=code=>vm.runInContext(code,ctx);
for(const [key,w,expected] of [['40dry',800,24],['40dry',1000,21],['40ref',800,24],['40ref',1000,20]]){
  for(const [l,width] of [[1200,w],[w,1200]]){
    run(`globalThis.caps=calcPalletCapacityModes(CONTS['${key}'],${l},${width},144,1200,false,20,50)`);
    assert.equal(ctx.caps.operational.perLayer,expected);
    assert.equal(run(`getContainerPlanningCapacity(CONTS['${key}'],caps,500)`),expected);
    assert.match(run("buildCapacityModeHTML('pallet',caps)"),/Capacità operativa di riferimento/);
    assert.match(run("buildCapacityModeHTML('pallet',caps)"),/Capacità geometrica del layout/);
  }
  run(`globalThis.caps=calcPalletCapacityModes(CONTS['${key}'],1200,${w},144,900,true,20,50)`);
  assert.equal(ctx.caps.operational.total,expected*2);
  assert.equal(run(`getContainerPlanningCapacity(CONTS['${key}'],caps,2000)`),Math.floor(run(`CONTS['${key}'].maxP`)/2000));
  run(`globalThis.caps=calcPalletCapacityModes(CONTS['${key}'],1200,${w},144,3000,false,20,50)`);
  assert.equal(ctx.caps.operational.total,0);assert.equal(run(`getContainerPlanningCapacity(CONTS['${key}'],caps,500)`),0);
}
for(const key of ['20dry','40hc'])assert.equal(run(`calcPalletCapacityModes(CONTS['${key}'],1200,800,144,1200,false,20,50).operational`),null);
assert.equal(run("calcPalletCapacityModes(TRUCKS.std,1200,800,144,1200,false,20,50).practical.perLayer"),33);
assert.equal(run("getOperationalPalletsPerLayer(CONTS['40dry'],1219,1016)"),null);
assert.equal(run("getOperationalPalletsPerLayer({name:'Custom'},1200,800)"),null);
// Check that generated physical layouts continue to respect the original dimensions and losses.
for(const key of ['40dry','40ref'])for(const w of [800,1000]){
 run(`globalThis.spec=CONTS['${key}'];globalThis.layout=buildVehiclePalletLayout(spec,1200,${w},40)`);
 assert.equal(run('layout.positions.every((p,i)=>p.x>=layout.startX && p.z>=layout.startZ && p.x+p.pw<=layout.startX+layout.binL && p.z+p.pl<=layout.startZ+layout.binW && !layout.positions.some((q,j)=>i!==j && p.x<q.x+q.pw && p.x+p.pw>q.x && p.z<q.z+q.pl && p.z+p.pl>q.z))'),true);
}
console.log('Passed: operational capacities for Dry/Reefer in both orientations, stacking, height, payload, unaffected formats/trucks and physical layout validity.');
