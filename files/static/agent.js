"use strict";

(function () {
  const getBaseUrl = () => window.location.origin || (window.location.protocol + "//" + window.location.host);

  function route() {
    const path = window.location.pathname || "/srm";
    document.querySelectorAll(".sidebar-nav-link").forEach(a => {
      const route = a.getAttribute("data-route") || "";
      const active = route === path || (route !== "/srm" && path.startsWith(route));
      a.classList.toggle("active", active);
    });
    const titles = { "/srm": "Dashboard", "/srm/sessions": "My Sessions", "/srm/profile": "Profile" };
    const t = path.startsWith("/srm/sessions") ? "My Sessions" : titles[path] || "Dashboard";
    const titleEl = document.getElementById("srmPageTitle");
    if (titleEl) titleEl.textContent = t;

    if (path === "/srm" || path === "/srm/") renderDashboard();
    else if (path.startsWith("/srm/sessions")) renderSessions();
    else if (path.startsWith("/srm/profile")) renderProfile();
    else renderDashboard();
  }

  function escapeHtml(s) {
    if (!s) return "";
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  async function renderDashboard() {
    const el = document.getElementById("srmContent");
    if (!el) return;
    el.innerHTML = `
      <div class="card-component">
        <h4>Create session</h4>
        <p class="text-muted" style="margin-bottom:16px;">Create a secure session and share the link with your client.</p>
        <button type="button" class="quick-action-btn" id="btnCreateSession">➕ Create Session</button>
        <div id="agent-create-error" class="text-danger mt-2" role="alert" style="display:none;"></div>
        <button type="button" class="btn btn-outline-dark btn-sm mt-2" id="btnRetryCreate" style="display:none;">Retry</button>
        <div id="agent-link-area" class="mt-4" style="display:none;">
          <label class="form-label">Share this link with your client:</label>
          <div class="input-group mb-2">
            <input type="text" id="agentLink" class="form-control" readonly>
            <button type="button" class="btn btn-outline-secondary" id="btnCopyLink">Copy</button>
          </div>
          <div class="mb-2">
            <label class="form-label">Manual code:</label>
            <code id="agentSessionCode" class="d-block p-2 bg-light rounded"></code>
            <button type="button" class="btn btn-outline-secondary btn-sm mt-1" id="btnCopyOtp">Copy code</button>
          </div>
          <div id="agent-qr" class="mb-2"></div>
          <a href="#" id="agent-open-session" class="quick-action-btn" style="display:none;">Open Viewer</a>
        </div>
      </div>
    `;
    bindCreateSession();
  }

  function bindCreateSession() {
    const btn = document.getElementById("btnCreateSession");
    const area = document.getElementById("agent-link-area");
    const input = document.getElementById("agentLink");
    const errEl = document.getElementById("agent-create-error");
    const codeEl = document.getElementById("agentSessionCode");
    const qrEl = document.getElementById("agent-qr");
    const openLink = document.getElementById("agent-open-session");

    function handleError(msg) {
      if (errEl) { errEl.textContent = msg; errEl.style.display = "block"; }
      if (btn) { btn.disabled = false; btn.textContent = "➕ Create Session"; }
      const retryBtn = document.getElementById("btnRetryCreate");
      if (retryBtn) { retryBtn.style.display = "block"; retryBtn.onclick = () => { if (errEl) errEl.style.display = "none"; retryBtn.style.display = "none"; doCreate(); }; }
    }

    async function doCreate() {
      if (!btn || !area || !input) return;
      if (errEl) { errEl.style.display = "none"; errEl.textContent = ""; }
      btn.disabled = true;
      btn.textContent = "Creating…";
      try {
        const res = await fetch(getBaseUrl() + "/api/session/create", { method: "POST", credentials: "include" });
        const text = await res.text();
        if (!res.ok) { handleError("Server error (" + res.status + ")."); return; }
        if (text.trimStart().startsWith("<")) { handleError("Server returned HTML. Is the server running?"); return; }
        let data;
        try { data = JSON.parse(text); } catch (e) { handleError("Invalid response."); return; }
        const roomId = data?.roomId || data?.token || data?.sessionId;
        const sessionCode = data?.code || data?.sessionCode || roomId;
        const shareUrl = data?.connectUrl || (getBaseUrl().replace(/\/$/, "") + "/connect?token=" + encodeURIComponent(roomId));
        if (!roomId) { handleError("No session token returned."); return; }
        input.value = shareUrl;
        if (codeEl) codeEl.textContent = sessionCode;
        if (qrEl) { qrEl.innerHTML = ""; if (typeof QRCode !== "undefined") new QRCode(qrEl, { text: shareUrl, width: 128, height: 128 }); }
        if (openLink) { openLink.href = "/srm/session/" + encodeURIComponent(roomId); openLink.target = "_blank"; openLink.style.display = "inline-block"; }
        area.style.display = "block";
        (window.showToast || function(){})("Session created", "success");
      } catch (err) { handleError("Failed: " + (err?.message || "")); } finally {
        if (btn) { btn.disabled = false; btn.textContent = "➕ Create Session"; }
      }
    }

    if (btn) btn.onclick = doCreate;
    document.getElementById("btnCopyLink")?.addEventListener("click", () => {
      if (!input?.value) return;
      navigator.clipboard.writeText(input.value).then(() => { (window.showToast || function(){})("Link copied", "success"); });
    });
    document.getElementById("btnCopyOtp")?.addEventListener("click", () => {
      if (!codeEl?.textContent) return;
      navigator.clipboard.writeText(codeEl.textContent).then(() => { (window.showToast || function(){})("Code copied", "success"); });
    });
  }

  async function renderSessions() {
    const el = document.getElementById("srmContent");
    if (!el) return;
    el.innerHTML = `<div class="card-component"><p>Loading…</p></div>`;
    try {
      const res = await fetch(getBaseUrl() + "/api/session/list", { credentials: "include" });
      const d = await res.json().catch(() => ({}));
      const sessions = d.sessions || [];
      let html = `<div class="card-component"><h4>My Sessions</h4>`;
      if (sessions.length === 0) {
        html += `<p class="text-muted">No sessions yet. Create a session from the dashboard.</p>`;
      } else {
        html += `<table class="data-table admin-table"><thead><tr><th>Code</th><th>Status</th><th>Created</th><th></th></tr></thead><tbody>`;
        sessions.forEach(s => {
          const id = s.id || s.token;
          const badgeClass = s.status === "SHARING" || s.status === "CONNECTED" ? "badge-active" : s.status === "ENDED" ? "badge-ended" : "badge-pending";
          html += `<tr><td><code>${escapeHtml(s.token || id)}</code></td><td><span class="badge ${badgeClass}">${escapeHtml(s.status)}</span></td><td>${escapeHtml((s.createdAt || "").slice(0, 19))}</td><td><a href="/viewer/${escapeHtml(id)}" class="btn btn-outline-dark btn-sm" target="_blank">Open Viewer</a></td></tr>`;
        });
        html += "</tbody></table>";
      }
      html += "</div>";
      el.innerHTML = html;
    } catch (e) {
      el.innerHTML = `<div class="card-component"><p class="text-danger">Failed to load: ${e.message}</p></div>`;
    }
  }

  async function renderProfile() {
    const el = document.getElementById("srmContent");
    if (!el) return;
    let email = "—";
    try {
      const res = await fetch("/api/auth-check", { credentials: "include" });
      const d = await res.json().catch(() => ({}));
      if (d.user && d.user.email) email = d.user.email;
    } catch (_) {}
    el.innerHTML = `
      <div class="card-component">
        <h4>Profile</h4>
        <p><strong>Email:</strong> ${escapeHtml(email)}</p>
        <p class="text-muted small">Contact your admin to update your account.</p>
      </div>
    `;
  }

  window.addEventListener("popstate", route);
  window.addEventListener("load", function() {
    route();
    const t = document.getElementById("srmSidebarToggle");
    const s = document.getElementById("srmSidebar");
    const o = document.getElementById("srmSidebarOverlay");
    function toggle() { s?.classList.toggle("open"); o?.classList.toggle("open"); }
    if (t) t.addEventListener("click", toggle);
    if (o) o.addEventListener("click", toggle);
    fetch("/api/auth-check", { credentials: "include" }).then(r => r.json()).then(d => {
      const u = document.getElementById("srmTopbarUser");
      if (u && d.user) u.textContent = d.user.email || "SRM";
    }).catch(function(){});
  });

  document.querySelectorAll(".sidebar-nav-link, .sidebar-primary-btn").forEach(a => {
    if (a.id === "btnCreateSessionSidebar") return;
    a.addEventListener("click", function(e) {
      const href = this.getAttribute("href");
      if (href && href.startsWith("/") && !href.startsWith("http")) {
        e.preventDefault();
        history.pushState({}, "", href);
        route();
        document.getElementById("srmSidebar")?.classList.remove("open");
        document.getElementById("srmSidebarOverlay")?.classList.remove("open");
      }
    });
  });

  document.getElementById("btnCreateSessionSidebar")?.addEventListener("click", function(e) {
    e.preventDefault();
    history.pushState({}, "", "/srm");
    route();
    document.getElementById("srmSidebar")?.classList.remove("open");
    document.getElementById("srmSidebarOverlay")?.classList.remove("open");
    setTimeout(() => document.getElementById("btnCreateSession")?.click(), 100);
  });
})();
