const products = [
  { name: "Geraina POS", desc: "POS retail dan inventori.", href: "/geraina", icon: "geraina-icon.png", color: "#25c96f", status: "available" },
  { name: "DapurOS", desc: "Operasional restoran dan F&B.", href: "/dapuros", icon: "dapuros-icon.png", color: "#ff7a31", status: "available" },
  { name: "LaundryOS", desc: "Operasional laundry dan dry cleaning.", icon: "laundryos-icon.png", color: "#2b9bf0", status: "coming-soon" },
  { name: "AutoCareOS", desc: "Sistem workshop dan autocare.", icon: "autocareos-icon.png", color: "#176fe8", status: "coming-soon" },
  { name: "SalonOS", desc: "Operasional salon dan layanan.", icon: "salonos-icon.png", color: "#e14ab4", status: "coming-soon" },
  { name: "DagangOS Web", desc: "Kehadiran digital untuk bisnis.", href: "/produk#dagangos-web", icon: "dagangosweb-icon.png", color: "#7257ef", status: "available" },
];

const route = location.pathname.replace(/^\/|\/$/g, "") || "home";
const image = (name) => `/assets/brand/${name}`;
const productRows = () => `<div class="product-rail">${products.map((product) => {
  const id = product.name.toLowerCase().replace(/\s+/g, "-");
  const content = `<img src="${image(product.icon)}" alt=""><h3>${product.name}</h3><p>${product.desc}</p>${product.status === "coming-soon"
    ? `<span class="product-status is-coming">Segera hadir</span>`
    : `<span class="product-status is-available">Tersedia <strong>↗</strong></span>`}`;
  return product.status === "coming-soon"
    ? `<div class="product-row is-coming reveal" id="${id}" aria-label="${product.name}, segera hadir" style="--accent:${product.color}">${content}</div>`
    : `<a class="product-row reveal" id="${id}" href="${product.href}" style="--accent:${product.color}">${content}</a>`;
}).join("")}</div>`;
const orbitNode = (product, index) => {
  const content = `<span class="node-object"><i class="node-field" aria-hidden="true"></i><i class="node-glass" aria-hidden="true"></i><img src="${image(product.icon)}" alt=""></span><span class="node-label"><b>${product.name}</b><small>${product.status === "coming-soon" ? "Segera hadir" : product.desc}</small></span>`;
  const style = `--node:${product.color};--entrance-delay:${180 + index * 110}ms`;
  return product.status === "coming-soon"
    ? `<span class="orbit-node is-coming" data-index="${index}" data-status="coming-soon" aria-label="${product.name}, segera hadir" style="${style}">${content}</span>`
    : `<a class="orbit-node" data-index="${index}" data-status="available" href="${product.href}" aria-label="Buka ${product.name}" style="${style}">${content}</a>`;
};
const orbit = () => `<div class="orbit-stage" data-orbit aria-label="Ekosistem produk DagangOS interaktif">
  <canvas class="neuron-canvas" role="img" aria-label="Jaringan produk yang terhubung ke pusat DagangOS"></canvas>
  <div class="universe-atmosphere" aria-hidden="true"><i></i><i></i><i></i></div>
  <div class="orbit-core" data-core aria-hidden="true">
    <i class="core-field core-field-a"></i><i class="core-field core-field-b"></i><i class="core-field core-field-c"></i>
    <span class="core-object"><span class="core-glass"><img src="${image("dagangos-icon.png")}" alt=""></span></span>
    <span class="core-caption"><b>DagangOS</b><small>Pusat ekosistem</small></span>
  </div>
  ${products.map(orbitNode).join("")}
</div>`;
const marquee = `<div class="marquee"><div class="marquee-track">${[...products, ...products].map((product) => `<span>${product.name}${product.status === "coming-soon" ? " · Segera hadir" : ""}</span>`).join("")}</div></div>`;
const cta = `<section class="shell cta-band reveal"><h2>Temukan sistem yang cocok dengan cara bisnis Anda bekerja.</h2><a class="button" href="/produk">Jelajahi ekosistem <span>↗</span></a></section>`;
const flow = `<div class="flow-track"><i class="flow-packet"></i>
  <div class="flow-step"><i>01</i><b>Aktivitas</b><span>Proses bisnis dimulai di produk yang sesuai.</span></div>
  <div class="flow-step"><i>02</i><b>Operasional</b><span>Tim menjalankan alur kerja sehari-hari.</span></div>
  <div class="flow-step"><i>03</i><b>Data</b><span>Aktivitas tercatat di ruang kerja yang sama.</span></div>
  <div class="flow-step"><i>04</i><b>Keputusan</b><span>Informasi tersedia untuk tindak lanjut.</span></div>
</div>`;

const pages = {
  home: `<div class="page">
    <section class="shell hero hero-universe"><div class="hero-copy"><span class="eyebrow">Ekosistem operasional DagangOS</span><h1>Bisnis bergerak.<br><em>Sistem ikut hidup.</em></h1><p>DagangOS menghubungkan produk digital yang dibangun untuk cara kerja berbeda—retail, restoran, layanan, dan kebutuhan bisnis lainnya—dalam satu keluarga teknologi.</p><div class="hero-actions"><a class="button button-primary" href="/produk">Jelajahi Ekosistem <span>↗</span></a><a class="button" href="/solusi">Lihat cara kerjanya</a></div><div class="hero-availability"><span><i></i>Geraina POS</span><span><i></i>DapurOS</span><small>Tersedia sekarang</small></div></div>${orbit()}</section>
    <section class="shell chapter"><div class="chapter-head reveal"><div><span class="eyebrow">Status produk</span><h2>Tersedia sekarang.<br>Berikutnya sedang dibangun.</h2></div><p>Geraina POS dan DapurOS dapat langsung digunakan. LaundryOS, AutoCareOS, dan SalonOS sedang dikembangkan dan ditandai jelas sebagai “Segera hadir”.</p></div>${productRows()}</section>
    <section class="shell chapter dark-stage reveal"><span class="eyebrow">Satu alur operasional</span><h2>Teknologi yang mengikuti pergerakan bisnis.</h2><p>Dari aktivitas di lapangan hingga informasi untuk mengambil keputusan.</p>${flow}</section>${cta}
  </div>`,
  produk: `<div class="page"><section class="shell page-hero"><span class="eyebrow">Produk DagangOS</span><h1>Bukan kumpulan kartu.<br><em>Sistem yang punya peran.</em></h1><p>Geraina POS dan DapurOS dapat langsung digunakan. LaundryOS, AutoCareOS, dan SalonOS masih dalam pengembangan dan ditandai sebagai “Segera hadir”.</p><div class="hero-actions"><a class="button button-primary" href="/geraina">Buka Geraina POS</a><a class="button" href="/dapuros">Buka DapurOS</a></div></section>${marquee}<section class="shell chapter">${productRows()}</section><section class="shell chapter dark-stage reveal"><span class="eyebrow">Pusat ekosistem</span><h2>Produk bergerak mengitari satu identitas DagangOS.</h2><p>Gerakkan pointer untuk merasakan kedalaman. Setiap produk bergerak di ruangnya sendiri sambil tetap terhubung ke pusat DagangOS.</p>${orbit()}</section>${cta}</div>`,
  solusi: `<div class="page"><section class="shell page-hero"><span class="eyebrow">Cara kerja</span><h1>Dari pekerjaan harian<br>menjadi <em>alur yang terbaca.</em></h1><p>Solusi DagangOS dirancang di sekitar proses nyata: transaksi, produksi, layanan, pencatatan, dan tindak lanjut.</p></section>${marquee}<section class="shell chapter"><article class="solution-story reveal"><span>01 · FRONTLINE</span><div><h2>Mulai dari titik aktivitas.</h2><p>Kasir, pesanan, meja, stok, atau layanan menjadi pintu masuk data—sesuai cara bisnis beroperasi.</p><div class="motion-lane"><i class="motion-object"><img src="${image("geraina-icon.png")}" alt=""></i><i class="motion-object"><img src="${image("dapuros-icon.png")}" alt=""></i><i class="motion-object"><img src="${image("autocareos-icon.png")}" alt=""></i></div></div></article><article class="solution-story reveal"><span>02 · WORKFLOW</span><div><h2>Informasi bergerak bersama pekerjaan.</h2><p>Status, transaksi, bahan, dan tanggung jawab tidak berhenti di satu layar. Sistem meneruskan konteks ke langkah berikutnya.</p>${flow}</div></article><article class="solution-story reveal"><span>03 · CONTROL</span><div><h2>Pengelola melihat apa yang perlu ditindaklanjuti.</h2><p>Setiap produk menyajikan kontrol dan laporan yang relevan untuk industrinya, tanpa klaim atau angka yang dibuat-buat.</p></div></article></section>${cta}</div>`,
  industri: `<div class="page"><section class="shell page-hero"><span class="eyebrow">Konteks industri</span><h1>Satu keluarga desain.<br><em>Karakter yang berbeda.</em></h1><p>Pilih industri untuk melihat bagaimana identitas, perangkat, dan alur kerja berubah tanpa kehilangan hubungan dengan DagangOS.</p></section><section class="shell chapter"><div class="industry-selector reveal"><div class="industry-tabs" role="tablist">${["Retail", "Restoran & F&B", "Laundry · Segera hadir", "Otomotif · Segera hadir", "Salon · Segera hadir", "Kehadiran Digital"].map((label, index) => `<button role="tab" data-industry="${index}" class="${index === 0 ? "is-active" : ""}">${label}<span>0${index + 1}</span></button>`).join("")}</div><div class="industry-scene" data-industry-scene><div class="scene-copy"><small data-scene-label>Geraina POS</small><h2 data-scene-title>Retail yang terhubung.</h2><p data-scene-copy>Transaksi, produk, inventori, supplier, dan laporan berada di satu alur.</p></div><div class="scene-device"></div><i class="scene-orb" style="left:63%;top:20%"></i><i class="scene-orb" style="left:48%;top:68%;animation-delay:-2s;width:40px;height:40px"></i></div></div></section>${cta}</div>`,
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
  const core = stage.querySelector("[data-core]");
  const canvas = stage.querySelector(".neuron-canvas");
  const context = canvas.getContext("2d");
  const phases = nodes.map((_, index) => index * 1.37 + 0.4);
  const particles = Array.from({ length: 46 }, (_, index) => {
    const seed = (index * 9301 + 49297) % 233280;
    return {
      x: (seed % 997) / 997,
      y: ((seed * 47) % 991) / 991,
      depth: 0.25 + ((seed * 17) % 100) / 135,
      phase: index * 0.73,
    };
  });
  let pointerX = 0;
  let pointerY = 0;
  let targetPointerX = 0;
  let targetPointerY = 0;
  let frame = 0;

  const slotsFor = (width) => width < 520
    ? [
        [0.17, 0.15], [0.83, 0.15],
        [0.15, 0.50], [0.85, 0.50],
        [0.20, 0.84], [0.80, 0.84],
      ]
    : [
        [0.22, 0.18], [0.78, 0.18],
        [0.14, 0.50], [0.86, 0.50],
        [0.25, 0.82], [0.75, 0.82],
      ];

  stage.addEventListener("pointermove", (event) => {
    const rect = stage.getBoundingClientRect();
    targetPointerX = Math.max(-0.5, Math.min(0.5, (event.clientX - rect.left) / rect.width - 0.5));
    targetPointerY = Math.max(-0.5, Math.min(0.5, (event.clientY - rect.top) / rect.height - 0.5));
  });
  stage.addEventListener("pointerleave", () => {
    targetPointerX = 0;
    targetPointerY = 0;
  });

  const bezierPoint = (start, control, end, amount) => {
    const inverse = 1 - amount;
    return {
      x: inverse * inverse * start.x + 2 * inverse * amount * control.x + amount * amount * end.x,
      y: inverse * inverse * start.y + 2 * inverse * amount * control.y + amount * amount * end.y,
    };
  };

  const render = (time = 0) => {
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    const pixelRatio = Math.min(devicePixelRatio || 1, 2);
    const compact = width < 520;
    const slots = slotsFor(width);

    if (canvas.width !== Math.round(width * pixelRatio) || canvas.height !== Math.round(height * pixelRatio)) {
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }

    pointerX += (targetPointerX - pointerX) * 0.055;
    pointerY += (targetPointerY - pointerY) * 0.055;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);

    const center = {
      x: width * 0.5 + pointerX * (compact ? 5 : 14),
      y: height * 0.5 + pointerY * (compact ? 4 : 10),
    };
    const driftRadiusX = compact ? 4 : Math.min(11, width * 0.016);
    const driftRadiusY = compact ? 5 : 9;
    const positions = nodes.map((node, index) => {
      const phase = phases[index];
      const active = node.matches(":hover") || node.matches(":focus-visible");
      const orbitAmount = reduced || active ? 0 : 1;
      const localX = Math.cos(time * (0.00022 + index * 0.000006) + phase) * driftRadiusX * orbitAmount;
      const localY = Math.sin(time * (0.00028 + index * 0.000005) + phase) * driftRadiusY * orbitAmount;
      const depth = reduced ? 0.5 : (Math.sin(time * 0.00019 + phase) + 1) / 2;
      const xCenter = width * slots[index][0] + localX + pointerX * (depth - 0.5) * (compact ? 4 : 20);
      const yCenter = height * slots[index][1] + localY + pointerY * (depth - 0.5) * (compact ? 3 : 15);
      const scale = active ? 1.1 : 0.95 + depth * 0.08;
      const x = xCenter - node.offsetWidth / 2;
      const y = yCenter - node.offsetHeight / 2;
      node.style.transform = `translate3d(${x}px,${y}px,${-22 + depth * 50}px) scale(${scale})`;
      node.style.zIndex = String(active ? 12 : 3 + Math.round(depth * 4));
      node.style.setProperty("--depth", depth.toFixed(3));
      return {
        x: xCenter,
        y: yCenter - (compact ? 7 : 13),
        depth,
        color: getComputedStyle(node).getPropertyValue("--node").trim(),
        coming: node.dataset.status === "coming-soon",
      };
    });

    particles.forEach((particle, index) => {
      const pulse = reduced ? 0 : Math.sin(time * 0.00045 + particle.phase);
      const x = particle.x * width + pointerX * particle.depth * 18;
      const y = particle.y * height + pointerY * particle.depth * 14 + pulse * 2.5;
      const alpha = 0.09 + particle.depth * 0.17 + pulse * 0.025;
      context.beginPath();
      context.arc(x, y, 0.7 + particle.depth * 1.25, 0, Math.PI * 2);
      context.fillStyle = `rgba(73,126,255,${alpha})`;
      context.fill();
      const neighbor = particles[index + 1];
      if (neighbor && index % 2 === 0) {
        const neighborX = neighbor.x * width + pointerX * neighbor.depth * 18;
        const neighborY = neighbor.y * height + pointerY * neighbor.depth * 14;
        if (Math.hypot(x - neighborX, y - neighborY) < width * 0.22) {
          context.beginPath();
          context.moveTo(x, y);
          context.lineTo(neighborX, neighborY);
          context.strokeStyle = "rgba(67,112,210,.06)";
          context.lineWidth = 0.65;
          context.stroke();
        }
      }
    });

    positions.forEach((position, index) => {
      const bendDirection = index % 2 === 0 ? -1 : 1;
      const control = {
        x: center.x + (position.x - center.x) * 0.52 + bendDirection * (compact ? 12 : 34),
        y: center.y + (position.y - center.y) * 0.43 - Math.sin(time * 0.00032 + index) * (compact ? 5 : 15),
      };
      const gradient = context.createLinearGradient(center.x, center.y, position.x, position.y);
      gradient.addColorStop(0, position.coming ? "rgba(65,112,255,.28)" : "rgba(65,112,255,.62)");
      gradient.addColorStop(0.55, `${position.color}${position.coming ? "42" : "78"}`);
      gradient.addColorStop(1, `${position.color}${position.coming ? "10" : "1f"}`);
      context.beginPath();
      context.moveTo(center.x, center.y);
      context.quadraticCurveTo(control.x, control.y, position.x, position.y);
      context.strokeStyle = gradient;
      context.lineWidth = 1 + position.depth * 1.15;
      context.stroke();

      const pulseOffset = reduced ? 0.72 : (time * (0.00012 + index * 0.000006) + index * 0.16) % 1;
      const pulse = bezierPoint(center, control, position, pulseOffset);
      context.beginPath();
      context.arc(pulse.x, pulse.y, 2 + position.depth * 1.6, 0, Math.PI * 2);
      context.fillStyle = position.coming ? `${position.color}99` : position.color;
      context.shadowColor = position.color;
      context.shadowBlur = 16;
      context.fill();
      context.shadowBlur = 0;
    });

    const wave = reduced ? 0.45 : (time * 0.00013) % 1;
    context.beginPath();
    context.arc(center.x, center.y, 64 + wave * (compact ? 65 : 115), 0, Math.PI * 2);
    context.strokeStyle = `rgba(60,111,255,${0.17 * (1 - wave)})`;
    context.lineWidth = 1;
    context.stroke();

    core.style.transform = `translate3d(calc(-50% + ${pointerX * (compact ? 5 : 15)}px),calc(-50% + ${pointerY * (compact ? 4 : 10)}px),44px) rotateX(${-pointerY * 7}deg) rotateY(${pointerX * 9}deg)`;
    stage.classList.add("is-ready");
    if (!reduced) frame = requestAnimationFrame(render);
  };

  render();
  if (reduced) {
    const resizeObserver = new ResizeObserver(() => render());
    resizeObserver.observe(stage);
  }
  return () => cancelAnimationFrame(frame);
}
document.querySelectorAll("[data-orbit]").forEach(startOrbit);

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
