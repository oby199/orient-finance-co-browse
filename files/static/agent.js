"use strict";

(function () {
  const btn = document.getElementById("btnCreateSession");
  const area = document.getElementById("agent-link-area");
  const input = document.getElementById("agentLink");
  const errEl = document.getElementById("agent-create-error");
  const codeEl = document.getElementById("agentSessionCode");
  const qrEl = document.getElementById("agent-qr");
  const openLink = document.getElementById("agent-open-session");

  function getBaseUrl() {
    return window.location.origin || (window.location.protocol + "//" + window.location.host);
  }

  function handleError(msg, err) {
    console.error("[Create Session]", msg, err);
    if (errEl) { errEl.textContent = msg; errEl.style.display = "block"; }
    if (btn) { btn.disabled = false; btn.textContent = "Create Session"; }
    const retryBtn = document.getElementById("btnRetryCreate");
    if (retryBtn) {
      retryBtn.style.display = "block";
      retryBtn.onclick = () => { if (errEl) errEl.style.display = "none"; retryBtn.style.display = "none"; createSession(); };
    }
  }

  async function createSession() {
    if (!btn || !area || !input) return;
    if (errEl) { errEl.style.display = "none"; errEl.textContent = ""; }
    btn.disabled = true;
    btn.textContent = "Creating…";
    try {
      const res = await fetch(getBaseUrl() + "/api/session/create", { method: "POST" });
      const text = await res.text();
      if (!res.ok) {
        handleError("Server error (" + res.status + "). " + text);
        return;
      }
      if (text.trimStart().startsWith("<")) {
        handleError("Server returned HTML. Check that the Go server is running.");
        return;
      }
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        handleError("Invalid response from server.");
        return;
      }
      const roomId = data?.roomId || data?.token || data?.sessionId;
      const sessionCode = data?.code || data?.sessionCode || roomId;
      const shareUrl = data?.connectUrl || (getBaseUrl().replace(/\/$/, "") + "/connect?token=" + encodeURIComponent(roomId));
      if (!roomId) {
        handleError("No session token returned.");
        return;
      }
      input.value = shareUrl;
      if (codeEl) codeEl.textContent = sessionCode;
      if (qrEl) {
        qrEl.innerHTML = "";
        if (typeof QRCode !== "undefined") new QRCode(qrEl, { text: shareUrl, width: 128, height: 128 });
      }
      if (openLink) {
        openLink.href = "/agent/session/" + encodeURIComponent(roomId);
        openLink.target = "_blank";
        openLink.style.display = "block";
      }
      area.style.display = "block";
      document.getElementById("btnRetryCreate")?.setAttribute("style", "display:none");
    } catch (err) {
      handleError("Failed to create session. " + (err?.message || ""), err);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "Create Session"; }
    }
  }

  if (btn) btn.addEventListener("click", createSession);
  document.getElementById("btnCopyLink")?.addEventListener("click", () => {
    if (!input?.value) return;
    navigator.clipboard.writeText(input.value).then(() => {
      const b = document.getElementById("btnCopyLink");
      if (b) { b.textContent = "Copied!"; setTimeout(() => b.textContent = "Copy", 2000); }
    });
  });
  document.getElementById("btnCopyOtp")?.addEventListener("click", () => {
    if (!codeEl?.textContent) return;
    navigator.clipboard.writeText(codeEl.textContent).then(() => {
      const b = document.getElementById("btnCopyOtp");
      if (b) { b.textContent = "Copied!"; setTimeout(() => b.textContent = "Copy code", 2000); }
    });
  });
})();
