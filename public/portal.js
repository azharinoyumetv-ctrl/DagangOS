import { parentPages, products } from "./parent-portal.js?v=guided-pages";

const route = location.pathname.replace(/^\/|\/$/g, "") || "home";
const marquee = `<div class="marquee"><div class="marquee-track">${[...products, ...products].map((product) => `<span>${product.name}${product.status === "coming-soon" ? " · Segera hadir" : ""}</span>`).join("")}</div></div>`;
const cta = `<section class="shell cta-band reveal"><h2>Temukan sistem yang cocok dengan cara bisnis Anda bekerja.</h2><a class="button" href="/produk">Jelajahi ekosistem <span>↗</span></a></section>`;
const pages = {
  tentang: `<div class="page"><section class="shell page-hero"><span class="eyebrow">Tentang DagangOS</span><h1>Membangun sistem dari<br><em>kebutuhan operasional.</em></h1><p>DagangOS adalah ekosistem produk digital milik PT DagangOS Digital Indonesia. Setiap produk dibentuk untuk konteks bisnis yang spesifik.</p></section>${marquee}<section class="shell chapter"><div class="timeline"><article class="reveal"><small>PRINSIP 01</small><h2>Produk harus punya fokus.</h2><p>Geraina POS berfokus pada retail. DapurOS berfokus pada restoran dan F&B. Identitas produk mengikuti pekerjaan yang dilayani.</p></article><article class="reveal"><small>PRINSIP 02</small><h2>Keluarga tidak berarti seragam.</h2><p>Struktur, kualitas interaksi, dan fondasi visual tetap konsisten, sementara warna, suasana, dan simulasi mempertahankan karakter produk.</p></article><article class="reveal"><small>PRINSIP 03</small><h2>Kejujuran sebelum promosi.</h2><p>Situs ini tidak menampilkan jumlah pengguna, mitra, testimonial, atau klaim performa yang belum didukung bukti.</p></article></div></section>${cta}</div>`,
};

const app = document.getElementById("app");
// Contact and legal documents are rendered by the Worker and remain readable without JavaScript.
if (pages[route]) app.innerHTML = pages[route];
else if (!app.querySelector("[data-server-rendered-public-content]")) app.innerHTML = parentPages[route] || parentPages.home;
document.querySelector(`[data-route="${route}"]`)?.setAttribute("aria-current", "page");
if (pages[route]) document.title = route === "home" ? "DagangOS — Ekosistem Operasional Bisnis" : `${route.replace("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())} — DagangOS`;

const toggle = document.querySelector(".nav-toggle");
const nav = document.querySelector(".main-nav");
toggle?.addEventListener("click", () => {
  const open = nav.classList.toggle("is-open");
  toggle.setAttribute("aria-expanded", String(open));
});

document.querySelectorAll(".reveal").forEach((element) => {
  const observer = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) {
      element.classList.add("is-visible");
      observer.disconnect();
    }
  }, { threshold: 0.12 });
  observer.observe(element);
});
