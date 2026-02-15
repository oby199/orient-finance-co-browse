# What Each Page Does

## Route Reference

| Route | File | Access | Purpose | Buttons | Redirects | API Calls |
|-------|------|--------|---------|---------|-----------|-----------|
| `/` | `files/landing.html` | Public | Landing: client vs SRM choice | **Join session** → /join<br>**SRM login** → /srm/login | — | None |
| `/join` | `files/join.html` + `join.js` | Public | Manual session code entry | **Connect** → validates, redirects<br>**Retry** → retry after error<br>**← Back** → /<br>**I have a connect link** → /connect | Success → /room/:roomId<br>Failure → stay, show error | POST /api/session/validate |
| `/connect` | `files/connect.html` + `connect.js` | Public | Enter code or use ?token=X | **Connect** → validates, redirects<br>**Retry** → retry after error<br>**← Home** → / | Success → /room/:roomId<br>Failure → stay | POST /api/session/validate |
| `/start` | Same as /connect | Public | Alias for /connect | Same as /connect | Same | Same |
| `/room/:roomId` | Server redirect | Public | Redirect only | — | → /stream.html?stream=1&room=:roomId | None |
| `/stream.html` | `files/main.html` + `laplace-legacy.js` | Client: Public<br>Agent: Protected | Client: share screen<br>Agent: view stream | **Start sharing** → getDisplayMedia, WS<br>**Stop sharing** → /<br>**Leave Room** → /<br>**Create Session** → POST create<br>**View session** → /agent/session/:id | Agent not authed → /agent/login<br>Leave → / | GET /api/auth-check<br>POST /api/session/create |
| `/agent/login` | `files/agent-login.html` (embedded) + `agent-login.js` | Public | Login form only | **Sign in** → POST login<br>**Retry** → clear error | Success → /agent<br>Already authed → /agent<br>404 → show error, stay | GET /api/auth-check<br>POST /api/login |
| `/agent` | `files/agent.html` + `agent.js` | Agent-only | Create session, share link | **Create Session** → POST create<br>**Copy** → copy link<br>**Copy code** → copy code<br>**Open Agent Session** → /agent/session/:id<br>**Logout** → /logout<br>**Home** → / | Not authed → /agent/login | POST /api/session/create |
| `/agent/session/:roomId` | Server redirect | Agent-only | Redirect to viewer | — | → /stream.html?id=:roomId | None |
| `/admin/login` | `admin-login.html` | Public | Admin login | **Sign in** → redirect by role | Admin → /admin, Agent → /agent | POST /api/login |
| `/admin` | `admin.html` | Admin-only | Dashboard, Agents, Settings, Documents, Onboarding, Sessions | — | — | GET /api/admin/* |
| `/logout` | Server handler | Public | Clear session | — | → /agent/login | None |
