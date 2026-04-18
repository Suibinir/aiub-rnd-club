/* UNICLUB — LOGIN.JS */
if (loadSession()) window.location.href = "dashboard.html";

function handleLogin() {
  const id  = document.getElementById("studentId").value.trim();
  const pw  = document.getElementById("password").value;
  const err = document.getElementById("errorMsg");
  if (!id||!pw) { showErr("⚠️ Please fill in both fields."); return; }
  const user = findUser(id, pw);
  if (user) {
    err.classList.remove("visible");
    saveSession(user);
    if (!localStorage.getItem("uniclub_"+user.id+"_stats")) {
      saveData(user.id,"stats",     getDefaultStats(user.id));
      saveData(user.id,"attendance",getDefaultAttendance());
      saveData(user.id,"badges",    getDefaultBadges());
      saveData(user.id,"streak",    getDefaultStreak());
      if (!localStorage.getItem("uniclub_notices"))
        localStorage.setItem("uniclub_notices",JSON.stringify(getDefaultNotices()));
      if (!localStorage.getItem("uniclub_events"))
        localStorage.setItem("uniclub_events",JSON.stringify(getDefaultEvents()));
    }
    window.location.href = "dashboard.html";
  } else {
    showErr("❌ Wrong ID or password.");
    document.getElementById("password").value = "";
  }
}
function showErr(msg) {
  const b=document.getElementById("errorMsg"); b.textContent=msg; b.classList.add("visible");
}
document.addEventListener("keydown", e => { if(e.key==="Enter") handleLogin(); });
