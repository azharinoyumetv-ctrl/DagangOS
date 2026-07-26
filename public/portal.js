const products = [
  { name: "Geraina POS", desc: "POS retail dan inventori.", href: "/geraina", icon: "geraina-icon.png", color: "#25c96f" },
  { name: "DapurOS", desc: "Operasional restoran dan F&B.", href: "/dapuros", icon: "dapuros-icon.png", color: "#ff7a31" },
  { name: "LaundryOS", desc: "Operasional laundry dan dry cleaning.", href: "/produk#laundryos", icon: "laundryos-icon.png", color: "#2b9bf0" },
  { name: "AutoCareOS", desc: "Sistem workshop dan autocare.", href: "/produk#autocareos", icon: "autocareos-icon.png", color: "#176fe8" },
  { name: "SalonOS", desc: "Operasional salon dan layanan.", href: "/produk#salonos", icon: "salonos-icon.png", color: "#e14ab4" },
  { name: "DagangOS Web", desc: "Kehadiran digital untuk bisnis.", href: "/produk#dagangos-web", icon: "dagangosweb-icon.png", color: "#7257ef" },
];

const route = location.pathname.replace(/^\/|\/$/g, "") || "home";
const image = (name) => `/assets/brand/${name}`;
const productRows = () => `<div class="product-rail">${products.map((product) => `
  <a class="product-row reveal" id="${product.name.toLowerCase().replace(/\s+/g, "-")}" href="${product.href}" style="--accent:${product.color}">
    <img src="${image(product.icon)}" alt=""><h3>${product.name}</h3><p>${product.desc}</p><strong>↗</strong>
  </a>`).join("")}</div>`;
const orbit = () => `<div class="orbit-stage" data-orbit><div class="orbit-ring"></div>
  <div class="orbit-core"><img src="${image("dagangos-icon.png")}" alt="DagangOS"></div>
  ${products.map((product, index) => `<a class="orbit-node" data-index="${index}" href="${product.href}" style="--node:${product.color}"><img src="${image(product.icon)}" alt=""><span><b>${product.name}</b><small>${product.desc}</small></span></a>`).join("")}
</div>`;
const marquee = `<div class="marquee"><div class="marquee-track">${[...products, ...products].map((product) => `<span>${product.name}</span>`).join("")}</div></div>`;
const cta = `<section class="shell cta-band reveal"><h2>Temukan sistem yang cocok dengan cara bisnis Anda bekerja.</h2><a class="button" href="/produk">Jelajahi ekosistem <span>↗</span></a></section>`;
const flow = `<div class="flow-track"><i class="flow-packet"></i>
  <div class="flow-step"><i>01</i><b>Aktivitas</b><span>Proses bisnis dimulai di produk yang sesuai.</span></div>
  <div class="flow-step"><i>02</i><b>Operasional</b><span>Tim menjalankan alur kerja sehari-hari.</span></div>
  <div class="flow-step"><i>03</i><b>Data</b><span>Aktivitas tercatat di ruang kerja yang sama.</span></div>
  <div class="flow-step"><i>04</i><b>Keputusan</b><span>Informasi tersedia untuk tindak lanjut.</span></div>
</div>`;

const pages = {
  home: `<div class="page">
    <section class="shell hero"><div class="hero-copy"><span class="eyebrow">Ekosistem produk DagangOS</span><h1>Satu <em>ekosistem.</em><br>Banyak solusi.<br>Untuk bisnis Indonesia.</h1><p>DagangOS menyatukan produk digital yang dibangun untuk kebutuhan operasional berbeda. Setiap produk membawa identitas dan alur kerja industrinya sendiri, tetap terhubung dalam satu keluarga teknologi.</p><div class="hero-actions"><a class="button button-primary" href="/produk">Jelajahi Ekosistem <span>↗</span></a><a class="button" href="/solusi">Lihat cara kerjanya</a></div><div class="signal-list"><span><b>Identitas mandiri</b>Setiap produk punya karakter.</span><span><b>Satu keluarga</b>Bahasa desain yang konsisten.</span></div></div>${orbit()}</section>
    ${marquee}
    <section class="shell chapter"><div class="chapter-head reveal"><div><span class="eyebrow">Produk aktif & berkembang</span><h2>Dirancang dari cara bisnis bekerja.</h2></div><p>Bukan satu aplikasi yang dipaksakan ke semua industri. Setiap sistem fokus pada kebutuhan operasional yang berbeda, dengan pengalaman yang tetap terasa sebagai bagian dari DagangOS.</p></div>${productRows()}</section>
    <section class="shell chapter dark-stage reveal"><span class="eyebrow">Satu alur operasional</span><h2>Teknologi yang mengikuti pergerakan bisnis.</h2><p>Dari aktivitas di lapangan hingga informasi untuk mengambil keputusan.</p>${flow}</section>${cta}
  </div>`,
  produk: `<div class="page"><section class="shell page-hero"><span class="eyebrow">Produk DagangOS</span><h1>Bukan kumpulan kartu.<br><em>Sistem yang punya peran.</em></h1><p>Masuk ke produk yang sesuai dengan konteks bisnis Anda. Geraina POS dan DapurOS dapat langsung digunakan; produk lain ditampilkan sebagai bagian dari arah ekosistem.</p><div class="hero-actions"><a class="button button-primary" href="/geraina">Buka Geraina POS</a><a class="button" href="/dapuros">Buka DapurOS</a></div></section>${marquee}<section class="shell chapter">${productRows()}</section><section class="shell chapter dark-stage reveal"><span class="eyebrow">Pusat ekosistem</span><h2>Produk bergerak mengitari satu identitas DagangOS.</h2><p>Gerakkan pointer pada panggung untuk merasakan kedalaman; setiap produk terus bergerak pada lintasannya sendiri.</p>${orbit()}</section>${cta}</div>`,
  solusi: `<div class="page"><section class="shell page-hero"><span class="eyebrow">Cara kerja</span><h1>Dari pekerjaan harian<br>menjadi <em>alur yang terbaca.</em></h1><p>Solusi DagangOS dirancang di sekitar proses nyata: transaksi, produksi, layanan, pencatatan, dan tindak lanjut.</p></section>${marquee}<section class="shell chapter"><article class="solution-story reveal"><span>01 · FRONTLINE</span><div><h2>Mulai dari titik aktivitas.</h2><p>Kasir, pesanan, meja, stok, atau layanan menjadi pintu masuk data—sesuai cara bisnis beroperasi.</p><div class="motion-lane"><i class="motion-object"><img src="${image("geraina-icon.png")}" alt=""></i><i class="motion-object"><img src="${image("dapuros-icon.png")}" alt=""></i><i class="motion-object"><img src="${image("autocareos-icon.png")}" alt=""></i></div></div></article><article class="solution-story reveal"><span>02 · WORKFLOW</span><div><h2>Informasi bergerak bersama pekerjaan.</h2><p>Status, transaksi, bahan, dan tanggung jawab tidak berhenti di satu layar. Sistem meneruskan konteks ke langkah berikutnya.</p>${flow}</div></article><article class="solution-story reveal"><span>03 · CONTROL</span><div><h2>Pengelola melihat apa yang perlu ditindaklanjuti.</h2><p>Setiap produk menyajikan kontrol dan laporan yang relevan untuk industrinya, tanpa klaim atau angka yang dibuat-buat.</p></div></article></section>${cta}</div>`,
  industri: `<div class="page"><section class="shell page-hero"><span class="eyebrow">Konteks industri</span><h1>Satu keluarga desain.<br><em>Karakter yang berbeda.</em></h1><p>Pilih industri untuk melihat bagaimana identitas, perangkat, dan alur kerja berubah tanpa kehilangan hubungan dengan DagangOS.</p></section><section class="shell chapter"><div class="industry-selector reveal"><div class="industry-tabs" role="tablist">${["Retail", "Restoran & F&B", "Laundry", "Otomotif", "Salon & Layanan", "Kehadiran Digital"].map((label, index) => `<button role="tab" data-industry="${index}" class="${index === 0 ? "is-active" : ""}">${label}<span>0${index + 1}</span></button>`).join("")}</div><div class="industry-scene" data-industry-scene><div class="scene-copy"><small data-scene-label>Geraina POS</small><h2 data-scene-title>Retail yang terhubung.</h2><p data-scene-copy>Transaksi, produk, inventori, supplier, dan laporan berada di satu alur.</p></div><div class="scene-device"></div><i class="scene-orb" style="left:63%;top:20%"></i><i class="scene-orb" style="left:48%;top:68%;animation-delay:-2s;width:40px;height:40px"></i></div></div></section>${cta}</div>`,
  tentang: `<div class="page"><section class="shell page-hero"><span class="eyebrow">Tentang DagangOS</span><h1>Membangun sistem dari<br><em>kebutuhan operasional.</em></h1><p>DagangOS adalah ekosistem produk digital milik PT DagangOS Digital Indonesia. Setiap produk dibentuk untuk konteks bisnis yang spesifik.</p></section>${marquee}<section class="shell chapter"><div class="timeline"><article class="reveal"><small>PRINSIP 01</small><h2>Produk harus punya fokus.</h2><p>Geraina POS berfokus pada retail. DapurOS berfokus pada restoran dan F&B. Identitas produk mengikuti pekerjaan yang dilayani.</p></article><article class="reveal"><small>PRINSIP 02</small><h2>Keluarga tidak berarti seragam.</h2><p>Struktur, kualitas interaksi, dan fondasi visual tetap konsisten, sementara warna, suasana, dan simulasi mempertahankan karakter produk.</p></article><article class="reveal"><small>PRINSIP 03</small><h2>Kejujuran sebelum promosi.</h2><p>Situs ini tidak menampilkan jumlah pengguna, mitra, testimonial, atau klaim performa yang belum didukung bukti.</p></article></div></section>${cta}</div>`,
  "sumber-daya": `<div class="page"><section class="shell page-hero"><span class="eyebrow">Sumber daya</span><h1>Masuk, mulai, atau<br><em>bicara dengan kami.</em></h1><p>Akses langsung ke produk yang sudah tersedia dan kanal resmi untuk pertanyaan lebih lanjut.</p></section><section class="shell chapter"><div class="resource-list"><a class="resource-row reveal" href="/geraina"><small>RETAIL</small><h2>Pelajari Geraina POS</h2><span>↗</span></a><a class="resource-row reveal" href="/geraina/pricing"><small>HARGA</small><h2>Paket Geraina POS</h2><span>↗</span></a><a class="resource-row reveal" href="/dapuros"><small>F&B</small><h2>Pelajari DapurOS</h2><span>↗</span></a><a class="resource-row reveal" href="/dapuros/pricing"><small>HARGA</small><h2>Paket DapurOS</h2><span>↗</span></a><a class="resource-row reveal" href="mailto:hello@dagangos.com"><small>KONTAK</small><h2>hello@dagangos.com</h2><span>↗</span></a></div></section>${cta}</div>`,
};

document.getElementById("app").innerHTML = pages[route] || pages.home;
document.querySelector(`[data-route="${route}"]`)?.classList.add("is-active");
document.title = route === "home" ? "DagangOS — Ekosistem Operasional Bisnis" : `${route.replace("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())} — DagangOS`;

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

function startOrbit(stage) {
  const nodes = [...stage.querySelectorAll(".orbit-node")];
  const core = stage.querySelector(".orbit-core");
  let pointerX = 0;
  let pointerY = 0;
  stage.addEventListener("pointermove", (event) => {
    const rect = stage.getBoundingClientRect();
    pointerX = (event.clientX - rect.left - rect.width / 2) / rect.width;
    pointerY = (event.clientY - rect.top - rect.height / 2) / rect.height;
  });
  stage.addEventListener("pointerleave", () => { pointerX = 0; pointerY = 0; });
  const draw = (time) => {
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    const radiusX = width * 0.39;
    const radiusY = height * 0.29;
    nodes.forEach((node, index) => {
      const angle = time * 0.00013 + (index / nodes.length) * Math.PI * 2;
      const depth = (Math.sin(angle) + 1) / 2;
      const x = Math.cos(angle) * radiusX - node.offsetWidth / 2 + pointerX * 26 * (1 - depth);
      const y = Math.sin(angle) * radiusY - node.offsetHeight / 2 + pointerY * 18 * (1 - depth);
      node.style.transform = `translate3d(${x}px,${y}px,0) scale(${0.87 + depth * 0.16})`;
      node.style.zIndex = String(2 + Math.round(depth * 4));
      node.style.opacity = String(0.7 + depth * 0.3);
    });
    core.style.transform = `translate(calc(-50% + ${pointerX * 14}px),calc(-50% + ${pointerY * 10}px))`;
    requestAnimationFrame(draw);
  };
  if (reduced) {
    nodes.forEach((node, index) => {
      const angle = (index / nodes.length) * Math.PI * 2;
      node.style.transform = `translate(${Math.cos(angle) * stage.clientWidth * 0.34 - node.offsetWidth / 2}px,${Math.sin(angle) * stage.clientHeight * 0.27 - node.offsetHeight / 2}px)`;
    });
  } else {
    requestAnimationFrame(draw);
  }
}
document.querySelectorAll("[data-orbit]").forEach(startOrbit);

const industryData = [
  ["Geraina POS", "Retail yang terhubung.", "Transaksi, produk, inventori, supplier, dan laporan berada di satu alur.", "#43df8c", "#bdf6d7"],
  ["DapurOS", "Dari pesanan ke dapur.", "Kasir, meja, KDS, resep, bahan, dan status pesanan bergerak bersama.", "#ff7a31", "#ffd3b8"],
  ["LaundryOS", "Layanan yang terlacak.", "Penerimaan, proses cucian, status, dan serah-terima berada pada urutan yang jelas.", "#2b9bf0", "#bee9ff"],
  ["AutoCareOS", "Workshop dalam kendali.", "Kendaraan, pekerjaan servis, suku cadang, dan status pengerjaan tersusun dalam satu alur.", "#176fe8", "#b9d4ff"],
  ["SalonOS", "Jadwal bertemu layanan.", "Reservasi, layanan, staf, dan transaksi bertemu dalam pengalaman yang rapi.", "#e14ab4", "#f7c4e9"],
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
