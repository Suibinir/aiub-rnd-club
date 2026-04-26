/* =============================================
   AIUB R&D CLUB — DASHBOARD.JS (Firebase)
   All localStorage replaced with Firestore.
   Real-time listeners for leaderboard, notices, events.
   ============================================= */
import {
  loadSession, clearSession, saveSession, verifySession, getSessionToken, listenToSession,
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
  getPapers, addPaper, deletePaper as fbDeletePaper, updatePaper, requestUnpublish, getUnpublishRequests, resolveUnpublishRequest,
  getTeams, addTeam, updateTeam, joinTeam as fbJoinTeam, deleteTeam as fbDeleteTeam, requestKick, getKickRequests, resolveKickRequest,
  getMentors, addMentor, deleteMentor as fbDeleteMentor,
  getExecutives, addExecutive, deleteExecutive as fbDeleteExecutive,
  saveBulkAttendance,
  listenToLeaderboard, listenToNotices, listenToEvents,
  sendChatMessage, getChatMessages, listenToChat, deleteChatMessage,
  sendNotification, broadcastNotification,
  getNotifications, markNotificationRead, markAllNotificationsRead,
  deleteNotification, clearAllNotifications, listenToNotifications,
  markNoticeRead, getNoticeReads
} from "./firebase.js";

// ---- AUTH GUARD ----
const currentUser = loadSession();
if (!currentUser) { window.location.href = "index.html"; }
const uid = currentUser ? currentUser.id : "";
const isAdmin = currentUser ? currentUser.role === "admin" : false;
const isModerator = currentUser ? currentUser.role === "moderator" : false;

// ---- APP STATE ----
let stats = {}, attendance = [], badges = [], streak = [], notices = [], events = [], leaderboard = [];
let unsubLeaderboard, unsubNotices, unsubEvents, unsubNotifications;

// ---- PENDING PDF ----
let _pendingPdfData = null, _pendingPdfName = null;

// ---- ESCAPE HTML ----
function escHtml(s){ return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

// =============================================
// INIT
// =============================================
document.addEventListener("DOMContentLoaded", async ()=>{
  showGlobalLoader(true);

  // Always hide loader after max 8 seconds — no matter what
  const loaderTimeout = setTimeout(()=>{ showGlobalLoader(false); }, 8000);

  try {
    // Basic session check — just make sure we have local session data
    // Don't block the whole app on Firestore session verification
    const localUser = loadSession();
    if(!localUser){
      clearTimeout(loaderTimeout);
      window.location.href = "index.html";
      return;
    }

    // Setup UI immediately — no network needed for these
    setupUser();
    setupDateTime();
    setupNavigation();
    setupTheme();
    setupConnectionMonitor();

    // Cross-tab session listener — kicks out other tabs when you log in elsewhere
    // Runs in background, never blocks dashboard load
    try {
      const token = getSessionToken();
      if(token && uid){
        listenToSession(uid, token, ()=>{
          sessionStorage.removeItem("uniclub_token");
          sessionStorage.removeItem("uniclub_user");
          const banner = document.createElement("div");
          banner.textContent = "🔒 You've been signed in from another location. Redirecting...";
          banner.style.cssText = "position:fixed;top:0;left:0;right:0;background:#E24B4A;color:#fff;text-align:center;padding:14px;font-size:14px;font-weight:600;z-index:99999;";
          document.body.appendChild(banner);
          setTimeout(()=>{ window.location.href = "index.html"; }, 2000);
        });
      }
    } catch(e){
      // If session listener fails for any reason, just log it — don't crash the app
      console.warn("Session listener error:", e.message);
    }

    // Load all personal data — handle failures individually
    try {
      [stats, attendance, badges, streak] = await Promise.all([
        getStats(uid).catch(()=>getDefaultStats()),
        getAttendance(uid).catch(()=>[]),
        getBadges(uid).catch(()=>[]),
        getStreak(uid).catch(()=>Array(30).fill(null))
      ]);
    } catch(e){
      console.warn("Personal data load error:", e);
      stats = getDefaultStats();
      attendance = []; badges = []; streak = Array(30).fill(null);
    }

    // Real-time listeners — each independent, won't crash others if one fails
    try { unsubLeaderboard = listenToLeaderboard(lb=>{ leaderboard=lb; renderLeaderboard(); refreshStats(); }); } catch(e){}
    try { unsubNotices     = listenToNotices(n=>{ notices=n; renderNotices(); updateNoticeBadge(); }); } catch(e){}
    try { unsubEvents      = listenToEvents(e=>{ events=e; renderEvents(); renderHomeEvents(); }); } catch(e){}
    try { unsubNotifications = listenToNotifications(uid, notifs=>{ renderNotificationBell(notifs); }); } catch(e){}

    // Render all pages
    renderHome();
    renderAttendance();
    renderProfile();

    // Research and admin load in background — don't block home page
    renderResearch().catch(e => console.warn("Research load error:", e));
    if(isAdmin || isModerator){
      renderAdmin().catch(e => console.warn("Admin load error:", e));
    }

  } catch(e){
    console.error("Init error:", e);
    showToast("⚠️ Some data failed to load. Check your connection.", "warn");
  }

  clearTimeout(loaderTimeout);
  showGlobalLoader(false);
});

// Default stats object when Firestore read fails
function getDefaultStats(){
  return { attendanceRate:0, eventsAttended:0, points:0, streak:0, noticesPosted:0 };
}

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
  const roleLabel = isAdmin?"Admin":isModerator?"Moderator":"Member";
  document.getElementById("sidebarRole").textContent = roleLabel+" · "+currentUser.dept;
  if(isAdmin) document.body.classList.add("is-admin");
  if(isModerator) document.body.classList.add("is-moderator");
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
    notifyEventRegistered(ev ? ev.title : "the event");
    showToast("🎉 Registered"+(ev?" for '"+ev.title+"'":"")+"!");
  } catch(e){ showToast("❌ Failed to register","warn"); btn.disabled=false; btn.textContent="Register"; }
}
async function doDeleteEvent(fid){
  if(!confirm("Delete this event permanently?")) return;
  try { await deleteEvent(fid, uid); showToast("🗑 Event deleted."); }
  catch(e){ showToast("❌ Error deleting event","warn"); }
}

// ---- ADD EVENT ----
function openAddEventModal(){ document.getElementById("addEventModal").style.display="flex"; document.getElementById("addEventForm").reset(); document.getElementById("addEventError").textContent=""; const t=new Date(); document.getElementById("evDay").value=String(t.getDate()).padStart(2,"0"); document.getElementById("evYear").value=t.getFullYear(); }
function closeAddEventModal(){ document.getElementById("addEventModal").style.display="none"; }
async function submitAddEvent(){
  if(!assertOnline()) return;
  const v=id=>document.getElementById(id).value.trim();
  const title=v("evTitle"),venue=v("evVenue"),description=v("evDescription");
  if(!title||!venue||!description){ document.getElementById("addEventError").textContent="⚠️ Title, Venue and Description are required."; return; }
  const btn=document.querySelector("#addEventForm .btn-primary"); btn.disabled=true; btn.textContent="Creating...";
  try {
    await createEvent({ day:v("evDay")||"01", month:v("evMonth")||"Jan", year:v("evYear")||new Date().getFullYear(), title, description, venue, time:v("evTime")||"TBD", duration:v("evDuration")||"TBD", capacity:parseInt(v("evCapacity"))||50, category:v("evCategory"), points:parseInt(v("evPoints"))||20, organizer:v("evOrganizer")||currentUser.name, past:false, registrants:[], attendees:[] }, uid);
    closeAddEventModal();
    notifyAllEvent(title);
    showToast("✅ Event '"+title+"' created!");
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
    await markEventAttendee(fid, memberId, attended, uid);
    if(attended){
      await addPointsToMember(memberId, pts);
      const mStats = await getStats(memberId);
      mStats.eventsAttended = (mStats.eventsAttended||0)+1;
      await saveStats(memberId, mStats);
      const ev = events.find(e=>(e.firestoreId||String(e.id))===fid);
      notifyEventAttended(memberId, ev ? ev.title : "an event", pts);
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
// Pending notice image
let _noticeImgData = null;

function renderNotices(){
  const list=document.getElementById("noticeList"); if(!list) return;
  notices.forEach(n=>{ if(n.firestoreId && !n.firestoreId.startsWith("seed")) markNoticeRead(n.firestoreId, uid, currentUser.name).catch(()=>{}); });
  list.innerHTML=notices.map(n=>{
    const canDelete = isAdmin || isModerator || n.authorId===uid;
    const canSeeReads = isAdmin || isModerator;
    return `<div class="notice-item">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;">
        <span class="notice-tag tag-${n.tag}">${{urgent:"🔴 Urgent",general:"🔵 General",event:"🟢 Event"}[n.tag]||n.tag}</span>
        <div style="display:flex;gap:6px;align-items:center;">
          ${canSeeReads?`<button class="btn-receipts" onclick="openNoticeReads('${n.firestoreId}')">👁️ Reads</button>`:""}
          ${canDelete?`<button class="btn-delete" onclick="doDeleteNotice('${n.firestoreId}')">🗑</button>`:""}
        </div>
      </div>
      ${n.imageData?`<img src="${n.imageData}" alt="Notice banner" class="notice-banner-img" style="object-fit:contain;background:#f8f9fa;"/>`:""}
      <div class="notice-title">${escHtml(n.title)}</div>
      <div class="notice-body" style="white-space:pre-wrap;">${escHtml(n.body)}</div>
      <div class="notice-date">${n.date} · Posted by ${escHtml(n.author)}</div>
    </div>`;
  }).join("") || `<p style="color:var(--text3);padding:1rem 0">No notices yet.</p>`;
}

function handleNoticeImg(input){
  const file = input.files[0]; if(!file) return;
  if(file.size > 10*1024*1024){ showToast("⚠️ Image too large. Max 10MB.","warn"); input.value=""; return; }
  const label   = document.getElementById("noticeImgLabel");
  const preview = document.getElementById("noticeImgPreview");
  const area    = document.getElementById("noticeImgArea");
  label.textContent = "⏳ Processing image...";

  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      // Resize to exactly 2048x1594 using canvas
      const TARGET_W = 2048;
      const TARGET_H = 1594;
      const canvas = document.createElement("canvas");
      canvas.width  = TARGET_W;
      canvas.height = TARGET_H;
      const ctx = canvas.getContext("2d");

      // Fill background black (for images that don't match aspect ratio)
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, TARGET_W, TARGET_H);

      // Scale image to cover the canvas (centre-crop like object-fit:cover)
      const srcRatio = img.width / img.height;
      const dstRatio = TARGET_W / TARGET_H;
      let drawW, drawH, drawX, drawY;
      if(srcRatio > dstRatio){
        // Image is wider — fit height, crop sides
        drawH = TARGET_H;
        drawW = img.width * (TARGET_H / img.height);
        drawX = (TARGET_W - drawW) / 2;
        drawY = 0;
      } else {
        // Image is taller — fit width, crop top/bottom
        drawW = TARGET_W;
        drawH = img.height * (TARGET_W / img.width);
        drawX = 0;
        drawY = (TARGET_H - drawH) / 2;
      }
      ctx.drawImage(img, drawX, drawY, drawW, drawH);

      // Export as JPEG at 85% quality to keep file size reasonable
      _noticeImgData = canvas.toDataURL("image/jpeg", 0.85);
      label.textContent = `✅ ${file.name} → resized to 2048×1594 — click to change`;
      area.style.borderColor = "var(--success)";
      preview.src = _noticeImgData;
      preview.style.display = "block";
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

async function openNoticeReads(noticeId){
  document.getElementById("noticeReadsModal").style.display="flex";
  const body=document.getElementById("noticeReadsBody");
  body.innerHTML=`<p style="color:var(--text3);">Loading...</p>`;
  try {
    const [reads, members] = await Promise.all([getNoticeReads(noticeId), getAllMembers()]);
    const readIds = reads.map(r=>r.userId);
    const nonAdmins = members.filter(m=>m.role!=="admin");
    const readList = reads.map(r=>({ name:r.userName, time:new Date(r.readAt).toLocaleString("en-GB",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}) }));
    const unreadList = nonAdmins.filter(m=>!readIds.includes(m.id)).map(m=>m.name);
    body.innerHTML=`
      <div style="margin-bottom:1rem;">
        <div style="font-size:13px;font-weight:600;color:var(--success);margin-bottom:.5rem;">✅ Read (${readList.length})</div>
        ${readList.length?readList.map(r=>`<div style="display:flex;justify-content:space-between;font-size:13px;color:var(--text);padding:4px 0;border-bottom:1px solid var(--border);"><span>${escHtml(r.name)}</span><span style="color:var(--text3)">${r.time}</span></div>`).join(""):`<p style="font-size:13px;color:var(--text3);">Nobody has read this yet.</p>`}
      </div>
      <div>
        <div style="font-size:13px;font-weight:600;color:var(--danger);margin-bottom:.5rem;">❌ Not Read (${unreadList.length})</div>
        ${unreadList.length?`<div style="font-size:13px;color:var(--text2);">${unreadList.map(n=>escHtml(n)).join(", ")}</div>`:`<p style="font-size:13px;color:var(--success);">Everyone has read this!</p>`}
      </div>`;
  } catch(e){ body.innerHTML=`<p style="color:var(--danger);">Error loading reads.</p>`; }
}
function closeNoticeReadsModal(){ document.getElementById("noticeReadsModal").style.display="none"; }
function toggleNoticeForm(){
  const f=document.getElementById("noticeForm"); f.classList.toggle("open");
  if(!f.classList.contains("open")){
    // Reset image state when closing
    _noticeImgData = null;
    const lbl=document.getElementById("noticeImgLabel"); if(lbl) lbl.textContent="🖼️ Click to attach a banner image";
    const area=document.getElementById("noticeImgArea"); if(area) area.style.borderColor="";
    const prev=document.getElementById("noticeImgPreview"); if(prev){ prev.src=""; prev.style.display="none"; }
    const inp=document.getElementById("noticeImgInput"); if(inp) inp.value="";
  } else {
    f.scrollIntoView({behavior:"smooth"});
  }
}
async function postNotice(){
  if(!assertOnline()) return;
  if(!isAdmin && !isModerator){ showToast("⚠️ Only admin or moderator can post notices.","warn"); return; }
  const title=document.getElementById("noticeTitle").value.trim();
  const tag=document.getElementById("noticeCategory").value;
  const body=document.getElementById("noticeContent").value.trim();
  if(!title||!body){ showToast("⚠️ Fill in title and content","warn"); return; }
  const btn=document.querySelector("#noticeForm .btn-primary");
  if(btn){ btn.disabled=true; btn.textContent="Posting..."; }
  try {
    await addNotice({ tag, title, body, date:"Just now", author:currentUser.name, authorId:uid, authorRole:currentUser.role, imageData:_noticeImgData||null }, uid);
    stats.noticesPosted=(stats.noticesPosted||0)+1;
    await addPointsToMember(uid,5);
    await saveStats(uid, stats);
    checkBadge("reporter", stats.noticesPosted>=3);
    notifyAllNotice(title);
    document.getElementById("noticeTitle").value="";
    document.getElementById("noticeContent").value="";
    toggleNoticeForm();
    showToast("📢 Notice posted! +5 pts");
  } catch(e){
    console.error("postNotice error:", e);
    showToast("❌ Error: "+e.message,"warn");
  }
  if(btn){ btn.disabled=false; btn.textContent="Post Notice"; }
}
async function doDeleteNotice(fid){
  if(!confirm("Delete this notice?")) return;
  try { await fbDeleteNotice(fid, uid); showToast("🗑 Notice deleted"); }
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
  await Promise.all([renderPapers(), renderTeams(), renderMentors(), renderExecutives()]);
}

// -- Papers --
async function renderPapers(){
  const el=document.getElementById("paperList"); if(!el) return;
  el.innerHTML=`<p style="color:var(--text3);">Loading papers...</p>`;
  try {
    const papers=(await getPapers()).filter(p=>p.published!==false||(isAdmin));
    if(!papers.length){ el.innerHTML=`<p style="color:var(--text3);padding:1rem 0">No papers added yet. Be the first!</p>`; return; }
    el.innerHTML=papers.map(p=>`
      <div class="paper-card ${p.published===false?"paper-unpublished":""}">
        ${p.published===false?`<div class="paper-unpub-banner">⚠️ Unpublished — pending admin review</div>`:""}
        <div class="paper-title">${escHtml(p.title)}</div>
        <div class="paper-authors">👥 ${escHtml(p.authors)}</div>
        <div class="paper-meta">
          <span>📅 ${p.year}</span>
          ${p.link?`<a href="${escHtml(p.link)}" target="_blank" rel="noopener" class="doi-link">🔗 View Paper</a>`:""}
          ${p.pdfData?`<button class="doi-link" style="background:none;border:none;cursor:pointer;padding:0;font-size:13px;" onclick="downloadPdf('${p.firestoreId}')">📥 Download PDF</button>`:""}
        </div>
        ${p.tags&&p.tags.length?`<div class="paper-tags">${p.tags.map(t=>`<span class="paper-tag">${escHtml(t)}</span>`).join("")}</div>`:""}
        <div class="paper-footer">Added by ${escHtml(p.addedBy)} · ${p.date}
          <div style="margin-left:auto;display:flex;gap:6px;">
            ${p.addedById===uid?`<button class="btn-edit-small" onclick="openEditPaper('${p.firestoreId}')">✏️ Edit</button>`:""}
            ${p.addedById===uid&&p.published!==false?`<button class="btn-edit-small" style="color:var(--warning);border-color:var(--warning);" onclick="requestPaperUnpublish('${p.firestoreId}','${escHtml(p.title).replace(/'/g,"\\'")}')">📤 Unpublish</button>`:""}
            ${isAdmin&&p.published===false?`<button class="btn-edit-small" style="color:var(--success);border-color:var(--success);" onclick="doRepublishPaper('${p.firestoreId}')">✅ Approve & Publish</button>`:""}
            ${(isAdmin||p.addedById===uid)?`<button class="btn-delete" onclick="doDeletePaper('${p.firestoreId}')">🗑</button>`:""}
          </div>
        </div>
      </div>`).join("");
  } catch(e){ el.innerHTML=`<p style="color:var(--danger);">Error loading papers.</p>`; }
}

// Edit paper modal
function openEditPaper(fid){
  getPapers().then(papers=>{
    const p=papers.find(x=>x.firestoreId===fid); if(!p) return;
    document.getElementById("editPaperId").value=fid;
    document.getElementById("editPaperTitle").value=p.title||"";
    document.getElementById("editPaperAuthors").value=p.authors||"";
    document.getElementById("editPaperYear").value=p.year||"";
    document.getElementById("editPaperLink").value=p.link||"";
    document.getElementById("editPaperTags").value=(p.tags||[]).join(", ");
    document.getElementById("editPaperModal").style.display="flex";
  });
}
function closeEditPaperModal(){ document.getElementById("editPaperModal").style.display="none"; }
async function submitEditPaper(){
  const fid=document.getElementById("editPaperId").value;
  const v=id=>document.getElementById(id).value.trim();
  const title=v("editPaperTitle"),authors=v("editPaperAuthors");
  if(!title||!authors){ showToast("⚠️ Title and authors required","warn"); return; }
  const tags=v("editPaperTags")?v("editPaperTags").split(",").map(t=>t.trim()).filter(Boolean):[];
  try {
    await updatePaper(fid,{ title, authors, link:v("editPaperLink"), year:parseInt(v("editPaperYear"))||new Date().getFullYear(), tags });
    closeEditPaperModal(); await renderPapers(); showToast("✅ Paper updated!");
  } catch(e){ showToast("❌ Error: "+e.message,"warn"); }
}
async function requestPaperUnpublish(fid,title){
  if(!confirm(`Request to unpublish "${title}"?\n\nAn admin will review and confirm.`)) return;
  try { await requestUnpublish(fid,title,uid); showToast("📤 Unpublish request sent to admin."); }
  catch(e){ showToast("❌ Error","warn"); }
}
async function doRepublishPaper(fid){
  try { await updatePaper(fid,{published:true}); await renderPapers(); showToast("✅ Paper re-published!"); }
  catch(e){ showToast("❌ Error","warn"); }
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
  if(!assertOnline()) return;
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
    notifyAllPaper(title, currentUser.name);
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
      const isMem=(t.members||[]).includes(uid);
      const isCreator=t.createdBy===uid;
      const memberObjs=(t.members||[]).map(id=>members.find(x=>x.id===id)).filter(Boolean);
      const memberNames=memberObjs.map(m=>m.name);
      return `<div class="team-card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:.5rem;">
          <div class="team-name">${escHtml(t.name)}</div>
          <span class="team-status ${t.status==="Active"?"status-active":"status-forming"}">${t.status}</span>
        </div>
        <div class="team-topic">🔬 ${escHtml(t.topic)}</div>
        <div class="team-lead">👑 Lead: <strong>${escHtml(t.lead)}</strong></div>
        <div class="team-members-list">
          👥 ${memberObjs.map(m=>`<span class="team-member-chip">${escHtml(m.name)}${(isCreator||isAdmin)&&m.id!==uid?`<button class="kick-btn" onclick="requestKickMember('${t.firestoreId}','${m.id}','${escHtml(m.name).replace(/'/g,"\\'")}','${escHtml(t.name).replace(/'/g,"\\'")}')">✕</button>`:""}</span>`).join("")}
        </div>
        <div style="margin-top:.75rem;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          ${isMem
            ? `<button class="btn-chat" onclick="openChat('${t.firestoreId}','${escHtml(t.name).replace(/'/g,"\\'")}')">💬 Chat</button>`
            : `<button class="btn-register" style="font-size:12px;padding:5px 14px;" onclick="doJoinTeam('${t.firestoreId}')">Join Team</button>`}
          ${(isCreator||isAdmin)?`<button class="btn-admin-ev" onclick="openEditTeam('${t.firestoreId}')">✏️ Edit</button>`:""}
          ${isAdmin?`<button class="btn-admin-ev" style="color:var(--danger);border-color:var(--danger);" onclick="doDeleteTeam('${t.firestoreId}')">🗑 Delete</button>`:""}
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
  try {
    await addTeam({ name, lead:v("teamLead")||currentUser.name, members:[uid], topic, status:v("teamStatus")||"Forming", createdBy:uid });
    document.getElementById("teamForm").classList.remove("open");
    document.getElementById("teamForm").querySelectorAll("input,select").forEach(i=>i.value="");
    await renderTeams(); showToast("🔬 Team created!");
  } catch(e){ showToast("❌ Error: "+e.message,"warn"); }
}
async function doJoinTeam(fid){
  try { await fbJoinTeam(fid,uid); await renderTeams(); showToast("🤝 Joined team!"); }
  catch(e){ showToast("❌ Error joining team","warn"); }
}
async function doDeleteTeam(fid){
  if(!confirm("Delete this team and all its chat history?")) return;
  try { await fbDeleteTeam(fid); closeChatModal(); await renderTeams(); }
  catch(e){ showToast("❌ Error","warn"); }
}

// Edit team
function openEditTeam(fid){
  getTeams().then(teams=>{
    const t=teams.find(x=>x.firestoreId===fid); if(!t) return;
    document.getElementById("editTeamId").value=fid;
    document.getElementById("editTeamName").value=t.name||"";
    document.getElementById("editTeamTopic").value=t.topic||"";
    document.getElementById("editTeamStatus").value=t.status||"Forming";
    document.getElementById("editTeamModal").style.display="flex";
  });
}
function closeEditTeamModal(){ document.getElementById("editTeamModal").style.display="none"; }
async function submitEditTeam(){
  const fid=document.getElementById("editTeamId").value;
  const name=document.getElementById("editTeamName").value.trim();
  const topic=document.getElementById("editTeamTopic").value.trim();
  const status=document.getElementById("editTeamStatus").value;
  if(!name||!topic){ showToast("⚠️ Name and topic required","warn"); return; }
  try {
    await updateTeam(fid,{name,topic,status});
    closeEditTeamModal(); await renderTeams(); showToast("✅ Team updated!");
  } catch(e){ showToast("❌ Error: "+e.message,"warn"); }
}

// Kick member request
async function requestKickMember(teamId,targetId,targetName,teamName){
  if(!confirm(`Request to kick "${targetName}" from "${teamName}"?\n\nAn admin must approve this.`)) return;
  try {
    await requestKick(teamId,targetId,targetName,uid,currentUser.name);
    showToast("📨 Kick request sent to admin for approval.");
  } catch(e){ showToast("❌ Error","warn"); }
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
    // Notify team members (throttled — only notify if last message was >60s ago to avoid spam)
    const teamName = document.getElementById("chatModalTitle").textContent.replace("💬 ","");
    notifyTeamChat(_activeChatTeamId, teamName, currentUser.name, text);
  } catch(e){
    showToast("❌ Failed to send message","warn");
    input.value = text;
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
  try { await addMentor({ name, title:v("mentorTitle")||"Mentor", dept:v("mentorDept")||"—", expertise, email:v("mentorEmail")||"—", available:true }, uid); document.getElementById("mentorForm").classList.remove("open"); document.getElementById("mentorForm").querySelectorAll("input").forEach(i=>i.value=""); await renderMentors(); showToast("👨‍🏫 Mentor added!"); }
  catch(e){ showToast("❌ Error: "+e.message,"warn"); }
}
async function doDeleteMentor(fid){ if(!confirm("Remove this mentor?")) return; try { await fbDeleteMentor(fid, uid); await renderMentors(); } catch(e){ showToast("❌ Error","warn"); } }

// -- Seminars --
// -- Executive Panel --
async function renderExecutives(){
  const el=document.getElementById("execList"); if(!el) return;
  try {
    const execs=await getExecutives();
    el.innerHTML=execs.map(e=>`
      <div class="mentor-card">
        <div class="mentor-avatar">${(e.name||"??").split(" ").map(w=>w[0]).join("").slice(0,2)}</div>
        <div class="mentor-info">
          <div class="mentor-name">${escHtml(e.name)}</div>
          <div class="mentor-title">${escHtml(e.title)} · ${escHtml(e.dept||"—")}</div>
          <div class="mentor-expertise">📋 ${escHtml(e.responsibilities||"—")}</div>
          <div style="display:flex;align-items:center;gap:10px;margin-top:.5rem;flex-wrap:wrap;">
            ${e.email?`<a href="mailto:${escHtml(e.email)}" class="doi-link">📧 Contact</a>`:""}
            ${isAdmin?`<button class="btn-delete" onclick="doDeleteExecutive('${e.firestoreId}')">🗑</button>`:""}
          </div>
        </div>
      </div>`).join("") || `<p style="color:var(--text3);">No executives listed yet.</p>`;
  } catch(e){ el.innerHTML=`<p style="color:var(--danger);">Error loading executives.</p>`; }
}
function toggleExecForm(){ document.getElementById("execForm").classList.toggle("open"); }
async function submitExecutive(){
  const v=id=>document.getElementById(id).value.trim();
  const name=v("execName"),title=v("execTitle");
  if(!name||!title){ showToast("⚠️ Name and position required","warn"); return; }
  try {
    await addExecutive({ name, title, dept:v("execDept")||"—", email:v("execEmail")||"—", responsibilities:v("execResp")||"—" }, uid);
    document.getElementById("execForm").classList.remove("open");
    document.getElementById("execForm").querySelectorAll("input").forEach(i=>i.value="");
    await renderExecutives(); showToast("👔 Executive added!");
  } catch(e){ showToast("❌ Error: "+e.message,"warn"); }
}
async function doDeleteExecutive(fid){
  if(!confirm("Remove this executive?")) return;
  try { await fbDeleteExecutive(fid, uid); await renderExecutives(); }
  catch(e){ showToast("❌ Error","warn"); }
}

// =============================================
// ADMIN
// =============================================
async function renderAdmin(){
  await Promise.all([renderMemberTable(), updateAdminStats(), renderPendingApprovals()]);
}

async function renderPendingApprovals(){
  const el=document.getElementById("pendingApprovalsList"); if(!el) return;
  try {
    const [kicks, unpubs] = await Promise.all([getKickRequests(), getUnpublishRequests()]);
    const total = kicks.length + unpubs.length;
    if(!total){ el.innerHTML=`<p style="color:var(--text3);font-size:14px;">No pending approvals. ✅</p>`; return; }
    el.innerHTML=[
      ...kicks.map(k=>`
        <div class="approval-item">
          <div class="approval-icon">👢</div>
          <div class="approval-body">
            <div class="approval-title">Kick Request</div>
            <div class="approval-desc"><strong>${escHtml(k.requesterName)}</strong> wants to remove <strong>${escHtml(k.targetName)}</strong> from a team.</div>
          </div>
          <div class="approval-actions">
            <button class="btn-approve" onclick="resolveApproval('kick','${k.firestoreId}',true,'${k.teamId}','${k.targetId}')">✅ Approve</button>
            <button class="btn-deny" onclick="resolveApproval('kick','${k.firestoreId}',false)">❌ Deny</button>
          </div>
        </div>`),
      ...unpubs.map(u=>`
        <div class="approval-item">
          <div class="approval-icon">📄</div>
          <div class="approval-body">
            <div class="approval-title">Unpublish Request</div>
            <div class="approval-desc">Member wants to unpublish paper: <strong>${escHtml(u.paperTitle)}</strong></div>
          </div>
          <div class="approval-actions">
            <button class="btn-approve" onclick="resolveApproval('unpub','${u.firestoreId}',true,'${u.paperId}')">✅ Approve</button>
            <button class="btn-deny" onclick="resolveApproval('unpub','${u.firestoreId}',false)">❌ Deny</button>
          </div>
        </div>`)
    ].join("");
  } catch(e){ el.innerHTML=`<p style="color:var(--danger);font-size:14px;">Error loading approvals.</p>`; }
}

async function resolveApproval(type, reqId, approved, extra1, extra2){
  try {
    if(type==="kick") await resolveKickRequest(reqId, approved, extra1, extra2);
    else if(type==="unpub") await resolveUnpublishRequest(reqId, approved, extra1);
    await renderPendingApprovals();
    if(type==="kick") await renderTeams();
    if(type==="unpub") await renderPapers();
    showToast(approved?"✅ Approved":"❌ Request denied");
  } catch(e){ showToast("❌ Error: "+e.message,"warn"); }
}

async function renderMemberTable(){
  const tbody=document.getElementById("adminMemberTbody"); if(!tbody) return;
  tbody.innerHTML=`<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:1rem;">Loading...</td></tr>`;
  try {
    const [members, lb] = await Promise.all([getAllMembers(), getLeaderboard()]);
    tbody.innerHTML=members.map(u=>{
      const pts=(lb.find(e=>e.id===u.id)||{points:0}).points;
      const roleLabel = u.role==="admin"?'<span class="pill" style="background:var(--warning-light);color:var(--warning)">Admin</span>':u.role==="moderator"?'<span class="pill" style="background:var(--purple-light);color:var(--purple)">Moderator</span>':'<span class="pill pill-present">Member</span>';
      return `<tr>
        <td><span class="mini-avatar">${u.initials}</span><strong>${escHtml(u.name)}</strong></td>
        <td style="font-size:12px;color:var(--text2)">${escHtml(u.id)}</td>
        <td>${escHtml(u.dept)}</td>
        <td>${roleLabel}</td>
        <td><span class="pill ${u.status==="active"?"pill-present":"pill-absent"}">${u.status||"active"}</span></td>
        <td><strong>${pts}</strong></td>
        <td>${u.id===uid?'<span style="font-size:12px;color:var(--text3)">You</span>':`<button class="btn-tbl-danger" onclick="doRemoveMember('${u.id}','${escHtml(u.name).replace(/'/g,"\\'")}')">Remove</button>`}</td>
      </tr>`;
    }).join("");
  } catch(e){ tbody.innerHTML=`<tr><td colspan="7" style="color:var(--danger);padding:1rem;">Error loading members.</td></tr>`; }
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
  const name=v("newName"),mid=v("newId"),pwd=v("newPassword"),dept=v("newDept"),email=v("newEmail"),phone=v("newPhone"),role=v("newRole"),status=v("newStatus");
  const errEl=document.getElementById("addMemberError");
  if(!name||!mid||!pwd||!dept||!email){ errEl.textContent="⚠️ Name, ID, Password, Dept and Email are required."; return; }
  if(pwd.length<6){ errEl.textContent="⚠️ Password must be at least 6 characters."; return; }
  const initials=(name.split(" ").map(w=>w[0]).join("").toUpperCase()+"??").slice(0,2);
  const btn=document.querySelector("#addMemberForm .btn-primary"); btn.disabled=true; btn.textContent="Adding...";
  try {
    const ok=await addMember({ id:mid, password:pwd, name, initials, role, dept, email, phone, status }, uid);
    if(!ok){ errEl.textContent="⚠️ A member with that ID already exists."; btn.disabled=false; btn.textContent="Add Member"; return; }
    closeAddMemberModal(); await renderAdmin();
    notifyNewMember(name);
    showToast("✅ Member '"+name+"' added!");
  } catch(e){ errEl.textContent="❌ Error: "+e.message; }
  btn.disabled=false; btn.textContent="Add Member";
}
async function doRemoveMember(memberId, memberName){
  if(!confirm(`Remove "${memberName}" (${memberId})?\n\nThis permanently deletes their account.`)) return;
  if(memberId===uid){ showToast("⚠️ Cannot remove yourself!","warn"); return; }
  try { await removeMember(memberId, uid); await renderAdmin(); showToast("🗑 '"+memberName+"' removed."); }
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
    const ok=await addMember(data[i], uid);
    ok?added++:skipped++;
  }
  closeCSVPreview(); await renderAdmin();
  showToast(`✅ Imported ${added} member(s).${skipped?" "+skipped+" skipped":""}`);
  btn.disabled=false; btn.textContent="✅ Import Selected";
}

let _bulkAllMembers = [];
async function openBulkAttendance(){
  try {
    const members=await getAllMembers();
    _bulkAllMembers=members.filter(m=>m.role!=="admin");
    document.getElementById("bulkSessionDate").textContent=new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"});
    document.getElementById("bulkSearchInput").value="";
    renderBulkRows(_bulkAllMembers);
    document.getElementById("bulkAttModal").style.display="flex";
    setTimeout(()=>document.getElementById("bulkSearchInput").focus(),100);
  } catch(e){ showToast("❌ Error loading members","warn"); }
}
function renderBulkRows(members){
  document.getElementById("bulkAttBody").innerHTML=members.map(m=>`
    <tr data-id="${m.id}" data-name="${escHtml(m.name).toLowerCase()}">
      <td><strong>${escHtml(m.name)}</strong></td>
      <td style="font-size:12px;color:var(--text2)">${escHtml(m.id)}</td>
      <td>${escHtml(m.dept)}</td>
      <td><select class="bulk-status-select" data-id="${m.id}"><option value="Present">✅ Present</option><option value="Late">🕐 Late</option><option value="Absent" selected>❌ Absent</option></select></td>
      <td><input type="text" class="bulk-note-input" placeholder="Note..." style="width:100%;padding:5px 8px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text);font-size:12px;"/></td>
    </tr>`).join("");
}
function filterBulkAttendance(query){
  const q=query.toLowerCase().trim();
  const filtered=q?_bulkAllMembers.filter(m=>m.name.toLowerCase().includes(q)||m.id.toLowerCase().includes(q)):_bulkAllMembers;
  renderBulkRows(filtered);
}
function closeBulkAttendance(){ document.getElementById("bulkAttModal").style.display="none"; }
async function submitBulkAttendance(){
  if(!assertOnline()) return;
  const session=document.getElementById("bulkSessionName").value.trim()||"Club Session";
  const todayStr=new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short"});
  const selects=document.querySelectorAll(".bulk-status-select");
  const noteInputs=document.querySelectorAll(".bulk-note-input");
  const btn=document.querySelector("#bulkAttModal .btn-primary"); btn.disabled=true; btn.textContent="Saving...";
  try {
    const records=[];
    selects.forEach((sel,i)=>{ records.push({ memberId:sel.dataset.id, date:todayStr, session, status:sel.value, note:noteInputs[i]?.value.trim()||"—" }); });
    await saveBulkAttendance(records, uid);
    // Notify each member of their individual attendance status
    records.forEach(r => {
      if(r.memberId !== uid) notifyAttendance(r.memberId, session, r.status);
    });
    closeBulkAttendance();
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
      notifyBadgeEarned(badge.name, badge.icon);
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
    if(unsubLeaderboard)    unsubLeaderboard();
    if(unsubNotices)        unsubNotices();
    if(unsubEvents)         unsubEvents();
    if(unsubNotifications)  unsubNotifications();
    await clearSession(); // deletes token from Firestore → invalidates ALL tabs
    window.location.href = "index.html";
  }
}

// =============================================
// CONNECTION STATUS MONITOR
// =============================================

let _isOnline = navigator.onLine;
let _offlineBannerShown = false;

function setupConnectionMonitor(){
  const status  = document.getElementById("connStatus");
  const dot     = document.getElementById("connDot");
  const label   = document.getElementById("connLabel");
  if(!status) return;

  function setOnline(){
    _isOnline = true;
    status.className = "conn-status online";
    label.textContent = "Online";
    if(_offlineBannerShown){
      showToast("✅ Back online! Reconnected.", "success");
      _offlineBannerShown = false;
    }
  }

  function setOffline(){
    _isOnline = false;
    _offlineBannerShown = true;
    status.className = "conn-status offline";
    label.textContent = "Offline";
    showOfflineBanner();
  }

  function setReconnecting(){
    status.className = "conn-status reconnecting";
    label.textContent = "Reconnecting...";
  }

  // Initial state
  _isOnline ? setOnline() : setOffline();

  // Browser online/offline events
  window.addEventListener("online",  ()=>{ setReconnecting(); setTimeout(setOnline, 1500); });
  window.addEventListener("offline", setOffline);
}

// Show a persistent offline banner (like YouTube's "No connection")
function showOfflineBanner(){
  // Remove existing banner if any
  const existing = document.getElementById("offlineBanner");
  if(existing) return; // already showing

  const banner = document.createElement("div");
  banner.id = "offlineBanner";
  banner.innerHTML = `
    <span>📡 No internet connection — changes won't be saved until you're back online</span>
    <button onclick="this.parentElement.remove()" style="background:none;border:none;color:#fff;cursor:pointer;font-size:16px;padding:0 4px;line-height:1;">✕</button>
  `;
  banner.style.cssText = `
    position:fixed;bottom:0;left:0;right:0;z-index:9997;
    background:#E24B4A;color:#fff;
    display:flex;align-items:center;justify-content:space-between;
    padding:12px 20px;font-size:13px;font-weight:600;
    box-shadow:0 -2px 12px rgba(0,0,0,.2);
    animation:slideUpBanner .3s ease;
  `;
  if(!document.getElementById("bannerStyle")){
    const s = document.createElement("style");
    s.id = "bannerStyle";
    s.textContent = "@keyframes slideUpBanner{from{transform:translateY(100%)}to{transform:translateY(0)}}";
    document.head.appendChild(s);
  }
  document.body.appendChild(banner);

  // Auto-remove when back online
  const check = setInterval(()=>{
    if(navigator.onLine){
      banner.remove();
      clearInterval(check);
    }
  }, 1000);
}

// Helper: check if offline before any write operation and warn user
function assertOnline(){
  if(!navigator.onLine){
    showToast("📡 You're offline. Please check your connection and try again.", "warn");
    return false;
  }
  return true;
}

// Play a soft notification beep using Web Audio API (no file needed)
function playNotifSound(){
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    // Two-tone pleasant "ding"
    const tones = [880, 1100];
    tones.forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.12);
      gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + i * 0.12 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.3);
      osc.start(ctx.currentTime + i * 0.12);
      osc.stop(ctx.currentTime + i * 0.12 + 0.35);
    });
  } catch(e){ /* AudioContext not available — silently skip */ }
}

let _prevUnreadCount = 0;

// --- Bell UI ---
function renderNotificationBell(notifs){
  const unread = notifs.filter(n=>!n.read).length;

  // Play sound only when unread count increases (new notification arrived)
  if(unread > _prevUnreadCount) playNotifSound();
  _prevUnreadCount = unread;

  // Update badge count
  const badge = document.getElementById("notifBadge");
  if(badge){
    badge.textContent = unread > 9 ? "9+" : unread;
    badge.style.display = unread > 0 ? "flex" : "none";
  }

  // If dropdown is open, re-render its content live
  const dropdown = document.getElementById("notifDropdown");
  if(dropdown && dropdown.classList.contains("open")){
    renderNotificationList(notifs);
  }
}

function renderNotificationList(notifs){
  const list = document.getElementById("notifList");
  if(!list) return;

  if(!notifs.length){
    list.innerHTML = `<div class="notif-empty">
      <div style="font-size:32px;margin-bottom:.5rem;">🔔</div>
      <div>No notifications yet</div>
      <div style="font-size:12px;color:var(--text3);margin-top:4px;">You're all caught up!</div>
    </div>`;
    return;
  }

  list.innerHTML = notifs.map(n => {
    const time = formatNotifTime(n.timestamp);
    return `<div class="notif-item ${n.read?"notif-read":"notif-unread"}" onclick="handleNotifClick('${n.id}','${n.link||""}')">
      <div class="notif-icon">${n.icon||"🔔"}</div>
      <div class="notif-content">
        <div class="notif-title">${escHtml(n.title)}</div>
        <div class="notif-body">${escHtml(n.body)}</div>
        <div class="notif-time">${time}</div>
      </div>
      ${!n.read ? `<div class="notif-dot"></div>` : ""}
      <button class="notif-del" onclick="event.stopPropagation();doDeleteNotification('${n.id}')" title="Remove">✕</button>
    </div>`;
  }).join("");
}

function formatNotifTime(ts){
  if(!ts) return "";
  const diff = Date.now() - ts;
  const mins = Math.floor(diff/60000);
  if(mins < 1) return "Just now";
  if(mins < 60) return mins+"m ago";
  const hrs = Math.floor(mins/60);
  if(hrs < 24) return hrs+"h ago";
  const days = Math.floor(hrs/24);
  if(days < 7) return days+"d ago";
  return new Date(ts).toLocaleDateString("en-GB",{day:"2-digit",month:"short"});
}

function toggleNotificationDropdown(){
  const dropdown = document.getElementById("notifDropdown");
  if(!dropdown) return;
  const isOpen = dropdown.classList.toggle("open");
  if(isOpen){
    // Load current notifications and render
    getNotifications(uid).then(notifs => renderNotificationList(notifs));
  }
}

// Close dropdown when clicking outside
document.addEventListener("click", e => {
  const bell = document.getElementById("notifBellWrap");
  if(bell && !bell.contains(e.target)){
    const dd = document.getElementById("notifDropdown");
    if(dd) dd.classList.remove("open");
  }
});

async function handleNotifClick(notifId, link){
  // Mark as read
  try { await markNotificationRead(uid, notifId); } catch(e){}
  // Navigate to the relevant page
  if(link){
    const dd = document.getElementById("notifDropdown");
    if(dd) dd.classList.remove("open");
    navigateTo(link);
  }
}

async function doMarkAllRead(){
  try {
    await markAllNotificationsRead(uid);
    showToast("✅ All notifications marked as read");
  } catch(e){ showToast("❌ Error","warn"); }
}

async function doClearAllNotifications(){
  if(!confirm("Clear all notifications?")) return;
  try {
    await clearAllNotifications(uid);
    showToast("🗑 Notifications cleared");
  } catch(e){ showToast("❌ Error","warn"); }
}

async function doDeleteNotification(notifId){
  try { await deleteNotification(uid, notifId); }
  catch(e){ showToast("❌ Error","warn"); }
}

// --- Helper: get all member IDs to broadcast to ---
async function getAllMemberIds(){
  const members = await getAllMembers();
  return members.map(m => m.id).filter(id => id !== uid); // exclude self
}

// --- Trigger functions (called when actions happen) ---

// Called when admin posts a notice
async function notifyAllNotice(noticeTitle){
  try {
    const ids = await getAllMemberIds();
    await broadcastNotification(ids, {
      type:"notice", icon:"📢",
      title:"New Notice Posted",
      body: noticeTitle,
      link:"notices"
    });
  } catch(e){ console.error("Notify error:",e); }
}

// Called when admin creates an event
async function notifyAllEvent(eventTitle){
  try {
    const ids = await getAllMemberIds();
    await broadcastNotification(ids, {
      type:"event", icon:"📅",
      title:"New Event Created",
      body: eventTitle,
      link:"events"
    });
  } catch(e){ console.error("Notify error:",e); }
}

// Called when admin marks bulk attendance — notify each member individually
async function notifyAttendance(memberId, session, status){
  try {
    await sendNotification(memberId, {
      type:"attendance", icon:"✅",
      title: status==="Present" ? "Attendance Marked ✅" : status==="Late" ? "Marked Late 🕐" : "Marked Absent ❌",
      body: `Your attendance for "${session}" was marked as ${status}.`,
      link:"attendance"
    });
  } catch(e){ console.error("Notify error:",e); }
}

// Called when someone earns a badge
async function notifyBadgeEarned(badgeName, badgeIcon){
  try {
    await sendNotification(uid, {
      type:"badge", icon: badgeIcon||"🏅",
      title:"Badge Unlocked! "+badgeIcon,
      body:`You earned the "${badgeName}" badge. Keep it up!`,
      link:"profile"
    });
  } catch(e){ console.error("Notify error:",e); }
}

// Called when a paper is added
async function notifyAllPaper(paperTitle, addedBy){
  try {
    const ids = await getAllMemberIds();
    await broadcastNotification(ids, {
      type:"paper", icon:"📄",
      title:"New Paper Added",
      body:`${addedBy} added "${paperTitle}" to the library.`,
      link:"papers"
    });
  } catch(e){ console.error("Notify error:",e); }
}

// Called when a new seminar is added
async function notifyAllSeminar(seminarTitle, speaker){
  try {
    const ids = await getAllMemberIds();
    await broadcastNotification(ids, {
      type:"seminar", icon:"🎓",
      title:"New Seminar Added",
      body:`"${seminarTitle}" by ${speaker} has been added.`,
      link:"seminars"
    });
  } catch(e){ console.error("Notify error:",e); }
}

// Called when a new team chat message arrives (only to team members, not sender)
async function notifyTeamChat(teamId, teamName, senderName, messagePreview){
  try {
    const teams = await getTeams();
    const team  = teams.find(t=>(t.firestoreId||String(t.id))===teamId);
    if(!team) return;
    const recipients = (team.members||[]).filter(id => id !== uid);
    await broadcastNotification(recipients, {
      type:"chat", icon:"💬",
      title:`${teamName}`,
      body:`${senderName}: ${messagePreview.slice(0,60)}${messagePreview.length>60?"…":""}`,
      link:"teams"
    });
  } catch(e){ console.error("Notify error:",e); }
}

// Called when admin adds a new member
async function notifyNewMember(memberName){
  try {
    const ids = await getAllMemberIds();
    await broadcastNotification(ids, {
      type:"member", icon:"👤",
      title:"New Member Joined",
      body:`${memberName} has joined the club.`,
      link:"leaderboard"
    });
  } catch(e){ console.error("Notify error:",e); }
}

// Called when member registers for event
async function notifyEventRegistered(eventTitle){
  // Self-notification confirming registration
  try {
    await sendNotification(uid, {
      type:"event", icon:"🎉",
      title:"Registration Confirmed",
      body:`You're registered for "${eventTitle}". See you there!`,
      link:"events"
    });
  } catch(e){ console.error("Notify error:",e); }
}

// Called when admin marks event attendance for a member
async function notifyEventAttended(memberId, eventTitle, pts){
  try {
    await sendNotification(memberId, {
      type:"event", icon:"🎯",
      title:"Event Attendance Marked",
      body:`You attended "${eventTitle}" and earned +${pts} points!`,
      link:"events"
    });
  } catch(e){ console.error("Notify error:",e); }
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
  toggleNoticeForm, postNotice, doDeleteNotice, openNoticeReads, closeNoticeReadsModal, handleNoticeImg,
  openChangePwModal, closeChangePwModal, submitChangePassword,
  triggerProfilePicUpload, handleProfilePicChange,
  togglePaperForm, submitPaper, doDeletePaper, handlePdfSelect, downloadPdf,
  openEditPaper, closeEditPaperModal, submitEditPaper, requestPaperUnpublish, doRepublishPaper,
  toggleTeamForm, submitTeam, doJoinTeam, doDeleteTeam,
  openEditTeam, closeEditTeamModal, submitEditTeam, requestKickMember,
  openChat, closeChatModal, sendMessage, chatKeydown, doDeleteChatMsg,
  toggleMentorForm, submitMentor, doDeleteMentor,
  toggleExecForm, submitExecutive, doDeleteExecutive,
  openAddMemberModal, closeAddMemberModal, submitAddMember, doRemoveMember, resolveApproval,
  exportMembersCSV, triggerCSVImport, handleCSVImport, openCSVPreview, closeCSVPreview, submitCSVImport,
  openBulkAttendance, closeBulkAttendance, submitBulkAttendance, filterBulkAttendance,
  toggleNotificationDropdown, doMarkAllRead, doClearAllNotifications, doDeleteNotification, handleNotifClick,
  logout
};
