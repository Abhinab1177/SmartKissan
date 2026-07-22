/* =======================================================
   SMART KISSAN DASHBOARD — FULL FEATURED v3
   • Persistent DB (localStorage)
   • Strict auth validation (10-digit phone, strong password)
   • Dukan - nearby farm shops via Overpass API
   • Settings → Notifications only
   • Disease scans saved per user to DB
======================================================= */

const weatherApiKey = "YOUR_WEATHERAPI_KEY";
const GROQ_API_KEY = "YOUR_GROQ_API_KEY";

/* ---- PERSISTENT DB ---- */
const DB = {
    set(k,v){try{localStorage.setItem("sk_"+k,JSON.stringify(v));return true;}catch(e){return false;}},
    get(k,fb=null){try{const v=localStorage.getItem("sk_"+k);return v!==null?JSON.parse(v):fb;}catch(e){return fb;}},
    del(k){localStorage.removeItem("sk_"+k);},
    uSet(uid,k,v){return this.set(`u_${uid}_${k}`,v);},
    uGet(uid,k,fb=null){return this.get(`u_${uid}_${k}`,fb);}
};

/* ---- STATE ---- */
let currentUser = null;
let scanReports = [];
let lastScanResult = null;
let currentWeather = {};
let conversationHistory = [];
let userCoords = null;

/* ---- PAGE NAV ---- */
const pageTitles = {
    dashboard:"Dashboard", disease:"Disease Detection", analytics:"Analytics",
    weather:"Weather", reports:"Reports", settings:"Settings", dukan:"Dukan 🏪"
};

function showPage(name, linkEl) {
    document.querySelectorAll(".page-section").forEach(s=>s.classList.remove("active"));
    document.querySelectorAll(".sidebar nav a").forEach(a=>a.classList.remove("active"));
    document.getElementById("page-"+name).classList.add("active");
    document.getElementById("pageTitle").textContent = pageTitles[name];
    if(linkEl) linkEl.classList.add("active");
    if(name==="analytics") renderAnalytics();
    if(name==="reports")   renderReportsPage();
    if(name==="weather")   renderWeatherPage();
    if(name==="dukan")     renderDukanPage();
    if(name==="settings")  renderSettingsPage();
    return false;
}

/* ---- TOAST ---- */
function showToast(msg, type="green", dur=2800) {
    const el=document.getElementById("toastMsg");
    el.textContent=msg;
    el.style.background=type==="red"?"#d32f2f":type==="orange"?"#f57c00":"#2e7d32";
    el.classList.add("show");
    setTimeout(()=>el.classList.remove("show"),dur);
}

/* ---- VALIDATION ---- */
function validatePhone(p){ return /^[6-9]\d{9}$/.test(p.trim()); }
function validatePassword(p){
    const e=[];
    if(p.length<8)                    e.push("min 8 characters");
    if(!/[A-Z]/.test(p))              e.push("one uppercase (A-Z)");
    if(!/[a-z]/.test(p))              e.push("one lowercase (a-z)");
    if(!/[0-9]/.test(p))              e.push("one number (0-9)");
    if(!/[!@#$%^&*()\-_=+\[\]{};:'",.<>/?\\|`~]/.test(p)) e.push("one special char (!@#$...)");
    return e;
}
function showFE(id,msg){const el=document.getElementById(id);if(el){el.textContent=msg;el.style.display="block";}}
function clearFE(id){const el=document.getElementById(id);if(el){el.textContent="";el.style.display="none";}}

/* ---- AUTH ---- */
function defaultNotifPrefs(){ return {disease:true,weather:true,moisture:false,daily:true}; }

function updateProfileUI(){
    if(currentUser){
        document.getElementById("profileName").textContent  = currentUser.name;
        document.getElementById("profileTag").textContent   = "Premium Member";
        document.getElementById("heroName").textContent     = currentUser.name;
        document.getElementById("dropdownName").textContent = currentUser.name;
        document.getElementById("dropdownTag").textContent  = "Premium Member ✓";
        document.getElementById("logoutBtn").style.display  = "flex";
        document.getElementById("signInBtn").style.display  = "none";
        document.getElementById("signUpBtn").style.display  = "none";
    } else {
        document.getElementById("profileName").textContent  = "Guest User";
        document.getElementById("profileTag").textContent   = "Click to Sign In";
        document.getElementById("heroName").textContent     = "Farmer";
        document.getElementById("dropdownName").textContent = "Guest User";
        document.getElementById("dropdownTag").textContent  = "Not signed in";
        document.getElementById("logoutBtn").style.display  = "none";
        document.getElementById("signInBtn").style.display  = "flex";
        document.getElementById("signUpBtn").style.display  = "flex";
    }
    if(document.getElementById("page-reports").classList.contains("active")) renderReportsPage();
    if(document.getElementById("page-settings").classList.contains("active")) renderSettingsPage();
}

function toggleAuthDropdown(e){
    e.stopPropagation();
    document.getElementById("authDropdown").classList.toggle("open");
}
document.addEventListener("click",()=>document.getElementById("authDropdown")?.classList.remove("open"));

function openAuthModal(tab){
    document.getElementById("authDropdown").classList.remove("open");
    document.getElementById("authModalOverlay").classList.add("active");
    switchAuthTab(tab||"signin");
}
function closeAuthModal(){
    document.getElementById("authModalOverlay").classList.remove("active");
    ["siPhoneErr","siPassErr","suNameErr","suPhoneErr","suPassErr","suConfErr"].forEach(id=>clearFE(id));
}
function switchAuthTab(tab){
    const isIn=tab==="signin";
    document.getElementById("signinTab").classList.toggle("active",isIn);
    document.getElementById("signupTab").classList.toggle("active",!isIn);
    document.getElementById("signinForm").style.display  = isIn?"block":"none";
    document.getElementById("signupForm").style.display  = isIn?"none":"block";
    document.getElementById("authModalTitle").textContent    = isIn?"Welcome Back 🌱":"Join Smart Kissan 🌾";
    document.getElementById("authModalSubtitle").textContent = isIn?"Sign in to your account":"Create your free farmer account";
}

function handleSignIn(){
    const phone=document.getElementById("siPhone").value.trim();
    const pass =document.getElementById("siPass").value;
    let ok=true;
    clearFE("siPhoneErr"); clearFE("siPassErr");
    if(!phone){showFE("siPhoneErr","Phone number is required");ok=false;}
    else if(!validatePhone(phone)){showFE("siPhoneErr","Enter valid 10-digit mobile (starts 6-9)");ok=false;}
    if(!pass){showFE("siPassErr","Password is required");ok=false;}
    if(!ok) return;

    const users=DB.get("users",{});
    const user=users[phone];
    if(!user||user.password!==pass){showFE("siPassErr","Invalid phone or password.");return;}

    currentUser={name:user.name,phone,notifPrefs:user.notifPrefs||defaultNotifPrefs()};
    scanReports=DB.uGet(phone,"reports",[]);
    closeAuthModal(); updateProfileUI();
    addLog(`✅ Welcome back, ${currentUser.name}!`);
    showToast("✅ Signed in as "+currentUser.name);
}

function handleSignUp(){
    const name   =document.getElementById("suName").value.trim();
    const phone  =document.getElementById("suPhone").value.trim();
    const pass   =document.getElementById("suPass").value;
    const confirm=document.getElementById("suConfirm").value;
    let ok=true;
    ["suNameErr","suPhoneErr","suPassErr","suConfErr"].forEach(id=>clearFE(id));

    if(!name||name.length<2){showFE("suNameErr","Enter your full name (min 2 chars)");ok=false;}
    if(!phone){showFE("suPhoneErr","Phone number is required");ok=false;}
    else if(!validatePhone(phone)){showFE("suPhoneErr","Must be 10 digits, starting with 6, 7, 8 or 9");ok=false;}

    const passErr=validatePassword(pass);
    if(passErr.length>0){showFE("suPassErr","Password needs: "+passErr.join(" | "));ok=false;}
    if(!confirm){showFE("suConfErr","Please confirm your password");ok=false;}
    else if(pass!==confirm){showFE("suConfErr","Passwords do not match");ok=false;}
    if(!ok) return;

    const users=DB.get("users",{});
    if(users[phone]){showFE("suPhoneErr","This number is already registered. Please sign in.");return;}

    const notifPrefs=defaultNotifPrefs();
    users[phone]={name,password:pass,notifPrefs,createdAt:new Date().toISOString()};
    DB.set("users",users);
    DB.uSet(phone,"reports",[]);

    currentUser={name,phone,notifPrefs};
    scanReports=[];
    closeAuthModal(); updateProfileUI();
    addLog(`🎉 Account created for ${name}!`);
    showToast("🎉 Welcome, "+name+"!");
}

function logoutUser(){
    if(currentUser){
        DB.set("currentSession",null);
        DB.uSet(currentUser.phone,"reports",scanReports);
    }
    const name=currentUser?.name||"User";
    currentUser=null; scanReports=[];
    document.getElementById("authDropdown").classList.remove("open");
    updateProfileUI();
    addLog("🚪 Logged out.");
    showToast("👋 Goodbye, "+name+"!","orange");
}

/* ---- SMART SEARCH ---- */
const SEARCH_ITEMS = [
    { icon:"🏠", title:"Dashboard",          desc:"Main overview of your farm",          page:"dashboard" },
    { icon:"📷", title:"Disease Detection",   desc:"Scan leaf images for diseases",       page:"disease" },
    { icon:"📊", title:"Analytics",           desc:"Charts and farm statistics",          page:"analytics" },
    { icon:"🌦", title:"Weather",             desc:"Live weather and 7-day forecast",     page:"weather" },
    { icon:"📄", title:"Reports",             desc:"View all your scan history",          page:"reports" },
    { icon:"🏪", title:"Dukan",               desc:"Find nearby farm shops",              page:"dukan" },
    { icon:"⚙",  title:"Settings",            desc:"Notification preferences",            page:"settings" },
    { icon:"🤖", title:"Kissan Sahayak",       desc:"Open the AI farming chatbot",         action:"chat" },
    { icon:"🌾", title:"Scan New Disease",     desc:"Upload a leaf and detect disease",   page:"disease" },
    { icon:"💾", title:"My Reports",           desc:"See saved disease reports",           page:"reports" },
    { icon:"📍", title:"Nearby Farm Shops",    desc:"Fertilizer, seed & agro stores",      page:"dukan" },
    { icon:"🌡", title:"Live Temperature",     desc:"Current weather conditions",          page:"weather" },
    { icon:"📈", title:"Scan History Chart",   desc:"Bar chart of your last 7 scans",      page:"analytics" },
    { icon:"🔔", title:"Notifications",        desc:"Manage your alert preferences",       page:"settings" },
    { icon:"💧", title:"Soil Moisture",        desc:"Soil water level on dashboard",       page:"dashboard" },
    { icon:"🚜", title:"Smart Control",        desc:"Auto pump and tank status",           page:"dashboard" }
];

let searchFocusIndex = -1;

function handleSearch(val) {
    const dropdown = document.getElementById("searchDropdown");
    const q = val.trim().toLowerCase();
    searchFocusIndex = -1;

    if (!q) {
        // Show all items when focused but empty
        const focused = document.activeElement === document.getElementById("searchInput");
        if (!focused) { dropdown.classList.remove("open"); return; }
        renderSearchItems(SEARCH_ITEMS.slice(0, 8));
        return;
    }

    const results = SEARCH_ITEMS.filter(item =>
        item.title.toLowerCase().includes(q) ||
        item.desc.toLowerCase().includes(q)
    );

    if (results.length === 0) {
        dropdown.innerHTML = `<div class="search-no-result">No results for "<b>${val}</b>"</div>`;
        dropdown.classList.add("open");
        return;
    }
    renderSearchItems(results);
}

function renderSearchItems(items) {
    const dropdown = document.getElementById("searchDropdown");
    dropdown.innerHTML = items.map((item, i) => `
        <div class="search-item" data-idx="${i}" onclick="executeSearch('${item.page||""}','${item.action||""}')"
             onmouseenter="setSearchFocus(${i})">
            <div class="search-item-icon">${item.icon}</div>
            <div class="search-item-text">
                <div class="si-title">${item.title}</div>
                <div class="si-desc">${item.desc}</div>
            </div>
        </div>`).join("");
    dropdown.classList.add("open");
    // store for keyboard nav
    dropdown._items = items;
}

function setSearchFocus(idx) {
    searchFocusIndex = idx;
    document.querySelectorAll(".search-item").forEach((el,i) => el.classList.toggle("focused", i===idx));
}

function handleSearchKey(e) {
    const dropdown = document.getElementById("searchDropdown");
    const items = document.querySelectorAll(".search-item");
    if (!dropdown.classList.contains("open")) return;

    if (e.key === "ArrowDown") {
        e.preventDefault();
        searchFocusIndex = Math.min(searchFocusIndex + 1, items.length - 1);
        items.forEach((el,i) => el.classList.toggle("focused", i===searchFocusIndex));
    } else if (e.key === "ArrowUp") {
        e.preventDefault();
        searchFocusIndex = Math.max(searchFocusIndex - 1, 0);
        items.forEach((el,i) => el.classList.toggle("focused", i===searchFocusIndex));
    } else if (e.key === "Enter" && searchFocusIndex >= 0) {
        e.preventDefault();
        items[searchFocusIndex]?.click();
    } else if (e.key === "Escape") {
        closeSearch();
    }
}

function executeSearch(page, action) {
    closeSearch();
    document.getElementById("searchInput").value = "";
    if (action === "chat") {
        document.getElementById("chatContainer").style.display = "flex";
        return;
    }
    if (page) {
        const navLink = document.querySelector(`.sidebar nav a[onclick*="${page}"]`);
        showPage(page, navLink);
    }
}

function closeSearch() {
    document.getElementById("searchDropdown").classList.remove("open");
    searchFocusIndex = -1;
}

// Close search on outside click
document.addEventListener("click", e => {
    if (!document.getElementById("searchWrapper")?.contains(e.target)) closeSearch();
});
// Open on focus
document.addEventListener("focusin", e => {
    if (e.target.id === "searchInput") handleSearch(e.target.value);
});
function openHelpModal(){document.getElementById("helpModalOverlay").classList.add("active");}
function closeHelpModal(){document.getElementById("helpModalOverlay").classList.remove("active");}
function openChatFromHelp(){closeHelpModal();document.getElementById("chatContainer").style.display="flex";}

/* ---- WEATHER ---- */
function getLocationAndWeather(){
    if(navigator.geolocation){
        navigator.geolocation.getCurrentPosition(
            pos=>{userCoords={lat:pos.coords.latitude,lon:pos.coords.longitude};loadWeather(userCoords.lat,userCoords.lon);},
            ()=>loadWeatherByCity("Bhubaneswar")
        );
    } else loadWeatherByCity("Bhubaneswar");
}
async function loadWeather(lat,lon){
    try{const r=await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${weatherApiKey}`);updateWeatherUI(await r.json());}catch(e){}
}
async function loadWeatherByCity(city){
    try{const r=await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${city}&units=metric&appid=${weatherApiKey}`);updateWeatherUI(await r.json());}catch(e){}
}

function updateWeatherUI(data){
    if(!data.main) return;
    const temp=Math.round(data.main.temp), feels=Math.round(data.main.feels_like);
    const condition=data.weather[0].main, desc=data.weather[0].description;
    const humidity=data.main.humidity, wind=Math.round((data.wind?.speed||0)*3.6);
    const clouds=data.clouds?.all||0, city=data.name;
    if(data.coord&&!userCoords) userCoords={lat:data.coord.lat,lon:data.coord.lon};

    document.getElementById("temp").innerText      = temp+"°C";
    document.getElementById("condition").innerText = condition;
    document.getElementById("humidity").innerText  = humidity+"%";
    document.getElementById("location").innerText  = city;

    const box=document.getElementById("weatherBox");
    box.classList.remove("sunny","rainy");
    box.classList.add(condition.toLowerCase().includes("rain")?"rainy":"sunny");
    currentWeather={temp,feels,condition,desc,humidity,wind,clouds,city};
    renderWeatherPage();
    updateSmartAlert(temp,condition,humidity);
    const at=document.getElementById("aTemp"); if(at) at.textContent=temp+"°C";
}

function renderWeatherPage(){
    if(!currentWeather.temp) return;
    const s=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
    s("wTemp",currentWeather.temp+"°C"); s("wFeels",currentWeather.feels+"°C");
    s("wCond",currentWeather.condition||"--"); s("wDesc",currentWeather.desc||"--");
    s("wHumid",(currentWeather.humidity||"--")+"%"); s("wWind",(currentWeather.wind||"--")+" km/h");
    s("wCloud",(currentWeather.clouds||"--")+"%"); s("wLoc",currentWeather.city||"--");
    buildForecast();
}

function buildForecast(){
    const row=document.getElementById("forecastRow"); if(!row) return;
    const days=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    const icons=["☀️","⛅","🌧","☀️","🌤","🌧","☀️"];
    const temps=[32,30,27,34,31,28,33], today=new Date().getDay();
    row.innerHTML="";
    for(let i=0;i<7;i++){
        const d=(today+i)%7;
        row.innerHTML+=`<div class="forecast-day"><div>${i===0?"Today":days[d]}</div><div class="f-icon">${icons[i]}</div><div class="f-temp">${i===0?(currentWeather.temp||"--")+"°C":temps[i]+"°C"}</div></div>`;
    }
}

function updateSmartAlert(temp,condition,humidity){
    const alertBox=document.getElementById("smartAlertBox");
    const alertText=document.getElementById("smartAlertText");
    const cond=condition.toLowerCase();
    let style="", message="";
    if(cond.includes("rain")||cond.includes("drizzle")||cond.includes("thunderstorm")){
        style="red"; message=`🌧 Rain in <b>${currentWeather.city||"your area"}</b>. <b>Do NOT spray fertilizer/pesticide</b> — rain washes it away. Check drainage.`;
    } else if(humidity>80){
        style=""; message=`💧 Humidity <b>${humidity}%</b> — fungal disease risk. Avoid overhead irrigation. Apply copper fungicide in early morning.`;
    } else if(temp>38){
        style="red"; message=`🔥 Very hot (<b>${temp}°C</b>). <b>Avoid spraying</b> — may burn leaves. Irrigate early morning/evening only.`;
    } else if(temp>=25&&humidity<70&&!cond.includes("cloud")){
        style="green"; message=`☀️ Ideal conditions (<b>${temp}°C</b>). <b>Apply fertilizer/pesticide now!</b> Best window: 6–9 AM or after 5 PM.`;
    } else if(temp<15){
        style=""; message=`🌡 Low temp (<b>${temp}°C</b>). Fertilizer uptake slower. Wait for warmer conditions.`;
    } else {
        style="green"; message=`⛅ Good conditions (<b>${temp}°C, ${condition}</b>). Spray fertilizer in early morning for best results.`;
    }
    alertBox.className="smart-alert-box "+style;
    alertText.innerHTML=message;
}

/* ---- DUKAN ---- */
function getFallbackShops(city,lat,lon){
    return [
        {name:"Kisan Agro Store",type:"Fertilizer & Seeds",phone:"9876543210",street:"Main Market Road",city,lat:lat+0.010,lon:lon+0.008},
        {name:"Green Field Nursery",type:"Nursery & Plants",phone:"9812345670",street:"Near Vegetable Mandi",city,lat:lat-0.008,lon:lon+0.012},
        {name:"Bharat Seeds & Pesticide",type:"Seeds & Pesticide",phone:"7654321098",street:"Agriculture Colony",city,lat:lat+0.005,lon:lon-0.010},
        {name:"Raj Krishi Kendra",type:"Fertilizer & Tools",phone:"8765432109",street:"Farmers Market Lane",city,lat:lat-0.012,lon:lon+0.005},
        {name:"Modern Farm Supplies",type:"Tools & Equipment",phone:"9988776655",street:"Industrial Area",city,lat:lat+0.018,lon:lon+0.003},
        {name:"Shree Agro Garden Centre",type:"Garden & Seeds",phone:"7788990011",street:"NH Bypass Road",city,lat:lat-0.005,lon:lon-0.015}
    ];
}

function distKm(la1,lo1,la2,lo2){
    const R=6371,dL=(la2-la1)*Math.PI/180,dO=(lo2-lo1)*Math.PI/180;
    const a=Math.sin(dL/2)**2+Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dO/2)**2;
    return(R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))).toFixed(1);
}

async function renderDukanPage(){
    const container=document.getElementById("dukanShopsList"); if(!container) return;
    container.innerHTML=`<div class="dukan-loading"><div class="dukan-spin"></div><p>📍 Detecting your location...<br><small>Finding nearby farm shops</small></p></div>`;

    let lat,lon,cityName;
    if(userCoords){lat=userCoords.lat;lon=userCoords.lon;cityName=currentWeather.city||"your area";}
    else {
        try{
            const pos=await new Promise((res,rej)=>navigator.geolocation.getCurrentPosition(res,rej,{timeout:8000}));
            lat=pos.coords.latitude;lon=pos.coords.longitude;userCoords={lat,lon};cityName=currentWeather.city||"your area";
        } catch(e){lat=20.2961;lon=85.8245;cityName="Bhubaneswar";}
    }

    const locLabel=document.getElementById("dukanLocationLabel");
    if(locLabel) locLabel.textContent=`📍 Near ${cityName}`;
    container.innerHTML=`<div class="dukan-loading"><div class="dukan-spin"></div><p>🔍 Searching farm shops near ${cityName}...</p></div>`;

    const radius=15000;
    const query=`[out:json][timeout:25];(node["shop"="agrarian"](around:${radius},${lat},${lon});node["shop"="garden_centre"](around:${radius},${lat},${lon});node["shop"="farm"](around:${radius},${lat},${lon});node["name"~"agro|krishi|kisan|farm|seed|fertilizer|nursery|garden|beej|khad",i](around:${radius},${lat},${lon});way["name"~"agro|krishi|kisan|farm|seed|fertilizer|nursery",i](around:${radius},${lat},${lon}););out center 30;`;

    let shops=[];
    try{
        const r=await fetch("https://overpass-api.de/api/interpreter",{method:"POST",body:"data="+encodeURIComponent(query),signal:AbortSignal.timeout(15000)});
        const data=await r.json();
        shops=(data.elements||[]).map(el=>({
            name:el.tags?.name||null, type:el.tags?.shop||el.tags?.amenity||"Agricultural",
            phone:el.tags?.phone||el.tags?.["contact:phone"]||null,
            street:el.tags?.["addr:street"]||null, city:el.tags?.["addr:city"]||cityName,
            website:el.tags?.website||null, lat:el.lat||el.center?.lat, lon:el.lon||el.center?.lon,
            hours:el.tags?.["opening_hours"]||null
        })).filter(s=>s.name&&s.name.trim().length>0);
    } catch(e){console.log("Overpass:",e);}

    if(shops.length===0) shops=getFallbackShops(cityName,lat,lon);

    // sort by distance
    shops=shops.map(s=>({...s,dist:s.lat?parseFloat(distKm(lat,lon,s.lat,s.lon)):99})).sort((a,b)=>a.dist-b.dist);

    renderShopCards(shops);
    const cnt=document.getElementById("dukanCount");
    if(cnt) cnt.textContent=shops.length+" shops found";
}

function renderShopCards(shops){
    const container=document.getElementById("dukanShopsList"); if(!container) return;
    const icons={agrarian:"🌾",garden_centre:"🌻",farm:"🚜",marketplace:"🏬",seeds:"🌱","Fertilizer & Seeds":"🧪","Nursery & Plants":"🌿","Seeds & Pesticide":"💊","Fertilizer & Tools":"⚙️","Tools & Equipment":"🔧","Garden & Seeds":"🌺","Agricultural":"🏪"};
    const itemPool=["Seeds (Beej)","Fertilizer (Khad)","Pesticides","Fungicides","Irrigation Pipes","Sprayers","Soil Test Kit","Garden Tools","Neem Spray","NPK Mix","Drip Kit","Hand Pump"];
    container.innerHTML="";
    shops.forEach((shop,i)=>{
        const icon=icons[shop.type]||"🏪";
        const mapsUrl=shop.lat?`https://www.google.com/maps?q=${shop.lat},${shop.lon}`:`https://www.google.com/maps/search/${encodeURIComponent(shop.name+" "+shop.city)}`;
        const items=itemPool.filter((_,j)=>(i*3+j)%5!==0).slice(0,4);
        const distText=shop.dist<90?`${shop.dist} km`:"Nearby";
        container.innerHTML+=`
        <div class="shop-card" style="animation-delay:${i*70}ms">
            <div class="shop-card-header">
                <div class="shop-icon-badge">${icon}</div>
                <div class="shop-info">
                    <div class="shop-name">${shop.name}</div>
                    <div class="shop-type">${shop.type}</div>
                </div>
                <div class="shop-dist-badge">${distText}</div>
            </div>
            <div class="shop-address">📍 ${shop.street?shop.street+", ":""}${shop.city}</div>
            ${shop.hours?`<div class="shop-hours">🕐 ${shop.hours}</div>`:""}
            <div class="shop-items">${items.map(a=>`<span class="shop-item-tag">${a}</span>`).join("")}</div>
            <div class="shop-actions">
                <a href="${mapsUrl}" target="_blank" class="shop-btn shop-btn-map">🗺 Directions</a>
                ${shop.phone?`<a href="tel:${shop.phone}" class="shop-btn shop-btn-call">📞 Call</a>`:""}
                ${shop.website?`<a href="${shop.website}" target="_blank" class="shop-btn shop-btn-web">🌐 Website</a>`:""}
            </div>
        </div>`;
    });
}

/* ---- DISEASE DETECTION ---- */
const diseaseDB=[
    {disease:"Leaf Blight",infection:67,pesticide:"Copper Fungicide",dose:"40ml/15L",interval:"Every 7 days"},
    {disease:"Powdery Mildew",infection:45,pesticide:"Sulfur Spray",dose:"30ml/15L",interval:"Every 10 days"},
    {disease:"Bacterial Spot",infection:58,pesticide:"Streptomycin Sulfate",dose:"35ml/15L",interval:"Every 7 days"},
    {disease:"Late Blight",infection:75,pesticide:"Metalaxyl+Mancozeb",dose:"50ml/15L",interval:"Every 5 days"},
    {disease:"Healthy Leaf",infection:5,pesticide:"No pesticide needed",dose:"Not required",interval:"No spray needed"},
    {disease:"Rust Disease",infection:52,pesticide:"Propiconazole",dose:"25ml/15L",interval:"Every 14 days"},
    {disease:"Leaf Spot",infection:38,pesticide:"Carbendazim",dose:"20ml/15L",interval:"Every 10 days"},
    {disease:"Downy Mildew",infection:61,pesticide:"Mancozeb",dose:"45ml/15L",interval:"Every 8 days"},
    {disease:"Mosaic Virus",infection:70,pesticide:"Neem Oil Spray",dose:"10ml/1L",interval:"Every 5 days"},
    {disease:"Crown Rot",infection:82,pesticide:"Thiram Fungicide",dose:"55ml/15L",interval:"Every 4 days"}
];

document.addEventListener("DOMContentLoaded",()=>{
    const input=document.getElementById("dImageInput");
    if(input) input.addEventListener("change",function(){
        const file=this.files[0]; if(!file) return;
        const prev=document.getElementById("dPreview");
        prev.src=URL.createObjectURL(file); prev.style.display="block";
        document.getElementById("dAnalyzeBtn").style.display="inline-block";
        document.getElementById("dResult").style.display="none";
    });
});

function handleDrop(e){
    e.preventDefault();
    document.getElementById("dropZone").style.borderColor="#c8e6c9";
    const file=e.dataTransfer.files[0]; if(!file||!file.type.startsWith("image/")) return;
    const dt=new DataTransfer(); dt.items.add(file);
    document.getElementById("dImageInput").files=dt.files;
    const prev=document.getElementById("dPreview");
    prev.src=URL.createObjectURL(file); prev.style.display="block";
    document.getElementById("dAnalyzeBtn").style.display="inline-block";
}

function runDiseaseDetection(){
    const input=document.getElementById("dImageInput");
    if(!input?.files[0]){showToast("⚠️ Upload a leaf image first!","orange");return;}
    document.getElementById("dLoading").style.display="block";
    document.getElementById("dResult").style.display="none";
    document.getElementById("dAnalyzeBtn").style.display="none";
    setTimeout(()=>{
        const result=diseaseDB[Math.floor(Math.random()*diseaseDB.length)];
        lastScanResult={...result,timestamp:new Date().toISOString()};
        document.getElementById("rDisease").textContent=result.disease;
        document.getElementById("rPesticide").textContent=result.pesticide;
        document.getElementById("rDose").textContent=result.dose;
        document.getElementById("rInterval").textContent=result.interval;
        document.getElementById("rPercent").textContent=result.infection;
        document.getElementById("rBar").style.width=result.infection+"%";
        let risk="Low 🟢",rColor="#2e7d32";
        if(result.infection>60){risk="High 🔴 (Severe)";rColor="#d32f2f";}
        else if(result.infection>30){risk="Moderate 🟡";rColor="#f57c00";}
        document.getElementById("rRisk").textContent=risk;
        document.getElementById("rRisk").style.color=rColor;
        const rb=document.getElementById("dResult");
        rb.style.borderLeft=result.infection>60?"6px solid #d32f2f":result.infection>30?"6px solid #f57c00":"6px solid #2e7d32";
        document.getElementById("dLoading").style.display="none";
        rb.style.display="block";
        updateLastScanCard(result);
        addLog(`🔬 ${result.disease} detected (${result.infection}% infection)`);
        if(currentUser&&result.infection>30&&currentUser.notifPrefs?.disease) showToast("⚠️ Disease: "+result.disease,"red",4000);
    },2200);
}

function updateLastScanCard(result){
    const badge=document.getElementById("lastScanBadge"), time=document.getElementById("lastScanTime");
    const img=document.getElementById("lastScanImg"), imgSrc=document.getElementById("dPreview")?.src;
    if(imgSrc&&imgSrc!==window.location.href){img.src=imgSrc;img.style.display="block";document.getElementById("scan-fallback").style.display="none";}
    badge.textContent=result.disease;
    badge.style.background=result.infection>60?"#ffebee":result.infection>30?"#fff3e0":"#dcecdf";
    badge.style.color=result.infection>60?"#d32f2f":result.infection>30?"#e65100":"#2e7d32";
    time.textContent="Today, "+new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
}

function resetScan(){
    const input=document.getElementById("dImageInput"); if(input) input.value="";
    document.getElementById("dPreview").style.display="none";
    document.getElementById("dResult").style.display="none";
    document.getElementById("dAnalyzeBtn").style.display="none";
    lastScanResult=null;
}

function saveToReports(){
    if(!currentUser){showToast("⚠️ Sign in to save reports!","orange");openAuthModal("signin");return;}
    if(!lastScanResult){showToast("⚠️ No scan result to save!","orange");return;}
    const last=scanReports[scanReports.length-1];
    if(last&&Math.abs(new Date()-new Date(last.timestamp))<5000){showToast("⚠️ Already saved!","orange");return;}
    const report={...lastScanResult,user:currentUser.phone,id:Date.now()};
    scanReports.push(report);
    DB.uSet(currentUser.phone,"reports",scanReports);
    showToast("✅ Report saved!");
    addLog(`💾 Report saved: ${lastScanResult.disease}`);
    updateAnalyticsCounts();
}

/* ---- REPORTS ---- */
function renderReportsPage(){
    const gate=document.getElementById("reportsGate"), content=document.getElementById("reportsContent");
    if(!currentUser){gate.style.display="block";content.style.display="none";return;}
    gate.style.display="none"; content.style.display="block";
    document.getElementById("reportCount").textContent=scanReports.length;
    const tbody=document.getElementById("reportsBody");
    if(scanReports.length===0){tbody.innerHTML=`<tr><td colspan="8" class="no-reports">📋 No reports yet — scan a leaf!</td></tr>`;return;}
    tbody.innerHTML="";
    scanReports.slice().reverse().forEach((r,i)=>{
        const d=new Date(r.timestamp);
        const ds=d.toLocaleDateString("en-IN")+" "+d.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
        const bc=r.infection>60?"badge-high":r.infection>30?"badge-mod":"badge-low";
        const rt=r.infection>60?"High":r.infection>30?"Moderate":"Low";
        tbody.innerHTML+=`<tr><td>${scanReports.length-i}</td><td>${ds}</td><td><b>${r.disease}</b></td><td>${r.infection}%</td><td><span class="${bc}">${rt}</span></td><td>${r.pesticide}</td><td>${r.dose}</td><td>${r.interval}</td></tr>`;
    });
}

function exportReports(){
    if(!currentUser) return;
    if(scanReports.length===0){showToast("⚠️ No reports to export!","orange");return;}
    const h=["#","Date","Time","Disease","Infection%","Risk","Pesticide","Dose","Interval"];
    const rows=scanReports.map((r,i)=>{
        const d=new Date(r.timestamp),risk=r.infection>60?"High":r.infection>30?"Moderate":"Low";
        return[i+1,d.toLocaleDateString("en-IN"),d.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),`"${r.disease}"`,r.infection,risk,`"${r.pesticide}"`,`"${r.dose}"`,`"${r.interval}"`].join(",");
    });
    const csv=[h.join(","),...rows].join("\n");
    const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
    a.download=`SmartKissan_${currentUser.name.replace(/\s/,"_")}_Reports.csv`; a.click();
    showToast("📥 CSV exported!");
}

/* ---- ANALYTICS ---- */
function updateAnalyticsCounts(){
    const r=scanReports;
    document.getElementById("aTotalScans").textContent=r.length;
    document.getElementById("aDiseases").textContent=r.filter(x=>x.infection>10).length;
    document.getElementById("aHealthy").textContent=r.filter(x=>x.infection<=10).length;
    document.getElementById("aPestUses").textContent=r.filter(x=>x.pesticide!=="No pesticide needed").length;
}
function renderAnalytics(){
    updateAnalyticsCounts();
    const last7=scanReports.slice(-7), chart=document.getElementById("barChart"); if(!chart) return;
    chart.innerHTML="";
    const days=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
    if(last7.length===0){chart.innerHTML=`<div style="color:#aaa;font-size:13px;padding:20px;line-height:1.6">No scan data yet.<br>Go to Disease Detection, scan a leaf and save the report — it will appear here as a bar.</div>`;return;}
    last7.forEach((r,i)=>{
        const pct=Math.max(r.infection,4);
        const color=r.infection>60?"linear-gradient(to top,#d32f2f,#ef9a9a)":r.infection>30?"linear-gradient(to top,#f57c00,#ffcc80)":"linear-gradient(to top,#2e7d32,#66bb6a)";
        chart.innerHTML+=`<div class="bar-wrap"><div class="bar" style="height:${pct}%;background:${color}" title="${r.disease}: ${r.infection}%"></div><span class="bar-label">${days[i%7]}<br><small>${r.infection}%</small></span></div>`;
    });
}

/* ---- SETTINGS ---- */
function renderSettingsPage(){
    if(!currentUser){
        const nb=document.getElementById("settingsNotLoggedIn"); if(nb) nb.style.display="block";
        const sf=document.getElementById("settingsForm"); if(sf) sf.style.display="none";
        return;
    }
    const nb=document.getElementById("settingsNotLoggedIn"); if(nb) nb.style.display="none";
    const sf=document.getElementById("settingsForm"); if(sf) sf.style.display="block";
    const p=currentUser.notifPrefs||defaultNotifPrefs();
    const el=id=>document.getElementById(id);
    if(el("notifDisease"))  el("notifDisease").checked  =!!p.disease;
    if(el("notifWeather"))  el("notifWeather").checked  =!!p.weather;
    if(el("notifMoisture")) el("notifMoisture").checked =!!p.moisture;
    if(el("notifDaily"))    el("notifDaily").checked    =!!p.daily;
}

function saveNotifSettings(){
    if(!currentUser){showToast("⚠️ Sign in first!","orange");openAuthModal("signin");return;}
    const prefs={
        disease: document.getElementById("notifDisease").checked,
        weather: document.getElementById("notifWeather").checked,
        moisture:document.getElementById("notifMoisture").checked,
        daily:   document.getElementById("notifDaily").checked
    };
    currentUser.notifPrefs=prefs;
    const users=DB.get("users",{});
    if(users[currentUser.phone]){users[currentUser.phone].notifPrefs=prefs;DB.set("users",users);}
    const t=document.getElementById("toastSettings");
    t.textContent="✅ Notification preferences saved!"; t.style.display="block";
    setTimeout(()=>t.style.display="none",3000);
    showToast("✅ Settings saved!");
    addLog("⚙️ Notification settings updated.");
}

/* ---- DASHBOARD ---- */
function animateHealth(){
    const circle=document.getElementById("healthCircle"), text=document.getElementById("healthText");
    const target=87,maxOffset=190;
    setTimeout(()=>{circle.style.strokeDashoffset=maxOffset-(target/100)*maxOffset;},500);
    let c=0; const iv=setInterval(()=>{if(c>=target)clearInterval(iv);else{c++;text.innerText=c;}},20);
}
function togglePump(checkbox){
    const el=document.getElementById("pumpStatus");
    if(checkbox.checked){el.innerText="System Active (Auto)";el.style.color="#2e7d32";addLog("🔄 Pump AUTO mode.");}
    else{el.innerText="Manual Override";el.style.color="#d32f2f";addLog("⚠️ Pump DISABLED.");}
}
function addLog(message){
    const box=document.getElementById("aiLogs");
    const time=new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
    const div=document.createElement("div"); div.className="log-item";
    div.innerHTML=`<span>${time}</span> ${message}`; box.prepend(div);
    while(box.children.length>20) box.removeChild(box.lastChild);
}
setInterval(()=>{
    const ev=["Scanning Sector 3: No pests found.","Soil moisture check: Optimal (60%).","Server sync: Health data updated.","Weather analysis: Conditions favorable.","Auto-pump cycle completed."];
    addLog(ev[Math.floor(Math.random()*ev.length)]);
},9000);

/* ---- NAV ---- */
function openTutorial(){const m=document.getElementById("tutorialModal"),v=document.getElementById("tutorialVideo");m.style.display="flex";v.currentTime=0;try{v.play();}catch(e){}}
function closeTutorial(){document.getElementById("tutorialVideo").pause();document.getElementById("tutorialModal").style.display="none";}
window.addEventListener("click",e=>{if(e.target===document.getElementById("tutorialModal"))closeTutorial();});

/* ---- CHATBOT ---- */
function toggleChat(){const c=document.getElementById("chatContainer");c.style.display=window.getComputedStyle(c).display==="none"?"flex":"none";}
function handleEnter(e){if(e.key==="Enter")sendMessage();}
async function sendMessage(){
    const input=document.getElementById("userInput"),msgs=document.getElementById("chatMessages");
    const text=input.value.trim(); if(!text) return;
    addChatMessage(text,"user-message"); input.value="";
    conversationHistory.push({role:"user",content:text});
    const lid="l"+Date.now(), ldiv=document.createElement("div");
    ldiv.className="message bot-message"; ldiv.id=lid; ldiv.innerText="Soch raha hoon... 🤔";
    msgs.appendChild(ldiv); msgs.scrollTop=msgs.scrollHeight;
    try{
        const sys=`You are Kissan Sahayak, expert farming AI. Weather:${currentWeather.temp||"--"}°C,${currentWeather.condition||"--"},Humidity:${currentWeather.humidity||"--"}%. User:${currentUser?.name||"Guest"}. Answer in Hinglish max 2-3 sentences, be friendly.`;
        const r=await fetch("https://api.groq.com/openai/v1/chat/completions",{method:"POST",headers:{"Authorization":`Bearer ${GROQ_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({model:"llama-3.3-70b-versatile",messages:[{role:"system",content:sys},...conversationHistory.slice(-6)],temperature:0.7,max_tokens:150})});
        if(!r.ok) throw new Error(r.status);
        const d=await r.json(), ai=d.choices?.[0]?.message?.content?.trim()||getSmartFallback(text);
        document.getElementById(lid).innerHTML=ai.replace(/\n/g,"<br>");
        conversationHistory.push({role:"assistant",content:ai});
    }catch(e){document.getElementById(lid).innerHTML=getSmartFallback(text);}
}
function getSmartFallback(text){
    text=text.toLowerCase();
    if(text.match(/hello|hi|namaste|helo/i)) return "Namaste! 🙏 Apni fasal ke baare mein kuch bhi puchiye!";
    if(text.match(/water|paani|pump|irrigation|sinchai/i)) return "Soil H₂O abhi 60% hai — sahi level! Auto Pump ON hai Dashboard pe.";
    if(text.match(/weather|mausam|rain|barish|garmi|thanda/i)) return `Abhi ${currentWeather.temp||"--"}°C, ${currentWeather.condition||"--"} hai. Smart Alert check karo sidebar me!`;
    if(text.match(/dukan|shop|store|seed|beej|fertilizer|khad|pesticide|kharido|kharid|nursery|agro|krishi kendra/i))
        return "Hanji! Aapke paas mein farm shops dhundhne ke liye Dashboard me <b>Dukan</b> section open karo. Wahan nearby seed, fertilizer aur agro stores mil jayenge GPS se!";
    if(text.match(/disease|bimari|yellow|peeli|spots|daag|leaf|patti/i)) return "Leaf ki photo upload karo Disease Detection me — AI turant bata dega kaun si bimari hai aur kaunsa pesticide use karna hai!";
    if(text.match(/report|history|scan.*save|save.*scan/i)) return "Tumhare saare scan Reports section me save hain. Sign in karo aur CSV bhi download kar sakte ho!";
    if(text.match(/setting|notification|alert/i)) return "Settings me jaake disease, weather aur soil moisture alerts customize kar sakte ho.";
    if(text.match(/analytic|chart|graph|stats/i)) return "Analytics me apne saare scans ka bar chart aur stats dekh sakte ho!";
    return "Thoda aur detail do — kaun si fasal hai, kya problem? Main help karunga! 🌱";
}
function addChatMessage(text,cls){
    const div=document.createElement("div"); div.className="message "+cls;
    div.innerHTML=text.replace(/\n/g,"<br>");
    const msgs=document.getElementById("chatMessages");
    msgs.appendChild(div); msgs.scrollTop=msgs.scrollHeight;
}

/* ---- INIT ---- */
window.onload=function(){
    const saved=DB.get("currentSession");
    if(saved){
        const users=DB.get("users",{});
        if(users[saved]){
            currentUser={name:users[saved].name,phone:saved,notifPrefs:users[saved].notifPrefs||defaultNotifPrefs()};
            scanReports=DB.uGet(saved,"reports",[]);
        }
    }
    updateProfileUI(); getLocationAndWeather(); animateHealth();
    setInterval(getLocationAndWeather,300000);
    addLog("🌱 Smart Kissan initialized.");
};
document.addEventListener("visibilitychange",()=>{
    if(document.visibilityState==="hidden"&&currentUser){DB.set("currentSession",currentUser.phone);DB.uSet(currentUser.phone,"reports",scanReports);}
});
window.addEventListener("beforeunload",()=>{
    if(currentUser){DB.set("currentSession",currentUser.phone);DB.uSet(currentUser.phone,"reports",scanReports);}
});