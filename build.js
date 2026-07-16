import { cpSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import { resolve } from 'path';

const GERAINA = existsSync('gerainaos/frontend') ? resolve('gerainaos/frontend') : resolve('gerainaos');
const DAPUROS = existsSync('dapuros/frontend') ? resolve('dapuros/frontend') : resolve('dapuros');
const PUBLIC_DIR = resolve('public');
const OUT = resolve('dist');

console.log('=== BUILD DIAGNOSTICS ===');
console.log('GERAINA path resolved:', GERAINA);
if (existsSync(GERAINA)) {
  console.log('GERAINA contents:', readdirSync(GERAINA));
} else {
  console.error(`CRITICAL ERROR: GerainaOS repository path does not exist at ${GERAINA}`);
  process.exit(1);
}

console.log('DAPUROS path resolved:', DAPUROS);
if (existsSync(DAPUROS)) {
  console.log('DAPUROS contents:', readdirSync(DAPUROS));
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(`${OUT}/geraina`, { recursive: true });
mkdirSync(`${OUT}/dapuros`, { recursive: true });

// Detect build folder for GerainaOS
let gerainaBuildDir = null;
if (existsSync(`${GERAINA}/dist`)) gerainaBuildDir = `${GERAINA}/dist`;
else if (existsSync(`${GERAINA}/build`)) gerainaBuildDir = `${GERAINA}/build`;
else if (existsSync(`${GERAINA}/out`)) gerainaBuildDir = `${GERAINA}/out`;

console.log(`GERAINA detected build directory: ${gerainaBuildDir}`);
if (gerainaBuildDir && existsSync(gerainaBuildDir)) {
  console.log(`Contents of ${gerainaBuildDir}:`, readdirSync(gerainaBuildDir));
  cpSync(gerainaBuildDir, `${OUT}/geraina`, { recursive: true });
  
  // Post-process Geraina index.html
  const gerainaIndex = resolve(`${OUT}/geraina/index.html`);
  if (existsSync(gerainaIndex)) {
    let html = readFileSync(gerainaIndex, 'utf8');
    html = html.replace(/src="\/static\//g, 'src="/geraina/static/');
    html = html.replace(/href="\/static\//g, 'href="/geraina/static/');
    html = html.replace(/src="\/assets\//g, 'src="/geraina/assets/');
    html = html.replace(/href="\/assets\//g, 'href="/geraina/assets/');
    writeFileSync(gerainaIndex, html);
    console.log('Successfully rewrote asset paths in Geraina index.html!');
  } else {
    console.error('CRITICAL ERROR: Geraina index.html NOT found in build dir!');
    process.exit(1);
  }
} else {
  console.error(`CRITICAL ERROR: No build/dist/out directory found in GerainaOS at ${GERAINA}`);
  process.exit(1);
}

// Detect build folder for DapurOS
const dapurosBuildDir = existsSync(`${DAPUROS}/dist`) ? `${DAPUROS}/dist` : `${DAPUROS}/build`;
console.log(`Copying DapurOS build from ${dapurosBuildDir}...`);
if (existsSync(dapurosBuildDir)) {
  cpSync(dapurosBuildDir, `${OUT}/dapuros`, { recursive: true });

  // Post-process DapurOS index.html
  const dapurosIndex = resolve(`${OUT}/dapuros/index.html`);
  if (existsSync(dapurosIndex)) {
    let html = readFileSync(dapurosIndex, 'utf8');
    html = html.replace(/src="\/static\//g, 'src="/dapuros/static/');
    html = html.replace(/href="\/static\//g, 'href="/dapuros/static/');
    html = html.replace(/src="\/assets\//g, 'src="/dapuros/assets/');
    html = html.replace(/href="\/assets\//g, 'href="/dapuros/assets/');
    writeFileSync(dapurosIndex, html);
    console.log('Successfully rewrote asset paths in DapurOS index.html!');
  } else {
    console.error('CRITICAL ERROR: DapurOS index.html NOT found in build dir!');
    process.exit(1);
  }
} else {
  console.error(`Neither build nor dist directory found in DapurOS at ${DAPUROS}`);
  process.exit(1);
}

if (existsSync(PUBLIC_DIR)) {
  console.log('Copying DagangOS portal public/ (index.html + shared favicon/manifest icons)...');
  cpSync(PUBLIC_DIR, OUT, { recursive: true });
}

console.log('=== BUILD COMPLETE === Output in ./dist');
