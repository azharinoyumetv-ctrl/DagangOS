import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
const require = createRequire(import.meta.url);
const { chromium } = require(join(root, 'DapurOS/frontend/node_modules/playwright'));
const capture = join(root, 'tmp/dapuros-showcase-capture');
const work = join(root, 'tmp/dapuros-showcase-render');
const media = join(root, 'public/product-media/dapuros');
const screenshots = join(media, 'screens');
const videos = join(media, 'videos');
for (const directory of [work, screenshots, videos]) mkdirSync(directory, { recursive: true });
const evidence = JSON.parse(readFileSync(join(capture, 'capture.json'), 'utf8'));
assert.equal(evidence.status, 'passed');
assert.equal(evidence.profiles.length, 3);

function ffmpeg(args, cwd = work) {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { cwd, windowsHide: true, encoding: 'utf8' });
  if (result.status !== 0) throw Error(result.stderr || result.error?.message || 'FFmpeg failed');
}
const slides = [
  { featureId: 'qr', file: 'qr', headline: 'Tamu pilih menu dari meja', description: 'Pindai QR meja untuk membuka menu di ponsel. Tamu memilih hidangan dan bisa menambahkan catatan.', alt: 'Menu DapurOS untuk Meja 03 dengan nama hidangan, harga, dan tombol Tambah' },
  { featureId: 'kasir', file: 'kasir', headline: 'Kasir langsung melihat tagihan meja', description: 'Setelah staf membuka meja, pesanan QR masuk ke tagihan. Staf bisa memeriksa pesanan tanpa mengetik ulang.', alt: 'Tagihan Meja 03 di kasir DapurOS dengan Nasi Ayam Bakar dan catatan Sambal dipisah' },
  { featureId: 'dapur', file: 'dapur', headline: 'Dapur tahu pesanan yang sedang dimasak', description: 'Tiket berisi nomor meja, hidangan, dan catatan. Tim dapur bisa menandai pesanan siap disajikan.', alt: 'Kitchen Display System DapurOS dengan tiket Meja 03 berstatus Cooking dan tombol Tandai Siap' },
  { featureId: 'reservasi', file: 'reservasi-form', headline: 'Catat reservasi atas nama tamu', description: 'Staf memilih meja kosong, mengisi nama dan jumlah tamu, lalu menyimpan reservasi.', alt: 'Formulir reservasi Business untuk Meja 08 dengan nama Rombongan Senja dan tiga tamu' },
  { featureId: 'reservasi', variant: 'held', file: 'reservasi-held', headline: 'Meja ditahan untuk rombongan', description: 'Nama dan jumlah tamu terlihat pada peta meja. Saat tamu datang, staf memilih Tempatkan tamu & buka meja.', alt: 'Meja 08 berstatus direservasi dengan nama Rombongan Senja dan tombol Tempatkan tamu & buka meja' },
  { featureId: 'reservasi', variant: 'seated', file: 'reservasi-seated', headline: 'Tamu duduk, meja siap menerima pesanan', description: 'Setelah staf menempatkan tamu, sesi meja terbuka dengan nama rombongan. Staf dapat mulai mencatat pesanan.', alt: 'Sesi Meja 08 terbuka atas nama Rombongan Senja setelah tamu ditempatkan' },
];
const names = { phone: 'Ponsel', tablet: 'Tablet', desktop: 'Desktop' };
const manifest = [];
for (const { device, width, height } of evidence.profiles) {
  for (const { file, ...slide } of slides) {
    const filename = `${device}-${file}.webp`;
    ffmpeg(['-i', join(capture, `${device}-${file}.png`), '-frames:v', '1', '-c:v', 'libwebp', '-lossless', '1', join(screenshots, filename)]);
    manifest.push({ ...slide, device, deviceLabel: names[device], screenWidth: width, screenHeight: height,
      screenSrc: `/product-media/dapuros/screens/${filename}`, ...(slide.featureId === 'reservasi' ? { badge: 'Paket Business' } : {}) });
  }
}
writeFileSync(join(root, 'public/product-media/dapuros-showcase.json'), JSON.stringify(manifest, null, 2) + '\n');

const chapters = [
  { id: 'qr', duration: 4, label: 'QR ORDERING', title: 'Dari QR ke dapur', caption: 'Tamu pindai kode QR di meja untuk membuka menu.' },
  { id: 'staff-open', duration: 4, label: 'SESI MEJA', title: 'Staf buka meja', caption: 'Staf membuka meja agar tamu dapat mengirim pesanan.' },
  { id: 'guest-send', duration: 6, label: 'PESANAN TAMU', title: 'Tamu pesan sendiri', caption: 'Tamu memilih hidangan dan menambahkan catatan tanpa perlu diketik ulang.' },
  { id: 'kasir', duration: 4, label: 'TAGIHAN MEJA', title: 'Kasir cek pesanan', caption: 'Kasir langsung melihat rincian pesanan di tagihan meja.' },
  { id: 'kitchen-ready', duration: 7, label: 'KITCHEN DISPLAY SYSTEM', title: 'Dapur pantau antrean', caption: 'Tim dapur memantau antrean dan menandai pesanan siap disajikan.', crop: 'crop=412:590:0:0' },
];
const phoneScreen = { x: 158, y: 219, width: 404, height: 898 };
const kitchenScreen = { x: 83, y: 263, width: 554, height: 794 };
const image = file => `data:image/png;base64,${readFileSync(file).toString('base64')}`;
const logo = image(join(root, 'public/assets/brand/dapuros-icon.png'));
const qrCard = image(join(capture, 'phone-qr-card.png'));
const menu = image(join(capture, 'phone-qr.png'));
const styles = `
*{box-sizing:border-box}html,body{margin:0;width:720px;height:1280px;overflow:hidden}body{font-family:"Segoe UI",Arial,sans-serif;color:#fff5eb;background:radial-gradient(ellipse at 90% 23%,#6b321c,transparent 52%),radial-gradient(ellipse at 14% 80%,#4f2619,transparent 60%),#211512}
.grid{position:absolute;inset:0;background-image:linear-gradient(#ffc8a20b 1px,transparent 1px),linear-gradient(90deg,#ffc8a20b 1px,transparent 1px);background-size:38px 38px;mask-image:linear-gradient(transparent,#000 35%,#000 75%,transparent)}
header{position:absolute;top:38px;left:56px;right:56px;height:63px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #d4aa8a55;padding-bottom:14px}header strong{display:flex;align-items:center;gap:13px;font-size:28px;letter-spacing:-.8px}header img{width:43px;height:43px;padding:5px;border-radius:11px;background:#fff5eb;object-fit:contain}.sample{color:#f4c5a3;font-size:15px;font-weight:700;letter-spacing:.1em}
.chapter{position:absolute;top:120px;left:56px;color:#ffb97d;font-size:16px;font-weight:750;letter-spacing:.13em}.chapter b{color:#251410;background:#ffad67;border-radius:7px;padding:4px 8px;margin-right:12px}h1{position:absolute;top:151px;left:56px;right:38px;margin:0;font-size:53px;line-height:1.07;letter-spacing:-.052em;font-weight:800}
.frame{position:absolute;border:9px solid #362b28;border-radius:22px;background:#fff;box-shadow:0 0 0 1px #d3a28270,0 22px 42px #0008}.qr-card{position:absolute;left:49px;top:394px;width:343px;height:auto;border-radius:20px;border:1px solid #d9b492;box-shadow:0 24px 38px #1a0809aa;transform:rotate(-6deg)}.menu{position:absolute;top:305px;left:353px;width:281px;border:10px solid #362b28;border-radius:28px;box-shadow:0 0 0 1px #d3a28270,0 22px 42px #0009;transform:rotate(6deg)}.menu-tag{position:absolute;top:1033px;left:56px;color:#ffcdac;font-weight:750;letter-spacing:.07em;font-size:19px}
footer{position:absolute;top:1138px;left:56px;right:56px;border-top:1px solid #d4aa8a55;padding-top:13px}footer p{margin:0;font-size:27px;line-height:1.24;font-weight:650}.progress{position:absolute;top:1248px;left:56px;right:56px;display:flex;gap:7px}.progress span{height:4px;flex:1;background:#fff3;border-radius:4px}.progress .active{background:#ffad67}.progress .done{background:#bf7950}
`;
function card(chapter, index) {
  const size = chapter.crop ? kitchenScreen : phoneScreen;
  const interior = chapter.id === 'qr'
    ? `<img class="menu" src="${menu}" alt=""><img class="qr-card" src="${qrCard}" alt=""><span class="menu-tag">QR MEJA → MENU TAMU</span>`
    : `<div class="frame" style="left:${size.x - 9}px;top:${size.y - 9}px;width:${size.width + 18}px;height:${size.height + 18}px"></div>`;
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><style>${styles}</style></head><body><div class="grid"></div>
    <header><strong><img src="${logo}" alt="">DapurOS</strong><span class="sample">DATA CONTOH</span></header>
    <div class="chapter"><b>${String(index + 1).padStart(2, '0')}</b>${chapter.label}</div><h1>${chapter.title}</h1>${interior}
    <footer><p>${chapter.caption}</p></footer><div class="progress">${chapters.map((_, number) => `<span class="${number < index ? 'done' : number === index ? 'active' : ''}"></span>`).join('')}</div></body></html>`;
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 720, height: 1280 }, deviceScaleFactor: 1 });
  for (let index = 0; index < chapters.length; index++) {
    await page.setContent(card(chapters[index], index));
    await page.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
    await page.screenshot({ path: join(work, `card-${index}.png`) });
  }
} finally { await browser.close(); }

const enc = ['-c:v', 'libx264', '-preset', 'fast', '-crf', '19', '-pix_fmt', 'yuv420p', '-an'];
const recorded = evidence.profiles.find(row => row.device === 'phone').recordings;
for (let index = 0; index < chapters.length; index++) {
  const chapter = chapters[index];
  const output = `chapter-${index}.mp4`;
  const background = ['-loop', '1', '-framerate', '30', '-i', `card-${index}.png`];
  if (chapter.id === 'qr') {
    ffmpeg([...background, '-t', String(chapter.duration), ...enc, output]);
    continue;
  }
  const recording = recorded.find(row => row.name === chapter.id);
  const size = chapter.crop ? kitchenScreen : phoneScreen;
  const input = recording ? ['-f', 'concat', '-safe', '0', '-i', join(capture, chapter.id, 'capture.ffconcat')]
    : ['-loop', '1', '-framerate', '30', '-i', join(capture, 'phone-kasir.png')];
  const timing = recording ? `setpts=(PTS-STARTPTS)*${chapter.duration / recording.duration},` : '';
  const crop = chapter.crop ? chapter.crop + ',' : '';
  const filter = `[1:v]${crop}${timing}fps=30,scale=${size.width}:${size.height}:flags=lanczos,setsar=1,tpad=stop_mode=clone:stop_duration=1[app];[0:v][app]overlay=${size.x}:${size.y},format=yuv420p[out]`;
  ffmpeg(['-filter_complex_threads', '2', ...background, ...input, '-filter_complex', filter, '-map', '[out]', '-t', String(chapter.duration), ...enc, output]);
}
writeFileSync(join(work, 'chapters.ffconcat'), chapters.map((_, index) => `file 'chapter-${index}.mp4'`).join('\n') + '\n');
ffmpeg(['-f', 'concat', '-safe', '0', '-i', 'chapters.ffconcat', '-c', 'copy', 'silent.mp4']);
const voices = chapters.flatMap((_, index) => ['-i', join(root, `product-media/dapuros/capture/narration/voice-${index}.mp3`)]);
const filters = chapters.map((_, index) => `[${index + 1}:a]asetpts=N/SR/TB,atempo=${[1.5625, 1.5625, 1.3125, 1.5625, 1.25][index]},adelay=${[200, 4200, 8200, 14200, 18200][index]}:all=1[a${index}]`).join(';');
ffmpeg(['-i', 'silent.mp4', ...voices, '-filter_complex', `${filters};[a0][a1][a2][a3][a4]amix=inputs=5:duration=longest:normalize=0,apad,asetpts=N/SR/TB[a]`, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '96k', '-t', '25', '-movflags', '+faststart', join(videos, 'qr-ke-dapur.mp4')]);
ffmpeg(['-i', 'card-0.png', '-frames:v', '1', '-c:v', 'libwebp', '-quality', '86', join(videos, 'qr-ke-dapur-poster.webp')]);
const timestamp = second => `00:00:${String(second).padStart(2, '0')}.000`;
let position = 0;
const captions = chapters.map(chapter => {
  const start = position;
  position += chapter.duration;
  return `${timestamp(start)} --> ${timestamp(position)}\n${chapter.caption}`;
});
writeFileSync(join(videos, 'qr-ke-dapur-id.vtt'), `WEBVTT\n\n${captions.join('\n\n')}\n`);
console.log(`Rendered ${manifest.length} DapurOS screens and one ${position}s Indonesian-captioned video.`);
