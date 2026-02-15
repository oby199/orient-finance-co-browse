"use strict";

const API = "/api/admin";

async function api(path, opts = {}) {
  const res = await fetch(API + path, { credentials: "include", ...opts });
  if (res.status === 401 || res.status === 403) {
    window.location.href = "/admin/login";
    throw new Error("Unauthorized");
  }
  return res.json().catch(() => ({}));
}

const PAGE_TITLES = { "/admin": "Dashboard", "/admin/srms": "Sales Relationship Managers", "/admin/settings": "Settings", "/admin/documents": "Documents", "/admin/onboarding": "Onboarding Flow", "/admin/sessions": "Sessions", "/admin/audit": "Audit Log" };

function route() {
  let path = window.location.pathname || "/admin";
  if (path === "/admin/agents" || path.startsWith("/admin/agents/")) {
    const rest = path.slice("/admin/agents".length) || "";
    history.replaceState({}, "", "/admin/srms" + rest);
    path = "/admin/srms" + rest;
  }
  document.querySelectorAll(".sidebar-nav-link").forEach(a => {
    const route = a.getAttribute("data-route") || "";
    const active = route === path || (route !== "/admin" && path.startsWith(route));
    a.classList.toggle("active", active);
  });
  const title = path.startsWith("/admin/sessions/") ? "Session detail" : PAGE_TITLES[path] || "Dashboard";
  const titleEl = document.getElementById("pageTitle");
  if (titleEl) titleEl.textContent = title;
  const loading = document.getElementById("adminLoading");
  if (loading) {
    loading.style.display = "block";
    loading.textContent = "Loading…";
  }

  if (path === "/admin" || path === "/admin/") renderDashboard();
  else if (path === "/admin/srms") renderAgents();
  else if (path === "/admin/settings") renderSettings();
  else if (path === "/admin/documents") renderDocuments();
  else if (path === "/admin/onboarding" || path === "/admin/onboarding-flow") renderOnboardingFlow();
  else if (path.startsWith("/admin/sessions")) renderSessions(path);
  else if (path.startsWith("/admin/review/")) renderReview(path);
  else if (path === "/admin/audit") renderAudit();
  else renderDashboard();
}

async function renderDashboard() {
  const el = document.getElementById("adminContent");
  if (!el) return;
  try {
    const d = await api("/dashboard");
    el.innerHTML = `
      <div class="card-component">
        <h4>${d.companyName || "Orient Finance"}</h4>
        <div class="stats-grid">
          <div class="stat-card"><div class="stat-value">${d.sessionsToday ?? 0}</div><div class="stat-label">Sessions today</div></div>
          <div class="stat-card"><div class="stat-value">${d.activeAgents ?? 0}</div><div class="stat-label">Active SRMs</div></div>
          <div class="stat-card"><div class="stat-value">${d.pendingReviews ?? 0}</div><div class="stat-label">Pending reviews</div></div>
        </div>
        <div class="quick-actions">
          <a href="/admin/srms" class="quick-action-btn" data-nav>➕ Create SRM</a>
          <a href="/admin/sessions" class="quick-action-btn outline" data-nav>View Sessions</a>
          <a href="/admin/onboarding" class="quick-action-btn outline" data-nav>Edit Onboarding</a>
        </div>
      </div>
    `;
    el.querySelectorAll("[data-nav]").forEach(a => { a.onclick = (e) => { e.preventDefault(); history.pushState({}, "", a.href); route(); }; });
  } catch (e) {
    el.innerHTML = `<div class="card-component"><p class="text-danger">Failed to load: ${e.message}</p></div>`;
  }
  const loading = document.getElementById("adminLoading");
  if (loading) loading.style.display = "none";
}

async function renderAgents() {
  const el = document.getElementById("adminContent");
  try {
    const d = await api("/srms");
    const agents = d.agents || [];
    let html = `
      <div class="card-component">
        <h4>Sales Relationship Managers (SRMs)</h4>
        <form id="createAgentForm" class="mb-3">
          <div class="form-row">
            <div class="col"><input type="email" class="form-control" id="newAgentEmail" placeholder="Email" required></div>
            <div class="col"><input type="password" class="form-control" id="newAgentPass" placeholder="Password" minlength="6"></div>
            <div class="col-auto"><button type="submit" class="btn btn-dark">Create SRM</button></div>
          </div>
        </form>
        <table class="data-table admin-table">
          <thead><tr><th>Email</th><th>ID</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
    `;
    agents.forEach(a => {
      html += `<tr>
        <td>${escapeHtml(a.email)}</td>
        <td><code>${escapeHtml(a.id)}</code></td>
        <td><span class="badge ${a.active ? "badge-active" : "badge-inactive"}">${a.active ? "Active" : "Disabled"}</span></td>
        <td>
          <button class="btn btn-outline-dark btn-sm" onclick="adminToggleAgent('${a.id}', ${!a.active})">${a.active ? "Disable" : "Enable"}</button>
          <button class="btn btn-outline-dark btn-sm ml-1" onclick="adminResetPass('${a.id}')">Reset password</button>
        </td>
      </tr>`;
    });
    html += "</tbody></table></div>";
    el.innerHTML = html;
    document.getElementById("createAgentForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById("newAgentEmail").value.trim();
      const pass = document.getElementById("newAgentPass").value;
      if (!email || pass.length < 6) { (window.showToast || alert)("Email and password (6+ chars) required", "error"); return; }
      try {
        await api("/srms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: pass }) });
        route();
      } catch (x) { (window.showToast || alert)(x.message, "error"); }
    });
  } catch (e) {
    el.innerHTML = `<div class="card-component"><p class="text-danger">Failed: ${e.message}</p></div>`;
  }
  const _loading = document.getElementById("adminLoading"); if (_loading) _loading.style.display = "none";
}

function escapeHtml(s) {
  if (!s) return "";
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

window.adminToggleAgent = async (id, active) => {
  if (!confirm(active ? "Enable this agent?" : "Disable this agent?")) return;
  try {
    await api("/srms/" + id, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active }) });
    route();
  } catch (x) { alert(x.message); }
};

window.adminResetPass = async (id) => {
  const pass = prompt("New password (min 6 chars):");
  if (!pass || pass.length < 6) return;
  try {
    await api("/srms/" + id, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pass }) });
    (window.showToast || alert)("Password updated", "success");
  } catch (x) { alert(x.message); }
};

async function renderSettings() {
  const el = document.getElementById("adminContent");
  try {
    const s = await api("/settings");
    el.innerHTML = `
      <div class="card-component">
        <h4>Global Settings</h4>
        <form id="settingsForm">
          <div class="form-group"><label>Company name</label><input type="text" class="form-control" name="companyName" value="${escapeHtml(s.companyName || "")}"></div>
          <div class="form-group"><label>Brand color</label><input type="text" class="form-control" name="brandColor" value="${escapeHtml(s.brandColor || "")}"></div>
          <div class="form-group"><label>Logo path</label><input type="text" class="form-control" name="logoPath" value="${escapeHtml(s.logoPath || "")}"></div>
          <div class="form-group"><label>Session expiry (minutes)</label><input type="number" class="form-control" name="sessionExpiryMinutes" value="${s.sessionExpiryMinutes || 15}"></div>
          <div class="form-group"><label>KYC mode</label><select class="form-control" name="kycModeDefault"><option value="manual" ${(s.kycModeDefault || "manual") === "manual" ? "selected" : ""}>manual</option><option value="sumsub" ${s.kycModeDefault === "sumsub" ? "selected" : ""}>sumsub</option><option value="mock" ${s.kycModeDefault === "mock" ? "selected" : ""}>mock</option></select></div>
          <button type="submit" class="btn btn-dark">Save</button>
        </form>
      </div>
    `;
    document.getElementById("settingsForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target;
      const body = { companyName: f.companyName.value, brandColor: f.brandColor.value, logoPath: f.logoPath.value, sessionExpiryMinutes: parseInt(f.sessionExpiryMinutes.value) || 15, kycModeDefault: f.kycModeDefault.value };
      try {
        await api("/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        (window.showToast || alert)("Saved", "success");
      } catch (x) { (window.showToast || alert)(x.message, "error"); }
    });
  } catch (e) {
    el.innerHTML = `<div class="card-component"><p class="text-danger">Failed: ${e.message}</p></div>`;
  }
  const _loading = document.getElementById("adminLoading"); if (_loading) _loading.style.display = "none";
}

async function renderDocuments() {
  const el = document.getElementById("adminContent");
  try {
    const d = await api("/documents");
    const docs = d.documents || [];
    let html = `<div class="card-component"><h4>Document Templates</h4><form id="addDocForm" class="mb-3"><div class="form-row"><div class="col"><input type="text" class="form-control" id="docTitle" placeholder="Title" required></div><div class="col"><input type="text" class="form-control" id="docUrl" placeholder="URL"></div><div class="col-auto"><label><input type="checkbox" id="docRequired"> Required</label></div><div class="col-auto"><button type="submit" class="btn btn-dark">Add</button></div></div></form><table class="data-table admin-table"><thead><tr><th>Title</th><th>URL</th><th>Required</th><th></th></tr></thead><tbody>`;
    docs.forEach(doc => {
      html += `<tr><td>${escapeHtml(doc.title)}</td><td><code>${escapeHtml(doc.url)}</code></td><td>${doc.required ? "Yes" : "No"}</td><td><button class="btn btn-outline-dark btn-sm" onclick="adminDelDoc('${doc.id}')">Delete</button></td></tr>`;
    });
    html += "</tbody></table></div>";
    el.innerHTML = html;
    document.getElementById("addDocForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        await api("/documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: document.getElementById("docTitle").value, url: document.getElementById("docUrl").value, required: document.getElementById("docRequired").checked }) });
        route();
      } catch (x) { (window.showToast || alert)(x.message, "error"); }
    });
  } catch (e) {
    el.innerHTML = `<div class="card-component"><p class="text-danger">Failed: ${e.message}</p></div>`;
  }
  const _loading = document.getElementById("adminLoading"); if (_loading) _loading.style.display = "none";
}

window.adminTerminateSession = async (id) => {
  if (!confirm("Terminate this session? The client will be disconnected.")) return;
  try {
    await api("/sessions/" + id, { method: "POST" });
    history.pushState({}, "", "/admin/sessions");
    route();
  } catch (x) { alert(x.message); }
};

window.adminDelDoc = async (id) => {
  if (!confirm("Delete this document?")) return;
  try {
    await fetch(API + "/documents/" + id, { method: "DELETE", credentials: "include" });
    route();
  } catch (x) { alert(x.message); }
};

async function renderOnboardingFlow() {
  const el = document.getElementById("adminContent");
  try {
    const d = await api("/onboarding-flow");
    const steps = (d.steps || []).join(", ");
    el.innerHTML = `
      <div class="card-component">
        <h4>Onboarding Flow</h4>
        <form id="onboardingForm">
          <div class="form-group"><label>Steps (comma-separated)</label><input type="text" class="form-control" name="steps" value="${escapeHtml(steps)}" placeholder="CONNECT, SHARE, DOCS, FORM, KYC, SIGN, REVIEW, SUBMITTED"></div>
          <div class="form-group"><label>KYC mode</label><select class="form-control" name="kycMode"><option value="manual" ${(d.kycMode || "manual") === "manual" ? "selected" : ""}>manual</option><option value="sumsub" ${d.kycMode === "sumsub" ? "selected" : ""}>sumsub</option><option value="mock" ${d.kycMode === "mock" ? "selected" : ""}>mock</option></select></div>
          <button type="submit" class="btn btn-dark">Save</button>
        </form>
      </div>
    `;
    document.getElementById("onboardingForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const stepsVal = e.target.steps.value.split(",").map(s => s.trim()).filter(Boolean);
      try {
        await api("/onboarding-flow", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ steps: stepsVal, kycMode: e.target.kycMode.value }) });
        (window.showToast || alert)("Saved", "success");
      } catch (x) { (window.showToast || alert)(x.message, "error"); }
    });
  } catch (e) {
    el.innerHTML = `<div class="card-component"><p class="text-danger">Failed: ${e.message}</p></div>`;
  }
  const _loading = document.getElementById("adminLoading"); if (_loading) _loading.style.display = "none";
}

async function renderSessions(path) {
  const el = document.getElementById("adminContent");
  let sessionId = "";
  if (path.startsWith("/admin/sessions/")) {
    sessionId = path.slice("/admin/sessions/".length).split("/")[0];
  }
  if (sessionId) {
    try {
      const d = await api("/sessions/" + sessionId);
      const s = d.session || {};
      el.innerHTML = `
        <div class="card-component">
          <h4>Session ${escapeHtml(sessionId)}</h4>
          <p><strong>Code:</strong> <code>${escapeHtml(s.token || sessionId)}</code> | <strong>Status:</strong> ${escapeHtml(s.status)} | <strong>SRM:</strong> ${escapeHtml(s.agentId)}</p>
          <p><strong>Client IP:</strong> ${escapeHtml(s.clientIpAtConnect || "-")}</p>
          <p><strong>Created:</strong> ${escapeHtml((s.createdAt || "").slice(0, 19))}</p>
          <p><strong>Application:</strong> ${escapeHtml(s.applicationName || "-")}</p>
          <pre>${escapeHtml(JSON.stringify(d.audit || [], null, 2))}</pre>
          <div class="mt-2">
            <button type="button" class="btn btn-outline-danger btn-sm" onclick="adminTerminateSession('${sessionId}')">Terminate session</button>
            <a href="/admin/sessions" class="btn btn-outline-dark ml-2" id="backToSessionsLink">Back to sessions</a>
          </div>
        </div>
      `;
    } catch (e) {
      el.innerHTML = `<div class="card-component"><p class="text-danger">Failed: ${e.message}</p></div>`;
    }
  } else {
    try {
      const d = await api("/sessions");
      const sessions = d.sessions || [];
      let html = `<div class="card-component"><h4>Sessions</h4>`;
      if (sessions.length === 0) {
        html += `<p class="text-muted">No sessions yet. SRMs create sessions from their dashboard.</p>`;
      } else {
        html += `<table class="data-table admin-table"><thead><tr><th>Code</th><th>SRM</th><th>Status</th><th>Created</th><th></th></tr></thead><tbody>`;
        sessions.forEach(s => {
          const id = s.id || s.token;
          html += `<tr><td><code>${escapeHtml(s.token || id)}</code></td><td>${escapeHtml(s.agentId)}</td><td><span class="badge ${s.status === "SHARING" || s.status === "CONNECTED" ? "badge-active" : s.status === "ENDED" ? "badge-ended" : "badge-pending"}">${escapeHtml(s.status)}</span></td><td>${escapeHtml((s.createdAt || "").slice(0, 19))}</td><td><a href="/admin/sessions/${escapeHtml(id)}" class="btn btn-outline-dark btn-sm">View</a></td></tr>`;
        });
        html += "</tbody></table>";
      }
      html += "</div>";
      el.innerHTML = html;
      el.querySelectorAll("a[href^='/admin/sessions/']").forEach(a => {
        a.addEventListener("click", e => { e.preventDefault(); history.pushState({}, "", a.href); route(); document.getElementById("sidebar")?.classList.remove("open"); document.getElementById("sidebarOverlay")?.classList.remove("open"); });
      });
    } catch (e) {
      el.innerHTML = `<div class="card-component"><p class="text-danger">Failed: ${e.message}</p></div>`;
    }
  }
  const _loading = document.getElementById("adminLoading"); if (_loading) _loading.style.display = "none";
  document.getElementById("backToSessionsLink")?.addEventListener("click", function(e) {
    e.preventDefault(); history.pushState({}, "", "/admin/sessions"); route();
    document.getElementById("sidebar")?.classList.remove("open"); document.getElementById("sidebarOverlay")?.classList.remove("open");
  });
}

async function renderAudit() {
  const el = document.getElementById("adminContent");
  try {
    const d = await api("/audit?limit=100");
    const events = d.events || [];
    let html = `<div class="card-component"><h4>Audit Log</h4>`;
    if (events.length === 0) {
      html += `<p class="text-muted">No audit events yet.</p>`;
    } else {
      html += `<table class="data-table admin-table"><thead><tr><th>Time</th><th>Role</th><th>Actor</th><th>Action</th><th>Details</th></tr></thead><tbody>`;
      events.slice().reverse().forEach(ev => {
        const time = ev.createdAt ? new Date(ev.createdAt).toLocaleString() : "-";
        const payload = ev.payload ? JSON.stringify(ev.payload) : "";
        html += `<tr><td>${escapeHtml(time)}</td><td>${escapeHtml(ev.actorRole)}</td><td>${escapeHtml(ev.actorId)}</td><td>${escapeHtml(ev.action)}</td><td><code class="small">${escapeHtml(payload)}</code></td></tr>`;
      });
      html += "</tbody></table>";
    }
    html += "</div>";
    el.innerHTML = html;
  } catch (e) {
    el.innerHTML = `<div class="card-component"><p class="text-danger">Failed: ${e.message}</p></div>`;
  }
  const _loading = document.getElementById("adminLoading"); if (_loading) _loading.style.display = "none";
}

async function renderReview(path) {
  const sessionId = path.replace("/admin/review/", "").split("/")[0];
  const el = document.getElementById("adminContent");
  try {
    const d = await api("/sessions/" + sessionId);
    const s = (d.session || {});
    el.innerHTML = `
      <div class="card-component">
        <h4>Review Session ${escapeHtml(sessionId)}</h4>
        <form id="reviewForm">
          <div class="form-group"><label>Decision</label><select class="form-control" name="status"><option value="APPROVED">APPROVED</option><option value="REJECTED">REJECTED</option><option value="NEEDS_INFO">NEEDS_INFO</option></select></div>
          <div class="form-group"><label>Notes</label><textarea class="form-control" name="notes" rows="3">${escapeHtml(s.adminNotes || "")}</textarea></div>
          <button type="submit" class="btn btn-dark">Submit review</button>
        </form>
      </div>
    `;
    document.getElementById("reviewForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const status = e.target.status.value;
      const notes = e.target.notes.value;
      try {
        await api("/review/" + sessionId, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, notes }) });
        (window.showToast || alert)("Review submitted", "success");
        window.location.href = "/admin/sessions";
      } catch (x) { (window.showToast || alert)(x.message, "error"); }
    });
  } catch (e) {
    el.innerHTML = `<div class="card-component"><p class="text-danger">Failed: ${e.message}</p></div>`;
  }
  const _loading = document.getElementById("adminLoading"); if (_loading) _loading.style.display = "none";
}

window.addEventListener("popstate", route);
window.addEventListener("load", function() {
  route();
  var t = document.getElementById("sidebarToggle"), s = document.getElementById("sidebar"), o = document.getElementById("sidebarOverlay");
  function toggle() { s.classList.toggle("open"); if (o) o.classList.toggle("open"); }
  if (t) t.addEventListener("click", toggle);
  if (o) o.addEventListener("click", toggle);
  fetch("/api/auth-check", { credentials: "include" }).then(r => r.json()).then(d => {
    var u = document.getElementById("topbarUser");
    if (u && d.user) u.textContent = d.user.email || "Admin";
    var btn = document.getElementById("btnOpenSRMPortal");
    if (btn && d.role === "admin") {
      btn.style.display = "inline-flex";
      btn.onclick = function() { window.open("/srm/login", "_blank"); };
    }
  }).catch(function(){});
});
document.querySelectorAll(".sidebar-nav-link").forEach(a => {
  a.addEventListener("click", (e) => {
    if (a.getAttribute("href") && a.getAttribute("href").startsWith("/") && !a.getAttribute("href").startsWith("http")) {
      e.preventDefault();
      history.pushState({}, "", a.getAttribute("href"));
      route();
      document.getElementById("sidebar")?.classList.remove("open");
      document.getElementById("sidebarOverlay")?.classList.remove("open");
    }
  });
});
