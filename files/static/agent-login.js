"use strict";

(function () {
  const form = document.getElementById("loginForm");
  const btn = document.getElementById("btnLogin");
  const errEl = document.getElementById("loginError");

  async function checkAuthAndRedirect() {
    try {
      const r = await fetch("/api/auth-check", { credentials: "include" });
      const d = await r.json().catch(() => ({}));
      if (r.ok && (d?.authenticated === true || d?.authenticated === "true")) {
        window.location.replace("/agent");
        return true;
      }
    } catch (_) {}
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
    const password = document.getElementById("loginPassword").value;

    if (!email || !password) {
      showError("Please enter email and password.");
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.textContent = "Signing in…";
    }

    try {
      const formData = new FormData();
      formData.append("email", email);
      formData.append("password", password);

      const res = await fetch("/api/login", {
        method: "POST",
        body: formData,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        showError(data?.error || "Invalid email or password.");
        return;
      }

      window.location.href = data?.redirect || "/agent";
    } catch (err) {
      showError("Connection failed. Please try again.");
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Login";
      }
    }
  });

  checkAuthAndRedirect();
})();
