// Runs before the first paint: apply the saved theme and sidebar state so the page doesn't flash.
try{var t=JSON.parse(localStorage.getItem("scor.theme"));document.documentElement.dataset.theme=t||(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");if(JSON.parse(localStorage.getItem("scor.sidebar")))document.documentElement.classList.add("nav-collapsed")}catch(e){}
// Refuse to run inside another site's frame (clickjacking). GitHub Pages can't send the
// frame-ancestors header, so hide the page and break out to a top-level window instead.
if(self!==top){document.documentElement.style.display="none";try{top.location.href=location.href}catch(e){}}
