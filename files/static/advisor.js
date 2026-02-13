"use strict";

(function () {
  const btn = document.getElementById("btnCreateSession");
  const area = document.getElementById("agent-link-area");
  const input = document.getElementById("agentLink");
  const errEl = document.getElementById("agent-create-error");
  const codeEl = document.getElementById("agentSessionCode");
  const qrEl = document.getElementById("agent-qr");

  function getBaseUrl() {
    return window.location.origin || (window.location.protocol + "//" + window.location.host);
  }

  function handleError(msg, err) {
    console.error("[Create Session]", msg, err);
    if (err?.stack) console.error(err.stack);
    if (errEl) {
      errEl.textContent = msg;
      errEl.style.display = "block";
    }
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Create Session";
    }
  }

  async function createSession() {
    if (!btn || !area || !input) return;
    if (errEl) { errEl.style.display = "none"; errEl.textContent = ""; }
    btn.disabled = true;
    btn.textContent = "Creating…";

    const apiUrl = getBaseUrl() + "/api/create-session";

    try {
      let res = await fetch(apiUrl, { method: "POST" }).catch((e) => null);
      if (!res) res = await fetch(apiUrl, { method: "GET" }).catch((e) => null);
      if (!res) {
        handleError("Cannot reach server. Is it running? Check console for details.", new Error("fetch failed"));
        return;
      }
      const text = await res.text();
      if (!res.ok) {
        handleError("Server error (" + res.status + "). " + (text || res.statusText), new Error(text));
        return;
      }
      if (text.trimStart().startsWith("<")) {
        handleError("Server returned HTML instead of JSON. The API route may not be registered. Check that the Go server is running.", new Error(text.slice(0, 100)));
        return;
      }
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        handleError("Invalid response from server. " + (e?.message || ""), e);
        return;
      }
      const token = data?.token || data?.sessionId;
      const sessionCode = data?.sessionCode || token;
      if (!token) {
        handleError("No session token returned. Check server.", new Error(JSON.stringify(data)));
        return;
      }

      const base = (window.OrientFinanceConfig?.CUSTOMER_APP_BASE_URL || window.OrientFinanceConfig?.BASE_URL || "").trim() || getBaseUrl();
      const connectPath = (window.OrientFinanceConfig?.CONNECT_PATH || "/connect").replace(/^\/+/, "");
      const url = base.replace(/\/$/, "") + "/" + connectPath + "?token=" + encodeURIComponent(token);
      input.value = url;
      if (codeEl) codeEl.textContent = sessionCode;
      if (qrEl) {
        qrEl.innerHTML = "";
        if (typeof QRCode !== "undefined") new QRCode(qrEl, { text: url, width: 128, height: 128 });
      }
      const viewLink = document.getElementById("agent-view-link");
      if (viewLink) {
        viewLink.href = getBaseUrl() + "/session/" + encodeURIComponent(token);
        viewLink.target = "_blank";
        viewLink.style.display = "inline-block";
      }
      area.style.display = "block";
    } catch (err) {
      handleError("Failed to create session. " + (err?.message || "Unknown error."), err);
      return;
    }
    btn.disabled = false;
    btn.textContent = "Create Session";
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
