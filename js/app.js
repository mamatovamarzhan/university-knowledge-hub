(function(){
"use strict";

/* ================================================================
   MOCK "UNIVERSITY SSO / LDAP" — external system.
   Passwords live ONLY here (as hashes), never in the hub's own DB.
   ================================================================ */
function hash(s){let h=5381;for(let i=0;i<s.length;i++){h=((h<<5)+h+s.charCodeAt(i))>>>0}return h.toString(16).padStart(8,"0")}
const SSO_DIRECTORY={
  "student1": {pw:hash("student123"), name:"Aruzhan Seitova",  dept:"School of IT"},
  "staff1":   {pw:hash("staff123"),   name:"Marat Bekov",      dept:"Dept. of Computer Science"},
  "admin":    {pw:hash("admin123"),   name:"Saule Karimova",   dept:"University IT Services"},
  "aigerim.n":{pw:hash("aigerim123"), name:"Aigerim Nurlanova",dept:"School of Business"},
  "timur.a":  {pw:hash("timur123"),   name:"Timur Abenov",     dept:"Dept. of Mathematics"}
};
const SSO={
  down:false,
  bind(username,password){
    if(this.down) return {ok:false,code:"SSO_UNAVAILABLE"};
    const u=SSO_DIRECTORY[username.trim().toLowerCase()];
    if(!u||u.pw!==hash(password)) return {ok:false,code:"INVALID_CREDENTIALS"};
    return {ok:true,profile:{username:username.trim().toLowerCase(),name:u.name,dept:u.dept}};
  }
};

/* ================================================================
   HUB DATABASE — table `users` (id, username, full_name, role, last_login)
   No password column. Persisted in localStorage for the demo.
   ================================================================ */
const ROLES=["Student","Staff","Admin"];
const SEED_USERS=[
  {id:1,username:"student1", full_name:"Aruzhan Seitova",  role:"Student",last_login:null},
  {id:2,username:"staff1",   full_name:"Marat Bekov",      role:"Staff",  last_login:null},
  {id:3,username:"admin",    full_name:"Saule Karimova",   role:"Admin",  last_login:null},
  {id:4,username:"aigerim.n",full_name:"Aigerim Nurlanova",role:"Student",last_login:null},
  {id:5,username:"timur.a",  full_name:"Timur Abenov",     role:"Staff",  last_login:null}
];
const DB_KEY="ukh_users_v1";
const DB={
  users:null,
  load(){try{const raw=localStorage.getItem(DB_KEY);this.users=raw?JSON.parse(raw):null}catch(e){this.users=null}
    if(!Array.isArray(this.users)) this.users=SEED_USERS.map(u=>({...u}));},
  save(){try{localStorage.setItem(DB_KEY,JSON.stringify(this.users))}catch(e){}},
  reset(){this.users=SEED_USERS.map(u=>({...u}));this.save()},
  byUsername(n){return this.users.find(u=>u.username===n)},
  byId(id){return this.users.find(u=>u.id===id)}
};
DB.load();

/* ================================================================
   KNOWLEDGE BASE (sample documents with visibility per role)
   ================================================================ */
const DOCS=[
  {id:"D-101",title:"Academic Calendar 2026–2027",cat:"Registrar Office",vis:"All",pages:6,
   text:"Fall semester runs from 1 September to 20 December 2026. The winter exam session is 21 December – 16 January. Spring semester starts on 19 January 2027. Public holidays: 16 December, 1–2 January, 8 March, 21–23 March.",
   tags:"calendar semester dates holidays exam session schedule"},
  {id:"D-102",title:"Exam Retake Policy",cat:"Academic Affairs",vis:"All",pages:4,
   text:"A student may retake a failed final exam once, for a fee, during the summer term. Submit the application to the Registrar Office no later than 10 working days after grades are published.",
   tags:"retake exam fail fx summer term fee registrar"},
  {id:"D-103",title:"Scholarship Regulations",cat:"Student Services",vis:"All",pages:9,
   text:"The state scholarship is kept if every exam in the session is passed with B- or higher. An increased scholarship requires a GPA of 3.67 or above and no retakes during the year.",
   tags:"scholarship stipend gpa grant money payment"},
  {id:"D-104",title:"Dormitory Rules",cat:"Campus Life",vis:"All",pages:5,
   text:"Quiet hours are 23:00–07:00. Guests may stay until 21:00 and must be registered at the front desk. Cooking is allowed only in shared kitchens.",
   tags:"dormitory dorm hostel housing guests quiet hours"},
  {id:"D-105",title:"Academic Leave Procedure",cat:"Academic Affairs",vis:"All",pages:3,
   text:"Academic leave of up to one year is granted for medical reasons, military service or family circumstances. Apply to the Dean's Office with supporting documents.",
   tags:"academic leave break pause study dean medical"},
  {id:"D-106",title:"Library Access and Opening Hours",cat:"Library",vis:"All",pages:2,
   text:"The main library is open Monday to Saturday, 08:00–21:00. Books can be borrowed for 14 days with a student or staff ID. Electronic databases are available off campus through the university login.",
   tags:"library books borrow opening hours databases"},
  {id:"D-201",title:"Staff Workload Regulations",cat:"Human Resources",vis:"Staff",pages:12,
   text:"Full-time teaching staff carry a workload of 600–750 contact hours per academic year. Research and supervision hours are counted separately and approved by the head of department.",
   tags:"workload teaching hours staff contract department"},
  {id:"D-202",title:"Grade Moderation Guide for Instructors",cat:"Academic Affairs",vis:"Staff",pages:7,
   text:"Final grades may be changed only within 5 working days after publication, through the appeal committee. Instructors must keep graded exam papers for one academic year.",
   tags:"grades grading moderation appeal instructors exam papers"},
  {id:"D-203",title:"Internal Research Grant Deadlines",cat:"Research Office",vis:"Staff",pages:4,
   text:"Internal research grant applications for 2027 are due on 15 November 2026. Each application needs a budget and the head of department's approval.",
   tags:"research grant deadline budget funding"},
  {id:"D-301",title:"User Access Audit Procedure",cat:"University IT Services",vis:"Admin",pages:5,
   text:"Administrators review all role assignments at the start of each semester, remove accounts of graduated students and export the access log for the IT security office.",
   tags:"access audit roles accounts security admin log"}
];
const VISIBLE_FOR={Student:["All"],Staff:["All","Staff"],Admin:["All","Staff","Admin"]};

/* ================================================================
   TOKENS (JWT-like: header.payload.signature)
   ================================================================ */
const SECRET="ukh-demo-secret";
const b64=o=>btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/=+$/,"").replace(/\+/g,"-").replace(/\//g,"_");
const unb64=s=>JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g,"+").replace(/_/g,"/")))));
function signToken(payload){const h=b64({alg:"HS256",typ:"JWT"});const p=b64(payload);return h+"."+p+"."+hash(h+"."+p+SECRET)}
function verifyToken(t){
  if(!t) return null;
  const parts=t.split(".");if(parts.length!==3) return null;
  if(hash(parts[0]+"."+parts[1]+SECRET)!==parts[2]) return null;
  try{return unb64(parts[1])}catch(e){return null}
}

/* ================================================================
   "BACKEND" API — every call verifies the token; role checks live here
   ================================================================ */
const IDLE_LIMIT_MS=30*60*1000;
const API={
  requests:0,
  login(username,password){
    this.requests++;
    const r=SSO.bind(username,password);
    if(!r.ok) return r;
    let user=DB.byUsername(r.profile.username);
    if(!user){ // first login: create a row with the default role
      user={id:Math.max(0,...DB.users.map(u=>u.id))+1,username:r.profile.username,full_name:r.profile.name,role:"Student",last_login:null};
      DB.users.push(user);
    }
    user.last_login=new Date().toISOString();DB.save();
    const token=signToken({sub:user.id,username:user.username,name:user.full_name,role:user.role,iat:Date.now()});
    return {ok:true,token};
  },
  search(token,query){
    this.requests++;
    const claims=verifyToken(token);
    if(!claims) return {ok:false,code:"UNAUTHORIZED"};
    const allowed=VISIBLE_FOR[claims.role]||["All"];
    const words=query.toLowerCase().split(/[^a-zа-яё0-9әіңғүұқөһ]+/i).filter(w=>w.length>1);
    const scored=DOCS.filter(d=>allowed.includes(d.vis)).map(d=>{
      let s=0;const t=d.title.toLowerCase(),b=d.text.toLowerCase(),g=d.tags;
      for(const w of words){if(t.includes(w))s+=3;if(g.includes(w))s+=2;if(b.includes(w))s+=1}
      return {d,s};
    }).filter(x=>x.s>0).sort((a,b)=>b.s-a.s);
    return {ok:true,role:claims.role,results:scored.map(x=>x.d),words};
  },
  listUsers(token){
    this.requests++;
    const c=verifyToken(token);
    if(!c||c.role!=="Admin") return {ok:false,code:"ACCESS_DENIED"};
    return {ok:true,users:DB.users.map(u=>({...u}))};
  },
  setRole(token,userId,role){
    this.requests++;
    const c=verifyToken(token);
    if(!c||c.role!=="Admin") return {ok:false,code:"ACCESS_DENIED",msg:"Only an Admin can change roles."};
    if(c.sub===userId) return {ok:false,code:"SELF_CHANGE",msg:"You can't change your own role."};
    if(!ROLES.includes(role)) return {ok:false,code:"BAD_ROLE",msg:"Unknown role."};
    const u=DB.byId(userId);if(!u) return {ok:false,code:"NOT_FOUND",msg:"User not found."};
    u.role=role;DB.save();
    return {ok:true,user:{...u}};
  }
};

/* ================================================================
   SESSION (client side)
   ================================================================ */
const SS_KEY="ukh_session_v1";
const S={token:null,claims:null,lastActivity:Date.now(),history:[],flash:null,lastQuery:"",lastResult:null,emptyWarn:false};
function saveSession(){try{S.token?sessionStorage.setItem(SS_KEY,JSON.stringify({token:S.token,lastActivity:S.lastActivity,history:S.history})):sessionStorage.removeItem(SS_KEY)}catch(e){}}
function loadSession(){try{const raw=sessionStorage.getItem(SS_KEY);if(!raw)return;const o=JSON.parse(raw);const c=verifyToken(o.token);
  if(c){S.token=o.token;S.claims=c;S.lastActivity=o.lastActivity||Date.now();S.history=o.history||[]}}catch(e){}}
function startSession(token){S.flash=null;S.token=token;S.claims=verifyToken(token);S.lastActivity=Date.now();S.history=[];S.lastQuery="";S.lastResult=null;saveSession()}
function endSession(flash){if(!S.token&&S.flash)return;S.token=null;S.claims=null;S.history=[];S.lastResult=null;S.lastQuery="";S.flash=flash||null;saveSession();go("login")}
function idleLeft(){return IDLE_LIMIT_MS-(Date.now()-S.lastActivity)}
function checkIdle(){ // true if the session was just expired
  if(S.token&&idleLeft()<=0){endSession({type:"warn",text:"Session expired, please log in again"});return true}
  return false;
}
function touch(){if(S.token){S.lastActivity=Date.now();saveSession()}}

/* every user action inside the app first checks inactivity */
["pointerdown","keydown"].forEach(ev=>document.addEventListener(ev,e=>{
  if(!S.token) return;
  if(e.target.closest&&e.target.closest(".qa,.qa-toggle")) return; // QA drawer is not part of the product
  if(checkIdle()){e.preventDefault();e.stopPropagation();return}
  touch();
},true));
setInterval(()=>{checkIdle();renderQAStats()},1000);

/* ================================================================
   ROUTER
   ================================================================ */
const app=document.getElementById("app");
function route(){return (location.hash||"").replace(/^#/,"")||(S.token?"search":"login")}
function go(r){if(location.hash==="#"+r) render(); else location.hash=r}
window.addEventListener("hashchange",()=>{if(S.token&&checkIdle())return;render()});

function render(){
  let r=route();
  if(!S.token&&r!=="login"){ go("login"); return }
  if(S.token&&r==="login"){ go("search"); return }
  if(r==="login") return renderLogin();
  const views={search:viewSearch,faq:viewFaq,history:viewHistory,admin:viewAdmin};
  const view=views[r]||viewNotFound;
  app.innerHTML=shell(r)+`<main id="main">${view()}</main>`+footerHtml();
  bindShell();
  if(r==="search") bindSearch();
  if(r==="admin") bindAdmin();
  if(r==="faq"||r==="history") bindQuickAsk();
  renderQA();
}

/* ================================================================
   VIEWS
   ================================================================ */
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

function renderLogin(){
  const f=S.flash;
  app.innerHTML=`
  <div class="login-wrap">
    <div class="login-card">
      <section class="login-brand">
        <div class="crest"><div class="crest-mark">K</div><span>University Knowledge Hub</span></div>
        <h1>Rules, regulations and guides in one place</h1>
        <p>Find official university documents for students and staff. Sign in with the same account you use for the university portal.</p>
        <ul>
          <li>Academic calendar and exam policies</li>
          <li>Scholarships, dormitory, library</li>
          <li>Staff regulations for instructors</li>
        </ul>
      </section>
      <form class="login-form" id="loginForm" novalidate>
        <div style="display:grid;gap:4px">
          <h2>Sign in</h2>
          <div class="sso-status" id="ssoStatus"></div>
        </div>
        ${f?`<div class="notice notice-${f.type}" role="alert">${esc(f.text)}</div>`:""}
        <div class="notice notice-danger" id="loginError" role="alert" hidden></div>
        <div class="field">
          <label for="username">University username</label>
          <input class="input" id="username" name="username" autocomplete="username" placeholder="e.g. student1" autocapitalize="off" spellcheck="false">
        </div>
        <div class="field">
          <label for="password">Password</label>
          <input class="input" id="password" name="password" type="password" autocomplete="current-password" placeholder="Your university password">
        </div>
        <button class="btn btn-primary" id="loginBtn" type="submit" disabled>Login</button>
        <p class="hint">Your password is checked by university SSO / LDAP and is never stored in the Knowledge Hub. Sessions end after 30 minutes of inactivity.</p>
        <div class="demo-accounts">
          <div class="label">Demo accounts · click to fill</div>
          <div class="acc-row">
            <button type="button" class="acc" data-u="student1" data-p="student123">student1 <b>/ student123</b></button>
            <button type="button" class="acc" data-u="staff1" data-p="staff123">staff1 <b>/ staff123</b></button>
            <button type="button" class="acc" data-u="admin" data-p="admin123">admin <b>/ admin123</b></button>
          </div>
        </div>
      </form>
    </div>
  </div>`;
  const u=document.getElementById("username"),p=document.getElementById("password"),btn=document.getElementById("loginBtn"),err=document.getElementById("loginError");
  const sync=()=>{btn.disabled=!(u.value.trim()&&p.value)};
  u.addEventListener("input",sync);p.addEventListener("input",sync);
  document.querySelectorAll(".acc").forEach(a=>a.addEventListener("click",()=>{u.value=a.dataset.u;p.value=a.dataset.p;sync();btn.focus()}));
  document.getElementById("loginForm").addEventListener("submit",e=>{
    e.preventDefault();
    if(btn.disabled) return;
    const r=API.login(u.value,p.value);
    if(!r.ok){
      err.textContent=r.code==="SSO_UNAVAILABLE"?"University SSO is unavailable right now, so you can't sign in. Please try again later.":"Invalid username or password";
      err.hidden=false;p.value="";sync();p.focus();renderQAStats();return;
    }
    startSession(r.token);go("search");
  });
  renderSSOStatus();
  renderQA();
  u.focus();
}
function renderSSOStatus(){
  const el=document.getElementById("ssoStatus");if(!el)return;
  el.innerHTML=SSO.down?`<span class="dot off"></span>University SSO: unavailable`:`<span class="dot"></span>University SSO: online`;
}

function shell(r){
  const c=S.claims;
  const link=(id,label)=>`<a href="#${id}" ${r===id?'aria-current="page"':""}>${label}</a>`;
  return `
  <header class="topbar"><div class="topbar-inner">
    <a href="#search" class="crest" style="color:inherit;text-decoration:none"><div class="crest-mark">K</div><span>Knowledge Hub</span></a>
    <nav class="nav" aria-label="Main">
      ${link("search","Search")}${link("faq","FAQ")}${link("history","History")}${c.role==="Admin"?link("admin","Admin"):""}
    </nav>
    <div class="user-chip">
      <span class="uname">${esc(c.name)}</span>
      <span class="role-badge role-${c.role}">${c.role}</span>
      <button class="btn btn-logout" id="logoutBtn" type="button">Logout</button>
    </div>
  </div></header>`;
}
function footerHtml(){return `<footer><span>University Knowledge Hub · Sprint 1 prototype (US1–US3)</span><span class="mono" id="loadTime"></span></footer>`}
function bindShell(){
  document.getElementById("logoutBtn").addEventListener("click",()=>endSession({type:"info",text:"You have been logged out."}));
  const lt=document.getElementById("loadTime");if(lt) lt.textContent=`page loaded in ${LOAD_MS} ms`;
}

const SEARCH_ICON=`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.5-3.5"></path></svg>`;
function viewSearch(){
  const c=S.claims;
  const res=S.lastResult;
  let body="";
  if(res){
    body=`<div class="results-head"><h2>${res.results.length} document${res.results.length===1?"":"s"} for “${esc(S.lastQuery)}”</h2>
      <span class="muted" style="font-size:13px">Showing documents available to <b>${res.role}</b></span></div>`;
    body+=res.results.length?`<div class="results">${res.results.map(d=>docCard(d,res.words)).join("")}</div>`
      :`<div class="empty-state">No documents match “${esc(S.lastQuery)}”. Try other words, for example “exam”, “scholarship” or “library”.</div>`;
  }else{
    body=`<div class="home-grid">
      <a class="tile" href="#faq"><span class="eyebrow">FAQ</span><h3>Frequently asked questions</h3><p>Quick answers to common student and staff questions.</p></a>
      <a class="tile" href="#history"><span class="eyebrow">History</span><h3>Your recent questions</h3><p>Open a question you asked earlier without retyping it.</p></a>
      <div class="tile"><span class="eyebrow">Signed in as</span><h3>${esc(c.name)}</h3><p>Role: ${c.role}. You see ${VISIBLE_FOR[c.role].length===1?"public documents":VISIBLE_FOR[c.role].length===2?"public and staff documents":"all documents"}.</p></div>
    </div>`;
  }
  return `
  <section class="search-hero">
    <h1>What do you need to find?</h1>
    <form class="search-form" id="searchForm" role="search" novalidate>
      <div class="search-box">${SEARCH_ICON}
        <label for="q" class="sr-only">Search the knowledge hub</label>
        <input class="search-input" id="q" name="q" type="search" placeholder="Ask your question..." autocomplete="off" value="${esc(S.lastQuery)}">
      </div>
      <button class="btn btn-primary" type="submit">Search</button>
    </form>
    <div class="notice notice-warn" id="emptyMsg" role="alert" ${S.emptyWarn?"":"hidden"}>Please enter your question</div>
    <div class="chips"><span class="lbl">Try:</span>
      ${["exam retake","scholarship GPA","academic calendar","dormitory guests","teaching workload"].map(t=>`<button type="button" class="chip" data-q="${t}">${t}</button>`).join("")}
    </div>
  </section>
  <section id="results">${body}</section>`;
}
function highlight(text,words){
  let out=esc(text);
  words.filter(w=>w.length>2).forEach(w=>{out=out.replace(new RegExp("("+w.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+")","gi"),"<mark>$1</mark>")});
  return out;
}
function docCard(d,words){
  const visLabel=d.vis==="All"?"All users":d.vis+" only";
  return `<article class="doc">
    <div class="doc-top"><h3>${highlight(d.title,words)}</h3><span class="vis vis-${d.vis}">${visLabel}</span></div>
    <p>${highlight(d.text,words)}</p>
    <div class="meta">${d.id} · ${esc(d.cat)} · ${d.pages} pages</div>
  </article>`;
}
function runSearch(q){
  S.emptyWarn=false;
  const r=API.search(S.token,q);
  if(!r.ok){endSession({type:"warn",text:"Session expired, please log in again"});return}
  S.lastQuery=q;S.lastResult=r;
  S.history.unshift({q,at:Date.now(),n:r.results.length});S.history=S.history.slice(0,20);saveSession();
  if(route()!=="search") go("search"); else render();
  const inp=document.getElementById("q");if(inp) inp.focus();
}
function bindSearch(){
  const form=document.getElementById("searchForm"),inp=document.getElementById("q"),msg=document.getElementById("emptyMsg");
  form.addEventListener("submit",e=>{
    e.preventDefault();
    const q=inp.value.trim();
    if(!q){S.emptyWarn=true;msg.hidden=false;inp.focus();renderQAStats();return} // query is NOT sent
    runSearch(q);
  });
  inp.addEventListener("input",()=>{if(inp.value.trim()){S.emptyWarn=false;msg.hidden=true}});
  document.querySelectorAll(".chip").forEach(ch=>ch.addEventListener("click",()=>runSearch(ch.dataset.q)));
  if(!S.lastResult) inp.focus();
}

const FAQ=[
  ["How do I retake a failed exam?","exam retake"],
  ["What GPA do I need to keep my scholarship?","scholarship GPA"],
  ["When does the spring semester start?","academic calendar"],
  ["Until what time can guests stay in the dormitory?","dormitory guests"],
  ["How long can I borrow a library book?","library borrow"]
];
function viewFaq(){
  return `<div class="page-head"><span class="eyebrow">Frequently asked</span><h1>FAQ</h1>
    <p class="muted">Common questions from students and staff. Click a question to search for it. The full FAQ section is planned for iteration 4 (US10).</p></div>
    <div class="panel"><ul class="list">${FAQ.map(([t,q])=>`<li><button class="link-btn qa-ask" data-q="${esc(q)}" type="button">${esc(t)}</button><span class="muted mono" style="font-size:12px">${esc(q)}</span></li>`).join("")}</ul></div>`;
}
function viewHistory(){
  const h=S.history;
  return `<div class="page-head"><span class="eyebrow">This session</span><h1>History</h1>
    <p class="muted">Questions you asked since you signed in. Saving history across sessions is planned for iteration 4 (US9).</p></div>
    ${h.length?`<div class="panel"><ul class="list">${h.map(x=>`<li><button class="link-btn qa-ask" data-q="${esc(x.q)}" type="button">${esc(x.q)}</button><span class="muted num" style="font-size:13px">${x.n} result${x.n===1?"":"s"} · ${new Date(x.at).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</span></li>`).join("")}</ul></div>`
      :`<div class="empty-state">You haven't asked anything yet. <a href="#search">Go to search</a></div>`}`;
}
function bindQuickAsk(){document.querySelectorAll(".qa-ask").forEach(b=>b.addEventListener("click",()=>runSearch(b.dataset.q)))}

function viewAdmin(){
  const r=API.listUsers(S.token);
  if(!r.ok) return `<div class="denied"><span class="code">403 · ACCESS_DENIED</span><h1>Access Denied</h1>
    <p class="muted">The admin panel is available only to users with the Admin role. You are signed in as <b>${S.claims.role}</b>.</p>
    <a class="btn" href="#search">Back to search</a></div>`;
  const me=S.claims.sub;
  const rows=r.users.map(u=>`<tr>
    <td class="num mono">${u.id}</td>
    <td><span class="mono">${esc(u.username)}</span></td>
    <td>${esc(u.full_name)}</td>
    <td>${u.id===me?`<span class="role-badge" style="color:var(--warn)">${u.role}</span> <span class="muted" style="font-size:12px">you</span>`
      :`<label class="sr-only" for="role-${u.id}">Role for ${esc(u.username)}</label>
        <select class="input" id="role-${u.id}" data-id="${u.id}" data-orig="${u.role}">${ROLES.map(x=>`<option ${x===u.role?"selected":""}>${x}</option>`).join("")}</select>`}</td>
    <td class="num muted" style="font-size:13px">${u.last_login?new Date(u.last_login).toLocaleString([], {day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}):"—"}</td>
    <td>${u.id===me?`<span class="muted" style="font-size:12px">Can't change own role</span>`:`<button class="btn btn-sm save-role" data-id="${u.id}" type="button" disabled>Save</button>`}</td>
  </tr>`).join("");
  return `<div class="page-head"><span class="eyebrow">Administration</span><h1>User roles</h1>
    <p class="muted">Each user has exactly one role. A change is saved to the database at once and takes effect on the user's next login.</p></div>
    <div class="admin-grid">
      <div class="table-wrap"><table>
        <thead><tr><th>ID</th><th>Username</th><th>Full name</th><th>Role</th><th>Last login</th><th></th></tr></thead>
        <tbody>${rows}</tbody></table></div>
      <div class="panel schema">
        <h3>Table <span class="mono">users</span></h3>
        <pre>id          INTEGER  PK
username    TEXT     UNIQUE
full_name   TEXT
role        TEXT     CHECK (role IN
                     ('Student','Staff','Admin'))
last_login  TIMESTAMP</pre>
        <p class="muted" style="font-size:13px">There is no password column. Passwords stay in university SSO / LDAP.</p>
        <h3>What each role sees</h3>
        <ul class="list" style="font-size:13px">
          <li><b>Student</b><span class="muted">public documents</span></li>
          <li><b>Staff</b><span class="muted">public + staff only</span></li>
          <li><b>Admin</b><span class="muted">all + admin panel</span></li>
        </ul>
      </div>
    </div>`;
}
function bindAdmin(){
  document.querySelectorAll("select[data-id]").forEach(s=>s.addEventListener("change",()=>{
    const b=document.querySelector(`.save-role[data-id="${s.dataset.id}"]`);if(b) b.disabled=s.value===s.dataset.orig;
  }));
  document.querySelectorAll(".save-role").forEach(b=>b.addEventListener("click",()=>{
    const id=+b.dataset.id,sel=document.getElementById("role-"+id);
    const r=API.setRole(S.token,id,sel.value);
    if(!r.ok){toast(r.msg,"danger");return}
    render();
    toast(`${r.user.username} is now ${r.user.role}. The change applies at their next login.`,"ok");
  }));
}
function viewNotFound(){return `<div class="denied"><span class="code">404</span><h1>Page not found</h1><a class="btn" href="#search">Back to search</a></div>`}

let toastTimer;
function toast(text,type){const t=document.getElementById("toast");t.className="toast notice notice-"+(type||"info");t.textContent=text;t.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.hidden=true,4200)}

/* ================================================================
   QA DRAWER — scenarios from the Sprint 1 spreadsheet
   ================================================================ */
const qa=document.getElementById("qa"),qaBody=document.getElementById("qaBody"),qaToggle=document.getElementById("qaToggle");
function setQA(open){qa.hidden=!open;qaToggle.hidden=open;qaToggle.setAttribute("aria-expanded",String(open));if(open)renderQA()}
qaToggle.addEventListener("click",()=>setQA(true));
document.getElementById("qaClose").addEventListener("click",()=>setQA(false));

function fmt(ms){ms=Math.max(0,ms);const m=Math.floor(ms/60000),s=Math.floor(ms%60000/1000);return String(m).padStart(2,"0")+":"+String(s).padStart(2,"0")}
function renderQAStats(){
  const el=document.getElementById("qaStats");if(!el||qa.hidden) return;
  el.innerHTML=`
    <div class="stat"><div class="k">Session</div><div class="v">${S.token?S.claims.username+" · "+S.claims.role:"signed out"}</div></div>
    <div class="stat"><div class="k">Idle timeout in</div><div class="v">${S.token?fmt(idleLeft()):"—"}</div></div>
    <div class="stat"><div class="k">API requests sent</div><div class="v">${API.requests}</div></div>
    <div class="stat"><div class="k">Viewport width</div><div class="v">${window.innerWidth}px</div></div>`;
}
function scn(title,desc,acts){return `<div class="scn"><div class="scn-title">${title}</div><p>${desc}</p>${acts?`<div class="acts">${acts}</div>`:""}</div>`}
function act(id,label,disabled){return `<button class="btn btn-sm" type="button" data-act="${id}" ${disabled?"disabled":""}>${label}</button>`}
function renderQA(){
  if(qa.hidden) return;
  const inn=!!S.token,role=inn?S.claims.role:null;
  qaBody.innerHTML=`
  <div class="qa-stats" id="qaStats"></div>
  <label class="switch"><input type="checkbox" id="ssoDown" ${SSO.down?"checked":""}> Simulate SSO outage</label>

  <div class="qa-us"><h3><span class="tag">US1</span>Login</h3>
    ${scn("S1 · Valid credentials","Enter valid credentials and click Login. Expect a redirect to the search page.",act("fillValid","Fill student1",inn))}
    ${scn("S2 · Invalid credentials",'Wrong password shows “Invalid username or password”.',act("fillInvalid","Fill wrong password",inn))}
    ${scn("S3 · Logout","Click Logout in the top bar. The session ends and the login page opens.",act("logout","Logout now",!inn))}
    ${scn("S4 · Session timeout","After 30 minutes without activity, the next action shows the login page with “Session expired, please log in again”. Click the button, then click anything in the app.",act("idle","Simulate 30 min idle",!inn))}
  </div>

  <div class="qa-us"><h3><span class="tag">US2</span>User roles</h3>
    ${scn("S1 · Admin assigns Staff","Log in as admin → Admin → change student1 to Staff → Save. Log out, log in as student1: staff documents now appear.",act("asAdmin","Log in as admin")+act("openAdmin","Open Admin",!inn))}
    ${scn("S2 · Student opens admin URL","As a Student, open #admin directly. Expect “Access Denied”.",act("asStudent","Log in as student1")+act("openAdmin2","Go to #admin",!inn))}
    ${scn("S3 · Role-based filtering","Search “workload”. Student gets no results; Staff sees “Staff Workload Regulations”.",act("searchWorkload","Search “workload”",!inn))}
  </div>

  <div class="qa-us"><h3><span class="tag">US3</span>Search page</h3>
    ${scn("S1 · Main page","Search bar at the top, FAQ and History links in the navigation.",act("home","Open main page",!inn))}
    ${scn("S2 · Empty query","Press Search with an empty field. No request is sent (watch the counter) and “Please enter your question” appears.",act("emptySearch","Submit empty query",!inn))}
    ${scn("S3 · Mobile 375px","Narrow the window or open on a phone. The search bar stays usable and nothing overflows sideways.")}
    ${scn("Load time",`Page loaded in ${LOAD_MS} ms (limit 3000 ms).`)}
  </div>
  <button class="btn btn-sm" type="button" data-act="reset">Reset demo data</button>`;
  renderQAStats();
  document.getElementById("ssoDown").addEventListener("change",e=>{SSO.down=e.target.checked;renderSSOStatus()});
  qaBody.querySelectorAll("[data-act]").forEach(b=>b.addEventListener("click",()=>qaAction(b.dataset.act)));
}
function fillLogin(u,p){
  if(S.token) return;
  go("login");
  setTimeout(()=>{const U=document.getElementById("username"),P=document.getElementById("password");if(!U)return;U.value=u;P.value=p;U.dispatchEvent(new Event("input"));document.getElementById("loginBtn").focus()},30);
}
function loginAs(u,p){
  if(S.token){S.token=null;S.claims=null}
  const r=API.login(u,p);
  if(!r.ok){toast(r.code==="SSO_UNAVAILABLE"?"SSO is unavailable. Turn off the outage switch first.":"Login failed","danger");go("login");return}
  startSession(r.token);go("search");
}
function qaAction(a){
  switch(a){
    case "fillValid": fillLogin("student1","student123");break;
    case "fillInvalid": fillLogin("student1","wrong-pass");break;
    case "logout": endSession({type:"info",text:"You have been logged out."});break;
    case "idle": S.lastActivity=Date.now()-IDLE_LIMIT_MS-1000;saveSession();toast("Last activity moved back 30 minutes. Now click anything in the app.","warn");renderQAStats();break;
    case "asAdmin": loginAs("admin","admin123");break;
    case "asStudent": loginAs("student1","student123");break;
    case "openAdmin": case "openAdmin2": if(!checkIdle()) go("admin");break;
    case "searchWorkload": if(!checkIdle()){touch();runSearch("workload")}break;
    case "home": if(!checkIdle()){S.lastResult=null;S.lastQuery="";go("search")}break;
    case "emptySearch": if(!checkIdle()){touch();S.lastResult=null;S.lastQuery="";if(route()!=="search"){go("search")}else render();
      setTimeout(()=>{const f=document.getElementById("searchForm");if(f){document.getElementById("q").value="";f.requestSubmit()}},30)}break;
    case "reset": DB.reset();toast("Demo data reset. All roles are back to their defaults.","info");if(route()==="admin")render();break;
  }
  setTimeout(renderQA,60);
}
window.addEventListener("resize",renderQAStats);

/* ================================================================
   BOOT
   ================================================================ */
const LOAD_MS=Math.round(performance.now());
loadSession();
if(S.token&&idleLeft()<=0){S.token=null;S.claims=null;S.flash={type:"warn",text:"Session expired, please log in again"};saveSession()}
render();
})();
