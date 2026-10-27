// Runs before the first paint: apply the saved theme and sidebar state so the page doesn't flash.
try{var t=JSON.parse(localStorage.getItem("scor.theme"));document.documentElement.dataset.theme=t||(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");if(JSON.parse(localStorage.getItem("scor.sidebar")))document.documentElement.classList.add("nav-collapsed")}catch(e){}
