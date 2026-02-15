"use strict";

(function () {
  const btn = document.getElementById("btnConnect");
  const errEl = document.getElementById("connect-error");
  const statusEl = document.getElementById("connect-status");
  const inputCode = document.getElementById("inputSessionCode");
  const hintEl = document.getElementById("connect-hint");

  const VALIDATE_TIMEOUT_MS = 15000;
  const SESSION_CODE_LENGTH = 6;
  const MIN_CODE_LENGTH = 6;
  let isSubmitting = false;

  function getTypedCode() {
    if (!inputCode) return "";
    return (inputCode.value || "").replace(/\D/g, "").slice(0, 8);
  }

  function getTokenFromUrl() {
    const params = new URLSearchParams(window.location.search);
    let token = params.get("token");
    if (!token && window.location.hash) {
      token = window.location.hash.replace(/^#+/, "").trim();
    }
    if (token) return token.trim().replace(/^#+/, "");
    if (window.location.pathname.startsWith("/connect/") || window.location.pathname.startsWith("/start/")) {
      const parts = window.location.pathname.split("/").filter(Boolean);
      return (parts[parts.length - 1] || "").trim().replace(/^#+/, "");
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
    const params = new URLSearchParams();
    params.append("token", code);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), VALIDATE_TIMEOUT_MS);
    const res = await fetch(getBaseUrl() + "/api/session/validate", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
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
          const data = await res.json().catch(() => ({}));
          showError(data?.error || "Invalid session code");
        } else if (res.status === 404) {
          showError("Session not found or expired");
        } else {
          showError("Connection failed. Please try again.");
        }
        return;
      }

      const data = await res.json().catch(() => ({}));
      const roomId = data?.roomId || data?.sessionId || code;
      if (data?.agentName) {
        try {
          sessionStorage.setItem("orient_agent_" + roomId, data.agentName);
        } catch (_) {}
      }
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
      const numericOnly = String(urlToken).replace(/\D/g, "").slice(0, 8);
      inputCode.value = numericOnly;
      updateButtonState();
    } else {
      inputCode.value = "";
    }
    inputCode.addEventListener("input", function() {
      const digits = (this.value || "").replace(/\D/g, "");
      this.value = digits.slice(0, 8);
      updateButtonState();
      if (digits.length === SESSION_CODE_LENGTH && !isSubmitting) handleConnect();
    });
    inputCode.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleConnect();
    });
  }

  if (btn) btn.addEventListener("click", handleConnect);

  // Auto-validate when visiting /connect?token=... and redirect to /room/:roomId
  (async function autoValidateFromToken() {
    const token = getTokenFromUrl();
    const numericToken = token ? String(token).replace(/\D/g, "").slice(0, 8) : "";
    if (!numericToken || numericToken.length < 6) return;
    if (!btn || !statusEl) return;
    setStatus("Validating…");
    if (btn) { btn.disabled = true; btn.textContent = "Connecting…"; }
    try {
      const res = await doValidate(numericToken);
      if (!res.ok) {
        setStatus("");
        updateHint("Session not found or expired. You can try entering the code manually.");
        if (btn) { btn.disabled = false; btn.textContent = "Connect"; }
        return;
      }
      const data = await res.json().catch(() => ({}));
      const roomId = data?.roomId || data?.sessionId || numericToken;
      if (data?.agentName) {
        try {
          sessionStorage.setItem("orient_agent_" + roomId, data.agentName);
        } catch (_) {}
      }
      window.location.href = getBaseUrl() + "/room/" + encodeURIComponent(roomId);
    } catch (e) {
      setStatus("");
      updateHint("Connection failed. You can try entering the code manually.");
      if (btn) { btn.disabled = false; btn.textContent = "Connect"; }
    }
  })();
})();
