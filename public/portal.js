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
const orbit = () => `<div class="orbit-stage" data-orbit>
  <canvas class="neuron-canvas" aria-hidden="true"></canvas>
  <div class="orbit-core"><span class="core-object"><img src="${image("dagangos-icon.png")}" alt="DagangOS"></span><small>PUSAT EKOSISTEM</small></div>
  ${products.map((product, index) => `<a class="orbit-node" data-index="${index}" href="${product.href}" style="--node:${product.color}"><span class="node-object"><img src="${image(product.icon)}" alt=""></span><span class="node-label"><b>${product.name}</b><small>${product.desc}</small></span></a>`).join("")}
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
  "sumber-daya": `<div class="page"><section class="shell page-hero"><span class="eyebrow">Sumber daya</span><h1>Masuk, mulai, atau<br><em>bicara dengan kami.</em></h1><p>Akses langsung ke produk yang sudah tersedia dan kanal resmi untuk pertanyaan lebih lanjut.</p></section><section class="shell chapter"><div class="resource-list"><a class="resource-row reveal" href="/geraina"><small>RETAIL</small><h2>Pelajari Geraina POS</h2><span>↗</span></a><a class="resource-row reveal" href="/geraina/pricing"><small>HARGA</small><h2>Paket Geraina POS</h2><span>↗</span></a><a class="resource-row reveal" href="/dapuros"><small>F&B</small><h2>Pelajari DapurOS</h2><span>↗</span></a><a class="resource-row reveal" href="/dapuros/pricing"><small>HARGA</small><h2>Paket DapurOS</h2><span>↗</span></a><a class="resource-row reveal" href="mailto:contact@dagangos.com"><small>EMAIL</small><h2>contact@dagangos.com</h2><span>↗</span></a><a class="resource-row reveal" href="https://wa.me/628999155182"><small>WHATSAPP</small><h2>+62 899 9155 182</h2><span>↗</span></a><div class="resource-row reveal"><small>LOKASI</small><h2>Subang, West Java, Indonesia</h2><span>◎</span></div></div></section>${cta}</div>`,
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
  const canvas = stage.querySelector(".neuron-canvas");
  const context = canvas.getContext("2d");
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
    const pixelRatio = Math.min(devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(width * pixelRatio) || canvas.height !== Math.round(height * pixelRatio)) {
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);
    const center = { x: width * 0.5 + pointerX * 14, y: height * 0.51 + pointerY * 10 };
    const positions = [];
    nodes.forEach((node, index) => {
      const phase = (index / nodes.length) * Math.PI * 2;
      const speed = 0.000105 + index * 0.000008;
      const angle = time * speed + phase;
      const breathingX = width * (0.32 + 0.055 * Math.sin(time * 0.00031 + phase * 1.7));
      const breathingY = height * (0.25 + 0.05 * Math.cos(time * 0.00027 + phase));
      const wanderX = Math.sin(time * 0.00043 + phase * 2.1) * width * 0.065;
      const wanderY = Math.cos(time * 0.00037 + phase * 1.3) * height * 0.075;
      const xCenter = center.x + Math.cos(angle) * breathingX + wanderX;
      const yCenter = center.y + Math.sin(angle * 1.17) * breathingY + wanderY;
      const depth = (Math.sin(angle * 1.17) + 1) / 2;
      const x = xCenter - width * 0.5 - node.offsetWidth / 2 + pointerX * 18 * (1 - depth);
      const y = yCenter - height * 0.5 - node.offsetHeight / 2 + pointerY * 14 * (1 - depth);
      positions.push({ x: xCenter, y: yCenter, color: getComputedStyle(node).getPropertyValue("--node").trim(), depth });
      node.style.transform = `translate3d(${x}px,${y}px,0) scale(${0.8 + depth * 0.22}) rotate(${Math.sin(time * 0.0004 + phase) * 2.2}deg)`;
      node.style.zIndex = String(2 + Math.round(depth * 4));
      node.style.opacity = String(0.78 + depth * 0.22);
    });
    positions.forEach((position, index) => {
      const bend = Math.sin(time * 0.00055 + index) * 48;
      const midX = (center.x + position.x) / 2 + bend;
      const midY = (center.y + position.y) / 2 - bend * 0.35;
      const gradient = context.createLinearGradient(center.x, center.y, position.x, position.y);
      gradient.addColorStop(0, "rgba(66,114,255,.5)");
      gradient.addColorStop(0.62, `${position.color}65`);
      gradient.addColorStop(1, `${position.color}18`);
      context.beginPath();
      context.moveTo(center.x, center.y);
      context.quadraticCurveTo(midX, midY, position.x, position.y);
      context.strokeStyle = gradient;
      context.lineWidth = 0.8 + position.depth * 0.9;
      context.stroke();
      const travel = (time * 0.00016 + index * 0.17) % 1;
      const inv = 1 - travel;
      const pulseX = inv * inv * center.x + 2 * inv * travel * midX + travel * travel * position.x;
      const pulseY = inv * inv * center.y + 2 * inv * travel * midY + travel * travel * position.y;
      context.beginPath();
      context.arc(pulseX, pulseY, 2.3 + position.depth * 1.5, 0, Math.PI * 2);
      context.fillStyle = position.color;
      context.shadowColor = position.color;
      context.shadowBlur = 13;
      context.fill();
      context.shadowBlur = 0;
    });
    for (let index = 0; index < positions.length; index += 1) {
      const next = positions[(index + 2) % positions.length];
      const current = positions[index];
      const distance = Math.hypot(current.x - next.x, current.y - next.y);
      if (distance < width * 0.48) {
        context.beginPath();
        context.moveTo(current.x, current.y);
        context.lineTo(next.x, next.y);
        context.strokeStyle = "rgba(81,112,173,.1)";
        context.lineWidth = 0.65;
        context.stroke();
      }
    }
    core.style.transform = `translate(calc(-50% + ${pointerX * 14}px),calc(-50% + ${pointerY * 10}px))`;
    requestAnimationFrame(draw);
  };
  if (reduced) {
    nodes.forEach((node, index) => {
      const angle = (index / nodes.length) * Math.PI * 2;
      node.style.transform = `translate(${Math.cos(angle) * stage.clientWidth * 0.32 - node.offsetWidth / 2}px,${Math.sin(angle) * stage.clientHeight * 0.25 - node.offsetHeight / 2}px)`;
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
