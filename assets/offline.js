let registration;
export async function registerOffline() {
  if (!('serviceWorker' in navigator)) return;
  try {
    registration=await navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'});
    let applying=false;
    const apply=()=>{ if(!registration.waiting) return; applying=true; registration.waiting.postMessage({type:'SKIP_WAITING'}); };
    // A reload mid-question is jarring, so only update on its own when no quiz is on screen.
    const busy=()=>!!document.querySelector('#app .quiz');
    const offerUpdate=()=>{
      if(!registration.waiting || !navigator.serviceWorker.controller) return;
      if(!busy()) { apply(); return; }
      if(document.getElementById('site-update')) return;
      const button=document.createElement('button'); button.id='site-update';button.className='btn update-notice';button.textContent='Study site update available · Reload';
      button.onclick=apply;document.body.append(button);
    };
    offerUpdate();
    registration.addEventListener('updatefound',()=>registration.installing?.addEventListener('statechange',offerUpdate));
    addEventListener('hashchange',()=>setTimeout(offerUpdate,300));
    let reloading=false;
    navigator.serviceWorker.addEventListener('controllerchange',()=>{ if(!reloading && applying) { reloading=true;location.reload(); } });
  } catch { /* HTTP hosts without service-worker support can still study online. */ }
}
export function offlineHTML() {
  return `<section class="card offline"><h2>Study offline</h2><p>Visited pages are kept on this device. Download all chapters, flashcards and tests before going offline. Progress stays in this browser.</p><button class="btn" id="download-offline">Download all study data</button><p id="offline-status" role="status"></p></section>`;
}
export function wireOffline() {
  document.getElementById('download-offline').onclick=async e=>{
    const button=e.currentTarget, status=document.getElementById('offline-status');button.disabled=true; status.textContent='Downloading study data…';
    try {
      if(!('serviceWorker' in navigator)) throw new Error('Offline storage is unavailable in this browser.');
      await navigator.serviceWorker.ready;
      const worker=registration?.active || (await navigator.serviceWorker.getRegistration()).active;
      const channel=new MessageChannel();
      await new Promise((resolve,reject)=>{
        const timeout=setTimeout(()=>reject(new Error('Download timed out. Reconnect and try again.')),120000);
        channel.port1.onmessage=event=>{clearTimeout(timeout);channel.port1.close();event.data.ok ? resolve() : reject(new Error(event.data.error));};
        worker.postMessage({type:'DOWNLOAD_OFFLINE'},[channel.port2]);
      });
      status.textContent='All study data is ready offline on this device.';
    } catch(error) { status.textContent=error.message; }
    button.disabled=false;
  };
}
