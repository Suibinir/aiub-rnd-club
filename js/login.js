/* =============================================
   AIUB R&D CLUB — LOGIN.JS (Firebase)
   ============================================= */
import { findUser, saveSession, loadSession } from "./firebase.js";

if (loadSession()) window.location.href = "dashboard.html";

function setLoading(on){
  const btn = document.getElementById("loginBtn");
  btn.disabled = on;
  btn.textContent = on ? "Signing in..." : "Sign In →";
}

async function handleLogin() {
  const id  = document.getElementById("studentId").value.trim();
  const pw  = document.getElementById("password").value;
  const err = document.getElementById("errorMsg");
  err.classList.remove("visible");

  if (!id || !pw) { showErr("⚠️ Please fill in both fields."); return; }
  setLoading(true);
  try {
    const user = await findUser(id, pw);
    if (user) {
      saveSession(user);
      window.location.href = "dashboard.html";
    } else {
      showErr("❌ Wrong ID or password.");
      document.getElementById("password").value = "";
      setLoading(false);
    }
  } catch(e) {
    showErr("❌ Connection error. Check your internet and try again.");
    console.error(e);
    setLoading(false);
  }
}

function showErr(msg){
  const b = document.getElementById("errorMsg");
  b.textContent = msg;
  b.classList.add("visible");
}

document.addEventListener("keydown", e => { if(e.key==="Enter") handleLogin(); });
window.handleLogin = handleLogin;
// This connects the button to the function correctly for a Module
document.getElementById("loginBtn").addEventListener("click", handleLogin);

document.addEventListener("keydown", e => { 
  if(e.key === "Enter") handleLogin(); 
});
