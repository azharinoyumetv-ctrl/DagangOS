import { parentPages, products } from "./parent-portal.js?v=tiga-ruang";

const route = location.pathname.replace(/^\/|\/$/g, "") || "home";
const image = (name) => `/assets/brand/${name}`;
const marquee = `<div class="marquee"><div class="marquee-track">${[...products, ...products].map((product) => `<span>${product.name}${product.status === "coming-soon" ? " · Segera hadir" : ""}</span>`).join("")}</div></div>`;
const cta = `<section class="shell cta-band reveal"><h2>Temukan sistem yang cocok dengan cara bisnis Anda bekerja.</h2><a class="button" href="/produk">Jelajahi ekosistem <span>↗</span></a></section>`;
const flow = `<div class="flow-track"><i class="flow-packet"></i>
  <div class="flow-step"><i>01</i><b>Aktivitas</b><span>Proses bisnis dimulai di produk yang sesuai.</span></div>
  <div class="flow-step"><i>02</i><b>Operasional</b><span>Tim menjalankan alur kerja sehari-hari.</span></div>
  <div class="flow-step"><i>03</i><b>Data</b><span>Aktivitas tercatat di ruang kerja yang sama.</span></div>
  <div class="flow-step"><i>04</i><b>Keputusan</b><span>Informasi tersedia untuk tindak lanjut.</span></div>
</div>`;

const pages = {
  solusi: `<div class="page"><section class="shell page-hero"><span class="eyebrow">Cara kerja</span><h1>Dari pekerjaan harian<br>menjadi <em>alur yang terbaca.</em></h1><p>Solusi DagangOS dirancang di sekitar proses nyata: transaksi, produksi, layanan, pencatatan, dan tindak lanjut.</p></section>${marquee}<section class="shell chapter"><article class="solution-story reveal"><span>01 · FRONTLINE</span><div><h2>Mulai dari titik aktivitas.</h2><p>Kasir, pesanan, meja, stok, atau layanan menjadi pintu masuk data—sesuai cara bisnis beroperasi.</p><div class="motion-lane"><i class="motion-object"><img src="${image("geraina-icon.png")}" alt=""></i><i class="motion-object"><img src="${image("dapuros-icon.png")}" alt=""></i><i class="motion-object"><img src="${image("autocareos-icon.png")}" alt=""></i></div></div></article><article class="solution-story reveal"><span>02 · WORKFLOW</span><div><h2>Informasi bergerak bersama pekerjaan.</h2><p>Status, transaksi, bahan, dan tanggung jawab tidak berhenti di satu layar. Sistem meneruskan konteks ke langkah berikutnya.</p>${flow}</div></article><article class="solution-story reveal"><span>03 · CONTROL</span><div><h2>Pengelola melihat apa yang perlu ditindaklanjuti.</h2><p>Setiap produk menyajikan kontrol dan laporan yang relevan untuk industrinya, tanpa klaim atau angka yang dibuat-buat.</p></div></article></section>${cta}</div>`,
  industri: `<div class="page"><section class="shell page-hero"><span class="eyebrow">Konteks industri</span><h1>Satu keluarga desain.<br><em>Karakter yang berbeda.</em></h1><p>Pilih industri untuk melihat bagaimana identitas, perangkat, dan alur kerja berubah tanpa kehilangan hubungan dengan DagangOS.</p></section><section class="shell chapter"><div class="industry-selector reveal"><div class="industry-tabs" role="tablist">${["Retail", "Restoran & F&B", "Laundry · Segera hadir", "Otomotif · Segera hadir", "Salon · Segera hadir", "Kehadiran Digital"].map((label, index) => `<button role="tab" data-industry="${index}" class="${index === 0 ? "is-active" : ""}">${label}<span>0${index + 1}</span></button>`).join("")}</div><div class="industry-scene" data-industry-scene><div class="scene-copy"><small data-scene-label>Geraina POS</small><h2 data-scene-title>Retail yang terhubung.</h2><p data-scene-copy>Transaksi, produk, inventori, supplier, dan laporan berada di satu alur.</p></div><div class="scene-device"></div><i class="scene-orb" style="left:63%;top:20%"></i><i class="scene-orb" style="left:48%;top:68%;animation-delay:-2s;width:40px;height:40px"></i></div></div></section>${cta}</div>`,
  tentang: `<div class="page"><section class="shell page-hero"><span class="eyebrow">Tentang DagangOS</span><h1>Membangun sistem dari<br><em>kebutuhan operasional.</em></h1><p>DagangOS adalah ekosistem produk digital milik PT DagangOS Digital Indonesia. Setiap produk dibentuk untuk konteks bisnis yang spesifik.</p></section>${marquee}<section class="shell chapter"><div class="timeline"><article class="reveal"><small>PRINSIP 01</small><h2>Produk harus punya fokus.</h2><p>Geraina POS berfokus pada retail. DapurOS berfokus pada restoran dan F&B. Identitas produk mengikuti pekerjaan yang dilayani.</p></article><article class="reveal"><small>PRINSIP 02</small><h2>Keluarga tidak berarti seragam.</h2><p>Struktur, kualitas interaksi, dan fondasi visual tetap konsisten, sementara warna, suasana, dan simulasi mempertahankan karakter produk.</p></article><article class="reveal"><small>PRINSIP 03</small><h2>Kejujuran sebelum promosi.</h2><p>Situs ini tidak menampilkan jumlah pengguna, mitra, testimonial, atau klaim performa yang belum didukung bukti.</p></article></div></section>${cta}</div>`,
  "sumber-daya": `<div class="page"><section class="shell page-hero"><span class="eyebrow">Sumber daya</span><h1>Masuk, mulai, atau<br><em>bicara dengan kami.</em></h1><p>Akses langsung ke produk yang sudah tersedia dan kanal resmi untuk pertanyaan lebih lanjut.</p></section><section class="shell chapter"><div class="resource-list"><a class="resource-row reveal" href="/geraina"><small>RETAIL</small><h2>Pelajari Geraina POS</h2><span>↗</span></a><a class="resource-row reveal" href="/geraina/pricing"><small>HARGA</small><h2>Paket Geraina POS</h2><span>↗</span></a><a class="resource-row reveal" href="/dapuros"><small>F&B</small><h2>Pelajari DapurOS</h2><span>↗</span></a><a class="resource-row reveal" href="/dapuros/pricing"><small>HARGA</small><h2>Paket DapurOS</h2><span>↗</span></a><a class="resource-row reveal" href="mailto:contact@dagangos.com"><small>EMAIL</small><h2>contact@dagangos.com</h2><span>↗</span></a><a class="resource-row reveal" href="https://wa.me/628999155182"><small>WHATSAPP</small><h2>+62 899 9155 182</h2><span>↗</span></a><div class="resource-row reveal"><small>LOKASI</small><h2>Subang, West Java, Indonesia</h2><span>◎</span></div></div></section>${cta}</div>`,
};

const app = document.getElementById("app");
// Contact and legal documents are rendered by the Worker and remain readable without JavaScript.
if (pages[route]) app.innerHTML = pages[route];
else if (!app.querySelector("[data-server-rendered-public-content]")) app.innerHTML = parentPages[route] || parentPages.home;
document.querySelector(`[data-route="${route}"]`)?.classList.add("is-active");
if (pages[route]) document.title = route === "home" ? "DagangOS — Ekosistem Operasional Bisnis" : `${route.replace("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())} — DagangOS`;

const toggle = document.querySelector(".nav-toggle");
const nav = document.querySelector(".main-nav");
toggle?.addEventListener("click", () => {
  const open = nav.classList.toggle("is-open");
  toggle.setAttribute("aria-expanded", String(open));
});

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
document.querySelectorAll(".reveal").forEach((element) => {
  const observer = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) {
      element.classList.add("is-visible");
      observer.disconnect();
    }
  }, { threshold: 0.12 });
  observer.observe(element);
});

const industryData = [
  ["Geraina POS", "Retail yang terhubung.", "Transaksi, produk, inventori, supplier, dan laporan berada di satu alur.", "#43df8c", "#bdf6d7"],
  ["DapurOS", "Dari pesanan ke dapur.", "Kasir, meja, KDS, resep, bahan, dan status pesanan bergerak bersama.", "#ff7a31", "#ffd3b8"],
  ["LaundryOS · Segera hadir", "Layanan yang terlacak.", "Penerimaan, proses cucian, status, dan serah-terima berada pada urutan yang jelas.", "#2b9bf0", "#bee9ff"],
  ["AutoCareOS · Segera hadir", "Workshop dalam kendali.", "Kendaraan, pekerjaan servis, suku cadang, dan status pengerjaan tersusun dalam satu alur.", "#176fe8", "#b9d4ff"],
  ["SalonOS · Segera hadir", "Jadwal bertemu layanan.", "Reservasi, layanan, staf, dan transaksi bertemu dalam pengalaman yang rapi.", "#e14ab4", "#f7c4e9"],
  ["DagangOS Web", "Wajah digital bisnis.", "Kehadiran web membawa identitas dan informasi bisnis ke ruang digital.", "#7257ef", "#d8cdfd"],
];
document.querySelectorAll("[data-industry]").forEach((button) => button.addEventListener("click", () => {
  document.querySelectorAll("[data-industry]").forEach((item) => item.classList.remove("is-active"));
  button.classList.add("is-active");
  const data = industryData[Number(button.dataset.industry)];
  const scene = document.querySelector("[data-industry-scene]");
  scene.style.setProperty("--scene-accent", data[3]);
  scene.style.setProperty("--scene-glow", data[4]);
  scene.querySelector("[data-scene-label]").textContent = data[0];
  scene.querySelector("[data-scene-title]").textContent = data[1];
  scene.querySelector("[data-scene-copy]").textContent = data[2];
  scene.querySelector(".scene-device").animate(
    [{ transform: "rotate(-6deg) translateY(35px)", opacity: 0.5 }, { transform: "rotate(-6deg)", opacity: 1 }],
    { duration: 550, easing: "cubic-bezier(.2,.8,.2,1)" },
  );
}));
