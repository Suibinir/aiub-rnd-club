/* =============================================
   UNICLUB PORTAL — DASHBOARD.JS  v5
   Fixes:
   - Admin can create events (Add Event modal)
   - Admin's Manage button shows even when registered
   - Change password for all users
   New research club features:
   - Research Paper Library
   - Project Teams
   - Supervisor/Mentor Board
   - Seminar Tracker
   ============================================= */

const currentUser = loadSession();
if (!currentUser) window.location.href = "index.html";
const uid = currentUser.id;
const isAdmin = currentUser.role === "admin";

let stats      = loadData(uid,"stats",     getDefaultStats(uid));
let attendance = loadData(uid,"attendance",getDefaultAttendance());
let badges     = loadData(uid,"badges",    getDefaultBadges());
let streak     = loadData(uid,"streak",    getDefaultStreak());
let notices    = JSON.parse(localStorage.getItem("uniclub_notices")||JSON.stringify(getDefaultNotices()));
function getEvents(){ return getGlobalEvents(); }

// =============================================
// INIT
// =============================================
document.addEventListener("DOMContentLoaded", ()=>{
  setupUser(); setupDateTime(); setupNavigation(); setupTheme();
  renderHome(); renderAttendance(); renderEvents(); renderNotices();
  renderLeaderboard(); renderProfile(); renderResearch();
  if(isAdmin) renderAdmin();
});

// =============================================
// USER
// =============================================
function setupUser(){
  setAvatar("sidebarAvatar", uid, currentUser.initials);
  document.getElementById("sidebarName").textContent = currentUser.name;
  document.getElementById("sidebarRole").textContent = (isAdmin?"Admin":"Member")+" · "+currentUser.dept;
  if(isAdmin) document.body.classList.add("is-admin");
  const h=new Date().getHours();
  const g=h<12?"Good morning":h<17?"Good afternoon":"Good evening";
  document.getElementById("greetingText").textContent=g+", "+currentUser.name.split(" ")[0]+"! 👋";
  document.getElementById("todayDate").textContent=new Date().toLocaleDateString("en-US",{weekday:"long",year:"numeric",month:"long",day:"numeric"});
}
function setAvatar(elId, memberId, initials){
  const el=document.getElementById(elId); if(!el) return;
  const pic=loadProfilePic(memberId);
  if(pic){ el.innerHTML=`<img src="${pic}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"/>`; el.style.padding="0"; }
  else { el.textContent=initials; el.style.padding=""; }
}

// =============================================
// DATE & TIME
// =============================================
function setupDateTime(){
  const tick=()=>{ const el=document.getElementById("attTimeText"); if(el){ const n=new Date(); el.textContent=n.toLocaleDateString("en-US",{weekday:"long",year:"numeric",month:"long",day:"numeric"})+" · "+n.toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit",second:"2-digit"}); } };
  tick(); setInterval(tick,1000);
}

// =============================================
// NAVIGATION
// =============================================
function setupNavigation(){
  document.querySelectorAll(".nav-item").forEach(item=>{
    item.addEventListener("click",e=>{
      e.preventDefault();
      const page=item.dataset.page;
      document.querySelectorAll(".nav-item").forEach(n=>n.classList.remove("active"));
      document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
      item.classList.add("active");
      const t=document.getElementById("page-"+page); if(t) t.classList.add("active");
      document.getElementById("topbarTitle").textContent=item.textContent.trim().replace(/\s\d+$/,"").trim();
      if(page==="notices"){const b=document.getElementById("noticeBadge");if(b)b.style.display="none";}
      document.getElementById("sidebar").classList.remove("open");
    });
  });
}
function toggleSidebar(){ document.getElementById("sidebar").classList.toggle("open"); }
function navigateTo(page){
  const item=document.querySelector(`.nav-item[data-page="${page}"]`);
  if(item) item.click();
}

// =============================================
// THEME
// =============================================
function setupTheme(){
  if(localStorage.getItem("uniclub_theme")==="dark"){ document.body.classList.add("dark"); document.getElementById("themeBtn").textContent="☀️ Light"; }
}
function toggleTheme(){
  const d=document.body.classList.toggle("dark");
  document.getElementById("themeBtn").textContent=d?"☀️ Light":"🌙 Dark";
  localStorage.setItem("uniclub_theme",d?"dark":"light");
}

// =============================================
// SAVE
// =============================================
function saveAll(){
  saveData(uid,"stats",stats); saveData(uid,"attendance",attendance);
  saveData(uid,"badges",badges); saveData(uid,"streak",streak);
  localStorage.setItem("uniclub_notices",JSON.stringify(notices));
}

// =============================================
// HOME
// =============================================
function renderHome(){
  document.getElementById("statAttendance").textContent=stats.attendanceRate+"%";
  document.getElementById("statEvents").textContent=stats.eventsAttended;
  document.getElementById("statPoints").textContent=stats.points;
  document.getElementById("statStreak").textContent=stats.streak+"d 🔥";
  document.getElementById("statRank").textContent="#"+getUserRank(uid);
  buildStreakBar("streakBar"); renderHomeBadges(); renderHomeEvents();
}
function buildStreakBar(barId){
  const bar=document.getElementById(barId); if(!bar) return;
  bar.innerHTML="";
  const today=new Date().getDate();
  streak.forEach((val,idx)=>{
    const day=idx+1, dot=document.createElement("div");
    dot.className="streak-day"; dot.title="Day "+day;
    if(val===null||day>today) dot.style.opacity="0.25";
    else if(day===today){ dot.classList.add("today"); if(val) dot.classList.add("present"); }
    else dot.classList.add(val?"present":"absent");
    bar.appendChild(dot);
  });
}
function renderHomeBadges(){
  const g=document.getElementById("homeBadgeGrid"); if(!g) return;
  g.innerHTML=badges.map(b=>`<div class="badge-item ${b.earned?"earned":""}" title="${b.desc}"><div class="badge-icon">${b.icon}</div><div class="badge-name">${b.name}</div></div>`).join("");
}
function renderHomeEvents(){
  const list=document.getElementById("homeEventList"); if(!list) return;
  list.innerHTML=getEvents().filter(e=>!e.past).slice(0,3).map(ev=>{
    const reg=ev.registrants.includes(uid);
    return `<div class="event-item">
      <div class="event-date-box"><div class="event-day">${ev.day}</div><div class="event-month">${ev.month}</div></div>
      <div class="event-info">
        <div class="event-title">${ev.title}</div>
        <div class="event-meta">${ev.time} · ${ev.venue}</div>
        ${reg?`<span class="badge-registered">✓ Registered</span>`:`<button class="btn-register" onclick="registerEvent(${ev.id},this)">Register</button>`}
      </div>
    </div>`;
  }).join("") || `<p style="color:var(--text3);">No upcoming events.</p>`;
}

// =============================================
// ATTENDANCE — view only for members
// =============================================
function renderAttendance(){
  buildStreakBar("streakBar2");
  const rateEl=document.getElementById("myAttRate"); if(rateEl) rateEl.textContent=stats.attendanceRate+"%";
  const strEl=document.getElementById("myStreakNum"); if(strEl) strEl.textContent=stats.streak;
  renderAttendanceTable();
}
function renderAttendanceTable(){
  const tbody=document.getElementById("attendanceTbody"); if(!tbody) return;
  const rows=[...attendance].reverse();
  if(!rows.length){ tbody.innerHTML=`<tr><td colspan="4" style="text-align:center;color:var(--text3);padding:1.5rem">No attendance records yet. The admin gives attendance during sessions.</td></tr>`; return; }
  tbody.innerHTML=rows.map(r=>`<tr><td>${r.date}</td><td>${r.session}</td><td><span class="pill pill-${r.status.toLowerCase()}">${r.status}</span></td><td>${r.note}</td></tr>`).join("");
}

// =============================================
// EVENTS — FIXED: admin can always Manage, + Add Event
// =============================================
let selectedEventId=null;
const categoryColors={ Competition:"#cfe2ff:#0a3980", Lecture:"#e1f5ee:#0F6E56", Workshop:"#faeeda:#BA7517", Social:"#f8d7c4:#7c4a2a", Seminar:"#f3e6fb:#6f42c1", Other:"#f0f2f5:#555" };

function renderEvents(){
  renderEventCards("upcomingEventList", getEvents().filter(e=>!e.past));
  renderEventCards("pastEventList",     getEvents().filter(e=>e.past), true);
  renderHomeEvents();
}

function renderEventCards(containerId, list, past=false){
  const el=document.getElementById(containerId); if(!el) return;
  if(!list.length){ el.innerHTML=`<p style="color:var(--text3);padding:1rem 0;">No events here yet.</p>`; return; }
  el.innerHTML=list.map(ev=>{
    const registered=ev.registrants.includes(uid);
    const spotsLeft=ev.capacity-ev.registrants.length;
    const pct=Math.min(100,Math.round((ev.registrants.length/ev.capacity)*100));
    const [bg,tc]=(categoryColors[ev.category]||categoryColors.Other).split(":");
    return `
    <div class="ev-card ${past?"ev-past":""}">
      <div class="ev-card-left">
        <div class="ev-date-box ${past?"ev-past-box":""}">
          <div class="ev-day">${ev.day}</div>
          <div class="ev-month">${ev.month}</div>
          <div class="ev-year">${ev.year}</div>
        </div>
        <span class="ev-cat-badge" style="background:${bg};color:${tc}">${ev.category}</span>
      </div>
      <div class="ev-card-body">
        <div class="ev-card-title">${ev.title}</div>
        <div class="ev-card-desc">${ev.description}</div>
        <div class="ev-meta-grid">
          <div class="ev-meta-item">🕐 <span>${ev.time} · ${ev.duration}</span></div>
          <div class="ev-meta-item">📍 <span>${ev.venue}</span></div>
          <div class="ev-meta-item">👤 <span>${ev.organizer}</span></div>
          <div class="ev-meta-item">🎯 <span>+${ev.points} pts on attendance</span></div>
        </div>
        ${!past?`<div class="ev-capacity-row">
          <div class="ev-capacity-bar"><div class="ev-capacity-fill" style="width:${pct}%"></div></div>
          <span class="ev-capacity-text">${ev.registrants.length}/${ev.capacity} registered${spotsLeft>0?" · "+spotsLeft+" spots left":""}</span>
        </div>`:""}
        <div class="ev-card-actions">
          ${past
            ? ev.attendees.includes(uid) ? `<span class="badge-registered">✓ You attended · +${ev.points} pts</span>` : `<span class="badge-absent-event">✗ Not attended</span>`
            : registered
              ? `<span class="badge-registered">✓ Registered</span>`
              : spotsLeft>0 ? `<button class="btn-register" onclick="registerEvent(${ev.id},this)">Register for this event</button>` : `<span class="badge-full">Event Full</span>`
          }
          ${/* FIX: Admin ALWAYS sees Manage, regardless of registration */ isAdmin
            ? `<button class="btn-admin-ev" onclick="openEventAdmin(${ev.id})">⚙️ Manage</button>`
              + (isAdmin && !past ? `<button class="btn-admin-ev" style="color:var(--danger);border-color:var(--danger);" onclick="deleteEvent(${ev.id})">🗑 Delete</button>` : "")
            : ""}
        </div>
      </div>
    </div>`;
  }).join("");
}

function registerEvent(eventId){
  const evts=getEvents(), ev=evts.find(e=>e.id===eventId);
  if(!ev||ev.registrants.includes(uid)){ return; }
  if(ev.registrants.length>=ev.capacity){ showToast("⚠️ This event is full","warn"); return; }
  ev.registrants.push(uid);
  saveGlobalEvents(evts);
  checkBadge("team_player",true);
  saveAll(); renderEvents(); refreshStats();
  showToast("🎉 Registered for '"+ev.title+"'!");
}

// ---- DELETE EVENT ----
function deleteEvent(eventId){
  if(!confirm("Delete this event permanently?")) return;
  saveGlobalEvents(getEvents().filter(e=>e.id!==eventId));
  renderEvents(); showToast("🗑 Event deleted.");
}

// ---- ADD EVENT MODAL ---- (FIX: was missing entirely)
function openAddEventModal(){
  document.getElementById("addEventModal").style.display="flex";
  document.getElementById("addEventForm").reset();
  document.getElementById("addEventError").textContent="";
  // Default date = today
  const today=new Date();
  document.getElementById("evDay").value=String(today.getDate()).padStart(2,"0");
  document.getElementById("evMonth").value=today.toLocaleString("en-US",{month:"short"});
  document.getElementById("evYear").value=today.getFullYear();
}
function closeAddEventModal(){ document.getElementById("addEventModal").style.display="none"; }

function submitAddEvent(){
  const v=id=>document.getElementById(id).value.trim();
  const title=v("evTitle"),day=v("evDay"),month=v("evMonth"),year=v("evYear"),
        time=v("evTime"),duration=v("evDuration"),venue=v("evVenue"),
        capacity=parseInt(v("evCapacity"))||50,
        category=v("evCategory"),points=parseInt(v("evPoints"))||20,
        organizer=v("evOrganizer"),description=v("evDescription");
  const errEl=document.getElementById("addEventError");
  if(!title||!venue||!description){ errEl.textContent="⚠️ Title, Venue and Description are required."; return; }

  const evts=getEvents();
  const newId=evts.length ? Math.max(...evts.map(e=>e.id))+1 : 1;
  evts.push({
    id:newId, day:day||"01", month:month||"Jan", year:year||new Date().getFullYear(),
    title, description, venue, time:time||"TBD", duration:duration||"TBD",
    capacity, category, points, organizer:organizer||currentUser.name,
    contact:currentUser.email||"—", past:false, registrants:[], attendees:[]
  });
  saveGlobalEvents(evts);
  closeAddEventModal();
  renderEvents();
  showToast("✅ Event '"+title+"' created!");
}

// ---- MANAGE EVENT MODAL ----
function openEventAdmin(eventId){
  selectedEventId=eventId;
  const ev=getEvents().find(e=>e.id===eventId); if(!ev) return;
  document.getElementById("evAdminTitle").textContent="⚙️ Manage: "+ev.title;
  document.getElementById("evAdminDate").textContent=ev.day+" "+ev.month+" "+ev.year+" · "+ev.time+" · "+ev.venue;
  document.querySelectorAll(".ev-tab-btn").forEach((b,i)=>b.classList.toggle("active",i===0));
  renderEventAdminTabs(ev,"registrants");
  document.getElementById("evAdminModal").style.display="flex";
}
function closeEventAdmin(){ document.getElementById("evAdminModal").style.display="none"; selectedEventId=null; }
function switchEvTab(tab,btn){
  document.querySelectorAll(".ev-tab-btn").forEach(b=>b.classList.remove("active"));
  btn.classList.add("active");
  const ev=getEvents().find(e=>e.id===selectedEventId); if(!ev) return;
  renderEventAdminTabs(ev,tab);
}
function renderEventAdminTabs(ev,tab){
  const body=document.getElementById("evAdminBody");
  const members=getAllMembers();
  if(tab==="registrants"){
    if(!ev.registrants.length){ body.innerHTML=`<p style="color:var(--text3);padding:1rem 0">No registrations yet.</p>`; return; }
    body.innerHTML=`<p style="font-size:13px;color:var(--text2);margin-bottom:1rem;">${ev.registrants.length} registered · ${ev.attendees.length} attended</p>
      <table class="data-table"><thead><tr><th>Name</th><th>Student ID</th><th>Dept</th><th>Registered</th><th>Attended</th></tr></thead>
      <tbody>${ev.registrants.map(rid=>{ const m=members.find(x=>x.id===rid)||{name:"Unknown",id:rid,dept:"—"}; const att=ev.attendees.includes(rid);
        return `<tr><td><strong>${m.name}</strong></td><td style="font-size:12px;color:var(--text2)">${m.id}</td><td>${m.dept}</td>
          <td><span class="pill pill-present">✓ Yes</span></td>
          <td><span class="pill ${att?"pill-present":"pill-absent"}">${att?"✓ Attended":"✗ Absent"}</span></td></tr>`;
      }).join("")}</tbody></table>`;
  } else {
    if(!ev.registrants.length){ body.innerHTML=`<p style="color:var(--text3);padding:1rem 0">No registrations yet. Members must register first.</p>`; return; }
    body.innerHTML=`<p style="font-size:13px;color:var(--text2);margin-bottom:1rem;">Check who actually attended. Checking gives <strong>+${ev.points} pts</strong>.</p>
      <table class="data-table"><thead><tr><th>Name</th><th>Student ID</th><th>Dept</th><th>Mark Attendance</th></tr></thead>
      <tbody>${ev.registrants.map(rid=>{ const m=members.find(x=>x.id===rid)||{name:"Unknown",id:rid,dept:"—"}; const att=ev.attendees.includes(rid);
        return `<tr><td><strong>${m.name}</strong></td><td style="font-size:12px;color:var(--text2)">${m.id}</td><td>${m.dept}</td>
          <td><label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
            <input type="checkbox" id="evatt_${rid}" ${att?"checked":""} onchange="toggleEventAttendance(${ev.id},'${rid}',this.checked)" style="width:16px;height:16px;accent-color:var(--success);cursor:pointer;"/>
            <span style="font-size:13px;color:var(--text2);">${att?"✓ Attended":"Mark as attended"}</span>
          </label></td></tr>`;
      }).join("")}</tbody></table>`;
  }
}
function toggleEventAttendance(eventId,memberId,isAttended){
  const evts=getEvents(), ev=evts.find(e=>e.id===eventId); if(!ev) return;
  if(isAttended){
    if(!ev.attendees.includes(memberId)){
      ev.attendees.push(memberId);
      const mS=loadData(memberId,"stats",getDefaultStats(memberId));
      mS.eventsAttended=(mS.eventsAttended||0)+1; mS.points=(mS.points||0)+ev.points;
      saveData(memberId,"stats",mS); addPointsToLeaderboard(memberId,ev.points);
      checkBadge_for(memberId,mS.eventsAttended>=3,"event_pro");
    }
  } else {
    ev.attendees=ev.attendees.filter(x=>x!==memberId);
    const mS=loadData(memberId,"stats",getDefaultStats(memberId));
    mS.eventsAttended=Math.max(0,(mS.eventsAttended||1)-1); mS.points=Math.max(0,(mS.points||ev.points)-ev.points);
    saveData(memberId,"stats",mS); addPointsToLeaderboard(memberId,-ev.points);
  }
  saveGlobalEvents(evts);
  const lbl=document.querySelector(`#evatt_${memberId}`)?.parentElement?.querySelector("span");
  if(lbl) lbl.textContent=isAttended?"✓ Attended":"Mark as attended";
  refreshStats(); renderLeaderboard();
  showToast(isAttended?`✅ +${ev.points} pts given to ${memberId}`:`↩ Attendance removed for ${memberId}`);
}

// =============================================
// NOTICES
// =============================================
function renderNotices(){
  const list=document.getElementById("noticeList"); if(!list) return;
  list.innerHTML=notices.map(n=>`
    <div class="notice-item">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;">
        <span class="notice-tag tag-${n.tag}">${{urgent:"🔴 Urgent",general:"🔵 General",event:"🟢 Event"}[n.tag]||n.tag}</span>
        ${isAdmin?`<button class="btn-delete" onclick="deleteNotice(${n.id})">🗑</button>`:""}
      </div>
      <div class="notice-title">${n.title}</div>
      <div class="notice-body">${n.body}</div>
      <div class="notice-date">${n.date} · Posted by ${n.author}</div>
    </div>`).join("") || `<p style="color:var(--text3);padding:1rem 0">No notices yet.</p>`;
}
function toggleNoticeForm(){ const f=document.getElementById("noticeForm"); f.classList.toggle("open"); if(f.classList.contains("open")) f.scrollIntoView({behavior:"smooth"}); }
function postNotice(){
  const title=document.getElementById("noticeTitle").value.trim();
  const tag=document.getElementById("noticeCategory").value;
  const body=document.getElementById("noticeContent").value.trim();
  if(!title||!body){ showToast("⚠️ Fill in title and content","warn"); return; }
  notices.unshift({id:Date.now(),tag,title,body,date:"Just now",author:currentUser.name});
  stats.noticesPosted=(stats.noticesPosted||0)+1;
  addPoints(5); checkBadge("reporter",stats.noticesPosted>=3);
  const badge=document.getElementById("noticeBadge");
  if(badge){ badge.textContent=parseInt(badge.textContent||0)+1; badge.style.display=""; }
  saveAll(); renderNotices();
  document.getElementById("noticeTitle").value=""; document.getElementById("noticeContent").value="";
  toggleNoticeForm(); showToast("📢 Notice posted! +5 pts");
}
function deleteNotice(id){
  if(!confirm("Delete this notice?")) return;
  notices=notices.filter(n=>n.id!==id);
  localStorage.setItem("uniclub_notices",JSON.stringify(notices));
  renderNotices(); showToast("🗑 Notice deleted");
}

// =============================================
// LEADERBOARD
// =============================================
function renderLeaderboard(){
  const list=document.getElementById("leaderboardList"); if(!list) return;
  list.innerHTML=getLeaderboard().map((e,idx)=>{
    const rank=idx+1, isYou=e.id===uid;
    const rc=rank===1?"gold":rank===2?"silver":rank===3?"bronze":"";
    return `<div class="lb-item ${isYou?"lb-you":""}">
      <span class="lb-rank ${rc}">${rank}</span>
      <div class="lb-avatar" style="background:${e.bgColor};color:${e.txtColor}">${e.initials}</div>
      <div class="lb-name">${e.name}${isYou?` <span class="you-tag">You</span>`:""}</div>
      <span class="lb-badges">${e.badges} badge${e.badges!==1?"s":""}</span>
      <div class="lb-score">${e.points} pts</div>
    </div>`;
  }).join("");
}

// =============================================
// PROFILE + PROFILE PICTURE
// =============================================
function renderProfile(){
  setAvatar("profileAvatarEl", uid, currentUser.initials);
  document.getElementById("profileName").textContent=currentUser.name;
  document.getElementById("profileEmail").textContent=currentUser.email;
  document.getElementById("profileDept").textContent=currentUser.dept;
  const rb=document.getElementById("profileRoleBadge");
  rb.textContent=isAdmin?"Admin":"Active Member";
  if(isAdmin) rb.classList.add("admin");
  document.getElementById("pstatAttendance").textContent=stats.attendanceRate+"%";
  document.getElementById("pstatEvents").textContent=stats.eventsAttended;
  document.getElementById("pstatPoints").textContent=stats.points;
  document.getElementById("pstatRank").textContent="#"+getUserRank(uid);
  renderProfileBadges();
}
function renderProfileBadges(){
  const g=document.getElementById("profileBadgeGrid"); if(!g) return;
  g.innerHTML=badges.map(b=>`<div class="badge-item ${b.earned?"earned":""}" title="${b.desc}"><div class="badge-icon">${b.icon}</div><div class="badge-name">${b.name}</div>${!b.earned?'<div class="badge-locked">🔒</div>':""}</div>`).join("");
}
function triggerProfilePicUpload(){ document.getElementById("profilePicInput").click(); }
function handleProfilePicChange(input){
  const file=input.files[0]; if(!file) return;
  if(file.size>2*1024*1024){ showToast("⚠️ Image too large. Max 2MB.","warn"); return; }
  const reader=new FileReader();
  reader.onload=e=>{ saveProfilePic(uid,e.target.result); setAvatar("profileAvatarEl",uid,currentUser.initials); setAvatar("sidebarAvatar",uid,currentUser.initials); showToast("🖼️ Profile picture updated!"); };
  reader.readAsDataURL(file);
}

// =============================================
// CHANGE PASSWORD — NEW FEATURE
// =============================================
function openChangePwModal(){
  document.getElementById("changePwModal").style.display="flex";
  document.getElementById("changePwForm").reset();
  document.getElementById("changePwError").textContent="";
  document.getElementById("changePwSuccess").style.display="none";
}
function closeChangePwModal(){ document.getElementById("changePwModal").style.display="none"; }
function submitChangePassword(){
  const curr=document.getElementById("pwCurrent").value;
  const newPw=document.getElementById("pwNew").value;
  const conf=document.getElementById("pwConfirm").value;
  const errEl=document.getElementById("changePwError");
  const okEl=document.getElementById("changePwSuccess");
  errEl.textContent=""; okEl.style.display="none";

  // Verify current password
  const userRecord=findUser(uid,curr);
  if(!userRecord){ errEl.textContent="⚠️ Current password is incorrect."; return; }
  if(newPw.length<6){ errEl.textContent="⚠️ New password must be at least 6 characters."; return; }
  if(newPw!==conf){ errEl.textContent="⚠️ New passwords do not match."; return; }

  // Update in member list
  const members=getAllMembers();
  const m=members.find(x=>x.id===uid);
  if(m){ m.password=newPw; saveAllMembers(members); }
  okEl.style.display="block";
  document.getElementById("changePwForm").reset();
  setTimeout(closeChangePwModal, 1800);
  showToast("🔒 Password changed successfully!");
}

// =============================================
// RESEARCH FEATURES
// =============================================
function getResearchData(){
  const raw=localStorage.getItem("uniclub_research");
  if(raw) return JSON.parse(raw);
  const def={
    papers:[
      {id:1,title:"Machine Learning in Climate Prediction",authors:"Nadia Khan, Arif Rahman",link:"https://ieeexplore.ieee.org/",year:2025,tags:["ML","Climate"],addedBy:"Nadia Khan",addedById:"2023-CS-010",date:"Mar 10",pdfData:null,pdfName:null},
      {id:2,title:"Federated Learning for Privacy-Preserving Healthcare",authors:"Tanvir Chowdhury",link:"https://www.nature.com/",year:2024,tags:["Federated Learning","Healthcare"],addedBy:"Tanvir Chowdhury",addedById:"2024-ME-007",date:"Feb 22",pdfData:null,pdfName:null},
      {id:3,title:"Graph Neural Networks: A Review",authors:"Fatima Begum, Sadia Ferdousi",link:"https://dl.acm.org/",year:2024,tags:["GNN","Survey"],addedBy:"Fatima Begum",addedById:"2024-EEE-015",date:"Jan 15",pdfData:null,pdfName:null}
    ],
    teams:[
      {id:1,name:"NLP Research Group",lead:"Nadia Khan",members:["2023-CS-010","member","2024-CS-042"],topic:"Bangla NLP & Sentiment Analysis",status:"Active"},
      {id:2,name:"Computer Vision Lab",lead:"Tanvir Chowdhury",members:["2024-ME-007","2024-EEE-015"],topic:"Medical Image Segmentation",status:"Active"},
      {id:3,name:"Data Science Team",lead:"Fatima Begum",members:["2024-EEE-015","2023-BA-019"],topic:"Predictive Analytics for Education",status:"Forming"}
    ],
    mentors:[
      {id:1,name:"Dr. Asif Mahmud",title:"Club Supervisor",dept:"CS Dept",expertise:"Machine Learning, Deep Learning",email:"asif@university.edu",available:true},
      {id:2,name:"Dr. Rina Begum",title:"External Mentor",dept:"EEE Dept",expertise:"Signal Processing, Embedded Systems",email:"rina@university.edu",available:true},
      {id:3,name:"Mr. Karim Hassan",title:"Industry Mentor",dept:"Google Bangladesh",expertise:"MLOps, Cloud Computing",email:"karim@google.com",available:false}
    ],
    seminars:[
      {id:1,title:"Introduction to Transformer Models",speaker:"Dr. Asif Mahmud",date:"Mar 15, 2026",duration:"90 min",attendees:["member","2024-CS-042","2023-CS-010"],notes:"Covered BERT, GPT architecture. Slides shared on drive."},
      {id:2,title:"Research Methodology & Academic Writing",speaker:"Dr. Rina Begum",date:"Feb 28, 2026",duration:"2 hours",attendees:["member","2024-EEE-015","2023-BA-019"],notes:"Focus on paper structure, citation formats, avoiding plagiarism."}
    ]
  };
  localStorage.setItem("uniclub_research",JSON.stringify(def));
  return def;
}
function saveResearchData(data){ localStorage.setItem("uniclub_research",JSON.stringify(data)); }

function renderResearch(){
  renderPapers(); renderTeams(); renderMentors(); renderSeminars();
}

// -- Papers --
// Holds the selected PDF as base64 while the form is open
let _pendingPdfData = null;
let _pendingPdfName = null;

function renderPapers(){
  const el=document.getElementById("paperList"); if(!el) return;
  const papers=getResearchData().papers;
  if(!papers.length){ el.innerHTML=`<p style="color:var(--text3);padding:1rem 0">No papers added yet. Be the first to share one!</p>`; return; }
  el.innerHTML=papers.map(p=>`
    <div class="paper-card">
      <div class="paper-title">${p.title}</div>
      <div class="paper-authors">👥 ${p.authors}</div>
      <div class="paper-meta">
        <span>📅 ${p.year}</span>
        ${p.link?`<a href="${escHtml(p.link)}" target="_blank" rel="noopener" class="doi-link">🔗 View Paper / Reference</a>`:""}
        ${p.pdfData?`<button class="doi-link" style="background:none;border:none;cursor:pointer;padding:0;font-size:13px;" onclick="downloadPdf(${p.id})">📥 Download PDF</button>`:""}
      </div>
      ${p.tags&&p.tags.length?`<div class="paper-tags">${p.tags.map(t=>`<span class="paper-tag">${escHtml(t)}</span>`).join("")}</div>`:""}
      <div class="paper-footer">
        Added by ${escHtml(p.addedBy)} · ${p.date}
        ${(isAdmin||p.addedById===uid)?`<button class="btn-delete" style="margin-left:auto;" onclick="deletePaper(${p.id})">🗑</button>`:""}
      </div>
    </div>`).join("");
}

function escHtml(str){ return String(str||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

function handlePdfSelect(input){
  const file=input.files[0];
  if(!file) return;
  if(file.size>5*1024*1024){ showToast("⚠️ PDF too large. Max 5MB.","warn"); input.value=""; return; }
  const label=document.getElementById("pdfUploadLabel");
  label.textContent="⏳ Reading PDF...";
  const reader=new FileReader();
  reader.onload=e=>{
    _pendingPdfData=e.target.result; // base64 data URL
    _pendingPdfName=file.name;
    label.textContent="✅ "+file.name+" ("+Math.round(file.size/1024)+" KB) — click to change";
    document.getElementById("pdfUploadArea").style.borderColor="var(--success)";
  };
  reader.readAsDataURL(file);
}

function downloadPdf(paperId){
  const p=getResearchData().papers.find(x=>x.id===paperId);
  if(!p||!p.pdfData){ showToast("No PDF attached to this paper.","warn"); return; }
  const a=document.createElement("a");
  a.href=p.pdfData;
  a.download=p.pdfName||p.title.replace(/[^a-z0-9]/gi,"_")+".pdf";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

function togglePaperForm(){
  const f=document.getElementById("paperForm"); f.classList.toggle("open");
  if(!f.classList.contains("open")){
    // Reset PDF state when closing
    _pendingPdfData=null; _pendingPdfName=null;
    const label=document.getElementById("pdfUploadLabel");
    if(label) label.textContent="📎 Click to attach PDF file";
    const area=document.getElementById("pdfUploadArea");
    if(area) area.style.borderColor="";
  }
}

function submitPaper(){
  const v=id=>document.getElementById(id).value.trim();
  const title=v("paperTitle"),authors=v("paperAuthors"),link=v("paperLink"),year=v("paperYear"),tags=v("paperTags");
  if(!title||!authors){ showToast("⚠️ Title and authors are required","warn"); return; }
  const data=getResearchData();
  const newId=data.papers.length?Math.max(...data.papers.map(p=>p.id))+1:1;
  const newPaper={
    id:newId, title, authors,
    link: link||"",
    year: parseInt(year)||new Date().getFullYear(),
    tags: tags?tags.split(",").map(t=>t.trim()).filter(Boolean):[],
    addedBy: currentUser.name,
    addedById: uid,
    date: new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short"}),
    pdfData: _pendingPdfData||null,
    pdfName: _pendingPdfName||null
  };
  data.papers.unshift(newPaper);
  saveResearchData(data);
  // Reset form
  togglePaperForm();
  document.getElementById("paperForm").querySelectorAll("input,textarea").forEach(i=>i.value="");
  document.getElementById("paperPdfInput").value="";
  renderPapers(); addPoints(10); showToast("📄 Paper added to library! +10 pts");
}

function deletePaper(id){
  if(!confirm("Remove this paper from the library?")) return;
  const d=getResearchData(); d.papers=d.papers.filter(p=>p.id!==id);
  saveResearchData(d); renderPapers(); showToast("🗑 Paper removed.");
}

// -- Teams --
function renderTeams(){
  const el=document.getElementById("teamList"); if(!el) return;
  const teams=getResearchData().teams;
  const members=getAllMembers();
  el.innerHTML=teams.map(t=>{
    const isMember=t.members.includes(uid);
    const memberNames=t.members.map(id=>{ const m=members.find(x=>x.id===id); return m?m.name:id; });
    return `<div class="team-card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div class="team-name">${t.name}</div>
        <span class="team-status ${t.status==="Active"?"status-active":"status-forming"}">${t.status}</span>
      </div>
      <div class="team-topic">🔬 ${t.topic}</div>
      <div class="team-lead">👑 Lead: <strong>${t.lead}</strong></div>
      <div class="team-members">👥 ${memberNames.join(", ")}</div>
      <div style="margin-top:.75rem;display:flex;gap:8px;flex-wrap:wrap;">
        ${isMember
          ? `<span class="badge-registered" style="font-size:12px;">✓ You're in this team</span>`
          : `<button class="btn-register" style="font-size:12px;padding:5px 14px;" onclick="joinTeam(${t.id})">Join Team</button>`}
        ${isAdmin?`<button class="btn-admin-ev" onclick="deleteTeam(${t.id})">🗑 Remove</button>`:""}
      </div>
    </div>`;
  }).join("") || `<p style="color:var(--text3);">No teams yet.</p>`;
}
function joinTeam(teamId){
  const d=getResearchData(), t=d.teams.find(x=>x.id===teamId); if(!t||t.members.includes(uid)) return;
  t.members.push(uid); saveResearchData(d); renderTeams();
  showToast("🤝 You joined '"+t.name+"'!");
}
function toggleTeamForm(){ document.getElementById("teamForm").classList.toggle("open"); }
function submitTeam(){
  const v=id=>document.getElementById(id).value.trim();
  const name=v("teamName"),topic=v("teamTopic"),lead=v("teamLead"),status=v("teamStatus");
  if(!name||!topic){ showToast("⚠️ Name and topic required","warn"); return; }
  const d=getResearchData();
  const newId=d.teams.length?Math.max(...d.teams.map(t=>t.id))+1:1;
  d.teams.push({id:newId,name,lead:lead||currentUser.name,members:[uid],topic,status});
  saveResearchData(d); document.getElementById("teamForm").classList.remove("open");
  document.getElementById("teamForm").querySelectorAll("input,select").forEach(i=>i.value="");
  renderTeams(); showToast("🔬 Team '"+name+"' created!");
}
function deleteTeam(id){ if(!confirm("Delete this team?")) return; const d=getResearchData(); d.teams=d.teams.filter(t=>t.id!==id); saveResearchData(d); renderTeams(); }

// -- Mentors --
function renderMentors(){
  const el=document.getElementById("mentorList"); if(!el) return;
  el.innerHTML=getResearchData().mentors.map(m=>`
    <div class="mentor-card">
      <div class="mentor-avatar">${m.name.split(" ").map(w=>w[0]).join("").slice(0,2)}</div>
      <div class="mentor-info">
        <div class="mentor-name">${m.name}</div>
        <div class="mentor-title">${m.title} · ${m.dept}</div>
        <div class="mentor-expertise">💡 ${m.expertise}</div>
        <div style="display:flex;align-items:center;gap:10px;margin-top:.5rem;flex-wrap:wrap;">
          <span class="pill ${m.available?"pill-present":"pill-absent"}" style="font-size:11px;">${m.available?"✓ Available":"✗ Busy"}</span>
          <a href="mailto:${m.email}" class="doi-link">📧 Contact</a>
          ${isAdmin?`<button class="btn-delete" onclick="deleteMentor(${m.id})">🗑</button>`:""}
        </div>
      </div>
    </div>`).join("") || `<p style="color:var(--text3);">No mentors listed.</p>`;
}
function toggleMentorForm(){ document.getElementById("mentorForm").classList.toggle("open"); }
function submitMentor(){
  const v=id=>document.getElementById(id).value.trim();
  const name=v("mentorName"),title=v("mentorTitle"),dept=v("mentorDept"),expertise=v("mentorExpertise"),email=v("mentorEmail");
  if(!name||!expertise){ showToast("⚠️ Name and expertise required","warn"); return; }
  const d=getResearchData();
  const newId=d.mentors.length?Math.max(...d.mentors.map(m=>m.id))+1:1;
  d.mentors.push({id:newId,name,title:title||"Mentor",dept:dept||"—",expertise,email:email||"—",available:true});
  saveResearchData(d); document.getElementById("mentorForm").classList.remove("open");
  document.getElementById("mentorForm").querySelectorAll("input").forEach(i=>i.value="");
  renderMentors(); showToast("👨‍🏫 Mentor '"+name+"' added!");
}
function deleteMentor(id){ if(!confirm("Remove this mentor?")) return; const d=getResearchData(); d.mentors=d.mentors.filter(m=>m.id!==id); saveResearchData(d); renderMentors(); }

// -- Seminars --
function renderSeminars(){
  const el=document.getElementById("seminarList"); if(!el) return;
  const members=getAllMembers();
  el.innerHTML=getResearchData().seminars.map(s=>{
    const attended=s.attendees.includes(uid);
    const attNames=s.attendees.map(id=>{ const m=members.find(x=>x.id===id); return m?m.name.split(" ")[0]:id; });
    return `<div class="seminar-card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;flex-wrap:wrap;">
        <div>
          <div class="seminar-title">${s.title}</div>
          <div class="seminar-meta">🎤 ${s.speaker} · 📅 ${s.date} · ⏱ ${s.duration}</div>
        </div>
        <span class="pill ${attended?"pill-present":"pill-absent"}" style="flex-shrink:0;">${attended?"✓ Attended":"✗ Not attended"}</span>
      </div>
      ${s.notes?`<div class="seminar-notes">📝 ${s.notes}</div>`:""}
      <div class="seminar-footer">Attendees: ${attNames.join(", ")}
        ${isAdmin?`<button class="btn-admin-ev" style="margin-left:auto;" onclick="deleteSeminar(${s.id})">🗑 Delete</button>`:""}
      </div>
    </div>`;
  }).join("") || `<p style="color:var(--text3);">No seminars recorded yet.</p>`;
}
function toggleSeminarForm(){ document.getElementById("seminarForm").classList.toggle("open"); }
function submitSeminar(){
  const v=id=>document.getElementById(id).value.trim();
  const title=v("semTitle"),speaker=v("semSpeaker"),date=v("semDate"),duration=v("semDuration"),notes=v("semNotes");
  if(!title||!speaker){ showToast("⚠️ Title and speaker required","warn"); return; }
  const d=getResearchData();
  const newId=d.seminars.length?Math.max(...d.seminars.map(s=>s.id))+1:1;
  d.seminars.unshift({id:newId,title,speaker,date:date||new Date().toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}),duration:duration||"—",attendees:[],notes});
  saveResearchData(d); document.getElementById("seminarForm").classList.remove("open");
  document.getElementById("seminarForm").querySelectorAll("input,textarea").forEach(i=>i.value="");
  renderSeminars(); showToast("🎓 Seminar '"+title+"' added!");
}
function deleteSeminar(id){ if(!confirm("Delete this seminar record?")) return; const d=getResearchData(); d.seminars=d.seminars.filter(s=>s.id!==id); saveResearchData(d); renderSeminars(); }

// =============================================
// ADMIN
// =============================================
async function renderAdmin() {
  const container = document.getElementById("adminMembersList");
  if (!container) return;

  // 1. Get the latest data from the Cloud
  const snapshot = await db.collection("members").get();
  const cloudMembers = [];
  snapshot.forEach(doc => cloudMembers.push(doc.data()));

  // 2. Clear the list and draw the members
  container.innerHTML = "";
  cloudMembers.forEach(m => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <div class="user-info">
          <div class="user-avatar" style="background:#cfe2ff;color:#0a3980">${m.initials}</div>
          <div>
            <div class="user-name">${m.name}</div>
            <div class="user-id">${m.id}</div>
          </div>
        </div>
      </td>
      <td>${m.dept}</td>
      <td><span class="badge badge-success">${m.status}</span></td>
      <td><button class="btn-outline" onclick="alert('Profile of ${m.name}')">View</button></td>
    `;
    container.appendChild(tr);
  });
}
function renderMemberTable(){
  const tbody=document.getElementById("adminMemberTbody"); if(!tbody) return;
  const lb=getLeaderboard(), members=getAllMembers();
  tbody.innerHTML=members.map(u=>{
    const pts=(lb.find(e=>e.id===u.id)||{points:0}).points;
    const pic=loadProfilePic(u.id);
    const avatarHTML=pic?`<img src="${pic}" style="width:28px;height:28px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-right:6px;"/>`:`<span class="mini-avatar">${u.initials}</span>`;
    return `<tr>
      <td>${avatarHTML}<strong>${u.name}</strong></td>
      <td style="font-size:12px;color:var(--text2)">${u.id}</td>
      <td>${u.dept}</td><td>${u.year||"—"}</td>
      <td>${u.role==="admin"?'<span class="pill" style="background:var(--warning-light);color:var(--warning)">Admin</span>':'<span class="pill pill-present">Member</span>'}</td>
      <td><span class="pill ${u.status==="active"?"pill-present":"pill-absent"}">${u.status||"active"}</span></td>
      <td><strong>${pts}</strong></td>
      <td>${u.id===uid?'<span style="font-size:12px;color:var(--text3)">You</span>':`<button class="btn-tbl-danger" onclick="confirmRemoveMember('${u.id}','${u.name.replace(/'/g,"\\'").replace(/"/g,'\\"')}')">Remove</button>`}</td>
    </tr>`;
  }).join("");
}
function updateAdminStats(){
  const members=getAllMembers(), lb=getLeaderboard();
  document.getElementById("adminTotalMembers").textContent=members.length;
  document.getElementById("adminActiveMembers").textContent=members.filter(m=>m.status==="active").length;
  document.getElementById("adminTotalPoints").textContent=lb.reduce((s,e)=>s+e.points,0);
  document.getElementById("adminTotalNotices").textContent=notices.length;
}
function openAddMemberModal(){ document.getElementById("addMemberModal").style.display="flex"; document.getElementById("addMemberForm").reset(); document.getElementById("addMemberError").textContent=""; }
function closeAddMemberModal(){ document.getElementById("addMemberModal").style.display="none"; }
async function submitAddMember() {
  // 1. Get values from the modal inputs
  const nameInput = document.getElementById('newName').value.trim();
  const idInput = document.getElementById('newId').value.trim();
  const passwordInput = document.getElementById('newPassword').value || "123456";
  const deptInput = document.getElementById('newDept').value;
  const emailInput = document.getElementById('newEmail').value.trim();
  const phoneInput = document.getElementById('newPhone').value.trim();
  const yearInput = document.getElementById('newYear').value;
  const roleInput = document.getElementById('newRole').value;
  const statusInput = document.getElementById('newStatus').value;

  // 2. Simple validation
  if (!nameInput || !idInput) {
    alert("Name and Student ID are required!");
    return;
  }

  // 3. Create the member object
  const newMemberObj = {
    id: idInput,
    name: nameInput,
    password: passwordInput,
    dept: deptInput,
    email: emailInput,
    phone: phoneInput,
    year: yearInput,
    role: roleInput,
    status: statusInput,
    initials: nameInput.split(' ').map(n => n[0]).join('').toUpperCase()
  };

  // 4. Send to Firebase (using the 'await' we discussed)
  const success = await addMember(newMemberObj); 
  if (success) {
    alert("Success! Member added to the cloud.");
    closeAddMemberModal();
    window.location.reload(); 
  } else {
    alert("Error: Could not save to cloud. Check your connection or Firebase Rules.");
  }
}
function confirmRemoveMember(memberId,memberName){
  if(!confirm(`Remove "${memberName}" (${memberId})?\n\nThis permanently deletes their account and all data.`)) return;
  if(memberId===uid){ showToast("⚠️ Cannot remove yourself!","warn"); return; }
  removeMember(memberId); renderAdmin(); renderLeaderboard(); showToast("🗑 '"+memberName+"' removed.");
}
function exportMembersCSV(){
  const members=getAllMembers(), lb=getLeaderboard();
  const headers=["Name","Student ID","Department","Year","Role","Email","Phone","Status","Points","Rank"];
  const rows=members.map(u=>{ const lbE=lb.find(e=>e.id===u.id)||{points:0}; const rank=lb.findIndex(e=>e.id===u.id)+1||"—"; return [u.name,u.id,u.dept,u.year||"—",u.role,u.email,u.phone||"—",u.status||"active",lbE.points,rank]; });
  const csv=[headers,...rows].map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
  downloadFile(csv,"text/csv","UniClub_Members_"+new Date().toISOString().slice(0,10)+".csv");
  showToast("📥 CSV downloaded! "+members.length+" members exported.");
}
function triggerCSVImport(){ document.getElementById("csvImportInput").click(); }
function handleCSVImport(input){
  const file=input.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=e=>{ const lines=e.target.result.split("\n").map(l=>l.trim()).filter(Boolean); if(lines.length<2){ showToast("⚠️ CSV needs header + at least 1 row","warn"); return; } openCSVPreview(lines); };
  reader.readAsText(file); input.value="";
}
function openCSVPreview(lines){
  const header=lines[0].split(",").map(h=>h.replace(/"/g,"").trim().toLowerCase().replace(/\s/g,""));
  const preview=[], errors=[];
  lines.slice(1).forEach((line,i)=>{
    const cols=line.split(",").map(c=>c.replace(/"/g,"").trim());
    const get=keys=>{ for(const k of keys){ const idx=header.indexOf(k); if(idx>=0&&cols[idx]) return cols[idx]; } return ""; };
    const name=get(["name","fullname"]), id=get(["studentid","id","memberid"]);
    if(!name||!id){ errors.push("Row "+(i+2)+": missing Name or ID — skipped."); return; }
    const pwd=get(["password","pass"])||id;
    const initials=(name.split(" ").map(w=>w[0]).join("").toUpperCase()+"??").slice(0,2);
    preview.push({name,id,password:pwd,dept:get(["department","dept"])||"—",email:get(["email","mail"]),phone:get(["phone","mobile"]),year:get(["year","level","batch"]),role:get(["role"])||"member",status:get(["status"])||"active",initials});
  });
  document.getElementById("csvPreviewErrors").innerHTML=errors.length?`<div class="csv-errors">`+errors.map(e=>`<div>⚠️ ${e}</div>`).join("")+`</div>`:"";
  document.getElementById("csvPreviewCount").textContent=preview.length+" member(s) ready to import";
  document.getElementById("csvPreviewTbody").innerHTML=preview.map((m,i)=>`<tr><td><input type="checkbox" id="csvrow_${i}" checked style="width:14px;height:14px;accent-color:var(--primary)"/></td><td><strong>${m.name}</strong></td><td>${m.id}</td><td>${m.dept}</td><td>${m.email}</td><td>${m.role}</td></tr>`).join("");
  window._csvPreviewData=preview;
  document.getElementById("csvPreviewModal").style.display="flex";
}
function closeCSVPreview(){ document.getElementById("csvPreviewModal").style.display="none"; window._csvPreviewData=null; }
function submitCSVImport(){
  const data=window._csvPreviewData; if(!data) return;
  let added=0, skipped=0;
  data.forEach((m,i)=>{ const cb=document.getElementById("csvrow_"+i); if(cb&&!cb.checked){ skipped++; return; } addMember(m)?added++:skipped++; });
  closeCSVPreview(); renderAdmin(); renderLeaderboard();
  showToast(`✅ Imported ${added} member(s).${skipped?" "+skipped+" skipped":""}`);
}
function openBulkAttendance(){
  const members=getAllMembers().filter(m=>m.role!=="admin");
  document.getElementById("bulkSessionDate").textContent=new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"});
  document.getElementById("bulkAttBody").innerHTML=members.map(m=>`
    <tr><td><strong>${m.name}</strong></td><td style="font-size:12px;color:var(--text2)">${m.id}</td><td>${m.dept}</td>
    <td><select class="bulk-status-select" data-id="${m.id}"><option value="Present">✅ Present</option><option value="Late">🕐 Late</option><option value="Absent" selected>❌ Absent</option></select></td>
    <td><input type="text" class="bulk-note-input" data-id="${m.id}" placeholder="Note..." style="width:100%;padding:5px 8px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text);font-size:12px;"/></td></tr>`).join("");
  document.getElementById("bulkAttModal").style.display="flex";
}
function closeBulkAttendance(){ document.getElementById("bulkAttModal").style.display="none"; }
function submitBulkAttendance(){
  const session=document.getElementById("bulkSessionName").value.trim()||"Club Session";
  const todayStr=new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short"});
  let saved=0;
  document.querySelectorAll(".bulk-status-select").forEach((sel,i)=>{
    const memberId=sel.dataset.id, status=sel.value;
    const noteEl=document.querySelectorAll(".bulk-note-input")[i];
    const note=noteEl?noteEl.value.trim():"—";
    const mAtt=loadData(memberId,"attendance",getDefaultAttendance());
    if(!mAtt.some(r=>r.date===todayStr&&r.session===session)){ mAtt.push({date:todayStr,session,status,note:note||"—"}); saveData(memberId,"attendance",mAtt); }
    const mS=loadData(memberId,"stats",getDefaultStats(memberId));
    if(status==="Present"){ const pc=mAtt.filter(r=>r.status==="Present").length; mS.attendanceRate=Math.round((pc/mAtt.length)*100); mS.streak=(mS.streak||0)+1; mS.points=(mS.points||0)+10; addPointsToLeaderboard(memberId,10); checkBadge_for(memberId,mS.streak>=7,"streak_7"); }
    saveData(memberId,"stats",mS); saved++;
  });
  closeBulkAttendance(); attendance=loadData(uid,"attendance",getDefaultAttendance()); stats=loadData(uid,"stats",getDefaultStats(uid));
  renderAttendance(); renderHome(); renderLeaderboard();
  showToast("✅ Attendance saved for "+saved+" members!");
}
function checkBadge_for(memberId,condition,badgeId){
  if(!condition) return;
  const mB=loadData(memberId,"badges",getDefaultBadges()), b=mB.find(x=>x.id===badgeId);
  if(b&&!b.earned){ b.earned=true; saveData(memberId,"badges",mB); const lb=getLeaderboard(),le=lb.find(e=>e.id===memberId); if(le){le.badges++;saveLeaderboard(lb);} }
}

// =============================================
// POINTS & BADGES
// =============================================
function addPoints(amount){ stats.points+=amount; addPointsToLeaderboard(uid,amount); checkBadge("top_3",getUserRank(uid)<=3); refreshStats(); }
function refreshStats(){
  [["statAttendance","pstatAttendance"],["statEvents","pstatEvents"],["statPoints","pstatPoints"],["statRank","pstatRank"]].forEach(([a,b])=>{
    const va=document.getElementById(a), vb=document.getElementById(b);
    const val=a==="statAttendance"?stats.attendanceRate+"%":a==="statEvents"?stats.eventsAttended:a==="statPoints"?stats.points:"#"+getUserRank(uid);
    if(va) va.textContent=val; if(vb) vb.textContent=val;
  });
  const ss=document.getElementById("statStreak"); if(ss) ss.textContent=stats.streak+"d 🔥";
  renderLeaderboard();
}
function checkBadge(id,condition){
  const b=badges.find(x=>x.id===id);
  if(b&&!b.earned&&condition){ b.earned=true; const lb=getLeaderboard(),e=lb.find(x=>x.id===uid); if(e){e.badges++;saveLeaderboard(lb);} saveAll(); renderHomeBadges(); renderProfileBadges(); showToast("🏅 Badge unlocked: "+b.name+"!"); }
}

// =============================================
// HELPERS
// =============================================
function downloadFile(content,mime,filename){ const blob=new Blob([content],{type:mime}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); }
function logout(){ if(confirm("Log out?")){ clearSession(); window.location.href="index.html"; } }
function showToast(msg,type="success"){
  const old=document.getElementById("toastMsg"); if(old) old.remove();
  const t=document.createElement("div"); t.id="toastMsg"; t.textContent=msg;
  t.style.cssText=`position:fixed;bottom:24px;right:24px;z-index:9999;background:${type==="warn"?"var(--warning)":"var(--success)"};color:#fff;padding:12px 22px;border-radius:8px;font-size:14px;font-weight:600;box-shadow:0 4px 20px rgba(0,0,0,.25);animation:slideIn .3s ease;`;
  if(!document.getElementById("toastStyle")){ const s=document.createElement("style"); s.id="toastStyle"; s.textContent="@keyframes slideIn{from{transform:translateX(120%);opacity:0}to{transform:translateX(0);opacity:1}}"; document.head.appendChild(s); }
  document.body.appendChild(t); setTimeout(()=>t.remove(),3500);
}
