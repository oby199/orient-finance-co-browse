"use strict";

(function () {
  const form = document.getElementById("loginForm");
  const btn = document.getElementById("btnLogin");
  const errEl = document.getElementById("loginError");

  async function checkAuthAndRedirect() {
    const pathname = window.location.pathname || "/";
    if (!pathname.startsWith("/admin")) return false;
    try {
      const r = await fetch("/api/auth-check", { credentials: "include" });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d?.authed === true && d?.role === "admin") {
        window.location.replace("/admin");
        return true;
      }
    } catch (e) {}
    return false;
  }

  function showError(msg) {
    if (errEl) {
      errEl.textContent = msg;
      errEl.style.display = "block";
    }
  }

  function hideError() {
    if (errEl) {
      errEl.textContent = "";
      errEl.style.display = "none";
    }
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
    if (btn) { btn.disabled = true; btn.textContent = "Signing in…"; }
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
      window.location.replace(data?.redirect || "/admin");
    } catch (err) {
      showError("Connection failed. Please try again.");
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "Sign in"; }
    }
  });

  document.getElementById("btnTogglePassword")?.addEventListener("click", () => {
    const input = document.getElementById("loginPassword");
    const toggleBtn = document.getElementById("btnTogglePassword");
    if (!input || !toggleBtn) return;
    const isHidden = input.type === "password";
    input.type = isHidden ? "text" : "password";
    toggleBtn.setAttribute("aria-label", isHidden ? "Hide password" : "Show password");
  });

  checkAuthAndRedirect();
})();
