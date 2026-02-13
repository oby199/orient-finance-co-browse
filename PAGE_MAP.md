# Laplace — Page Map & Documentation

> See **WHAT_EACH_PAGE_DOES.md** for the concise "Route | File | Access | Purpose | Buttons | Redirects | API Calls" reference.

## Page Map

---

### 1. `/` (Landing)

| Field | Value |
|-------|-------|
| **File** | `files/landing.html` |
| **Access** | Public |
| **Purpose** | Entry point. Welcomes users and offers two paths: join as client or log in as advisor. |
| **Inputs** | None |
| **API calls** | None |
| **Redirects** | N/A (page is destination) |
| **Buttons** | **Join session** → navigates to `/join`<br>**Advisor login** → navigates to `/agent/login` |

---

### 2. `/join`

| Field | Value |
|-------|-------|
| **File** | `files/join.html` + `files/static/join.js` |
| **Access** | Public |
| **Purpose** | Manual session code entry. Client types the code shared by advisor and validates it. |
| **Inputs** | `inputSessionCode` (form): session code (6+ chars, e.g. `frosty_cranky_bandicoot`) |
| **API calls** | `POST /api/session/validate` — body: `FormData{ token: code }`<br>Success: `{ roomId, sessionId, valid }`<br>Error: `{ error }` + 400/404 |
| **Redirects** | Success → `/room/:roomId` (server redirects to `/stream.html?stream=1&room=:roomId`)<br>Failure → stay, show error + Retry button |
| **Buttons** | **← Back** → `/`<br>**Connect** → validates code, redirects on success<br>**Retry** → retries validation after error<br>**I have a connect link** → `/connect` |

---

### 3. `/connect` (and `/connect?token=...`, `/connect/:token`)

| Field | Value |
|-------|-------|
| **File** | `files/connect.html` + `files/static/connect.js` |
| **Access** | Public |
| **Purpose** | Connect page for clients. Enter code or follow link with pre-filled token; validates and redirects to stream. |
| **Inputs** | Query: `token` — pre-filled session code<br>Form: `inputSessionCode` — session code (6+ chars) |
| **API calls** | `POST /api/session/validate` — body: `FormData{ token: code }`<br>Success: `{ roomId, sessionId, valid }`<br>Error: `{ error }` + 400/404 |
| **Redirects** | Success → `/room/:roomId` → `/stream.html?stream=1&room=:roomId`<br>Failure → stay, show hint/error; user can retry manually or click Retry |
| **Buttons** | **Connect** → validates code, redirects on success<br>**Retry** → retries validation after error |
| **Notes** | If `token` in URL and length ≥ 6, auto-validates on load and redirects on success. |

---

### 4. `/start` and `/start/`

| Field | Value |
|-------|-------|
| **File** | Same as `/connect` — `files/connect.html` + `files/static/connect.js` |
| **Access** | Public |
| **Purpose** | Alias for `/connect`. Same behavior. |
| **Inputs** | Same as `/connect` (`token` in query or path) |
| **API calls** | Same as `/connect` |
| **Redirects** | Same as `/connect` |
| **Buttons** | Same as `/connect` |

---

### 5. `/room/:roomId` (Redirect only)

| Field | Value |
|-------|-------|
| **File** | Server-side redirect (no HTML served) |
| **Access** | Public |
| **Purpose** | Redirects client to the stream page with correct query params. |
| **Inputs** | Path: `roomId` |
| **API calls** | None |
| **Redirects** | Always → `/stream.html?stream=1&room=:roomId`<br>If `roomId` empty → `/join` |
| **Buttons** | N/A |

---

### 6. `/stream.html` (Client share + Agent viewer)

| Field | Value |
|-------|-------|
| **File** | `files/main.html` + `files/static/laplace-legacy.js` + `files/static/qrcode.min.js` |
| **Access** | **Client mode** (`stream=1&room=X`): Public<br>**Agent mode** (`id=X`): Agent-only (redirect to `/agent/login` if not authed) |
| **Purpose** | Dual-purpose stream page. Client: share screen with advisor. Agent: watch client’s screen, annotate (laser/highlight), send click requests. |
| **Inputs** | Query: `stream` + `room` → client flow (room = claim token)<br>Query: `id` → agent flow (roomId to join)<br>Query: `debug=1` → show debug panel |
| **API calls** | **Agent mode only:** `GET /api/auth-check` — 200/401, `{ authed }`<br>**Create Session (panel):** `POST /api/session/create` — `{ token, roomId, connectUrl, code }` |
| **Redirects** | Agent, not authed → `/agent/login`<br>**Leave Room** / **Cancel** → `/` (landing) |
| **Buttons** | **Client flow:** **Start sharing** → getDisplayMedia + connect to `/ws/serve`; **Stop sharing** → leaveRoom → `/`; **Need help?** → open help sheet<br>**Agent flow:** **Request click** → send message to client; **Highlight** → toggle highlight mode; **Leave Room** → `/`<br>**Panel (agent):** **Create Session** → POST session/create, show link/QR; **Copy** / **Copy code**; **View session** → `/agent/session/:roomId`; **Join** (form) → doJoin; **Start sharing** (legacy) → doStream |
| **WebSocket** | Client: `/ws/serve?claim=:token`<br>Agent: `/ws/connect?id=:roomId` |

---

### 7. `/agent/login`

| Field | Value |
|-------|-------|
| **File** | `files/agent-login.html` (embedded in binary via `//go:embed`) + `files/static/agent-login.js` |
| **Access** | Public |
| **Purpose** | Agent login form only. No dashboard, no Logout. |
| **Inputs** | Form: `loginEmail`, `loginPassword` |
| **API calls** | `GET /api/auth-check` — on load; if `authed` → redirect to `/agent`<br>`POST /api/login` — body: `FormData{ email, password }`<br>Success: `{ ok, redirect }`<br>Error: `{ error }` + 401 |
| **Redirects** | If already authed → `/agent`<br>Login success → `data.redirect` or `/agent`<br>Failure → stay, show error + Retry |
| **Buttons** | **Sign in** → submit login<br>**Retry** → clear error, retry form |

---

### 8. `/agent`

| Field | Value |
|-------|-------|
| **File** | `files/agent.html` + `files/static/agent.js` + `files/static/qrcode.min.js` |
| **Access** | Agent-only (redirect to `/agent/login` if not authed) |
| **Purpose** | Agent dashboard. Create session and share link/code/QR with client. |
| **Inputs** | None |
| **API calls** | `POST /api/session/create` — no body<br>Returns: `{ token, roomId, connectUrl, code, sessionId, sessionCode }` |
| **Redirects** | Failure → stay, show error + Retry |
| **Buttons** | **Create Session** → POST session/create, show link/QR/code<br>**Copy** → copy connect URL<br>**Copy code** → copy session code<br>**Open Agent Session** → `/agent/session/:roomId` (new tab)<br>**Logout** → `/logout`<br>**Home** → `/` |

---

### 9. `/agent/session/:roomId`

| Field | Value |
|-------|-------|
| **File** | Server-side redirect (no HTML) |
| **Access** | Agent-only |
| **Purpose** | Redirects agent to stream viewer for a given room. |
| **Inputs** | Path: `roomId` |
| **API calls** | None |
| **Redirects** | Always → `/stream.html?id=:roomId`<br>If not authed → `/agent/login` (middleware) |
| **Buttons** | N/A |

---

### 10. `/logout`

| Field | Value |
|-------|-------|
| **File** | Server handler (no HTML) |
| **Access** | Public |
| **Purpose** | Clears session cookie, destroys server-side session, redirects to login. |
| **Inputs** | Cookie: `orient_agent_session` |
| **API calls** | N/A (HTTP handler) |
| **Redirects** | Always → `/agent/login` |
| **Buttons** | N/A (linked from navbar on agent pages) |

---

## API Map

| Method | Path | Response | Called by |
|--------|------|----------|-----------|
| GET | `/api/health` | `200` `{ status: "ok" }` | Health checks |
| GET | `/api/auth-check` | `200` `{ authed: true }` or `401` `{ authed: false }` | `agent-login.html`, `main.html` (agent mode) |
| POST | `/api/login` | `200` `{ ok, redirect }` or `401` `{ error }` | `agent-login.html` |
| GET/POST | `/api/session/create` | `200` `{ token, roomId, connectUrl, code, sessionId, sessionCode }` | `agent.html`, `main.html` (Create Session) |
| POST | `/api/session/validate` | `200` `{ roomId, sessionId, valid }` or `400/404` `{ error }` | `join.html`, `connect.html` |
| GET | `/api/validate` | `200` `{ sessionId, roomId, valid }` or 400/404 | `start.js` (legacy; `/start` serves connect which uses session/validate) |
| GET/POST | `/api/create-session` | `200` `{ token, sessionId, sessionCode }` (no connectUrl) | `advisor.js` / `advisor.html` (not in main routes) |
| — | `/logout` | HTTP redirect to `/agent/login` | Navbar links |

---

## WebSocket Map

| Route | Used by | When | Messages (high level) |
|-------|---------|------|------------------------|
| `/ws/serve` | Client (sharer) | When client starts screen share on `/stream.html?stream=1&room=:token` | **Client → Server:** `addCallerIceCandidate`, `gotOffer`<br>**Server → Client:** `newRoom` (roomId), `newSession` (sessionId), `addCalleeIceCandidate`, `gotAnswer`, `beat` (heartbeat), `roomClosed` |
| `/ws/serve?claim=:token` | Client (sharer) | Same as above when coming from connect flow; uses `claim` to bind room to token | Same as `/ws/serve` |
| `/ws/connect` | Agent (viewer) | When agent views room at `/stream.html?id=:roomId` | **Agent → Server:** `addCalleeIceCandidate`, `gotAnswer`<br>**Server → Agent:** `newSession`, `addCallerIceCandidate`, `gotOffer`, `roomNotFound`, `roomClosed` |

**DataChannel (client ↔ agent, over WebRTC):** `ping`/`pong`, `status`, `assistant` (JSON commands: `requestClick`, etc.)

---

## Flow Diagrams

### Agent flow

```
/agent/login
   │
   │  [Sign in] → POST /api/login
   │  Success → redirect
   ▼
/agent
   │
   │  [Create Session] → POST /api/session/create
   │  Shows: connectUrl, code, QR, "Open Agent Session"
   │
   │  [Open Agent Session] or [View session]
   ▼
/agent/session/:roomId  →  redirect
   │
   ▼
/stream.html?id=:roomId
   │
   │  GET /api/auth-check (if not authed → /agent/login)
   │  WebSocket: /ws/connect?id=:roomId
   │  Waits for client; receives video; can annotate / request click
   │
   │  [Leave Room] → /
   ▼
/
```

### Client flow

```
/   or   /connect?token=:code   or   /join
   │
   │  Option A: /connect?token=X
   │    → auto-validate → POST /api/session/validate
   │
   │  Option B: /join or /connect (manual)
   │    → [Connect] with code → POST /api/session/validate
   │
   │  Success
   ▼
/room/:roomId  →  server redirect
   │
   ▼
/stream.html?stream=1&room=:roomId
   │
   │  WebSocket: /ws/serve?claim=:roomId
   │  [Start sharing] → getDisplayMedia → WebRTC to agent
   │
   │  [Stop sharing] → /
   ▼
/
```
