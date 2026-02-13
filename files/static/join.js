"use strict";

(function () {
  const btn = document.getElementById("btnConnect");
  const errEl = document.getElementById("connect-error");
  const inputCode = document.getElementById("inputSessionCode");

  async function handleConnect() {
    const code = (inputCode?.value || "").trim().replace(/\s+/g, "_");
    if (code.length < 6) {
      if (errEl) { errEl.textContent = "Enter a valid session code (6+ characters)"; errEl.style.display = "block"; }
      return;
    }
    if (errEl) { errEl.style.display = "none"; }
    if (btn) { btn.disabled = true; btn.textContent = "Validating…"; }
    try {
      const form = new FormData();
      form.append("token", code);
      const res = await fetch("/api/session/validate", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (errEl) { errEl.textContent = data?.error || "Session not found or expired"; errEl.style.display = "block"; }
        return;
      }
      const roomId = data?.roomId || data?.sessionId || code;
      window.location.href = "/room/" + encodeURIComponent(roomId);
    } catch (e) {
      if (errEl) { errEl.textContent = "Connection failed. Please try again."; errEl.style.display = "block"; }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "Connect"; }
    }
  }
  if (btn) btn.addEventListener("click", handleConnect);
  if (inputCode) inputCode.addEventListener("keydown", (e) => { if (e.key === "Enter") handleConnect(); });
})();
