(() => {
  'use strict';
  const section = document.querySelector('[data-geraina-videos], [data-dapuros-videos]');
  if (!section) return;
  const video = section.querySelector('video');
  const status = section.querySelector('[data-video-status]');
  const error = section.querySelector('[data-video-error]');
  const play = section.querySelector('[data-video-play]');
  video.addEventListener('error', () => { error.hidden = false; status.textContent = ''; play.hidden = false; });
  video.addEventListener('play', () => { play.hidden = true; video.controls = true; });
  video.addEventListener('playing', () => { error.hidden = true; status.textContent = ''; });
  video.controls = false;play.hidden = false;
  play.addEventListener('click', () => {
    if (video.error) video.load();
    video.controls = true;play.hidden = true;status.textContent = 'Memuat video…';
    video.play().catch(() => { error.hidden = false;play.hidden = false;status.textContent = ''; });
  });
  // Do not keep narration playing after the visitor leaves this browser tab.
  document.addEventListener('visibilitychange', () => { if (document.hidden) video.pause(); });
})();
