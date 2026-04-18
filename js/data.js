/* =============================================
   UNICLUB PORTAL — DATA.JS  v4
   ============================================= */

const SEED_MEMBERS = [
  { id:"admin",        password:"admin123", name:"Asif Mahmud",      initials:"AM", role:"admin",  dept:"CS Dept",  email:"asif@university.edu",   phone:"01700-000001", year:"Faculty",  status:"active" },
  { id:"member",       password:"pass123",  name:"Arif Rahman",      initials:"AR", role:"member", dept:"CS Dept",  email:"arif.r@university.edu", phone:"01700-000002", year:"2nd Year", status:"active" },
  { id:"2024-CS-042",  password:"arif2024", name:"Arif Rahman",      initials:"AR", role:"member", dept:"CS Dept",  email:"arif.r@university.edu", phone:"01700-000002", year:"2nd Year", status:"active" },
  { id:"2024-EEE-015", password:"eee2024",  name:"Fatima Begum",     initials:"FB", role:"member", dept:"EEE Dept", email:"fatima@university.edu", phone:"01700-000003", year:"2nd Year", status:"active" },
  { id:"2024-ME-007",  password:"me2024",   name:"Tanvir Chowdhury", initials:"TC", role:"member", dept:"ME Dept",  email:"tanvir@university.edu", phone:"01700-000004", year:"3rd Year", status:"active" },
  { id:"2023-CS-010",  password:"nadia123", name:"Nadia Khan",       initials:"NK", role:"member", dept:"CS Dept",  email:"nadia@university.edu",  phone:"01700-000005", year:"3rd Year", status:"active" },
  { id:"2023-BA-019",  password:"sadia123", name:"Sadia Ferdousi",   initials:"SF", role:"member", dept:"BBA Dept", email:"sadia@university.edu",  phone:"01700-000006", year:"3rd Year", status:"inactive" }
];

// ---- MEMBERS ----
function getAllMembers() {
  const raw = localStorage.getItem("uniclub_members");
  if (raw) return JSON.parse(raw);
  localStorage.setItem("uniclub_members", JSON.stringify(SEED_MEMBERS));
  return SEED_MEMBERS;
}
function saveAllMembers(m) { localStorage.setItem("uniclub_members", JSON.stringify(m)); }
function addMember(m) {
  const all = getAllMembers();
  if (all.find(x => x.id === m.id)) return false;
  all.push(m);
  saveAllMembers(all);
  const lb = getLeaderboard();
  lb.push({ id:m.id, name:m.name, initials:m.initials, points:0, badges:0, bgColor:"#e9ecef", txtColor:"#495057" });
  saveLeaderboard(lb);
  return true;
}
function removeMember(id) {
  saveAllMembers(getAllMembers().filter(m => m.id !== id));
  saveLeaderboard(getLeaderboard().filter(e => e.id !== id));
  ["stats","attendance","badges","streak"].forEach(k => localStorage.removeItem("uniclub_"+id+"_"+k));
}

// ---- AUTH ----
function findUser(id, pw) { return getAllMembers().find(u => u.id===id && u.password===pw)||null; }
function saveSession(u) {
  sessionStorage.setItem("uniclub_user", JSON.stringify({
    id:u.id, name:u.name, initials:u.initials, role:u.role, dept:u.dept, email:u.email
  }));
}
function loadSession() { const r=sessionStorage.getItem("uniclub_user"); return r?JSON.parse(r):null; }
function clearSession() { sessionStorage.removeItem("uniclub_user"); }

// ---- PER-USER STORAGE ----
function saveData(uid,sec,data) { localStorage.setItem("uniclub_"+uid+"_"+sec, JSON.stringify(data)); }
function loadData(uid,sec,def)  { const r=localStorage.getItem("uniclub_"+uid+"_"+sec); return r?JSON.parse(r):def; }

// ---- PROFILE PICTURE ----
function saveProfilePic(uid, base64) { localStorage.setItem("uniclub_pic_"+uid, base64); }
function loadProfilePic(uid) { return localStorage.getItem("uniclub_pic_"+uid)||null; }

// ---- DEFAULTS ----
function getDefaultAttendance() {
  const today=new Date(), records=[];
  const sess=["Regular Meeting","Workshop Session","General Meeting","Club Event","Workshop: Python","General Session"];
  const stat=["Present","Present","Present","Present","Late","Present","Absent"];
  for(let i=6;i>=1;i--){
    const d=new Date(today); d.setDate(d.getDate()-(i*3)); const s=stat[i%stat.length];
    records.push({date:d.toLocaleDateString("en-GB",{day:"2-digit",month:"short"}),session:sess[i%sess.length],status:s,note:s==="Late"?"10 min late":"—"});
  }
  return records;
}

function getDefaultEvents() {
  return [
    {
      id:1, day:"05", month:"Apr", year:"2026",
      title:"Spring Hackathon 2026",
      description:"A 6-hour coding competition open to all members. Build something amazing in teams of 3–4. Prizes for top 3 teams including cash awards and certificates.",
      venue:"CS Lab Block B, 3rd Floor", time:"9:00 AM", duration:"6 hours",
      capacity:60, category:"Competition", points:20,
      organizer:"Tech Committee", contact:"tech@university.edu",
      past:false, registrants:[], attendees:[]
    },
    {
      id:2, day:"10", month:"Apr", year:"2026",
      title:"Guest Lecture: AI in Industry",
      description:"Industry expert Dr. Rafiq Hossain from Google DeepMind will speak about real-world applications of artificial intelligence in modern industries. Q&A session included.",
      venue:"Main Auditorium", time:"3:00 PM", duration:"2 hours",
      capacity:120, category:"Lecture", points:20,
      organizer:"Academic Committee", contact:"academic@university.edu",
      past:false, registrants:[], attendees:[]
    },
    {
      id:3, day:"18", month:"Apr", year:"2026",
      title:"Annual Club Dinner 2026",
      description:"Our yearly celebration dinner for all club members. Enjoy a wonderful evening with food, performances, and the annual award ceremony recognizing top contributors.",
      venue:"University Cafeteria, Main Hall", time:"7:00 PM", duration:"3 hours",
      capacity:80, category:"Social", points:15,
      organizer:"Social Committee", contact:"social@university.edu",
      past:false, registrants:[], attendees:[]
    },
    {
      id:4, day:"25", month:"Apr", year:"2026",
      title:"Photography Workshop",
      description:"Learn the basics of DSLR photography, composition, lighting, and post-processing with Adobe Lightroom. Bring your own camera if you have one.",
      venue:"Art Block, Studio 2", time:"11:00 AM", duration:"4 hours",
      capacity:30, category:"Workshop", points:20,
      organizer:"Arts Committee", contact:"arts@university.edu",
      past:false, registrants:[], attendees:[]
    },
    {
      id:5, day:"20", month:"Mar", year:"2026",
      title:"Workshop: Python Fundamentals",
      description:"An introductory Python programming workshop covering variables, loops, functions, and basic data structures. Suitable for beginners.",
      venue:"CS Lab A, 2nd Floor", time:"10:00 AM", duration:"3 hours",
      capacity:45, category:"Workshop", points:20,
      organizer:"Tech Committee", contact:"tech@university.edu",
      past:true, registrants:["member","2024-CS-042","2024-EEE-015","2023-CS-010"], attendees:["member","2024-CS-042","2024-EEE-015","2023-CS-010"]
    },
    {
      id:6, day:"14", month:"Mar", year:"2026",
      title:"Quiz Night — Round 3",
      description:"The third installment of our popular quiz night series. Teams of 3 compete across topics including general knowledge, science, sports, and pop culture.",
      venue:"Student Lounge, Ground Floor", time:"6:00 PM", duration:"2 hours",
      capacity:50, category:"Competition", points:20,
      organizer:"Events Committee", contact:"events@university.edu",
      past:true, registrants:["member","2024-CS-042","2024-ME-007","2023-CS-010"], attendees:["member","2024-CS-042","2024-ME-007","2023-CS-010"]
    }
  ];
}

function getGlobalEvents() {
  const raw = localStorage.getItem("uniclub_events");
  if (raw) return JSON.parse(raw);
  const def = getDefaultEvents();
  localStorage.setItem("uniclub_events", JSON.stringify(def));
  return def;
}
function saveGlobalEvents(evts) { localStorage.setItem("uniclub_events", JSON.stringify(evts)); }

function getDefaultNotices() {
  return [
    {id:1,tag:"urgent", title:"Membership renewal deadline — April 7th",  body:"All members must renew before April 7th to maintain active status and event access.", date:"2 hours ago", author:"Admin"},
    {id:2,tag:"event",  title:"Hackathon team registration now open",     body:"Form your teams of 3–4 and register via the Events tab. Deadline: April 3rd.",      date:"Yesterday",  author:"Events Committee"},
    {id:3,tag:"general",title:"Updated club constitution — please review",body:"The constitution has been updated. Please review before the next meeting.",           date:"3 days ago",  author:"President"}
  ];
}
function getDefaultStats(uid) {
  return {attendanceRate:87,eventsAttended:uid==="admin"?0:2,points:uid==="admin"?500:120,streak:5,noticesPosted:0};
}
function getDefaultBadges() {
  return [
    {id:"first_login",icon:"🌟",name:"First Login", earned:true, desc:"Logged in for the first time"},
    {id:"event_pro",  icon:"🎯",name:"Event Pro",   earned:false,desc:"Attend 3 events"},
    {id:"streak_7",   icon:"🔥",name:"7-Day Streak",earned:false,desc:"Attend 7 sessions in a row"},
    {id:"team_player",icon:"🤝",name:"Team Player", earned:false,desc:"Register for a team event"},
    {id:"reporter",   icon:"📝",name:"Reporter",    earned:false,desc:"Post 3 notices"},
    {id:"top_3",      icon:"👑",name:"Top 3",       earned:false,desc:"Reach top 3 on leaderboard"}
  ];
}
function getDefaultStreak() {
  const today=new Date().getDate(), s=[];
  for(let i=1;i<=30;i++) s.push(i>=today?null:Math.random()>0.2);
  return s;
}

// ---- LEADERBOARD ----
function getLeaderboard() {
  const raw=localStorage.getItem("uniclub_leaderboard");
  if(raw) return JSON.parse(raw);
  const lb=[
    {id:"2023-CS-010", name:"Nadia Khan",      initials:"NK",points:420,badges:3,bgColor:"#FFF3CD",txtColor:"#856404"},
    {id:"admin",       name:"Asif Mahmud",      initials:"AM",points:360,badges:2,bgColor:"#faeeda",txtColor:"#BA7517"},
    {id:"member",      name:"Arif Rahman",      initials:"AR",points:120,badges:1,bgColor:"#cfe2ff",txtColor:"#0a3980"},
    {id:"2024-CS-042", name:"Arif Rahman",      initials:"AR",points:120,badges:1,bgColor:"#cfe2ff",txtColor:"#0a3980"},
    {id:"2024-EEE-015",name:"Fatima Begum",     initials:"FB",points:90, badges:1,bgColor:"#e9ecef",txtColor:"#495057"},
    {id:"2024-ME-007", name:"Tanvir Chowdhury", initials:"TC",points:70, badges:0,bgColor:"#e9ecef",txtColor:"#495057"},
    {id:"2023-BA-019", name:"Sadia Ferdousi",   initials:"SF",points:50, badges:0,bgColor:"#e9ecef",txtColor:"#495057"}
  ];
  localStorage.setItem("uniclub_leaderboard",JSON.stringify(lb));
  return lb;
}
function saveLeaderboard(lb) { localStorage.setItem("uniclub_leaderboard",JSON.stringify(lb)); }
function addPointsToLeaderboard(uid,pts) {
  const lb=getLeaderboard(), e=lb.find(x=>x.id===uid);
  if(e) e.points+=pts;
  lb.sort((a,b)=>b.points-a.points);
  saveLeaderboard(lb);
}
function getUserRank(uid) {
  const idx=getLeaderboard().findIndex(e=>e.id===uid);
  return idx>=0?idx+1:"—";
}
