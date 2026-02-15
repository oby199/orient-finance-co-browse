"use strict";

(function () {
  const btn = document.getElementById("btnConnect");
  const errEl = document.getElementById("start-error");

  function getToken() {
    const params = new URLSearchParams(window.location.search);
    let token = params.get("token");
    if (!token && window.location.pathname.startsWith("/start/")) {
      const parts = window.location.pathname.split("/");
      token = parts[parts.length - 1] || "";
    }
    return (token || "").trim();
  }

  function showError(msg) {
    errEl.textContent = msg;
    errEl.classList.add("visible");
    btn.disabled = false;
    btn.textContent = "CONNECT";
  }

  function hideError() {
    errEl.textContent = "";
    errEl.classList.remove("visible");
  }

  function getBaseUrl() {
    return window.location.origin;
  }

  async function handleConnect() {
    const token = getToken();
    if (!token) {
      showError("This link is invalid or expired. Ask your SRM to generate a new link.");
      return;
    }

    hideError();
    btn.disabled = true;
    btn.textContent = "Connecting…";

    try {
      const res = await fetch("/api/validate?token=" + encodeURIComponent(token));
      if (!res.ok) {
        showError("This link is invalid or expired. Ask your SRM to generate a new link.");
        return;
      }

      const data = await res.json().catch(() => ({}));
      const sessionId = data.sessionId || token;

      window.location.href = getBaseUrl() + "/?stream=1&room=" + encodeURIComponent(sessionId);
    } catch {
      showError("Connection failed. Please try again.");
    }
  }

  const token = getToken();
  if (token) {
    btn.disabled = false;
  } else {
    showError("This link is invalid or expired. Ask your SRM to generate a new link.");
  }

  btn.addEventListener("click", handleConnect);
})();
