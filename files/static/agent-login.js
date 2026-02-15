"use strict";

(function () {
  const form = document.getElementById("loginForm");
  const btn = document.getElementById("btnLogin");
  const errEl = document.getElementById("loginError");

  async function checkAuthAndRedirect() {
    const pathname = window.location.pathname || "/";
    const targetAgent = "/srm";
    if (pathname === targetAgent || pathname.startsWith(targetAgent + "/")) return false;
    try {
      const r = await fetch("/api/auth-check", { credentials: "include" });
      const d = await r.json().catch(() => ({}));
      console.log("[agent-login] auth-check (once):", r.status, JSON.stringify(d));
      if (r.status === 404) {
        showError("Server misconfigured: /api/auth-check returned 404. Rebuild and restart the server.");
        return false;
      }
      if (r.ok && (d?.authed === true || d?.authed === "true")) {
        console.log("[agent-login] redirect from=" + pathname + " to=" + targetAgent + " authed=true");
        window.location.replace(targetAgent);
        return true;
      }
    } catch (e) {
      showError("Cannot reach server. Is it running at " + window.location.origin + "?");
      return false;
    }
    return false;
  }

  function showError(msg) {
    if (errEl) {
      errEl.textContent = msg;
      errEl.style.display = "block";
    }
    const retryBtn = document.getElementById("btnRetryLogin");
    if (retryBtn) {
      retryBtn.style.display = "inline-block";
      retryBtn.onclick = () => { hideError(); retryBtn.style.display = "none"; };
    }
  }

  function hideError() {
    if (errEl) {
      errEl.textContent = "";
      errEl.style.display = "none";
    }
    document.getElementById("btnRetryLogin")?.setAttribute("style", "display:none");
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideError();

    const email = (document.getElementById("loginEmail").value || "").trim();
    const password = (document.getElementById("loginPassword").value || "").trim();

    if (!email || !password) {
      showError("Please enter email and password.");
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.textContent = "Signing in…";
    }

    try {
      const params = new URLSearchParams();
      params.append("email", email);
      params.append("password", password);

      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
        credentials: "include",
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        showError(data?.error || "Invalid email or password.");
        return;
      }

      window.location.replace(data?.redirect || "/srm");
    } catch (err) {
      showError("Connection failed. Please try again.");
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Login";
      }
    }
  });

  document.getElementById("btnTogglePassword")?.addEventListener("click", () => {
    const input = document.getElementById("loginPassword");
    const btn = document.getElementById("btnTogglePassword");
    if (!input || !btn) return;
    const isHidden = input.type === "password";
    input.type = isHidden ? "text" : "password";
    btn.setAttribute("aria-label", isHidden ? "Hide password" : "Show password");
    btn.setAttribute("title", isHidden ? "Hide password" : "Show password");
  });

  checkAuthAndRedirect();
})();
