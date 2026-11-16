function openLoginFromLink() {
  const login = document.getElementById('masuk');
  if (location.hash === '#masuk' && login instanceof HTMLDetailsElement) login.open = true;
}
openLoginFromLink();
window.addEventListener('hashchange', openLoginFromLink);

document.querySelectorAll('[data-copy-for]').forEach(button => {
  const input = document.getElementById(button.dataset.copyFor);
  const status = button.parentElement.nextElementSibling;
  if (!(input instanceof HTMLInputElement) || !status) return;
  button.hidden = false;
  button.addEventListener('click', async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(input.value);
      status.textContent = 'Berhasil disalin.';
    } catch {
      input.focus();
      input.select();
      status.textContent = 'Teks dipilih. Silakan salin secara manual.';
    }
  });
});
