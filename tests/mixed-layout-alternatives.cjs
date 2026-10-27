const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const fields=new Map(),alerts=[];
const ctx=vm.createContext({console,alert:s=>alerts.push(s),document:{getElementById(id){if(!fields.has(id))fields.set(id,{value:'20',textContent:'',style:{}});return fields.get(id);}},lastT:null,lastC:null,GRP_C:{},GRP_T:{}});
const run=s=>vm.runInContext(s,ctx);
for(const [a,b] of [['const CONTS=','let selectedCont='],['function getPracticalMargins(','function calcPalletCapacityModes('],['function truckBounds(','function renderTruckPlan('],['// Optimise the inventory','function swTab(']])run(html.slice(html.indexOf(a),html.indexOf(b)));
run(`globalThis.containerPlanState={};globalThis.truckSelectedIndex=-1;globalThis.refreshes=0;globalThis.scenes=0;
function refreshMixedTruck(){refreshes++;}function buildBoxScene(){scenes++;}function renderRealLoadSimulation(){};
function renderContainerPlan(spec,items){containerPlanState.items=items;}function syncPlanTo3D(){lastC.items=containerPlanState.items.map(it=>({...it}));}`);
const create=(n,l,w,kg=500)=>Array.from({length:n},(_,id)=>({id:'p'+id,x:20+id*l,z:20,y:0,pw:l,pl:w,pt:144,ch:900,kg:kg+id,type:'pallet',manual:id%2===0,sku:'SKU-'+id}));
const signature=items=>items.map(({x,z,rot,pw,pl,...it})=>({...it,dimensions:[pw,pl].sort((a,b)=>a-b)}));
let count=0;
for(const specName of ["TRUCKS.std","TRUCKS.mega","TRUCKS.van","TRUCKS.ref","CONTS['40dry']","CONTS['40ref']"]){
  for(let n=1;n<=10;n++){
    const items=create(n,800,1200);
    items.push({id:'chep',x:20,z:1220,y:0,pw:1200,pl:1000,pt:144,ch:1100,kg:650,type:'pallet',sku:'CHEP'});
    items.push({id:'custom',x:1220,z:1220,y:0,pw:700,pl:650,pt:150,ch:1000,kg:220,type:'pallet',sku:'CUSTOM'});
    ctx.input=items;
    for(let variant=0;variant<3;variant++){
      const output=run(`optimisePalletInventory(input,${specName},20,50,${variant})`);
      if(!output)continue;
      assert.deepEqual(signature(JSON.parse(JSON.stringify(output))),signature(items));
      ctx.output=output;
      assert.equal(run(`output.every((it,i)=>palletFitsTruck(it,output.filter((_,j)=>i!==j),${specName},20,50))`),true);
      count++;
    }
  }
}
// Stacks keep supports, quantities, y positions and per-pallet data.
ctx.input=create(3,1200,800);ctx.input.push({...ctx.input[0],id:'stacked',y:1044});
let output=run('optimisePalletInventory(input,TRUCKS.std,20,50)');assert.ok(output);assert.deepEqual(signature(JSON.parse(JSON.stringify(output))),signature(ctx.input));assert.equal(output[0].x,output[3].x);assert.equal(output[0].z,output[3].z);
// Exercise actual buttons, repeatedly, with changed main inputs and additional formats.
ctx.input=create(5,800,1200);ctx.input.push({id:'custom',x:4500,z:20,y:0,pw:700,pl:650,pt:150,ch:800,kg:300,type:'pallet',sku:'CUSTOM'});
run('containerPlanState={spec:CONTS["40dry"],mode:"pallets",items:input,originalItems:input};lastC={items:input};lastT={spec:TRUCKS.std,mode:"pallets",items:input};');
for(const id of ['cpL','cpW','tpL','tpW'])ctx.document.getElementById(id).value='9999';
for(let i=0;i<6;i++){
  run('cycleContainerLayout();cycleTruckLayout();');
  assert.deepEqual(signature(JSON.parse(JSON.stringify(ctx.lastC.items))),signature(ctx.input));
  assert.deepEqual(signature(JSON.parse(JSON.stringify(ctx.lastT.items))),signature(ctx.input));
}
assert.ok(ctx.scenes>=6);assert.equal(ctx.refreshes,6);
// An infeasible load is never partially applied, cleared or replaced.
run('containerPlanState.items=[{...input[0],pw:99999}];lastT.items=[{...input[0],kg:99999}];');
const before=run('JSON.stringify([containerPlanState.items,lastT.items])');run('cycleContainerLayout();cycleTruckLayout();');assert.equal(run('JSON.stringify([containerPlanState.items,lastT.items])'),before);assert.equal(alerts.length,2);
console.log(`Passed: ${count} complete mixed layouts; inventory metadata, custom formats, weights, stacks, actual button handlers, 3D sync and atomic failure.`);
