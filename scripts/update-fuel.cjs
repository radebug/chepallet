// Fetch outside the browser so the published snapshot needs no CORS proxy.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const context=vm.createContext({});
vm.runInContext(html.slice(html.indexOf('const FUEL_REGION_NAMES='),html.indexOf('function fuelPriceFmt(')),context);
async function update(){
  const page='https://www.mimit.gov.it/it/prezzo-medio-carburanti/regioni';
  let parsed=null,source=page;
  const get=async url=>{
    const response=await fetch(url,{signal:AbortSignal.timeout(30000),headers:{'Cache-Control':'no-cache'}});
    if(!response.ok)throw Error(`MIMIT HTTP ${response.status}`);
    return response.text();
  };
  try{
    const text=await get(page);
    parsed=context.parseFuelHTML(text);
    // Discover the current official CSV link when the page layout changes.
    if(!parsed){
      const link=[...text.matchAll(/href=["']([^"']+\.csv(?:\?[^"']*)?)["']/gi)].map(m=>new URL(m[1].replace(/&amp;/g,'&'),page)).find(url=>url.hostname==='www.mimit.gov.it'&&url.protocol==='https:');
      if(link){source=link.href;parsed=context.parseFuelCSV(await get(source));}
    }
  }catch(error){console.warn('Official page unavailable:',error.message);}
  if(!parsed){
    source='https://www.mimit.gov.it/images/stories/carburanti/MediaRegionaleStradale.csv';
    parsed=context.parseFuelCSV(await get(source));
  }
  if(!parsed)throw Error('Invalid or incomplete MIMIT publication; existing snapshot retained');
  const target=path.join(__dirname,'../data/fuel-prices.json');
  if(fs.existsSync(target)){
    const previous=JSON.parse(fs.readFileSync(target,'utf8'));
    if(context.fuelDateISO(previous.date)>context.fuelDateISO(parsed.date))throw Error('MIMIT date regressed; existing snapshot retained');
  }
  const age=(Date.now()-Date.parse(context.fuelDateISO(parsed.date)+'T00:00:00Z'))/86400000;
  if(age>3||age< -1)throw Error(`MIMIT publication date outside freshness window: ${parsed.date}`);
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target,JSON.stringify({...parsed,source},null,2)+'\n');
  console.log(`Saved MIMIT data dated ${parsed.date}, ${parsed.data.length} regions`);
}
if(require.main===module)update().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={update};
