(() => {
  const links=[...document.querySelectorAll('[data-download-link]')];
  links.forEach(link=>link.addEventListener('click',event=>{if(link.getAttribute('aria-disabled')==='true')event.preventDefault();}));
  fetch('/downloads/geraina/latest.json',{cache:'no-cache'}).then(response=>{
    if(!response.ok)throw new Error('Release unavailable');return response.json();
  }).then(release=>{
    if(!/^\d+\.\d+\.\d+$/.test(release.version)||release.downloadUrl!==`/downloads/geraina/Geraina-POS-${release.version}.apk`||!/^[a-f0-9]{64}$/.test(release.sha256)||!Number.isSafeInteger(release.bytes)||release.bytes<=0)throw new Error('Invalid release metadata');
    if(!/^\d+(?:\.\d+)?$/.test(release.minimumAndroid))throw new Error('Invalid Android requirement');
    const size=release.bytes<1000000?`${Math.ceil(release.bytes/1024)} KB`:`${(release.bytes/1048576).toLocaleString('id-ID',{maximumFractionDigits:1})} MB`;
    links.forEach(link=>{link.href=release.downloadUrl;link.setAttribute('download',release.downloadUrl.split('/').pop());link.removeAttribute('aria-disabled');});
    document.querySelectorAll('[data-download-label]').forEach(label=>label.textContent='Unduh APK Android');
    document.querySelector('[data-release-meta]').textContent=`Versi ${release.version} · ${size} · Android ${release.minimumAndroid}+`;
    document.querySelector('[data-release-version]').textContent=`Versi ${release.version} · ${size}`;
    document.querySelector('[data-checksum]').textContent=release.sha256;
    document.querySelector('[data-download-status]').textContent='Unduhan langsung dari dagangos.com. Pembaruan tersedia melalui halaman ini.';
  }).catch(()=>{
    document.querySelectorAll('[data-download-label]').forEach(label=>label.textContent='Unduhan belum tersedia');
    const status=document.querySelector('[data-download-status]');status.classList.add('error');status.textContent='File belum dapat dimuat. Coba muat ulang halaman atau hubungi contact@dagangos.com.';
  });
})();
