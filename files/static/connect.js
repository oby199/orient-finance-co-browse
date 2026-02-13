"use strict";

(function () {
  const btn = document.getElementById("btnConnect");
  const errEl = document.getElementById("connect-error");
  const statusEl = document.getElementById("connect-status");
  const inputCode = document.getElementById("inputSessionCode");
  const hintEl = document.getElementById("connect-hint");

  const VALIDATE_TIMEOUT_MS = 15000;
  const MIN_CODE_LENGTH = 6;
  let isSubmitting = false;

  function getTypedCode() {
    if (!inputCode) return "";
    const raw = (inputCode.value || "").trim().replace(/\s+/g, "_");
    return raw;
  }

  function getTokenFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (token) return token.trim();
    if (window.location.pathname.startsWith("/connect/") || window.location.pathname.startsWith("/start/")) {
      const parts = window.location.pathname.split("/").filter(Boolean);
      return (parts[parts.length - 1] || "").trim();
    }
    return null;
  }

  function hasTokenInUrl() {
    return getTokenFromUrl() != null;
  }

  function updateHint(msg) {
    if (!hintEl) return;
    hintEl.textContent = msg || "";
    hintEl.style.display = msg ? "block" : "none";
  }

  function updateButtonState() {
    if (!btn) return;
    const code = getTypedCode();
    btn.disabled = code.length < MIN_CODE_LENGTH || isSubmitting;
  }

  function showError(msg) {
    if (errEl) {
      errEl.textContent = msg;
      errEl.classList.add("visible");
      errEl.style.display = "block";
    }
    if (statusEl) statusEl.textContent = "";
    const retryBtn = document.getElementById("btnRetry");
    if (retryBtn) {
      retryBtn.style.display = "block";
      retryBtn.onclick = () => { hideError(); retryBtn.style.display = "none"; handleConnect(); };
    }
  }

  function hideError() {
    if (errEl) {
      errEl.textContent = "";
      errEl.classList.remove("visible");
      errEl.style.display = "none";
    }
    const retryBtn = document.getElementById("btnRetry");
    if (retryBtn) retryBtn.style.display = "none";
  }

  function setStatus(msg) {
    if (statusEl) statusEl.textContent = msg;
  }

  function getBaseUrl() {
    return window.location.origin || (window.location.protocol + "//" + window.location.host);
  }

  async function doValidate(code) {
    const form = new FormData();
    form.append("token", code);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), VALIDATE_TIMEOUT_MS);
    const res = await fetch(getBaseUrl() + "/api/session/validate", {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return res;
  }

  async function handleConnect() {
    const code = getTypedCode();
    if (code.length < MIN_CODE_LENGTH) {
      showError("Invalid code");
      return;
    }

    hideError();
    isSubmitting = true;
    updateButtonState();
    if (btn) btn.textContent = "Connecting…";

    try {
      const res = await doValidate(code);

      if (!res.ok) {
        if (res.status === 400) {
          showError("Invalid code");
        } else if (res.status === 404) {
          showError("Session not found or expired");
        } else {
          showError("Connection failed. Please try again.");
        }
        return;
      }

      const data = await res.json().catch(() => ({}));
      const roomId = data?.roomId || data?.sessionId || code;
      setStatus("");
      window.location.href = getBaseUrl() + "/room/" + encodeURIComponent(roomId);
    } catch (e) {
      if (e.name === "AbortError") {
        showError("Request timed out. Please try again.");
      } else {
        showError("Connection failed. Please try again.");
      }
    } finally {
      isSubmitting = false;
      updateButtonState();
      if (btn) btn.textContent = "Connect";
    }
  }

  updateButtonState();

  if (inputCode) {
    const urlToken = getTokenFromUrl();
    if (urlToken) {
      inputCode.value = urlToken;
      updateButtonState();
    } else {
      inputCode.value = "";
    }
    inputCode.addEventListener("input", updateButtonState);
    inputCode.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleConnect();
    });
  }

  if (btn) btn.addEventListener("click", handleConnect);

  // Auto-validate when visiting /connect?token=... and redirect to /room/:roomId
  (async function autoValidateFromToken() {
    const token = getTokenFromUrl();
    if (!token || token.length < MIN_CODE_LENGTH) return;
    if (!btn || !statusEl) return;
    setStatus("Validating…");
    if (btn) { btn.disabled = true; btn.textContent = "Connecting…"; }
    try {
      const res = await doValidate(token);
      if (!res.ok) {
        setStatus("");
        updateHint("Session not found or expired. You can try entering the code manually.");
        if (btn) { btn.disabled = false; btn.textContent = "Connect"; }
        return;
      }
      const data = await res.json().catch(() => ({}));
      const roomId = data?.roomId || data?.sessionId || token;
      window.location.href = getBaseUrl() + "/room/" + encodeURIComponent(roomId);
    } catch (e) {
      setStatus("");
      updateHint("Connection failed. You can try entering the code manually.");
      if (btn) { btn.disabled = false; btn.textContent = "Connect"; }
    }
  })();
})();
