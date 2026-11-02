// Download the official publication outside the browser (no public CORS proxy).
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const exec = promisify(execFile);
const PAGE = 'https://www.mimit.gov.it/it/prezzo-medio-carburanti/regioni';
const CSV = 'https://www.mimit.gov.it/images/stories/carburanti/MediaRegionaleStradale.csv';
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const context = vm.createContext({});
vm.runInContext(html.slice(html.indexOf('const FUEL_REGION_NAMES='), html.indexOf('function fuelPriceFmt(')), context);
class PublicationUnavailable extends Error {}

// curl honours proxy configuration, uses IPv4 and retries transient connection,
// TLS and HTTP errors. Node fetch previously stopped at its first connect timeout.
async function download(url) {
  try {
    const {stdout} = await exec('curl', [
      '--ipv4', '--location', '--fail', '--silent', '--show-error',
      '--proto', '=https', '--proto-redir', '=https',
      '--connect-timeout', '15', '--max-time', '45',
      '--retry', '2', '--retry-all-errors', '--retry-delay', '3', '--retry-max-time', '100',
      '--user-agent', 'chepallet-fuel-updater/1.0 (https://github.com/radebug/chepallet)',
      '--header', 'Cache-Control: no-cache', url
    ], {encoding: 'utf8', maxBuffer: 5 * 1024 * 1024, timeout: 160000});
    return stdout;
  } catch (error) {
    throw new PublicationUnavailable(`${url}: ${String(error.stderr || error.message).trim()}`);
  }
}
function publication(text, source, now) {
  const parsed = source.includes('.csv') ? context.parseFuelCSV(text) : context.parseFuelHTML(text);
  if (!parsed) throw new PublicationUnavailable(`${source}: incomplete or invalid MIMIT publication`);
  const age = (now - Date.parse(context.fuelDateISO(parsed.date) + 'T00:00:00Z')) / 86400000;
  if (age > 3 || age < -1) throw new PublicationUnavailable(`${source}: publication outside freshness window (${parsed.date})`);
  return {...parsed, source};
}
async function retrieve({get = download, now = Date.now(), previous = null, warn = console.warn} = {}) {
  const errors = [];
  // The small official CSV is tried first; HTML is an independent format fallback.
  const queue = [CSV, PAGE];
  const seen = new Set();
  for (const source of queue) {
    if (seen.has(source)) continue;
    seen.add(source);
    try {
      const text = await get(source);
      if (source === PAGE) {
        for (const match of text.matchAll(/href=["']([^"']+\.csv(?:\?[^"']*)?)["']/gi)) {
          const url = new URL(match[1].replace(/&amp;/g, '&'), PAGE);
          if (url.hostname === 'www.mimit.gov.it' && url.protocol === 'https:') queue.push(url.href);
        }
      }
      const result = publication(text, source, now);
      if (previous && context.fuelDateISO(previous.date) > context.fuelDateISO(result.date)) {
        throw new PublicationUnavailable(`MIMIT date regressed (${result.date}); retained ${previous.date}`);
      }
      return result;
    } catch (error) {
      if (!(error instanceof PublicationUnavailable)) throw error;
      errors.push(error.message);
      warn(error.message);
    }
  }
  throw new PublicationUnavailable(errors.join('\n'));
}
async function update({get, now = Date.now(), directory = path.join(root, 'data')} = {}) {
  const target = path.join(directory, 'fuel-prices.json');
  const previous = fs.existsSync(target) ? JSON.parse(fs.readFileSync(target, 'utf8')) : null;
  if (previous && !context.validateFuelSnapshot(previous)) throw Error('Stored fuel snapshot is invalid');
  let snapshot, status;
  try {
    snapshot = await retrieve({get, now, previous});
    status = {state: 'updated', date: snapshot.date, source: snapshot.source};
  } catch (error) {
    if (!(error instanceof PublicationUnavailable)) throw error;
    status = {state: previous ? 'cached' : 'unavailable', date: previous?.date || null, error: error.message};
    console.warn(`::warning::MIMIT temporarily unavailable; ${previous ? 'retaining verified snapshot dated ' + previous.date : 'no verified prices available'}. See job summary.`);
  }
  fs.mkdirSync(directory, {recursive: true});
  if (snapshot) fs.writeFileSync(target, JSON.stringify(snapshot, null, 2) + '\n');
  const report = {...status, checkedAt: new Date(now).toISOString()};
  fs.writeFileSync(path.join(directory, 'fuel-status.json'), JSON.stringify(report, null, 2) + '\n');
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `state=${status.state}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const message = status.state === 'updated' ? `Validated official MIMIT prices dated **${status.date}**.` :
      `Official MIMIT publication unavailable. ${previous ? 'Retained verified prices dated **' + previous.date + '**.' : '**No verified prices available.**'} No prices or dates were fabricated. The next scheduled run will retry.`;
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## MIMIT fuel prices: ${status.state}\n\n${message}\n\n${status.error ? 'Diagnostics:\n\n```text\n' + status.error + '\n```\n' : ''}`);
  }
  console.log(JSON.stringify(report));
  return report;
}
if (require.main === module) update().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = {update, retrieve, publication, download, PublicationUnavailable};
