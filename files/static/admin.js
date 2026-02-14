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

function route() {
  const path = window.location.pathname || "/admin";
  document.querySelectorAll(".admin-nav-link").forEach(a => {
    const route = a.getAttribute("data-route") || "";
    const active = route === path || (route !== "/admin" && path.startsWith(route));
    a.classList.toggle("active", active);
  });
  const loading = document.getElementById("adminLoading");
  loading.style.display = "block";
  loading.textContent = "Loading…";

  if (path === "/admin" || path === "/admin/") renderDashboard();
  else if (path === "/admin/agents") renderAgents();
  else if (path === "/admin/settings") renderSettings();
  else if (path === "/admin/documents") renderDocuments();
  else if (path === "/admin/onboarding-flow") renderOnboardingFlow();
  else if (path.startsWith("/admin/sessions")) renderSessions(path);
  else if (path.startsWith("/admin/review/")) renderReview(path);
  else renderDashboard();
}

async function renderDashboard() {
  const el = document.getElementById("adminContent");
  try {
    const d = await api("/dashboard");
    el.innerHTML = `
      <div class="admin-card">
        <h4>Dashboard</h4>
        <p><strong>${d.companyName || "Orient Finance"}</strong></p>
        <div class="row mt-3">
          <div class="col-md-4"><div class="admin-stat">Sessions today: <strong>${d.sessionsToday ?? 0}</strong></div></div>
          <div class="col-md-4"><div class="admin-stat">Pending reviews: <strong>${d.pendingReviews ?? 0}</strong></div></div>
          <div class="col-md-4"><div class="admin-stat">Active agents: <strong>${d.activeAgents ?? 0}</strong></div></div>
        </div>
      </div>
    `;
  } catch (e) {
    el.innerHTML = `<div class="admin-card"><p class="text-danger">Failed to load: ${e.message}</p></div>`;
  }
  document.getElementById("adminLoading").style.display = "none";
}

async function renderAgents() {
  const el = document.getElementById("adminContent");
  try {
    const d = await api("/agents");
    const agents = d.agents || [];
    let html = `
      <div class="admin-card">
        <h4>Agents</h4>
        <form id="createAgentForm" class="mb-3">
          <div class="form-row">
            <div class="col"><input type="email" class="form-control" id="newAgentEmail" placeholder="Email" required></div>
            <div class="col"><input type="password" class="form-control" id="newAgentPass" placeholder="Password" minlength="6"></div>
            <div class="col-auto"><button type="submit" class="btn btn-dark">Create agent</button></div>
          </div>
        </form>
        <table class="admin-table table">
          <thead><tr><th>Email</th><th>ID</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
    `;
    agents.forEach(a => {
      html += `<tr>
        <td>${escapeHtml(a.email)}</td>
        <td><code>${escapeHtml(a.id)}</code></td>
        <td><span class="admin-badge ${a.active ? "admin-badge-active" : "admin-badge-inactive"}">${a.active ? "Active" : "Disabled"}</span></td>
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
      if (!email || pass.length < 6) { alert("Email and password (6+ chars) required"); return; }
      try {
        await api("/agents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: pass }) });
        route();
      } catch (x) { alert(x.message); }
    });
  } catch (e) {
    el.innerHTML = `<div class="admin-card"><p class="text-danger">Failed: ${e.message}</p></div>`;
  }
  document.getElementById("adminLoading").style.display = "none";
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
    await api("/agents/" + id, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active }) });
    route();
  } catch (x) { alert(x.message); }
};

window.adminResetPass = async (id) => {
  const pass = prompt("New password (min 6 chars):");
  if (!pass || pass.length < 6) return;
  try {
    await api("/agents/" + id, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pass }) });
    alert("Password updated");
  } catch (x) { alert(x.message); }
};

async function renderSettings() {
  const el = document.getElementById("adminContent");
  try {
    const s = await api("/settings");
    el.innerHTML = `
      <div class="admin-card">
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
        alert("Saved");
      } catch (x) { alert(x.message); }
    });
  } catch (e) {
    el.innerHTML = `<div class="admin-card"><p class="text-danger">Failed: ${e.message}</p></div>`;
  }
  document.getElementById("adminLoading").style.display = "none";
}

async function renderDocuments() {
  const el = document.getElementById("adminContent");
  try {
    const d = await api("/documents");
    const docs = d.documents || [];
    let html = `<div class="admin-card"><h4>Document Templates</h4><form id="addDocForm" class="mb-3"><div class="form-row"><div class="col"><input type="text" class="form-control" id="docTitle" placeholder="Title" required></div><div class="col"><input type="text" class="form-control" id="docUrl" placeholder="URL"></div><div class="col-auto"><label><input type="checkbox" id="docRequired"> Required</label></div><div class="col-auto"><button type="submit" class="btn btn-dark">Add</button></div></div></form><table class="admin-table table"><thead><tr><th>Title</th><th>URL</th><th>Required</th><th></th></tr></thead><tbody>`;
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
      } catch (x) { alert(x.message); }
    });
  } catch (e) {
    el.innerHTML = `<div class="admin-card"><p class="text-danger">Failed: ${e.message}</p></div>`;
  }
  document.getElementById("adminLoading").style.display = "none";
}

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
      <div class="admin-card">
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
        alert("Saved");
      } catch (x) { alert(x.message); }
    });
  } catch (e) {
    el.innerHTML = `<div class="admin-card"><p class="text-danger">Failed: ${e.message}</p></div>`;
  }
  document.getElementById("adminLoading").style.display = "none";
}

async function renderSessions(path) {
  const el = document.getElementById("adminContent");
  const sessionId = path.replace("/admin/sessions/", "").trim();
  if (sessionId) {
    try {
      const d = await api("/sessions/" + sessionId);
      const s = d.session || {};
      el.innerHTML = `
        <div class="admin-card">
          <h4>Session ${escapeHtml(sessionId)}</h4>
          <p><strong>Status:</strong> ${escapeHtml(s.status)} | <strong>Agent:</strong> ${escapeHtml(s.agentId)}</p>
          <p><strong>Client IP:</strong> ${escapeHtml(s.clientIpAtConnect || "-")}</p>
          <p><strong>Application:</strong> ${escapeHtml(s.applicationName || "-")}</p>
          <pre>${escapeHtml(JSON.stringify(d.audit || [], null, 2))}</pre>
          <a href="/admin/sessions" class="btn btn-outline-dark">Back to sessions</a>
        </div>
      `;
    } catch (e) {
      el.innerHTML = `<div class="admin-card"><p class="text-danger">Failed: ${e.message}</p></div>`;
    }
  } else {
    try {
      const d = await api("/sessions");
      const sessions = d.sessions || [];
      let html = `<div class="admin-card"><h4>Sessions</h4><table class="admin-table table"><thead><tr><th>Token</th><th>Agent</th><th>Status</th><th>Created</th><th></th></tr></thead><tbody>`;
      sessions.forEach(s => {
        html += `<tr><td><code>${escapeHtml(s.token)}</code></td><td>${escapeHtml(s.agentId)}</td><td>${escapeHtml(s.status)}</td><td>${escapeHtml((s.createdAt || "").slice(0, 19))}</td><td><a href="/admin/sessions/${s.id || s.token}" class="btn btn-outline-dark btn-sm">View</a></td></tr>`;
      });
      html += "</tbody></table></div>";
      el.innerHTML = html;
    } catch (e) {
      el.innerHTML = `<div class="admin-card"><p class="text-danger">Failed: ${e.message}</p></div>`;
    }
  }
  document.getElementById("adminLoading").style.display = "none";
}

async function renderReview(path) {
  const sessionId = path.replace("/admin/review/", "").split("/")[0];
  const el = document.getElementById("adminContent");
  try {
    const d = await api("/sessions/" + sessionId);
    const s = (d.session || {});
    el.innerHTML = `
      <div class="admin-card">
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
        alert("Review submitted");
        window.location.href = "/admin/sessions";
      } catch (x) { alert(x.message); }
    });
  } catch (e) {
    el.innerHTML = `<div class="admin-card"><p class="text-danger">Failed: ${e.message}</p></div>`;
  }
  document.getElementById("adminLoading").style.display = "none";
}

window.addEventListener("popstate", route);
window.addEventListener("load", route);
document.querySelectorAll(".admin-nav-link").forEach(a => {
  a.addEventListener("click", (e) => {
    if (a.getAttribute("href").startsWith("/")) {
      e.preventDefault();
      history.pushState({}, "", a.getAttribute("href"));
      route();
    }
  });
});
