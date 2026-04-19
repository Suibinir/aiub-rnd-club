/* =============================================
   AIUB R&D CLUB — DASHBOARD.JS (Firebase)
   All localStorage replaced with Firestore.
   Real-time listeners for leaderboard, notices, events.
   ============================================= */
import {
  loadSession, clearSession, saveSession,
  db, findUser, changePassword,
  getAllMembers, addMember, removeMember,
  getStats, saveStats, addPointsToMember,
  getAttendance, addAttendanceRecord,
  getStreak, saveStreak,
  getBadges, earnBadge,
  getEvents, createEvent, updateEvent, deleteEvent, registerForEvent, markEventAttendee,
  getNotices, addNotice, deleteNotice as fbDeleteNotice,
  getLeaderboard, getUserRank,
  saveProfilePic, loadProfilePic,
  getPapers, addPaper, deletePaper as fbDeletePaper,
  getTeams, addTeam, joinTeam as fbJoinTeam, deleteTeam as fbDeleteTeam,
  getMentors, addMentor, deleteMentor as fbDeleteMentor,
  getSeminars, addSeminar, deleteSeminar as fbDeleteSeminar,
  saveBulkAttendance,
  listenToLeaderboard, listenToNotices, listenToEvents,
  sendChatMessage, getChatMessages, listenToChat, deleteChatMessage
} from "./firebase.js";

// ---- AUTH GUARD ----
const currentUser = loadSession();
if (!currentUser) { window.location.href = "index.html"; throw new Error("Not logged in"); }
const uid = currentUser.id;
const isAdmin = currentUser.role === "admin";

// ---- APP STATE ----
let stats = {}, attendance = [], badges = [], streak = [], notices = [], events = [], leaderboard = [];
let unsubLeaderboard, unsubNotices, unsubEvents;

// ---- PENDING PDF ----
let _pendingPdfData = null, _pendingPdfName = null;

// ---- ESCAPE HTML ----
function escHtml(s){ return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

// =============================================
// INIT
// =============================================
document.addEventListener("DOMContentLoaded", async ()=>{
  showGlobalLoader(true);
  try {
    setupUser();
    setupDateTime();
    setupNavigation();
    setupTheme();
    // Load all data in parallel
    [stats, attendance, badges, streak] = await Promise.all([
      getStats(uid),
      getAttendance(uid),
      getBadges(uid),
      getStreak(uid)
    ]);
    // Real-time listeners
    unsubLeaderboard = listenToLeaderboard(lb=>{ leaderboard=lb; renderLeaderboard(); refreshStats(); });
    unsubNotices     = listenToNotices(n=>{ notices=n; renderNotices(); updateNoticeBadge(); });
    unsubEvents      = listenToEvents(e=>{ events=e; renderEvents(); renderHomeEvents(); });
    renderHome();
    renderAttendance();
    renderProfile();
    await renderResearch();
    if(isAdmin) await renderAdmin();
  } catch(e){
    console.error("Init error:", e);
    showToast("⚠️ Failed to load some data. Check connection.", "warn");
  }
  showGlobalLoader(false);
});

function showGlobalLoader(on){
  let el = document.getElementById("globalLoader");
  if(!el){
    el = document.createElement("div");
    el.id = "globalLoader";
    el.innerHTML = `<div style="position:fixed;inset:0;background:var(--bg);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:9998;">
      <div style="font-size:32px;margin-bottom:1rem;">🎓</div>
      <div style="font-size:15px;color:var(--text2);">Loading AIUB R&D Club...</div>
      <div style="margin-top:1rem;width:200px;height:3px;background:var(--border);border-radius:2px;overflow:hidden;">
        <div style="height:100%;background:var(--primary);animation:loadBar 1.5s ease-in-out infinite;border-radius:2px;"></div>
      </div>
    </div>`;
    const style = document.createElement("style");
    style.textContent = "@keyframes loadBar{0%{width:0%;margin-left:0}50%{width:60%;margin-left:20%}100%{width:0%;margin-left:100%}}";
    document.head.appendChild(style);
    document.body.appendChild(el);
  }
  el.style.display = on ? "block" : "none";
}

// =============================================
// USER SETUP
// =============================================
function setupUser(){
  loadProfilePic(uid).then(pic => setAvatarEl("sidebarAvatar", pic, currentUser.initials));
  document.getElementById("sidebarName").textContent = currentUser.name;
  document.getElementById("sidebarRole").textContent = (isAdmin?"Admin":"Member")+" · "+currentUser.dept;
  if(isAdmin) document.body.classList.add("is-admin");
  const h = new Date().getHours();
  const g = h<12?"Good morning":h<17?"Good afternoon":"Good evening";
  document.getElementById("greetingText").textContent = g+", "+currentUser.name.split(" ")[0]+"! 👋";
  document.getElementById("todayDate").textContent = new Date().toLocaleDateString("en-US",{weekday:"long",year:"numeric",month:"long",day:"numeric"});
}

function setAvatarEl(elId, picUrl, initials){
  const el = document.getElementById(elId); if(!el) return;
  if(picUrl){ el.innerHTML=`<img src="${picUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"/>`; el.style.padding="0"; }
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
      if(page==="notices"){ const b=document.getElementById("noticeBadge"); if(b) b.style.display="none"; }
      document.getElementById("sidebar").classList.remove("open");
    });
  });
}
function toggleSidebar(){ document.getElementById("sidebar").classList.toggle("open"); }
function navigateTo(page){ const item=document.querySelector(`.nav-item[data-page="${page}"]`); if(item) item.click(); }

// =============================================
// THEME (localStorage is fine for UI preferences)
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
// HOME
// =============================================
function renderHome(){
  document.getElementById("statAttendance").textContent = (stats.attendanceRate||0)+"%";
  document.getElementById("statEvents").textContent     = stats.eventsAttended||0;
  document.getElementById("statPoints").textContent     = stats.points||0;
  document.getElementById("statStreak").textContent     = (stats.streak||0)+"d 🔥";
  const rank = leaderboard.findIndex(e=>e.id===uid);
  document.getElementById("statRank").textContent = rank>=0 ? "#"+(rank+1) : "—";
  buildStreakBar("streakBar");
  renderHomeBadges();
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
  g.innerHTML=badges.map(b=>`<div class="badge-item ${b.earned?"earned":""}" title="${escHtml(b.desc)}"><div class="badge-icon">${b.icon}</div><div class="badge-name">${escHtml(b.name)}</div></div>`).join("");
}
function renderHomeEvents(){
  const list=document.getElementById("homeEventList"); if(!list) return;
  const upcoming=events.filter(e=>!e.past).slice(0,3);
  if(!upcoming.length){ list.innerHTML=`<p style="color:var(--text3);">No upcoming events yet.</p>`; return; }
  list.innerHTML=upcoming.map(ev=>{
    const reg=(ev.registrants||[]).includes(uid);
    return `<div class="event-item">
      <div class="event-date-box"><div class="event-day">${ev.day}</div><div class="event-month">${ev.month}</div></div>
      <div class="event-info">
        <div class="event-title">${escHtml(ev.title)}</div>
        <div class="event-meta">${escHtml(ev.time)} · ${escHtml(ev.venue)}</div>
        ${reg?`<span class="badge-registered">✓ Registered</span>`:`<button class="btn-register" onclick="doRegisterEvent('${ev.firestoreId||ev.id}',this)">Register</button>`}
      </div>
    </div>`;
  }).join("");
}

// =============================================
// ATTENDANCE — view only for members
// =============================================
function renderAttendance(){
  buildStreakBar("streakBar2");
  const rateEl=document.getElementById("myAttRate"); if(rateEl) rateEl.textContent=(stats.attendanceRate||0)+"%";
  const strEl=document.getElementById("myStreakNum"); if(strEl) strEl.textContent=stats.streak||0;
  renderAttendanceTable();
}
function renderAttendanceTable(){
  const tbody=document.getElementById("attendanceTbody"); if(!tbody) return;
  if(!attendance.length){
    tbody.innerHTML=`<tr><td colspan="4" style="text-align:center;color:var(--text3);padding:1.5rem;">No attendance records yet. Admin will give attendance during sessions.</td></tr>`;
    return;
  }
  tbody.innerHTML=[...attendance].slice(0,50).map(r=>`
    <tr><td>${r.date}</td><td>${escHtml(r.session)}</td>
    <td><span class="pill pill-${r.status.toLowerCase()}">${r.status}</span></td>
    <td>${r.note||"—"}</td></tr>`).join("");
}

// =============================================
// EVENTS — real-time via listener
// =============================================
const categoryColors={ Competition:"#cfe2ff:#0a3980", Lecture:"#e1f5ee:#0F6E56", Workshop:"#faeeda:#BA7517", Social:"#f8d7c4:#7c4a2a", Seminar:"#f3e6fb:#6f42c1", Other:"#f0f2f5:#555" };

function renderEvents(){
  renderEventCards("upcomingEventList", events.filter(e=>!e.past));
  renderEventCards("pastEventList",     events.filter(e=>e.past), true);
}
function renderEventCards(containerId, list, past=false){
  const el=document.getElementById(containerId); if(!el) return;
  if(!list.length){ el.innerHTML=`<p style="color:var(--text3);padding:1rem 0;">No events here yet.</p>`; return; }
  el.innerHTML=list.map(ev=>{
    const fid = ev.firestoreId || String(ev.id);
    const registered=(ev.registrants||[]).includes(uid);
    const spotsLeft=ev.capacity-(ev.registrants||[]).length;
    const pct=Math.min(100,Math.round(((ev.registrants||[]).length/ev.capacity)*100));
    const [bg,tc]=(categoryColors[ev.category]||categoryColors.Other).split(":");
    return `
    <div class="ev-card ${past?"ev-past":""}">
      <div class="ev-card-left">
        <div class="ev-date-box ${past?"ev-past-box":""}">
          <div class="ev-day">${ev.day}</div><div class="ev-month">${ev.month}</div><div class="ev-year">${ev.year}</div>
        </div>
        <span class="ev-cat-badge" style="background:${bg};color:${tc}">${ev.category}</span>
      </div>
      <div class="ev-card-body">
        <div class="ev-card-title">${escHtml(ev.title)}</div>
        <div class="ev-card-desc">${escHtml(ev.description)}</div>
        <div class="ev-meta-grid">
          <div class="ev-meta-item">🕐 <span>${escHtml(ev.time)} · ${escHtml(ev.duration)}</span></div>
          <div class="ev-meta-item">📍 <span>${escHtml(ev.venue)}</span></div>
          <div class="ev-meta-item">👤 <span>${escHtml(ev.organizer)}</span></div>
          <div class="ev-meta-item">🎯 <span>+${ev.points} pts on attendance</span></div>
        </div>
        ${!past?`<div class="ev-capacity-row">
          <div class="ev-capacity-bar"><div class="ev-capacity-fill" style="width:${pct}%"></div></div>
          <span class="ev-capacity-text">${(ev.registrants||[]).length}/${ev.capacity} registered${spotsLeft>0?" · "+spotsLeft+" spots left":""}</span>
        </div>`:""}
        <div class="ev-card-actions">
          ${past
            ? (ev.attendees||[]).includes(uid) ? `<span class="badge-registered">✓ You attended · +${ev.points} pts</span>` : `<span class="badge-absent-event">✗ Not attended</span>`
            : registered ? `<span class="badge-registered">✓ Registered</span>`
            : spotsLeft>0 ? `<button class="btn-register" onclick="doRegisterEvent('${fid}',this)">Register for this event</button>`
            : `<span class="badge-full">Event Full</span>`}
          ${isAdmin?`<button class="btn-admin-ev" onclick="openEventAdmin('${fid}')">⚙️ Manage</button>${!past?`<button class="btn-admin-ev" style="color:var(--danger);border-color:var(--danger);" onclick="doDeleteEvent('${fid}')">🗑 Delete</button>`:""}` :""}
        </div>
      </div>
    </div>`;
  }).join("");
}

async function doRegisterEvent(fid, btn){
  btn.disabled=true; btn.textContent="Registering...";
  try {
    await registerForEvent(fid, uid);
    const ev=events.find(e=>(e.firestoreId||String(e.id))===fid);
    checkBadge("team_player", true);
    showToast("🎉 Registered"+(ev?" for '"+ev.title+"'":"")+"!");
  } catch(e){ showToast("❌ Failed to register","warn"); btn.disabled=false; btn.textContent="Register"; }
}
async function doDeleteEvent(fid){
  if(!confirm("Delete this event permanently?")) return;
  try { await deleteEvent(fid); showToast("🗑 Event deleted."); }
  catch(e){ showToast("❌ Error deleting event","warn"); }
}

// ---- ADD EVENT ----
function openAddEventModal(){ document.getElementById("addEventModal").style.display="flex"; document.getElementById("addEventForm").reset(); document.getElementById("addEventError").textContent=""; const t=new Date(); document.getElementById("evDay").value=String(t.getDate()).padStart(2,"0"); document.getElementById("evYear").value=t.getFullYear(); }
function closeAddEventModal(){ document.getElementById("addEventModal").style.display="none"; }
async function submitAddEvent(){
  const v=id=>document.getElementById(id).value.trim();
  const title=v("evTitle"),venue=v("evVenue"),description=v("evDescription");
  if(!title||!venue||!description){ document.getElementById("addEventError").textContent="⚠️ Title, Venue and Description are required."; return; }
  const btn=document.querySelector("#addEventForm .btn-primary"); btn.disabled=true; btn.textContent="Creating...";
  try {
    await createEvent({ day:v("evDay")||"01", month:v("evMonth")||"Jan", year:v("evYear")||new Date().getFullYear(), title, description, venue, time:v("evTime")||"TBD", duration:v("evDuration")||"TBD", capacity:parseInt(v("evCapacity"))||50, category:v("evCategory"), points:parseInt(v("evPoints"))||20, organizer:v("evOrganizer")||currentUser.name, past:false, registrants:[], attendees:[] });
    closeAddEventModal(); showToast("✅ Event '"+title+"' created!");
  } catch(e){ document.getElementById("addEventError").textContent="❌ Error: "+e.message; }
  btn.disabled=false; btn.textContent="Create Event";
}

// ---- EVENT ADMIN MODAL ----
let selectedEventFid = null;
function openEventAdmin(fid){ selectedEventFid=fid; const ev=events.find(e=>(e.firestoreId||String(e.id))===fid); if(!ev) return; document.getElementById("evAdminTitle").textContent="⚙️ Manage: "+ev.title; document.getElementById("evAdminDate").textContent=ev.day+" "+ev.month+" "+ev.year+" · "+ev.time+" · "+ev.venue; document.querySelectorAll(".ev-tab-btn").forEach((b,i)=>b.classList.toggle("active",i===0)); renderEventAdminTabs(ev,"registrants"); document.getElementById("evAdminModal").style.display="flex"; }
function closeEventAdmin(){ document.getElementById("evAdminModal").style.display="none"; selectedEventFid=null; }
function switchEvTab(tab,btn){ document.querySelectorAll(".ev-tab-btn").forEach(b=>b.classList.remove("active")); btn.classList.add("active"); const ev=events.find(e=>(e.firestoreId||String(e.id))===selectedEventFid); if(ev) renderEventAdminTabs(ev,tab); }
async function renderEventAdminTabs(ev,tab){
  const body=document.getElementById("evAdminBody");
  const members=await getAllMembers();
  const regs=ev.registrants||[], atts=ev.attendees||[];
  if(tab==="registrants"){
    if(!regs.length){ body.innerHTML=`<p style="color:var(--text3);padding:1rem 0">No registrations yet.</p>`; return; }
    body.innerHTML=`<p style="font-size:13px;color:var(--text2);margin-bottom:1rem;">${regs.length} registered · ${atts.length} attended</p>
      <table class="data-table"><thead><tr><th>Name</th><th>Student ID</th><th>Dept</th><th>Registered</th><th>Attended</th></tr></thead>
      <tbody>${regs.map(rid=>{ const m=members.find(x=>x.id===rid)||{name:"Unknown",id:rid,dept:"—"}; const att=atts.includes(rid);
        return `<tr><td><strong>${escHtml(m.name)}</strong></td><td style="font-size:12px;color:var(--text2)">${escHtml(m.id)}</td><td>${escHtml(m.dept)}</td>
        <td><span class="pill pill-present">✓ Yes</span></td>
        <td><span class="pill ${att?"pill-present":"pill-absent"}">${att?"✓ Attended":"✗ Absent"}</span></td></tr>`;
      }).join("")}</tbody></table>`;
  } else {
    if(!regs.length){ body.innerHTML=`<p style="color:var(--text3);padding:1rem 0">No registrations yet.</p>`; return; }
    body.innerHTML=`<p style="font-size:13px;color:var(--text2);margin-bottom:1rem;">Check attendance. Checking gives <strong>+${ev.points} pts</strong>.</p>
      <table class="data-table"><thead><tr><th>Name</th><th>Student ID</th><th>Dept</th><th>Mark Attendance</th></tr></thead>
      <tbody>${regs.map(rid=>{ const m=members.find(x=>x.id===rid)||{name:"Unknown",id:rid,dept:"—"}; const att=atts.includes(rid);
        const fid=ev.firestoreId||String(ev.id);
        return `<tr><td><strong>${escHtml(m.name)}</strong></td><td style="font-size:12px;color:var(--text2)">${escHtml(m.id)}</td><td>${escHtml(m.dept)}</td>
        <td><label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
          <input type="checkbox" id="evatt_${rid}" ${att?"checked":""} onchange="doToggleEventAtt('${fid}','${rid}',this.checked,${ev.points})" style="width:16px;height:16px;accent-color:var(--success);cursor:pointer;"/>
          <span style="font-size:13px;color:var(--text2);">${att?"✓ Attended":"Mark as attended"}</span>
        </label></td></tr>`;
      }).join("")}</tbody></table>`;
  }
}
async function doToggleEventAtt(fid, memberId, attended, pts){
  try {
    await markEventAttendee(fid, memberId, attended);
    if(attended){
      await addPointsToMember(memberId, pts);
      // Update member stats
      const mStats = await getStats(memberId);
      mStats.eventsAttended = (mStats.eventsAttended||0)+1;
      await saveStats(memberId, mStats);
    } else {
      await addPointsToMember(memberId, -pts);
      const mStats = await getStats(memberId);
      mStats.eventsAttended = Math.max(0,(mStats.eventsAttended||1)-1);
      await saveStats(memberId, mStats);
    }
    const lbl=document.querySelector(`#evatt_${memberId}`)?.parentElement?.querySelector("span");
    if(lbl) lbl.textContent=attended?"✓ Attended":"Mark as attended";
    showToast(attended?`✅ +${pts} pts given to ${memberId}`:`↩ Attendance removed`);
  } catch(e){ showToast("❌ Error: "+e.message,"warn"); }
}

// =============================================
// NOTICES — real-time via listener
// =============================================
function updateNoticeBadge(){
  const badge=document.getElementById("noticeBadge");
  if(badge && notices.length>0){ badge.textContent=Math.min(notices.length,9); badge.style.display=""; }
}
function renderNotices(){
  const list=document.getElementById("noticeList"); if(!list) return;
  list.innerHTML=notices.map(n=>`
    <div class="notice-item">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;">
        <span class="notice-tag tag-${n.tag}">${{urgent:"🔴 Urgent",general:"🔵 General",event:"🟢 Event"}[n.tag]||n.tag}</span>
        ${isAdmin?`<button class="btn-delete" onclick="doDeleteNotice('${n.firestoreId}')">🗑</button>`:""}
      </div>
      <div class="notice-title">${escHtml(n.title)}</div>
      <div class="notice-body">${escHtml(n.body)}</div>
      <div class="notice-date">${n.date} · Posted by ${escHtml(n.author)}</div>
    </div>`).join("") || `<p style="color:var(--text3);padding:1rem 0">No notices yet.</p>`;
}
function toggleNoticeForm(){ const f=document.getElementById("noticeForm"); f.classList.toggle("open"); if(f.classList.contains("open")) f.scrollIntoView({behavior:"smooth"}); }
async function postNotice(){
  const title=document.getElementById("noticeTitle").value.trim();
  const tag=document.getElementById("noticeCategory").value;
  const body=document.getElementById("noticeContent").value.trim();
  if(!title||!body){ showToast("⚠️ Fill in title and content","warn"); return; }
  try {
    await addNotice({ tag, title, body, date:"Just now", author:currentUser.name });
    stats.noticesPosted=(stats.noticesPosted||0)+1;
    await addPointsToMember(uid,5);
    await saveStats(uid, stats);
    checkBadge("reporter", stats.noticesPosted>=3);
    document.getElementById("noticeTitle").value="";
    document.getElementById("noticeContent").value="";
    toggleNoticeForm();
    showToast("📢 Notice posted! +5 pts");
  } catch(e){ showToast("❌ Error posting notice","warn"); }
}
async function doDeleteNotice(fid){
  if(!confirm("Delete this notice?")) return;
  try { await fbDeleteNotice(fid); showToast("🗑 Notice deleted"); }
  catch(e){ showToast("❌ Error deleting notice","warn"); }
}

// =============================================
// LEADERBOARD — updates via real-time listener
// =============================================
function renderLeaderboard(){
  const list=document.getElementById("leaderboardList"); if(!list) return;
  list.innerHTML=leaderboard.map((e,idx)=>{
    const rank=idx+1, isYou=e.id===uid;
    const rc=rank===1?"gold":rank===2?"silver":rank===3?"bronze":"";
    return `<div class="lb-item ${isYou?"lb-you":""}">
      <span class="lb-rank ${rc}">${rank}</span>
      <div class="lb-avatar" style="background:${e.bgColor||"#e9ecef"};color:${e.txtColor||"#495057"}">${e.initials}</div>
      <div class="lb-name">${escHtml(e.name)}${isYou?` <span class="you-tag">You</span>`:""}</div>
      <span class="lb-badges">${e.badges||0} badge${(e.badges||0)!==1?"s":""}</span>
      <div class="lb-score">${e.points||0} pts</div>
    </div>`;
  }).join("") || `<p style="color:var(--text3);">Loading rankings...</p>`;
}

// =============================================
// PROFILE + PICTURE
// =============================================
async function renderProfile(){
  const pic = await loadProfilePic(uid);
  setAvatarEl("profileAvatarEl", pic, currentUser.initials);
  document.getElementById("profileName").textContent = currentUser.name;
  document.getElementById("profileEmail").textContent = currentUser.email;
  document.getElementById("profileDept").textContent = currentUser.dept;
  const rb=document.getElementById("profileRoleBadge");
  rb.textContent=isAdmin?"Admin":"Active Member";
  if(isAdmin) rb.classList.add("admin");
  renderProfileStats();
  renderProfileBadges();
}
function renderProfileStats(){
  document.getElementById("pstatAttendance").textContent=(stats.attendanceRate||0)+"%";
  document.getElementById("pstatEvents").textContent=stats.eventsAttended||0;
  document.getElementById("pstatPoints").textContent=stats.points||0;
  const rank=leaderboard.findIndex(e=>e.id===uid);
  document.getElementById("pstatRank").textContent=rank>=0?"#"+(rank+1):"—";
}
function renderProfileBadges(){
  const g=document.getElementById("profileBadgeGrid"); if(!g) return;
  g.innerHTML=badges.map(b=>`<div class="badge-item ${b.earned?"earned":""}" title="${escHtml(b.desc||"")}"><div class="badge-icon">${b.icon}</div><div class="badge-name">${escHtml(b.name)}</div>${!b.earned?'<div class="badge-locked">🔒</div>':""}</div>`).join("");
}
function triggerProfilePicUpload(){ document.getElementById("profilePicInput").click(); }
function handleProfilePicChange(input){
  const file=input.files[0]; if(!file) return;
  if(file.size>2*1024*1024){ showToast("⚠️ Image too large. Max 2MB.","warn"); return; }
  const reader=new FileReader();
  reader.onload=async e=>{
    try {
      await saveProfilePic(uid, e.target.result);
      setAvatarEl("profileAvatarEl", e.target.result, currentUser.initials);
      setAvatarEl("sidebarAvatar", e.target.result, currentUser.initials);
      showToast("🖼️ Profile picture updated!");
    } catch(err){ showToast("❌ Error saving picture","warn"); }
  };
  reader.readAsDataURL(file);
}

// =============================================
// CHANGE PASSWORD
// =============================================
function openChangePwModal(){ document.getElementById("changePwModal").style.display="flex"; document.getElementById("changePwForm").reset(); document.getElementById("changePwError").textContent=""; document.getElementById("changePwSuccess").style.display="none"; }
function closeChangePwModal(){ document.getElementById("changePwModal").style.display="none"; }
async function submitChangePassword(){
  const curr=document.getElementById("pwCurrent").value;
  const newPw=document.getElementById("pwNew").value;
  const conf=document.getElementById("pwConfirm").value;
  const errEl=document.getElementById("changePwError");
  const okEl=document.getElementById("changePwSuccess");
  errEl.textContent=""; okEl.style.display="none";
  const userRecord = await findUser(uid, curr);
  if(!userRecord){ errEl.textContent="⚠️ Current password is incorrect."; return; }
  if(newPw.length<6){ errEl.textContent="⚠️ New password must be at least 6 characters."; return; }
  if(newPw!==conf){ errEl.textContent="⚠️ New passwords do not match."; return; }
  try {
    await changePassword(uid, newPw);
    okEl.style.display="block";
    document.getElementById("changePwForm").reset();
    setTimeout(closeChangePwModal, 1800);
    showToast("🔒 Password changed successfully!");
  } catch(e){ errEl.textContent="❌ Error: "+e.message; }
}

// =============================================
// RESEARCH FEATURES
// =============================================
async function renderResearch(){
  await Promise.all([renderPapers(), renderTeams(), renderMentors(), renderSeminars()]);
}

// -- Papers --
async function renderPapers(){
  const el=document.getElementById("paperList"); if(!el) return;
  el.innerHTML=`<p style="color:var(--text3);">Loading papers...</p>`;
  try {
    const papers=await getPapers();
    if(!papers.length){ el.innerHTML=`<p style="color:var(--text3);padding:1rem 0">No papers added yet. Be the first!</p>`; return; }
    el.innerHTML=papers.map(p=>`
      <div class="paper-card">
        <div class="paper-title">${escHtml(p.title)}</div>
        <div class="paper-authors">👥 ${escHtml(p.authors)}</div>
        <div class="paper-meta">
          <span>📅 ${p.year}</span>
          ${p.link?`<a href="${escHtml(p.link)}" target="_blank" rel="noopener" class="doi-link">🔗 View Paper / Reference</a>`:""}
          ${p.pdfData?`<button class="doi-link" style="background:none;border:none;cursor:pointer;padding:0;font-size:13px;" onclick="downloadPdf('${p.firestoreId}')">📥 Download PDF</button>`:""}
        </div>
        ${p.tags&&p.tags.length?`<div class="paper-tags">${p.tags.map(t=>`<span class="paper-tag">${escHtml(t)}</span>`).join("")}</div>`:""}
        <div class="paper-footer">Added by ${escHtml(p.addedBy)} · ${p.date}
          ${(isAdmin||p.addedById===uid)?`<button class="btn-delete" style="margin-left:auto;" onclick="doDeletePaper('${p.firestoreId}')">🗑</button>`:""}
        </div>
      </div>`).join("");
  } catch(e){ el.innerHTML=`<p style="color:var(--danger);">Error loading papers.</p>`; }
}

let _paperCache = [];
async function downloadPdf(fid){
  const papers=await getPapers();
  const p=papers.find(x=>x.firestoreId===fid);
  if(!p||!p.pdfData){ showToast("No PDF attached.","warn"); return; }
  const a=document.createElement("a"); a.href=p.pdfData; a.download=p.pdfName||"paper.pdf";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

function handlePdfSelect(input){
  const file=input.files[0]; if(!file) return;
  if(file.size>5*1024*1024){ showToast("⚠️ PDF too large. Max 5MB.","warn"); input.value=""; return; }
  const label=document.getElementById("pdfUploadLabel");
  label.textContent="⏳ Reading PDF...";
  const reader=new FileReader();
  reader.onload=e=>{
    _pendingPdfData=e.target.result; _pendingPdfName=file.name;
    label.textContent="✅ "+file.name+" ("+Math.round(file.size/1024)+" KB)";
    document.getElementById("pdfUploadArea").style.borderColor="var(--success)";
  };
  reader.readAsDataURL(file);
}

function togglePaperForm(){
  const f=document.getElementById("paperForm"); f.classList.toggle("open");
  if(!f.classList.contains("open")){
    _pendingPdfData=null; _pendingPdfName=null;
    const lbl=document.getElementById("pdfUploadLabel"); if(lbl) lbl.textContent="📎 Click to attach a PDF file";
    const area=document.getElementById("pdfUploadArea"); if(area) area.style.borderColor="";
  }
}

async function submitPaper(){
  const v=id=>document.getElementById(id).value.trim();
  const title=v("paperTitle"),authors=v("paperAuthors");
  if(!title||!authors){ showToast("⚠️ Title and authors required","warn"); return; }
  const btn=document.querySelector("#paperForm .btn-primary"); btn.disabled=true; btn.textContent="Adding...";
  try {
    await addPaper({
      title, authors, link:v("paperLink"), year:parseInt(v("paperYear"))||new Date().getFullYear(),
      tags:v("paperTags")?v("paperTags").split(",").map(t=>t.trim()).filter(Boolean):[],
      addedBy:currentUser.name, addedById:uid,
      date:new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short"}),
      pdfData:_pendingPdfData||null, pdfName:_pendingPdfName||null
    });
    togglePaperForm();
    document.getElementById("paperForm").querySelectorAll("input,textarea").forEach(i=>i.value="");
    document.getElementById("paperPdfInput").value="";
    await renderPapers();
    await addPointsToMember(uid, 10);
    stats.points=(stats.points||0)+10;
    showToast("📄 Paper added! +10 pts");
  } catch(e){ showToast("❌ Error: "+e.message,"warn"); }
  btn.disabled=false; btn.textContent="Add to Library";
}

async function doDeletePaper(fid){
  if(!confirm("Remove this paper?")) return;
  try { await fbDeletePaper(fid); await renderPapers(); showToast("🗑 Paper removed."); }
  catch(e){ showToast("❌ Error removing paper","warn"); }
}

// -- Teams --
async function renderTeams(){
  const el=document.getElementById("teamList"); if(!el) return;
  el.innerHTML=`<p style="color:var(--text3);">Loading teams...</p>`;
  try {
    const teams=await getTeams(), members=await getAllMembers();
    if(!teams.length){ el.innerHTML=`<p style="color:var(--text3);">No teams yet. Create one above!</p>`; return; }
    el.innerHTML=teams.map(t=>{
      const isMember=(t.members||[]).includes(uid);
      const memberNames=(t.members||[]).map(id=>{ const m=members.find(x=>x.id===id); return m?m.name:id; });
      return `<div class="team-card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:.5rem;">
          <div class="team-name">${escHtml(t.name)}</div>
          <span class="team-status ${t.status==="Active"?"status-active":"status-forming"}">${t.status}</span>
        </div>
        <div class="team-topic">🔬 ${escHtml(t.topic)}</div>
        <div class="team-lead">👑 Lead: <strong>${escHtml(t.lead)}</strong></div>
        <div class="team-members">👥 ${escHtml(memberNames.join(", "))}</div>
        <div style="margin-top:.75rem;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          ${isMember
            ? `<button class="btn-chat" onclick="openChat('${t.firestoreId}','${escHtml(t.name).replace(/'/g,"\\'")}')">💬 Team Chat</button>`
            : `<button class="btn-register" style="font-size:12px;padding:5px 14px;" onclick="doJoinTeam('${t.firestoreId}')">Join Team</button>`}
          ${isMember && !isAdmin ? `<span class="badge-registered" style="font-size:12px;">✓ Member</span>` : ""}
          ${isAdmin ? `<button class="btn-admin-ev" onclick="openChat('${t.firestoreId}','${escHtml(t.name).replace(/'/g,"\\'")}')">💬 Chat</button><button class="btn-admin-ev" style="color:var(--danger);border-color:var(--danger);" onclick="doDeleteTeam('${t.firestoreId}')">🗑 Remove</button>` : ""}
        </div>
      </div>`;
    }).join("");
  } catch(e){ el.innerHTML=`<p style="color:var(--danger);">Error loading teams.</p>`; }
}
function toggleTeamForm(){ document.getElementById("teamForm").classList.toggle("open"); }
async function submitTeam(){
  const v=id=>document.getElementById(id).value.trim();
  const name=v("teamName"),topic=v("teamTopic");
  if(!name||!topic){ showToast("⚠️ Name and topic required","warn"); return; }
  try { await addTeam({ name, lead:v("teamLead")||currentUser.name, members:[uid], topic, status:v("teamStatus")||"Forming" }); document.getElementById("teamForm").classList.remove("open"); document.getElementById("teamForm").querySelectorAll("input,select").forEach(i=>i.value=""); await renderTeams(); showToast("🔬 Team created! You can now open its chat."); }
  catch(e){ showToast("❌ Error: "+e.message,"warn"); }
}
async function doJoinTeam(fid){
  try {
    await fbJoinTeam(fid,uid);
    await renderTeams();
    showToast("🤝 Joined team! You can now access the team chat.");
  } catch(e){ showToast("❌ Error joining team","warn"); }
}
async function doDeleteTeam(fid){
  if(!confirm("Delete this team and all its chat history?")) return;
  try { await fbDeleteTeam(fid); closeChatModal(); await renderTeams(); }
  catch(e){ showToast("❌ Error","warn"); }
}

// =============================================
// TEAM CHAT
// =============================================
let _chatUnsub       = null; // active Firestore listener
let _activeChatTeamId = null;

function openChat(teamId, teamName){
  _activeChatTeamId = teamId;

  // Set modal header
  document.getElementById("chatModalTitle").textContent = "💬 "+teamName;
  document.getElementById("chatModal").style.display = "flex";

  // Clear previous messages, show loader
  const msgList = document.getElementById("chatMessages");
  msgList.innerHTML = `<div class="chat-loading">Loading messages...</div>`;

  // Clear old send input
  document.getElementById("chatInput").value = "";
  document.getElementById("chatInput").focus();

  // Stop any previous listener
  if(_chatUnsub) { _chatUnsub(); _chatUnsub=null; }

  // Start real-time listener
  _chatUnsub = listenToChat(teamId, messages => {
    renderChatMessages(messages);
  });
}

function closeChatModal(){
  document.getElementById("chatModal").style.display = "none";
  if(_chatUnsub){ _chatUnsub(); _chatUnsub=null; }
  _activeChatTeamId = null;
}

function renderChatMessages(messages){
  const msgList = document.getElementById("chatMessages");
  if(!messages.length){
    msgList.innerHTML = `<div class="chat-empty">No messages yet. Say hello! 👋</div>`;
    return;
  }

  // Group consecutive messages from same sender
  let html = "";
  let prevSender = null;
  messages.forEach((msg, idx) => {
    const isMe = msg.senderId === uid;
    const showHeader = msg.senderId !== prevSender;
    const time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"}) : "";
    const date = msg.timestamp ? new Date(msg.timestamp).toLocaleDateString("en-GB",{day:"2-digit",month:"short"}) : "";

    // Date separator — show when day changes
    if(idx===0 || (idx>0 && new Date(messages[idx-1].timestamp).toDateString() !== new Date(msg.timestamp).toDateString())){
      html += `<div class="chat-date-sep"><span>${date}</span></div>`;
    }

    html += `<div class="chat-msg-wrap ${isMe?"chat-me":"chat-them"}">
      ${!isMe && showHeader ? `<div class="chat-avatar">${escHtml(msg.senderInitials||"?")}</div>` : `<div class="chat-avatar-gap"></div>`}
      <div class="chat-bubble-group">
        ${showHeader && !isMe ? `<div class="chat-sender-name">${escHtml(msg.senderName)}</div>` : ""}
        <div class="chat-bubble ${isMe?"bubble-me":"bubble-them"}" title="${time}">
          ${escHtml(msg.text)}
          ${(isAdmin || msg.senderId===uid) ? `<button class="chat-del-btn" onclick="doDeleteChatMsg('${msg.id}')">✕</button>` : ""}
        </div>
        <div class="chat-time">${time}</div>
      </div>
    </div>`;
    prevSender = msg.senderId;
  });

  msgList.innerHTML = html;
  // Auto-scroll to bottom
  msgList.scrollTop = msgList.scrollHeight;
}

async function sendMessage(){
  const input = document.getElementById("chatInput");
  const text  = input.value.trim();
  if(!text || !_activeChatTeamId) return;

  input.value = "";
  input.focus();

  try {
    await sendChatMessage(_activeChatTeamId, {
      senderId:       uid,
      senderName:     currentUser.name,
      senderInitials: currentUser.initials,
      text
    });
  } catch(e){
    showToast("❌ Failed to send message","warn");
    input.value = text; // restore
  }
}

async function doDeleteChatMsg(msgId){
  if(!_activeChatTeamId) return;
  try { await deleteChatMessage(_activeChatTeamId, msgId); }
  catch(e){ showToast("❌ Error deleting message","warn"); }
}

// Send on Enter (Shift+Enter = new line)
function chatKeydown(e){
  if(e.key === "Enter" && !e.shiftKey){
    e.preventDefault();
    sendMessage();
  }
}

// -- Mentors --
async function renderMentors(){
  const el=document.getElementById("mentorList"); if(!el) return;
  try {
    const mentors=await getMentors();
    el.innerHTML=mentors.map(m=>`
      <div class="mentor-card">
        <div class="mentor-avatar">${(m.name||"??").split(" ").map(w=>w[0]).join("").slice(0,2)}</div>
        <div class="mentor-info">
          <div class="mentor-name">${escHtml(m.name)}</div>
          <div class="mentor-title">${escHtml(m.title)} · ${escHtml(m.dept)}</div>
          <div class="mentor-expertise">💡 ${escHtml(m.expertise)}</div>
          <div style="display:flex;align-items:center;gap:10px;margin-top:.5rem;flex-wrap:wrap;">
            <span class="pill ${m.available?"pill-present":"pill-absent"}" style="font-size:11px;">${m.available?"✓ Available":"✗ Busy"}</span>
            <a href="mailto:${escHtml(m.email)}" class="doi-link">📧 Contact</a>
            ${isAdmin?`<button class="btn-delete" onclick="doDeleteMentor('${m.firestoreId}')">🗑</button>`:""}
          </div>
        </div>
      </div>`).join("") || `<p style="color:var(--text3);">No mentors listed.</p>`;
  } catch(e){ el.innerHTML=`<p style="color:var(--danger);">Error loading mentors.</p>`; }
}
function toggleMentorForm(){ document.getElementById("mentorForm").classList.toggle("open"); }
async function submitMentor(){
  const v=id=>document.getElementById(id).value.trim();
  const name=v("mentorName"),expertise=v("mentorExpertise");
  if(!name||!expertise){ showToast("⚠️ Name and expertise required","warn"); return; }
  try { await addMentor({ name, title:v("mentorTitle")||"Mentor", dept:v("mentorDept")||"—", expertise, email:v("mentorEmail")||"—", available:true }); document.getElementById("mentorForm").classList.remove("open"); document.getElementById("mentorForm").querySelectorAll("input").forEach(i=>i.value=""); await renderMentors(); showToast("👨‍🏫 Mentor added!"); }
  catch(e){ showToast("❌ Error: "+e.message,"warn"); }
}
async function doDeleteMentor(fid){ if(!confirm("Remove this mentor?")) return; try { await fbDeleteMentor(fid); await renderMentors(); } catch(e){ showToast("❌ Error","warn"); } }

// -- Seminars --
async function renderSeminars(){
  const el=document.getElementById("seminarList"); if(!el) return;
  try {
    const seminars=await getSeminars(), members=await getAllMembers();
    el.innerHTML=seminars.map(s=>{
      const attended=(s.attendees||[]).includes(uid);
      const attNames=(s.attendees||[]).map(id=>{ const m=members.find(x=>x.id===id); return m?m.name.split(" ")[0]:id; });
      return `<div class="seminar-card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;flex-wrap:wrap;">
          <div>
            <div class="seminar-title">${escHtml(s.title)}</div>
            <div class="seminar-meta">🎤 ${escHtml(s.speaker)} · 📅 ${escHtml(s.date)} · ⏱ ${escHtml(s.duration)}</div>
          </div>
          <span class="pill ${attended?"pill-present":"pill-absent"}" style="flex-shrink:0;">${attended?"✓ Attended":"✗ Not attended"}</span>
        </div>
        ${s.notes?`<div class="seminar-notes">📝 ${escHtml(s.notes)}</div>`:""}
        <div class="seminar-footer">Attendees: ${escHtml(attNames.join(", "))||"None yet"}
          ${isAdmin?`<button class="btn-admin-ev" style="margin-left:auto;" onclick="doDeleteSeminar('${s.firestoreId}')">🗑 Delete</button>`:""}
        </div>
      </div>`;
    }).join("") || `<p style="color:var(--text3);">No seminars recorded yet.</p>`;
  } catch(e){ el.innerHTML=`<p style="color:var(--danger);">Error loading seminars.</p>`; }
}
function toggleSeminarForm(){ document.getElementById("seminarForm").classList.toggle("open"); }
async function submitSeminar(){
  const v=id=>document.getElementById(id).value.trim();
  const title=v("semTitle"),speaker=v("semSpeaker");
  if(!title||!speaker){ showToast("⚠️ Title and speaker required","warn"); return; }
  try { await addSeminar({ title, speaker, date:v("semDate")||new Date().toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}), duration:v("semDuration")||"—", notes:v("semNotes"), attendees:[] }); document.getElementById("seminarForm").classList.remove("open"); document.getElementById("seminarForm").querySelectorAll("input,textarea").forEach(i=>i.value=""); await renderSeminars(); showToast("🎓 Seminar added!"); }
  catch(e){ showToast("❌ Error: "+e.message,"warn"); }
}
async function doDeleteSeminar(fid){ if(!confirm("Delete this seminar?")) return; try { await fbDeleteSeminar(fid); await renderSeminars(); } catch(e){ showToast("❌ Error","warn"); } }

// =============================================
// ADMIN
// =============================================
async function renderAdmin(){
  await renderMemberTable();
  await updateAdminStats();
}
async function renderMemberTable(){
  const tbody=document.getElementById("adminMemberTbody"); if(!tbody) return;
  tbody.innerHTML=`<tr><td colspan="8" style="text-align:center;color:var(--text3);padding:1rem;">Loading...</td></tr>`;
  try {
    const [members, lb] = await Promise.all([getAllMembers(), getLeaderboard()]);
    tbody.innerHTML=members.map(u=>{
      const pts=(lb.find(e=>e.id===u.id)||{points:0}).points;
      return `<tr>
        <td><span class="mini-avatar">${u.initials}</span><strong>${escHtml(u.name)}</strong></td>
        <td style="font-size:12px;color:var(--text2)">${escHtml(u.id)}</td>
        <td>${escHtml(u.dept)}</td><td>${escHtml(u.year||"—")}</td>
        <td>${u.role==="admin"?'<span class="pill" style="background:var(--warning-light);color:var(--warning)">Admin</span>':'<span class="pill pill-present">Member</span>'}</td>
        <td><span class="pill ${u.status==="active"?"pill-present":"pill-absent"}">${u.status||"active"}</span></td>
        <td><strong>${pts}</strong></td>
        <td>${u.id===uid?'<span style="font-size:12px;color:var(--text3)">You</span>':`<button class="btn-tbl-danger" onclick="doRemoveMember('${u.id}','${escHtml(u.name).replace(/'/g,"\\'")}')">Remove</button>`}</td>
      </tr>`;
    }).join("");
  } catch(e){ tbody.innerHTML=`<tr><td colspan="8" style="color:var(--danger);padding:1rem;">Error loading members.</td></tr>`; }
}
async function updateAdminStats(){
  try {
    const members=await getAllMembers(), lb=await getLeaderboard();
    document.getElementById("adminTotalMembers").textContent=members.length;
    document.getElementById("adminActiveMembers").textContent=members.filter(m=>m.status==="active").length;
    document.getElementById("adminTotalPoints").textContent=lb.reduce((s,e)=>s+(e.points||0),0);
    document.getElementById("adminTotalNotices").textContent=notices.length;
  } catch(e){}
}

function openAddMemberModal(){ document.getElementById("addMemberModal").style.display="flex"; document.getElementById("addMemberForm").reset(); document.getElementById("addMemberError").textContent=""; }
function closeAddMemberModal(){ document.getElementById("addMemberModal").style.display="none"; }
async function submitAddMember(){
  const v=id=>document.getElementById(id).value.trim();
  const name=v("newName"),mid=v("newId"),pwd=v("newPassword"),dept=v("newDept"),email=v("newEmail"),phone=v("newPhone"),year=v("newYear"),role=v("newRole"),status=v("newStatus");
  const errEl=document.getElementById("addMemberError");
  if(!name||!mid||!pwd||!dept||!email){ errEl.textContent="⚠️ Name, ID, Password, Dept and Email are required."; return; }
  if(pwd.length<6){ errEl.textContent="⚠️ Password must be at least 6 characters."; return; }
  const initials=(name.split(" ").map(w=>w[0]).join("").toUpperCase()+"??").slice(0,2);
  const btn=document.querySelector("#addMemberForm .btn-primary"); btn.disabled=true; btn.textContent="Adding...";
  try {
    const ok=await addMember({ id:mid, password:pwd, name, initials, role, dept, email, phone, year, status });
    if(!ok){ errEl.textContent="⚠️ A member with that ID already exists."; btn.disabled=false; btn.textContent="Add Member"; return; }
    closeAddMemberModal(); await renderAdmin(); showToast("✅ Member '"+name+"' added!");
  } catch(e){ errEl.textContent="❌ Error: "+e.message; }
  btn.disabled=false; btn.textContent="Add Member";
}
async function doRemoveMember(memberId, memberName){
  if(!confirm(`Remove "${memberName}" (${memberId})?\n\nThis permanently deletes their account.`)) return;
  if(memberId===uid){ showToast("⚠️ Cannot remove yourself!","warn"); return; }
  try { await removeMember(memberId); await renderAdmin(); showToast("🗑 '"+memberName+"' removed."); }
  catch(e){ showToast("❌ Error removing member","warn"); }
}

async function exportMembersCSV(){
  try {
    const [members, lb] = await Promise.all([getAllMembers(), getLeaderboard()]);
    const headers=["Name","Student ID","Department","Year","Role","Email","Phone","Status","Points","Rank"];
    const rows=members.map(u=>{ const lbE=lb.find(e=>e.id===u.id)||{points:0}; const rank=lb.findIndex(e=>e.id===u.id)+1||"—"; return [u.name,u.id,u.dept,u.year||"—",u.role,u.email,u.phone||"—",u.status||"active",lbE.points,rank]; });
    const csv=[headers,...rows].map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
    downloadFile(csv,"text/csv","AIUB_RD_Members_"+new Date().toISOString().slice(0,10)+".csv");
    showToast("📥 CSV downloaded!");
  } catch(e){ showToast("❌ Error exporting CSV","warn"); }
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
    preview.push({ name, id, password:pwd, dept:get(["department","dept"])||"—", email:get(["email","mail"]), phone:get(["phone","mobile"]), year:get(["year","level","batch"]), role:get(["role"])||"member", status:get(["status"])||"active", initials });
  });
  document.getElementById("csvPreviewErrors").innerHTML=errors.length?`<div class="csv-errors">`+errors.map(e=>`<div>⚠️ ${e}</div>`).join("")+`</div>`:"";
  document.getElementById("csvPreviewCount").textContent=preview.length+" member(s) ready to import";
  document.getElementById("csvPreviewTbody").innerHTML=preview.map((m,i)=>`<tr><td><input type="checkbox" id="csvrow_${i}" checked style="width:14px;height:14px;accent-color:var(--primary)"/></td><td><strong>${escHtml(m.name)}</strong></td><td>${escHtml(m.id)}</td><td>${escHtml(m.dept)}</td><td>${escHtml(m.email)}</td><td>${escHtml(m.role)}</td></tr>`).join("");
  window._csvPreviewData=preview;
  document.getElementById("csvPreviewModal").style.display="flex";
}
function closeCSVPreview(){ document.getElementById("csvPreviewModal").style.display="none"; window._csvPreviewData=null; }
async function submitCSVImport(){
  const data=window._csvPreviewData; if(!data) return;
  const btn=document.querySelector("#csvPreviewModal .btn-primary"); btn.disabled=true; btn.textContent="Importing...";
  let added=0, skipped=0;
  for(let i=0;i<data.length;i++){
    const cb=document.getElementById("csvrow_"+i); if(cb&&!cb.checked){ skipped++; continue; }
    const ok=await addMember(data[i]);
    ok?added++:skipped++;
  }
  closeCSVPreview(); await renderAdmin();
  showToast(`✅ Imported ${added} member(s).${skipped?" "+skipped+" skipped":""}`);
  btn.disabled=false; btn.textContent="✅ Import Selected";
}

async function openBulkAttendance(){
  try {
    const members=await getAllMembers();
    const nonAdmins=members.filter(m=>m.role!=="admin");
    document.getElementById("bulkSessionDate").textContent=new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"});
    document.getElementById("bulkAttBody").innerHTML=nonAdmins.map(m=>`
      <tr><td><strong>${escHtml(m.name)}</strong></td><td style="font-size:12px;color:var(--text2)">${escHtml(m.id)}</td><td>${escHtml(m.dept)}</td>
      <td><select class="bulk-status-select" data-id="${m.id}"><option value="Present">✅ Present</option><option value="Late">🕐 Late</option><option value="Absent" selected>❌ Absent</option></select></td>
      <td><input type="text" class="bulk-note-input" placeholder="Note..." style="width:100%;padding:5px 8px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text);font-size:12px;"/></td></tr>`).join("");
    document.getElementById("bulkAttModal").style.display="flex";
  } catch(e){ showToast("❌ Error loading members","warn"); }
}
function closeBulkAttendance(){ document.getElementById("bulkAttModal").style.display="none"; }
async function submitBulkAttendance(){
  const session=document.getElementById("bulkSessionName").value.trim()||"Club Session";
  const todayStr=new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short"});
  const selects=document.querySelectorAll(".bulk-status-select");
  const noteInputs=document.querySelectorAll(".bulk-note-input");
  const btn=document.querySelector("#bulkAttModal .btn-primary"); btn.disabled=true; btn.textContent="Saving...";
  try {
    const records=[];
    selects.forEach((sel,i)=>{ records.push({ memberId:sel.dataset.id, date:todayStr, session, status:sel.value, note:noteInputs[i]?.value.trim()||"—" }); });
    await saveBulkAttendance(records);
    closeBulkAttendance();
    // Refresh current user's data
    [stats, attendance] = await Promise.all([getStats(uid), getAttendance(uid)]);
    renderAttendance(); renderHome();
    showToast("✅ Attendance saved for "+records.length+" members!");
  } catch(e){ showToast("❌ Error saving attendance: "+e.message,"warn"); }
  btn.disabled=false; btn.textContent="💾 Save Attendance";
}

// =============================================
// BADGE CHECKING
// =============================================
async function checkBadge(id, condition){
  if(!condition) return;
  const badge=badges.find(b=>b.id===id);
  if(badge&&!badge.earned){
    badge.earned=true;
    try {
      await earnBadge(uid, id);
      renderHomeBadges(); renderProfileBadges();
      showToast("🏅 Badge unlocked: "+badge.name+"!");
    } catch(e){ console.error("Badge error:",e); }
  }
}

// =============================================
// STATS REFRESH
// =============================================
function refreshStats(){
  const rank=leaderboard.findIndex(e=>e.id===uid);
  document.getElementById("statRank").textContent=rank>=0?"#"+(rank+1):"—";
  document.getElementById("pstatRank").textContent=rank>=0?"#"+(rank+1):"—";
  // Update points from leaderboard (source of truth)
  const myLb=leaderboard.find(e=>e.id===uid);
  if(myLb){
    stats.points=myLb.points;
    document.getElementById("statPoints").textContent=myLb.points;
    document.getElementById("pstatPoints").textContent=myLb.points;
  }
}

// =============================================
// HELPERS
// =============================================
function downloadFile(content,mime,filename){
  const blob=new Blob([content],{type:mime}); const url=URL.createObjectURL(blob);
  const a=document.createElement("a"); a.href=url; a.download=filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

async function logout(){
  if(confirm("Log out?")){
    if(unsubLeaderboard) unsubLeaderboard();
    if(unsubNotices) unsubNotices();
    if(unsubEvents) unsubEvents();
    clearSession();
    window.location.href="index.html";
  }
}

function showToast(msg,type="success"){
  const old=document.getElementById("toastMsg"); if(old) old.remove();
  const t=document.createElement("div"); t.id="toastMsg"; t.textContent=msg;
  t.style.cssText=`position:fixed;bottom:24px;right:24px;z-index:9999;background:${type==="warn"?"var(--warning)":"var(--success)"};color:#fff;padding:12px 22px;border-radius:8px;font-size:14px;font-weight:600;box-shadow:0 4px 20px rgba(0,0,0,.25);animation:slideIn .3s ease;`;
  if(!document.getElementById("toastStyle")){ const s=document.createElement("style"); s.id="toastStyle"; s.textContent="@keyframes slideIn{from{transform:translateX(120%);opacity:0}to{transform:translateX(0);opacity:1}}"; document.head.appendChild(s); }
  document.body.appendChild(t); setTimeout(()=>t.remove(),3500);
}

// Expose all functions via window.APP so the HTML bridge script can call them
window.APP = {
  toggleSidebar, navigateTo, toggleTheme,
  doRegisterEvent, doDeleteEvent, openAddEventModal, closeAddEventModal, submitAddEvent,
  openEventAdmin, closeEventAdmin, switchEvTab, doToggleEventAtt,
  toggleNoticeForm, postNotice, doDeleteNotice,
  openChangePwModal, closeChangePwModal, submitChangePassword,
  triggerProfilePicUpload, handleProfilePicChange,
  togglePaperForm, submitPaper, doDeletePaper, handlePdfSelect, downloadPdf,
  toggleTeamForm, submitTeam, doJoinTeam, doDeleteTeam,
  openChat, closeChatModal, sendMessage, chatKeydown, doDeleteChatMsg,
  toggleMentorForm, submitMentor, doDeleteMentor,
  toggleSeminarForm, submitSeminar, doDeleteSeminar,
  openAddMemberModal, closeAddMemberModal, submitAddMember, doRemoveMember,
  exportMembersCSV, triggerCSVImport, handleCSVImport, openCSVPreview, closeCSVPreview, submitCSVImport,
  openBulkAttendance, closeBulkAttendance, submitBulkAttendance,
  logout
};
