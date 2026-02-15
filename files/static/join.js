"use strict";

(function () {
  const btn = document.getElementById("btnConnect");
  const errEl = document.getElementById("connect-error");
  const inputCode = document.getElementById("inputSessionCode");
  const SESSION_CODE_LENGTH = 6;
  let isSubmitting = false;

  function getTypedCode() {
    return (inputCode?.value || "").replace(/\D/g, "").slice(0, 8);
  }

  function updateButtonState() {
    if (btn) btn.disabled = getTypedCode().length < SESSION_CODE_LENGTH;
  }

  async function handleConnect() {
    const code = getTypedCode();
    if (code.length < 6) {
      if (errEl) { errEl.textContent = "Enter a 6-digit session code"; errEl.style.display = "block"; }
      return;
    }
    isSubmitting = true;
    if (errEl) { errEl.style.display = "none"; }
    if (btn) { btn.disabled = true; btn.textContent = "Validating…"; }
    try {
      const params = new URLSearchParams();
      params.append("token", code);
      const res = await fetch("/api/session/validate", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (errEl) {
          errEl.textContent = data?.error || "Session not found or expired";
          errEl.style.display = "block";
        }
        const retryBtn = document.getElementById("btnRetry");
        if (retryBtn) {
          retryBtn.style.display = "block";
          retryBtn.onclick = () => { errEl.style.display = "none"; retryBtn.style.display = "none"; handleConnect(); };
        }
        return;
      }
      const roomId = data?.roomId || data?.sessionId || code;
      window.location.href = "/room/" + encodeURIComponent(roomId);
    } catch (e) {
      if (errEl) {
        errEl.textContent = "Connection failed. Please try again.";
        errEl.style.display = "block";
      }
      const retryBtn = document.getElementById("btnRetry");
      if (retryBtn) {
        retryBtn.style.display = "block";
        retryBtn.onclick = () => { errEl.style.display = "none"; retryBtn.style.display = "none"; handleConnect(); };
      }
    } finally {
      isSubmitting = false;
      if (btn) { btn.disabled = false; btn.textContent = "Connect"; }
    }
  }
  if (btn) btn.addEventListener("click", handleConnect);
  if (inputCode) {
    inputCode.addEventListener("input", function() {
      this.value = (this.value || "").replace(/\D/g, "").slice(0, 8);
      updateButtonState();
      if (getTypedCode().length === SESSION_CODE_LENGTH && !isSubmitting) handleConnect();
    });
    inputCode.addEventListener("keydown", (e) => { if (e.key === "Enter") handleConnect(); });
    updateButtonState();
  }
})();
