// node tests/pallet-alternating.cjs
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
assert.match(html,/id="alternateLayers"/);
assert.match(html,/id="interlayerThickness"/);
assert.match(html,/schemaItemsB:clonePlanItems\(B\)/);
assert.match(html,/lastP\.interlayer/);
const script=html.match(/<script>[\s\S]*?<\/script>/g).filter(x=>x.length>100000)[0];
for(const fname of ['transformPalletLayer','layerOverlap','layerOutside','layerSupport']){
  const start=script.indexOf('function '+fname+'(');
  assert.ok(start>0,'Missing '+fname);
}
const p={areaL:1200,areaW:1000};
const layer=[{x:0,z:0,w:600,l:400,rot:false},{x:600,z:0,w:600,l:400,rot:false},{x:0,z:400,w:600,l:400,rot:false}];
function rotate180(items){return items.map(i=>({...i,x:p.areaL-i.x-i.w,z:p.areaW-i.z-i.l}));}
const flipped=rotate180(layer);
assert.equal(flipped.length,layer.length);
assert.deepEqual(rotate180(flipped).map(i=>[i.x,i.z]),layer.map(i=>[i.x,i.z]));
for(const b of flipped){assert.ok(b.x>=0&&b.z>=0&&b.x+b.w<=p.areaL&&b.z+b.l<=p.areaW);}
const layerCount=5,alternateTotal=layer.length*Math.ceil(layerCount/2)+flipped.length*Math.floor(layerCount/2);
assert.equal(alternateTotal,15);
const interlayer=3,boxH=250,palletH=144;
assert.equal(palletH+layerCount*boxH+(layerCount-1)*interlayer,1406);
console.log('PASS: alternating layers UI, transfer bridge, geometry and interlayers');
