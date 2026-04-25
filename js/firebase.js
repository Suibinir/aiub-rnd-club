/* =============================================
   AIUB R&D CLUB — FIREBASE CONFIG & HELPERS
   js/firebase.js
   All Firestore reads/writes live here.
   ============================================= */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc,
         collection, getDocs, addDoc, query, orderBy, onSnapshot,
         arrayUnion, arrayRemove, increment, serverTimestamp,
         writeBatch } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage, ref, uploadString, getDownloadURL, deleteObject }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

const firebaseConfig = {
  apiKey:            "AIzaSyCCEfpPzmhIbk9GIt2aYDl6R0gJ4fasfnM",
  authDomain:        "aiub-rnd-club.firebaseapp.com",
  projectId:         "aiub-rnd-club",
  storageBucket:     "aiub-rnd-club.firebasestorage.app",
  messagingSenderId: "652214407284",
  appId:             "1:652214407284:web:1d908b123525099346c121",
  measurementId:     "G-FKRY0YW370"
};

const app = initializeApp(firebaseConfig);
export const db  = getFirestore(app);
export const storage = getStorage(app);

/* =============================================
   FIRESTORE STRUCTURE
   /members/{memberId}          — member profile + password
   /members/{memberId}/attendance/{recordId}
   /members/{memberId}/badges/{badgeId}
   /events/{eventId}            — shared events
   /notices/{noticeId}          — shared notices
   /leaderboard/{memberId}      — points + rank
   /research/papers/{paperId}
   /research/teams/{teamId}
   /research/mentors/{mentorId}
   /research/seminars/{seminarId}
   /meta/streak/{memberId}      — streak arrays
   ============================================= */

// ---- SESSION — Firestore-backed tokens ----
// /sessions/{tokenId} = { uid, createdAt }
// Token stored in sessionStorage locally.
// On logout → delete from Firestore → ALL tabs instantly invalid.
// On every dashboard load → verify token still exists in Firestore.

function _makeToken(){
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export async function saveSession(u){
  const token = _makeToken();
  // Write token to Firestore — this is the source of truth
  await setDoc(doc(db,"sessions",token), {
    uid:       u.id,
    createdAt: Date.now()
  });
  // Store token + safe user info locally (no password ever stored)
  sessionStorage.setItem("uniclub_token", token);
  sessionStorage.setItem("uniclub_user", JSON.stringify({
    id:u.id, name:u.name, initials:u.initials, role:u.role, dept:u.dept, email:u.email
  }));
}

export function loadSession(){
  const r = sessionStorage.getItem("uniclub_user");
  return r ? JSON.parse(r) : null;
}

export function getSessionToken(){
  return sessionStorage.getItem("uniclub_token");
}

// Verify token is still valid on Firestore (call on dashboard load)
export async function verifySession(){
  const token = getSessionToken();
  if(!token) return false;
  try {
    const snap = await getDoc(doc(db,"sessions",token));
    return snap.exists();
  } catch(e){ return false; }
}

export async function clearSession() {
  const token = sessionStorage.getItem("uniclub_token");
  if (token) {
    try {
      // Physically remove the session from the Firestore database
      await deleteDoc(doc(db, "sessions", token));
    } catch (e) {
      console.error("Firestore error during logout:", e);
    }
  }
  sessionStorage.clear();
}

// Add this to your firebase.js exports
export async function deleteSession(token) {
  try {
    await deleteDoc(doc(db, "sessions", token));
  } catch (e) {
    console.error("Error invalidating session:", e);
  }
}

// Listen for session deletion in real-time (other tab logged out)
// Returns unsubscribe function
export function listenToSession(token, onInvalidated){
  if(!token) return ()=>{};
  return onSnapshot(doc(db,"sessions",token), snap => {
    if(!snap.exists()) onInvalidated();
  });
}

// ---- AUTH ----
export async function findUser(id, pw){
  try {
    const snap = await getDoc(doc(db,"members",id));
    if(!snap.exists()) return null;
    const data = snap.data();
    if(data.password !== pw) return null;
    return { id, ...data };
  } catch(e){ console.error("findUser error",e); return null; }
}

export async function changePassword(uid, newPw){
  await updateDoc(doc(db,"members",uid), { password: newPw });
}

// ---- MEMBERS ----
export async function getAllMembers(){
  const snap = await getDocs(collection(db,"members"));
  return snap.docs.map(d=>({ id:d.id, ...d.data() }));
}

export async function addMember(m){
  const existing = await getDoc(doc(db,"members",m.id));
  if(existing.exists()) return false;
  await setDoc(doc(db,"members",m.id), m);
  // Create leaderboard entry
  await setDoc(doc(db,"leaderboard",m.id), {
    name:m.name, initials:m.initials, points:0, badges:0,
    bgColor:"#e9ecef", txtColor:"#495057"
  });
  // Seed default stats
  await setDoc(doc(db,"stats",m.id), getDefaultStats(m.id));
  // Seed default badges
  const batch = writeBatch(db);
  getDefaultBadges().forEach(b=>{
    batch.set(doc(db,"badges",m.id+"_"+b.id), { memberId:m.id, ...b });
  });
  await batch.commit();
  return true;
}

export async function removeMember(id){
  // Delete member doc
  await deleteDoc(doc(db,"members",id));
  await deleteDoc(doc(db,"leaderboard",id));
  await deleteDoc(doc(db,"stats",id));
  // Note: sub-collections (attendance, badges) are not auto-deleted
  // They will be orphaned but won't affect the app
}

export async function updateMemberStatus(id, status){
  await updateDoc(doc(db,"members",id), { status });
}

// ---- STATS (per member) ----
export async function getStats(uid){
  const snap = await getDoc(doc(db,"stats",uid));
  if(snap.exists()) return snap.data();
  const def = getDefaultStats(uid);
  await setDoc(doc(db,"stats",uid), def);
  return def;
}
export async function saveStats(uid, data){
  await setDoc(doc(db,"stats",uid), data, { merge:true });
}
export async function addPointsToMember(uid, pts){
  await updateDoc(doc(db,"stats",uid), { points: increment(pts) });
  await updateDoc(doc(db,"leaderboard",uid), { points: increment(pts) });
}

// ---- ATTENDANCE (per member) ----
export async function getAttendance(uid){
  const snap = await getDocs(
    query(collection(db,"members",uid,"attendance"), orderBy("timestamp","desc"))
  );
  if(snap.empty){
    // Seed default attendance on first load
    const defaults = getDefaultAttendance();
    const batch = writeBatch(db);
    defaults.forEach((r,i)=>{
      batch.set(doc(collection(db,"members",uid,"attendance")), { ...r, timestamp: Date.now()-i*1000 });
    });
    await batch.commit();
    return defaults;
  }
  return snap.docs.map(d=>d.data());
}
export async function addAttendanceRecord(uid, record){
  await addDoc(collection(db,"members",uid,"attendance"), {
    ...record, timestamp: Date.now()
  });
}

// ---- STREAK ----
export async function getStreak(uid){
  const snap = await getDoc(doc(db,"streaks",uid));
  if(snap.exists()) return snap.data().streak;
  const def = getDefaultStreak();
  await setDoc(doc(db,"streaks",uid), { streak:def });
  return def;
}
export async function saveStreak(uid, streakArr){
  await setDoc(doc(db,"streaks",uid), { streak:streakArr });
}

// ---- BADGES (per member) ----
export async function getBadges(uid){
  const snap = await getDocs(collection(db,"members",uid,"badges"));
  if(snap.empty){
    const defaults = getDefaultBadges();
    const batch = writeBatch(db);
    defaults.forEach(b=>{
      batch.set(doc(db,"members",uid,"badges",b.id), b);
    });
    await batch.commit();
    return defaults;
  }
  return snap.docs.map(d=>({ id:d.id, ...d.data() }));
}
export async function earnBadge(uid, badgeId){
  await updateDoc(doc(db,"members",uid,"badges",badgeId), { earned:true });
  await updateDoc(doc(db,"leaderboard",uid), { badges: increment(1) });
}

// ---- EVENTS (global/shared) ----
export async function getEvents(){
  const snap = await getDocs(query(collection(db,"events"), orderBy("sortOrder","asc")));
  if(snap.empty){
    // Seed default events
    const defaults = getDefaultEvents();
    const batch = writeBatch(db);
    defaults.forEach((ev,i)=>{
      batch.set(doc(db,"events",String(ev.id)), { ...ev, sortOrder:i });
    });
    await batch.commit();
    return defaults;
  }
  return snap.docs.map(d=>({ firestoreId:d.id, ...d.data() }));
}
export async function createEvent(ev){
  const ref = await addDoc(collection(db,"events"), { ...ev, sortOrder: Date.now() });
  return ref.id;
}
export async function updateEvent(firestoreId, data){
  await updateDoc(doc(db,"events",firestoreId), data);
}
export async function deleteEvent(firestoreId){
  await deleteDoc(doc(db,"events",firestoreId));
}
export async function registerForEvent(firestoreId, uid){
  await updateDoc(doc(db,"events",firestoreId), { registrants: arrayUnion(uid) });
}
export async function markEventAttendee(firestoreId, memberId, attended){
  if(attended){
    await updateDoc(doc(db,"events",firestoreId), { attendees: arrayUnion(memberId) });
  } else {
    await updateDoc(doc(db,"events",firestoreId), { attendees: arrayRemove(memberId) });
  }
}

// ---- NOTICES (global/shared) ----
export async function getNotices(){
  const snap = await getDocs(query(collection(db,"notices"), orderBy("timestamp","desc")));
  if(snap.empty){
    const defaults = getDefaultNotices();
    const batch = writeBatch(db);
    defaults.forEach(n=>{
      batch.set(doc(collection(db,"notices")), { ...n, timestamp: Date.now() });
    });
    await batch.commit();
    return defaults.map((n,i)=>({ firestoreId:"seed"+i, ...n }));
  }
  return snap.docs.map(d=>({ firestoreId:d.id, ...d.data() }));
}
export async function addNotice(notice){
  const ref = await addDoc(collection(db,"notices"), { ...notice, timestamp: Date.now() });
  return ref.id;
}
export async function deleteNotice(firestoreId){
  await deleteDoc(doc(db,"notices",firestoreId));
}

// ---- LEADERBOARD ----
export async function getLeaderboard(){
  const snap = await getDocs(query(collection(db,"leaderboard"), orderBy("points","desc")));
  if(snap.empty){
    // Seed from members
    const members = await getAllMembers();
    const batch = writeBatch(db);
    members.forEach(m=>{
      batch.set(doc(db,"leaderboard",m.id),{
        name:m.name, initials:m.initials, points:0, badges:0,
        bgColor:"#e9ecef", txtColor:"#495057"
      });
    });
    await batch.commit();
    return members.map(m=>({ id:m.id, name:m.name, initials:m.initials, points:0, badges:0, bgColor:"#e9ecef", txtColor:"#495057" }));
  }
  return snap.docs.map(d=>({ id:d.id, ...d.data() }));
}
export async function getUserRank(uid){
  const lb = await getLeaderboard();
  const idx = lb.findIndex(e=>e.id===uid);
  return idx>=0 ? idx+1 : "—";
}

// ---- PROFILE PICTURE (Firebase Storage) ----
export async function saveProfilePic(uid, base64DataUrl){
  // Store as base64 in Firestore (simpler than Storage for small images)
  await setDoc(doc(db,"profilePics",uid), { dataUrl: base64DataUrl });
}
export async function loadProfilePic(uid){
  try {
    const snap = await getDoc(doc(db,"profilePics",uid));
    return snap.exists() ? snap.data().dataUrl : null;
  } catch(e){ return null; }
}

// ---- RESEARCH — PAPERS ----
export async function getPapers(){
  const snap = await getDocs(query(collection(db,"papers"), orderBy("timestamp","desc")));
  if(snap.empty){
    const defaults = getDefaultPapers();
    const batch = writeBatch(db);
    defaults.forEach(p=>{ batch.set(doc(collection(db,"papers")), { ...p, timestamp:Date.now() }); });
    await batch.commit();
    return defaults;
  }
  return snap.docs.map(d=>({ firestoreId:d.id, ...d.data() }));
}
export async function addPaper(paper){
  const ref = await addDoc(collection(db,"papers"), { ...paper, timestamp:Date.now() });
  return ref.id;
}
export async function deletePaper(firestoreId){
  await deleteDoc(doc(db,"papers",firestoreId));
}

// ---- RESEARCH — TEAMS ----
export async function getTeams(){
  const snap = await getDocs(collection(db,"teams"));
  if(snap.empty){
    const defaults = getDefaultTeams();
    const batch = writeBatch(db);
    defaults.forEach(t=>{ batch.set(doc(collection(db,"teams")), t); });
    await batch.commit();
    return defaults;
  }
  return snap.docs.map(d=>({ firestoreId:d.id, ...d.data() }));
}
export async function addTeam(team){
  const ref = await addDoc(collection(db,"teams"), team);
  return ref.id;
}
export async function updateTeam(firestoreId, data){
  await updateDoc(doc(db,"teams",firestoreId), data);
}
export async function joinTeam(firestoreId, uid){
  await updateDoc(doc(db,"teams",firestoreId), { members: arrayUnion(uid) });
}
export async function kickMemberFromTeam(firestoreId, memberId){
  await updateDoc(doc(db,"teams",firestoreId), { members: arrayRemove(memberId) });
}
export async function deleteTeam(firestoreId){
  await deleteDoc(doc(db,"teams",firestoreId));
}

// ---- KICK REQUESTS (team kick needing admin approval) ----
export async function requestKick(teamId, targetId, targetName, requesterId, requesterName){
  await addDoc(collection(db,"kickRequests"), {
    teamId, targetId, targetName, requesterId, requesterName,
    status:"pending", timestamp: Date.now()
  });
}
export async function getKickRequests(){
  const snap = await getDocs(query(collection(db,"kickRequests"), orderBy("timestamp","desc")));
  return snap.docs.map(d=>({ firestoreId:d.id, ...d.data() }));
}
export async function resolveKickRequest(firestoreId, approved, teamId, targetId){
  if(approved) await kickMemberFromTeam(teamId, targetId);
  await deleteDoc(doc(db,"kickRequests",firestoreId));
}

// ---- RESEARCH — MENTORS ----
export async function getMentors(){
  const snap = await getDocs(collection(db,"mentors"));
  if(snap.empty){
    const defaults = getDefaultMentors();
    const batch = writeBatch(db);
    defaults.forEach(m=>{ batch.set(doc(collection(db,"mentors")), m); });
    await batch.commit();
    return defaults;
  }
  return snap.docs.map(d=>({ firestoreId:d.id, ...d.data() }));
}
export async function addMentor(mentor){
  const ref = await addDoc(collection(db,"mentors"), mentor);
  return ref.id;
}
export async function deleteMentor(firestoreId){
  await deleteDoc(doc(db,"mentors",firestoreId));
}

// ---- EXECUTIVE PANEL ----
export async function getExecutives(){
  const snap = await getDocs(collection(db,"executives"));
  if(snap.empty) return [];
  return snap.docs.map(d=>({ firestoreId:d.id, ...d.data() }));
}
export async function addExecutive(exec){
  const ref = await addDoc(collection(db,"executives"), exec);
  return ref.id;
}
export async function deleteExecutive(firestoreId){
  await deleteDoc(doc(db,"executives",firestoreId));
}

// ---- PAPER UPDATE & UNPUBLISH ----
export async function updatePaper(firestoreId, data){
  await updateDoc(doc(db,"papers",firestoreId), data);
}
export async function requestUnpublish(paperId, paperTitle, requesterId){
  await addDoc(collection(db,"unpublishRequests"), {
    paperId, paperTitle, requesterId,
    status:"pending", timestamp: Date.now()
  });
}
export async function getUnpublishRequests(){
  const snap = await getDocs(query(collection(db,"unpublishRequests"), orderBy("timestamp","desc")));
  return snap.docs.map(d=>({ firestoreId:d.id, ...d.data() }));
}
export async function resolveUnpublishRequest(firestoreId, approved, paperId){
  if(approved) await updateDoc(doc(db,"papers",paperId), { published:false });
  await deleteDoc(doc(db,"unpublishRequests",firestoreId));
}
export async function republishPaper(paperId){
  await updateDoc(doc(db,"papers",paperId), { published:true });
}

// ---- NOTICE READ RECEIPTS ----
export async function markNoticeRead(noticeId, userId, userName){
  await setDoc(doc(db,"noticeReads",noticeId+"_"+userId), {
    noticeId, userId, userName, readAt: Date.now()
  });
}
export async function getNoticeReads(noticeId){
  const snap = await getDocs(query(
    collection(db,"noticeReads"),
    orderBy("readAt","asc")
  ));
  return snap.docs.map(d=>d.data()).filter(r=>r.noticeId===noticeId);
}

// ---- RESEARCH — SEMINARS ----
export async function getSeminars(){
  const snap = await getDocs(query(collection(db,"seminars"), orderBy("timestamp","desc")));
  if(snap.empty){
    const defaults = getDefaultSeminars();
    const batch = writeBatch(db);
    defaults.forEach(s=>{ batch.set(doc(collection(db,"seminars")), { ...s, timestamp:Date.now() }); });
    await batch.commit();
    return defaults;
  }
  return snap.docs.map(d=>({ firestoreId:d.id, ...d.data() }));
}
export async function addSeminar(seminar){
  const ref = await addDoc(collection(db,"seminars"), { ...seminar, timestamp:Date.now() });
  return ref.id;
}
export async function deleteSeminar(firestoreId){
  await deleteDoc(doc(db,"seminars",firestoreId));
}

// ---- BULK ATTENDANCE ----
export async function saveBulkAttendance(records){
  // records = [{ memberId, date, session, status, note }]
  const batch = writeBatch(db);
  for(const r of records){
    const attRef = doc(collection(db,"members",r.memberId,"attendance"));
    batch.set(attRef, { date:r.date, session:r.session, status:r.status, note:r.note, timestamp:Date.now() });
    // Update stats
    const statsRef = doc(db,"stats",r.memberId);
    const statsSnap = await getDoc(statsRef);
    const mStats = statsSnap.exists() ? statsSnap.data() : getDefaultStats(r.memberId);
    if(r.status==="Present"){
      mStats.streak = (mStats.streak||0)+1;
      mStats.points = (mStats.points||0)+10;
      batch.update(statsRef, { streak:mStats.streak, points:mStats.points });
      batch.update(doc(db,"leaderboard",r.memberId), { points:increment(10) });
    }
  }
  await batch.commit();
}

// ---- REAL-TIME LISTENERS (live sync) ----
export function listenToLeaderboard(callback){
  return onSnapshot(
    query(collection(db,"leaderboard"), orderBy("points","desc")),
    snap => callback(snap.docs.map(d=>({ id:d.id, ...d.data() })))
  );
}
export function listenToNotices(callback){
  return onSnapshot(
    query(collection(db,"notices"), orderBy("timestamp","desc")),
    snap => callback(snap.docs.map(d=>({ firestoreId:d.id, ...d.data() })))
  );
}
export function listenToEvents(callback){
  return onSnapshot(
    query(collection(db,"events"), orderBy("sortOrder","asc")),
    snap => callback(snap.docs.map(d=>({ firestoreId:d.id, ...d.data() })))
  );
}

// ---- DEFAULT DATA (used for seeding) ----
function getDefaultStats(uid){
  return { attendanceRate:0, eventsAttended:0, points:uid==="admin"?0:0, streak:0, noticesPosted:0 };
}
function getDefaultBadges(){
  return [
    {id:"first_login",icon:"🌟",name:"First Login", earned:true, desc:"Logged in for the first time"},
    {id:"event_pro",  icon:"🎯",name:"Event Pro",   earned:false,desc:"Attend 3 events"},
    {id:"streak_7",   icon:"🔥",name:"7-Day Streak",earned:false,desc:"Attend 7 sessions in a row"},
    {id:"team_player",icon:"🤝",name:"Team Player", earned:false,desc:"Register for a team event"},
    {id:"reporter",   icon:"📝",name:"Reporter",    earned:false,desc:"Post 3 notices"},
    {id:"top_3",      icon:"👑",name:"Top 3",       earned:false,desc:"Reach top 3 on leaderboard"}
  ];
}
function getDefaultStreak(){
  return Array(30).fill(null);
}
function getDefaultAttendance(){ return []; }
function getDefaultEvents(){
  return [
    { id:1, day:"25", month:"Apr", year:"2026", title:"Photography Workshop", description:"Learn DSLR photography, composition, and post-processing with Adobe Lightroom.", venue:"Art Block, Studio 2", time:"11:00 AM", duration:"4 hours", capacity:30, category:"Workshop", points:20, organizer:"Arts Committee", past:false, registrants:[], attendees:[] },
    { id:2, day:"20", month:"Mar", year:"2026", title:"Workshop: Python Fundamentals", description:"Introductory Python workshop covering variables, loops, functions, and data structures.", venue:"CS Lab A, 2nd Floor", time:"10:00 AM", duration:"3 hours", capacity:45, category:"Workshop", points:20, organizer:"Tech Committee", past:true, registrants:[], attendees:[] }
  ];
}
function getDefaultNotices(){
  return [
    { tag:"general", title:"Welcome to AIUB R&D Club Portal!", body:"This is the official portal for AIUB R&D Club members. Explore events, papers, and more.", date:"Just now", author:"Admin" }
  ];
}
function getDefaultPapers(){
  return [
    { title:"Machine Learning in Climate Prediction", authors:"Nadia Khan, Arif Rahman", link:"https://ieeexplore.ieee.org/", year:2025, tags:["ML","Climate"], addedBy:"Nadia Khan", addedById:"2023-CS-010", date:"Mar 10", pdfData:null, pdfName:null }
  ];
}
function getDefaultTeams(){
  return [
    { name:"NLP Research Group", lead:"Nadia Khan", members:["2023-CS-010"], topic:"Bangla NLP & Sentiment Analysis", status:"Active" }
  ];
}
function getDefaultMentors(){
  return [
    { name:"Dr. Asif Mahmud", title:"Club Supervisor", dept:"CS Dept", expertise:"Machine Learning, Deep Learning", email:"asif@university.edu", available:true }
  ];
}
function getDefaultSeminars(){
  return [
    { title:"Introduction to Transformer Models", speaker:"Dr. Asif Mahmud", date:"Mar 15, 2026", duration:"90 min", attendees:[], notes:"Covered BERT, GPT architecture. Slides shared on drive." }
  ];
}

// =============================================
// TEAM CHAT
// Firestore path: /teamChats/{teamId}/messages/{msgId}
// Each message: { senderId, senderName, senderInitials, text, timestamp }
// =============================================

// Send a message to a team chat
export async function sendChatMessage(teamId, message){
  await addDoc(collection(db, "teamChats", teamId, "messages"), {
    senderId:       message.senderId,
    senderName:     message.senderName,
    senderInitials: message.senderInitials,
    text:           message.text,
    timestamp:      Date.now()
  });
}

// Get last N messages (for initial load)
export async function getChatMessages(teamId, limitCount = 50){
  const q = query(
    collection(db, "teamChats", teamId, "messages"),
    orderBy("timestamp", "asc")
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// Real-time listener for new messages in a team chat
// Returns an unsubscribe function — call it to stop listening
export function listenToChat(teamId, callback){
  const q = query(
    collection(db, "teamChats", teamId, "messages"),
    orderBy("timestamp", "asc")
  );
  return onSnapshot(q, snap => {
    const messages = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(messages);
  });
}

// Delete a single message (admin or sender only)
export async function deleteChatMessage(teamId, messageId){
  await deleteDoc(doc(db, "teamChats", teamId, "messages", messageId));
}

// =============================================
// NOTIFICATION SYSTEM
// Firestore path: /notifications/{userId}/items/{notifId}
// Each notification:
//   { type, title, body, icon, link, read, timestamp }
// type: "notice"|"event"|"attendance"|"badge"|"paper"|"seminar"|"chat"|"member"
// link: which page to navigate to e.g. "notices", "events", "teams"
// =============================================

// Send a notification to one specific user
export async function sendNotification(userId, notif){
  await addDoc(collection(db,"notifications",userId,"items"), {
    type:      notif.type      || "general",
    title:     notif.title     || "",
    body:      notif.body      || "",
    icon:      notif.icon      || "🔔",
    link:      notif.link      || "",
    read:      false,
    timestamp: Date.now()
  });
}

// Send same notification to multiple users at once (batch)
export async function broadcastNotification(userIds, notif){
  const batch = writeBatch(db);
  userIds.forEach(userId => {
    const ref = doc(collection(db,"notifications",userId,"items"));
    batch.set(ref, {
      type:      notif.type      || "general",
      title:     notif.title     || "",
      body:      notif.body      || "",
      icon:      notif.icon      || "🔔",
      link:      notif.link      || "",
      read:      false,
      timestamp: Date.now()
    });
  });
  await batch.commit();
}

// Fetch all notifications for a user (latest first)
export async function getNotifications(userId){
  const q = query(
    collection(db,"notifications",userId,"items"),
    orderBy("timestamp","desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id:d.id, ...d.data() }));
}

// Mark one notification as read
export async function markNotificationRead(userId, notifId){
  await updateDoc(doc(db,"notifications",userId,"items",notifId), { read:true });
}

// Mark ALL notifications as read
export async function markAllNotificationsRead(userId){
  const q = query(
    collection(db,"notifications",userId,"items"),
    orderBy("timestamp","desc")
  );
  const snap = await getDocs(q);
  const batch = writeBatch(db);
  snap.docs.forEach(d => {
    if(!d.data().read) batch.update(d.ref, { read:true });
  });
  await batch.commit();
}

// Delete a single notification
export async function deleteNotification(userId, notifId){
  await deleteDoc(doc(db,"notifications",userId,"items",notifId));
}

// Delete ALL notifications for a user
export async function clearAllNotifications(userId){
  const snap = await getDocs(collection(db,"notifications",userId,"items"));
  const batch = writeBatch(db);
  snap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
}

// Real-time listener — fires whenever notifications change
export function listenToNotifications(userId, callback){
  const q = query(
    collection(db,"notifications",userId,"items"),
    orderBy("timestamp","desc")
  );
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id:d.id, ...d.data() })));
  });
}

