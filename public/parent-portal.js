export const products = [
  { name: "Geraina POS", desc: "POS retail dan inventori.", href: "/geraina", icon: "geraina-icon.png", color: "#25c96f", status: "available" },
  { name: "DapurOS", desc: "Operasional restoran dan F&B.", href: "/dapuros", icon: "dapuros-icon.png", color: "#ff7a31", status: "available" },
  { name: "LaundryOS", desc: "Operasional laundry dan dry cleaning.", icon: "laundryos-icon.png", color: "#2b9bf0", status: "coming-soon" },
  { name: "AutoCareOS", desc: "Sistem workshop dan autocare.", icon: "autocareos-icon.png", color: "#176fe8", status: "coming-soon" },
  { name: "SalonOS", desc: "Operasional salon dan layanan.", icon: "salonos-icon.png", color: "#e14ab4", status: "coming-soon" },
  { name: "DagangOS Web", desc: "Kehadiran digital untuk bisnis.", href: "https://wmp.dagangos.com/id", icon: "dagangosweb-icon.png", color: "#7257ef", status: "available" },
];

const image = name => `/assets/brand/${name}`;
const productDetails = {
  "Geraina POS": { id: "geraina", action: "Kelola toko", screenshot: "/product-media/geraina/screens/desktop-web-pos.png", alt: "Katalog dan keranjang di kasir Geraina POS", android: "/geraina/android" },
  DapurOS: { id: "dapuros", action: "Kelola restoran", screenshot: "/product-media/dapuros/screens/desktop-dapur.webp", alt: "Antrean pesanan di layar dapur DapurOS", android: "/dapuros/android" },
  "DagangOS Web": { id: "dagangosweb", action: "Buat situs bisnis", screenshot: "/assets/scenes/ruang-web.webp", alt: "Ilustrasi situs bisnis pada desktop dan ponsel" },
};
const available = products.filter(product => product.status === "available");
const upcoming = products.filter(product => product.status === "coming-soon");
const choices = available.map(product => {
  const detail = productDetails[product.name];
  return `<a class="studio-choice ${detail.id}" data-room="${detail.id}" href="${product.href}">
    <img src="${image(product.icon)}" alt=""><span><strong>${detail.action}</strong><small>${product.name}</small></span>
  </a>`;
}).join("");
const productCatalog = (showAndroid = false) => `<div class="parent-products ${showAndroid ? "parent-products--catalog" : ""}">${available.map(product => {
  const detail = productDetails[product.name];
  return `<article class="parent-product ${detail.id}"><div class="parent-product-copy">
    <img src="${image(product.icon)}" alt=""><h3>${product.name}</h3><p>${product.desc}</p>
    <div class="parent-product-actions"><a class="parent-product-link" href="${product.href}">Kenali ${product.name}</a>${showAndroid && detail.android ? `<a class="parent-android-link" href="${detail.android}">Unduh untuk Android</a>` : ""}</div>
    </div><img class="parent-product-screen" src="${detail.screenshot}" alt="${detail.alt}" loading="lazy">
  </article>`;
}).join("")}</div>`;
const upcomingCatalog = `<div class="parent-upcoming">${upcoming.map(product => `<article><img src="${image(product.icon)}" alt=""><h3>${product.name}</h3><p>${product.desc}</p></article>`).join("")}</div>`;
const guidePage = (label, title, intro, content) => `<div class="page guide-page" data-server-rendered-public-content>
  <section class="shell page-hero"><span class="eyebrow">${label}</span><h1>${title}</h1><p>${intro}</p></section>
  <div class="shell guide-content">${content}</div>
</div>`;
const workflows = [
  { product: "Geraina POS", title: "Dari transaksi kasir ke laporan toko", steps: ["Siapkan katalog, harga, dan barcode barang yang dijual.", "Pindai atau cari barang di layar kasir, lalu catat pembayaran.", "Periksa persediaan dan laporan penjualan sebelum menyiapkan pembelian berikutnya."] },
  { product: "DapurOS", title: "Dari pesanan meja ke antrean dapur", steps: ["Catat pesanan beserta pilihan menu dan catatan pelanggan.", "Tim dapur melihat antrean di Kitchen Display System dan memperbarui status pesanan.", "Gunakan resep dan catatan persediaan untuk meninjau kebutuhan bahan."] },
  { product: "DagangOS Web", title: "Dari informasi usaha ke situs yang bisa dibagikan", steps: ["Siapkan informasi layanan, foto, dan cara pelanggan menghubungi usaha Anda.", "Susun halaman yang menjawab pertanyaan pelanggan sebelum mereka menghubungi Anda.", "Tinjau tampilan di ponsel dan desktop, lalu bagikan alamat situs yang sudah diterbitkan."] },
];
const industries = [
  { title: "Toko & retail", fit: "Untuk minimarket, toko kelontong, dan toko khusus yang mencatat transaksi dan persediaan setiap hari." },
  { title: "Restoran & kafe", fit: "Untuk restoran, kedai, dan kafe yang perlu mengatur pesanan meja, antrean dapur, dan stok bahan." },
  { title: "Bisnis jasa & merek lokal", fit: "Untuk usaha yang membutuhkan halaman resmi berisi layanan, informasi usaha, dan kontak." },
];
const resourceGroups = [
  { title: "Pilih paket", intro: "Periksa fitur yang tersedia sebelum menentukan paket untuk usaha Anda.", links: [["Paket Geraina POS", "/geraina/pricing"], ["Paket DapurOS", "/dapuros/pricing"], ["Paket DagangOS Web", "https://wmp.dagangos.com/id/pricing"]] },
  { title: "Dapatkan bantuan", intro: "Untuk pertanyaan produk atau akun, sebutkan produk dan jelaskan kendala yang Anda alami.", links: [["Hubungi tim DagangOS", "/kontak"], ["Email dukungan", "mailto:support@dagangos.com"]] },
  { title: "Pembayaran dan kebijakan", intro: "Lihat ketentuan penggunaan layanan, pengelolaan data, dan pengembalian dana.", links: [["Syarat dan ketentuan", "/syarat-ketentuan"], ["Kebijakan privasi", "/kebijakan-privasi"], ["Refund dan pembatalan", "/kebijakan-refund"]] },
];

export const parentPages = {
  solusi: guidePage("Solusi", "Dari pekerjaan harian<br><em>ke langkah berikutnya.</em>", "Lihat cara memakai DagangOS untuk melayani pelanggan, menjalankan operasional, dan menyiapkan informasi yang dibutuhkan tim.", `
    <div class="guide-grid">${workflows.map((workflow, index) => `<article class="guide-card ${productDetails[workflow.product].id}">
      <p class="guide-label">${workflow.product}</p><h2>${workflow.title}</h2>
      <ol>${workflow.steps.map(step => `<li>${step}</li>`).join("")}</ol>
      <a href="${available[index].href}">Lihat ${workflow.product}</a>
    </article>`).join("")}</div>`),
  industri: guidePage("Industri", "Pilih sistem sesuai<br><em>jenis usaha Anda.</em>", "Mulai dari jenis usaha dan pekerjaan yang paling sering tim Anda tangani.", `
    <div class="guide-grid">${available.map((product, index) => {
      const detail = productDetails[product.name];
      const industry = industries[index];
      return `<article class="guide-card guide-industry ${detail.id}">
        <img src="${detail.screenshot}" alt="${detail.alt}" loading="lazy">
        <div><p class="guide-label">${product.name}</p><h2>${industry.title}</h2><p>${industry.fit}</p><a href="${product.href}">Kenali ${product.name}</a></div>
      </article>`;
    }).join("")}</div>
    <section class="guide-upcoming"><h2>Segera hadir</h2>${upcomingCatalog}</section>`),
  "sumber-daya": guidePage("Sumber Daya", "Temukan bantuan<br><em>yang Anda perlukan.</em>", "Bandingkan paket, hubungi dukungan, atau baca kebijakan layanan DagangOS.", `
    <div class="guide-grid">${resourceGroups.map(group => `<section class="guide-card"><h2>${group.title}</h2><p>${group.intro}</p>
      <ul class="guide-links">${group.links.map(([label, url]) => `<li><a href="${url}">${label}</a></li>`).join("")}</ul>
    </section>`).join("")}</div>`),
  home: `<div class="page parent-page" data-server-rendered-public-content>
    <section class="studio"><div class="shell">
      <div class="studio-intro"><h1>Ruang untuk<br><em>usaha Anda.</em></h1><p>Urus kasir dan stok, teruskan pesanan ke dapur, atau buat situs agar pelanggan bisa menemukan usaha Anda.</p></div>
      <div class="studio-exhibit">
        <figure class="studio-art"><img src="/assets/scenes/tiga-ruang.webp" alt="Ilustrasi tiga ruang kerja: kasir toko, dapur restoran, dan studio situs bisnis" fetchpriority="high"><span class="room-shade room-retail" aria-hidden="true"></span><span class="room-shade room-kitchen" aria-hidden="true"></span><span class="room-shade room-web" aria-hidden="true"></span></figure>
        <nav class="studio-choices" aria-label="Pilih kebutuhan usaha">${choices}</nav>
      </div>
    </div></section>
    <section class="shell parent-section"><div class="parent-section-heading"><h2>Pilih sistem sesuai usaha Anda.</h2><a href="/produk">Lihat semua produk</a></div>${productCatalog()}</section>
    <section class="shell parent-section parent-partnership"><div><span class="eyebrow">Program Afiliasi</span><h2>Bantu pelaku usaha menemukan aplikasi yang tepat.</h2></div><a class="button" href="/affiliate-program">Kenali Program Afiliasi</a></section>
  </div>`,
  produk: `<div class="page parent-page" data-server-rendered-public-content><section class="studio parent-catalog-intro"><div class="shell studio-intro"><h1>Aplikasi untuk<br><em>pekerjaan sehari-hari.</em></h1><p>Pilih sesuai kebutuhan usaha dan lihat cara kerja aplikasinya.</p></div></section>
    <section class="shell parent-section"><h2>Tersedia sekarang</h2>${productCatalog(true)}</section>
    <section class="shell parent-section"><h2>Segera hadir</h2>${upcomingCatalog}</section>
  </div>`,
};
