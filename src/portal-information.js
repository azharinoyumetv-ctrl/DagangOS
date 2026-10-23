const company = 'PT DagangOS Digital Indonesia';
const email = '<a href="mailto:contact@dagangos.com">contact@dagangos.com</a>';
const legalPages = [
  ['/syarat-ketentuan', 'Syarat &amp; Ketentuan'],
  ['/kebijakan-privasi', 'Kebijakan Privasi'],
  ['/kebijakan-refund', 'Refund &amp; Pembatalan'],
];

function legalDocument(pathname, title, description, content) {
  return {
    title: `${title} — DagangOS`,
    description,
    content: `<span class="eyebrow">Informasi legal</span><h1>${title}</h1><p>${description}</p>`,
    details: `<nav class="shell legal-nav" aria-label="Dokumen legal">${legalPages.map(([href, label]) => `<a href="${href}"${href === pathname ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav>
      <article class="shell information-prose">${content}
        <section><h2>Kontak</h2><p>Pertanyaan mengenai kebijakan ini dapat dikirim ke ${email}.</p><p><strong>${company}</strong><br>Subang, Jawa Barat, Indonesia</p><a href="/kontak">Lihat semua kanal kontak resmi ↗</a></section>
      </article>`,
  };
}

export const portalInformationDocuments = {
  '/kontak': {
    title: 'Kontak — DagangOS',
    description: 'Hubungi PT DagangOS Digital Indonesia melalui email atau WhatsApp untuk informasi produk, dukungan, dan kerja sama.',
    content: '<span class="eyebrow">Kontak resmi DagangOS</span><h1>Mari bicara tentang<br><em>kebutuhan bisnis Anda.</em></h1><p>Informasi produk, dukungan layanan, atau kerja sama. Hubungi tim kami melalui kanal resmi berikut.</p>',
    details: `<section class="shell contact-grid" aria-label="Kanal kontak resmi">
      <a class="contact-card" href="mailto:contact@dagangos.com"><span class="eyebrow">Email</span><h2>contact@dagangos.com</h2><p>Pertanyaan produk, dukungan, dan kerja sama.</p><span class="contact-action">Kirim email ↗</span></a>
      <a class="contact-card" href="https://wa.me/628999155182"><span class="eyebrow">WhatsApp</span><h2>+62 899 9155 182</h2><p>Bicarakan kebutuhan bisnis Anda dengan tim kami.</p><span class="contact-action">Buka WhatsApp ↗</span></a>
      <div class="contact-card"><span class="eyebrow">Identitas perusahaan</span><h2>${company}</h2><address>Subang, Jawa Barat, Indonesia</address></div>
    </section>
    <section class="shell information-links"><h2>Temukan layanan yang Anda butuhkan.</h2><div class="information-link-list"><a href="/geraina">Geraina POS <span>Retail ↗</span></a><a href="/dapuros">DapurOS <span>Restoran &amp; F&amp;B ↗</span></a><a href="https://wmp.dagangos.com/">DagangOS Web <span>Website &amp; platform ↗</span></a></div></section>
    <section class="shell information-links"><h2>Informasi legal</h2><p>Pelajari ketentuan layanan, penggunaan data pribadi, dan kebijakan pembatalan kami.</p><nav class="legal-nav" aria-label="Dokumen legal">${legalPages.map(([href, label]) => `<a href="${href}">${label} ↗</a>`).join('')}</nav></section>`,
  },
  '/syarat-ketentuan': legalDocument(
    '/syarat-ketentuan',
    'Syarat dan Ketentuan',
    'Ketentuan penggunaan situs dan layanan dalam ekosistem PT DagangOS Digital Indonesia.',
    `<p>Situs dagangos.com memperkenalkan ekosistem produk dan layanan ${company} ("DagangOS" atau "kami"), termasuk Geraina POS, DapurOS, dan DagangOS Web. Dengan menggunakan situs atau memesan layanan, Anda menyetujui ketentuan yang berlaku untuk layanan tersebut.</p>
    <section><h2>1. Layanan dan ruang lingkup</h2><p>Fitur, harga, periode langganan, hasil kerja, jadwal, dan cakupan dukungan mengikuti paket, pesanan, proposal, atau ruang lingkup kerja yang disetujui. Permintaan di luar cakupan tersebut dapat memerlukan persetujuan tertulis dan biaya tambahan.</p><p>Ketentuan khusus produk atau perjanjian tertulis berlaku untuk layanan terkait. Untuk proyek website dan platform, baca juga <a href="https://wmp.dagangos.com/id/site/terms">ketentuan DagangOS Web</a>.</p></section>
    <section><h2>2. Tanggung jawab pengguna</h2><p>Anda wajib memberikan informasi yang akurat, menjaga keamanan akun dan kredensial, serta memiliki hak dan izin atas konten, data, domain, dan materi yang Anda berikan. Layanan tidak boleh digunakan untuk kegiatan melanggar hukum, penyalahgunaan, atau tindakan yang mengganggu keamanan sistem.</p></section>
    <section><h2>3. Biaya dan pembayaran</h2><p>Biaya, pajak, tahap pembayaran, serta periode bulanan atau tahunan mengikuti paket, proposal, atau invoice terkait. Biaya pihak ketiga dan pemeliharaan opsional hanya termasuk apabila disebutkan secara tegas. Keterlambatan pembayaran dapat mengakibatkan pembatasan akses atau penundaan pekerjaan sesuai ketentuan layanan.</p><p>Pembatalan dan pengembalian dana mengikuti <a href="/kebijakan-refund">Kebijakan Refund dan Pembatalan</a>.</p></section>
    <section><h2>4. Data dan hak perangkat lunak</h2><p>Anda tetap memiliki data bisnis dan materi yang Anda berikan. Hak penggunaan perangkat lunak, hasil proyek, infrastruktur, serta pengalihan kode sumber mengikuti paket atau perjanjian tertulis terkait. DagangOS tetap memiliki kode sumber, template, metode, dan kekayaan intelektualnya kecuali disepakati lain secara tertulis.</p></section>
    <section><h2>5. Layanan pihak ketiga</h2><p>Integrasi pembayaran, hosting, domain, komunikasi, dan AI bergantung pada penyedia masing-masing. Penggunaan layanan tersebut tunduk pada ketentuan, biaya, kebijakan privasi, dan ketersediaan penyedia terkait. Akun dan kredensial pihak ketiga yang Anda kelola menjadi tanggung jawab Anda.</p></section>
    <section><h2>6. Keamanan, ketersediaan, dan kerahasiaan</h2><p>Kami menggunakan langkah yang wajar untuk menjaga keamanan dan keandalan layanan. Tidak ada layanan online yang selalu tanpa gangguan atau risiko. Kewajiban pencadangan dan dukungan mengikuti perjanjian layanan. Informasi bisnis nonpublik digunakan untuk menjalankan layanan yang disepakati dan dilindungi dengan kehati-hatian yang wajar.</p></section>
    <section><h2>7. Batasan tanggung jawab dan penghentian</h2><p>Sejauh diizinkan hukum yang berlaku, DagangOS tidak bertanggung jawab atas kerugian tidak langsung, insidental, konsekuensial, atau kehilangan keuntungan akibat penggunaan layanan atau sistem pihak ketiga. Akses dapat ditangguhkan untuk melindungi keamanan, mematuhi hukum, atau menangani pelanggaran material dan pembayaran yang terlambat.</p><p>Pengakhiran layanan mengikuti paket atau perjanjian yang disetujui. Kewajiban pembayaran, kerahasiaan, kepemilikan, dan batasan tanggung jawab tetap berlaku setelah penghentian.</p></section>
    <section><h2>8. Perubahan ketentuan</h2><p>Ketentuan situs dapat diperbarui untuk penggunaan di masa mendatang. Ketentuan material proyek tetap mengikuti proposal atau perjanjian yang telah disetujui.</p></section>`,
  ),
  '/kebijakan-privasi': legalDocument(
    '/kebijakan-privasi',
    'Kebijakan Privasi',
    'Cara DagangOS menangani data pribadi dari pengunjung situs, pertanyaan produk, dan layanan terkait.',
    `<p>${company} menghormati privasi Anda. Kebijakan ini menjelaskan penanganan data pribadi melalui situs dagangos.com dan komunikasi terkait produk kami. Penggunaan produk juga mengikuti kebijakan yang berlaku pada layanan tersebut, termasuk <a href="https://wmp.dagangos.com/id/site/privacy">Kebijakan Privasi DagangOS Web</a>.</p>
    <section><h2>1. Data yang kami kumpulkan</h2><p>Kami dapat menerima nama, email, nomor telepon, informasi bisnis, kebutuhan layanan, isi percakapan atau pertanyaan dukungan, serta informasi penagihan yang Anda berikan. Informasi teknis dapat mencakup alamat IP, perangkat, browser, sesi, dan peristiwa keamanan.</p></section>
    <section><h2>2. Penggunaan data</h2><p>Data digunakan untuk menanggapi pertanyaan, menyiapkan proposal, menyediakan dan mendukung layanan, memproses pembayaran yang disepakati, menjaga keamanan, mencegah penyalahgunaan, meningkatkan situs, dan memenuhi kewajiban hukum.</p></section>
    <section><h2>3. Pembagian data dan penyedia layanan</h2><p>Kami dapat membagikan data kepada penyedia yang membantu menjalankan situs dan layanan, penyedia integrasi yang Anda minta, atau apabila diwajibkan hukum. Kami tidak menjual data pribadi.</p><p>Penyedia hosting, pembayaran, komunikasi, analitik, dan AI dapat memproses data sesuai ketentuan mereka, termasuk di negara tempat mereka beroperasi, dengan perlindungan yang sesuai apabila diwajibkan hukum. Pertanyaan yang dikirim melalui chat dukungan dapat diproses oleh penyedia layanan AI; hindari mengirim kata sandi, API key, atau informasi pembayaran sensitif melalui chat.</p></section>
    <section><h2>4. Keamanan dan penyimpanan</h2><p>Kami menggunakan langkah teknis dan organisasi yang wajar untuk melindungi data. Informasi disimpan selama diperlukan untuk tujuan layanan, menjalankan kerja sama, menyelesaikan sengketa, serta memenuhi kewajiban hukum dan akuntansi.</p></section>
    <section><h2>5. Pilihan dan hak Anda</h2><p>Sesuai hukum yang berlaku, Anda dapat meminta akses, koreksi, penghapusan, atau pembatasan penggunaan data, serta menarik persetujuan jika pemrosesan didasarkan pada persetujuan. Kirim permintaan ke ${email}. Kami mungkin perlu memverifikasi identitas Anda sebelum memprosesnya.</p></section>
    <section><h2>6. Cookie dan teknologi serupa</h2><p>Situs dan produk kami dapat menggunakan cookie atau penyimpanan browser untuk sesi, keamanan, preferensi, dan operasi dasar. Anda dapat mengelolanya melalui pengaturan browser; menonaktifkan teknologi yang esensial dapat memengaruhi fungsi layanan.</p></section>
    <section><h2>7. Anak-anak dan pembaruan kebijakan</h2><p>Layanan kami tidak ditujukan untuk anak-anak. Jangan memberikan data pribadi anak kecuali Anda berwenang dan data tersebut diperlukan untuk layanan yang disepakati. Kebijakan ini dapat diperbarui dari waktu ke waktu.</p></section>`,
  ),
  '/kebijakan-refund': legalDocument(
    '/kebijakan-refund',
    'Kebijakan Refund dan Pembatalan',
    'Ketentuan pembatalan dan evaluasi pengembalian dana untuk layanan dan proyek DagangOS.',
    `<p>Kebijakan ini mengikuti <a href="https://wmp.dagangos.com/id/site/refund">kebijakan refund DagangOS</a> untuk layanan B2B SaaS, implementasi, website, dan pengembangan khusus. Jika proposal atau kontrak memuat ketentuan yang lebih spesifik, ketentuan tertulis tersebut berlaku untuk proyek terkait.</p>
    <section><h2>1. Refund yang memenuhi syarat</h2><p>Refund dievaluasi per kasus dan pada umumnya hanya dapat diberikan apabila DagangOS gagal menyerahkan layanan yang telah disepakati dalam ruang lingkup tertulis.</p></section>
    <section><h2>2. Website dan software</h2><p>Deposit tidak dapat dikembalikan setelah pekerjaan pengembangan dimulai. Jika proyek dibatalkan sebelum coding atau setup dimulai, refund sebagian dapat diberikan setelah dikurangi biaya discovery, desain, administrasi, dan komitmen pihak ketiga yang sudah terjadi. Pekerjaan yang telah diserahkan, diterima, atau disetujui pada suatu tahapan tidak dapat di-refund.</p></section>
    <section><h2>3. Langganan modul SaaS</h2><ul><li><strong>Bulanan:</strong> tidak ada refund prorata. Pelanggan dapat membatalkan agar tidak ditagihkan pada periode berikutnya.</li><li><strong>Tahunan:</strong> pembatalan dalam 14 hari pertama dapat dievaluasi untuk refund prorata setelah dikurangi biaya administrasi setara satu bulan.</li></ul></section>
    <section><h2>4. Infrastruktur dan pihak ketiga</h2><p>Biaya domain, VPS, database, lisensi, template, layanan cloud, verifikasi, nomor komunikasi, dan pembelian pihak ketiga tidak dapat dikembalikan oleh DagangOS setelah dipesan atau diaktifkan. Biaya payment gateway dan administrasi dapat dipotong apabila penyedia pembayaran tidak mengembalikannya.</p></section>
    <section><h2>5. Pemeliharaan dan pengembangan khusus</h2><p>Retainer pemeliharaan yang telah dibayar tidak dapat dikembalikan; layanan tetap tersedia sampai akhir siklus berjalan jika perjanjian diakhiri lebih awal. Pembayaran modul khusus, integrasi bespoke, atau paket enterprise tidak dapat dikembalikan setelah hasil melewati User Acceptance Testing (UAT), atau bila kegagalan disebabkan pelanggan tidak memberikan API key, aset, keputusan, atau feedback yang diperlukan.</p></section>
    <section><h2>6. Proyek tidak aktif dan kegagalan penyerahan</h2><p>Jika pelanggan tidak memberikan informasi, materi, persetujuan, atau feedback selama 30 hari kalender setelah pengingat tertulis, proyek dapat dinyatakan tidak aktif. Biaya pekerjaan dan komitmen pihak ketiga tetap terutang; pengaktifan kembali dapat memerlukan jadwal dan biaya baru.</p><p>Jika DagangOS tidak dapat menyerahkan ruang lingkup berbayar karena sebab dalam kendalinya, kami terlebih dahulu menawarkan perbaikan atau jadwal baru. Jika penyelesaian tetap tidak mungkin, refund dapat diberikan untuk bagian berbayar yang belum diserahkan.</p></section>
    <section><h2>7. Proses pembatalan dan waktu refund</h2><p>Kirim permintaan tertulis ke <a href="mailto:billing@dagangos.com">billing@dagangos.com</a> dengan identitas pelanggan, referensi proyek atau pembayaran, dan alasan permintaan. Pembatalan diterima setelah dikonfirmasi secara tertulis oleh DagangOS.</p><p>Refund yang disetujui diproses ke metode pembayaran asal dalam 14–21 hari kerja. Bank atau penyedia pembayaran dapat memerlukan waktu penyelesaian tambahan.</p></section>`,
  ),
};
