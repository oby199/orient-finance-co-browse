# Orient Finance Co-Browse

Secure screen sharing for **Orient Finance Broker** — Sales Relationship Managers (SRMs) create sessions, share links with clients, and view client screens in real time. Built on WebRTC with Go signaling.

## Quick Start

**Local HTTP (easiest):**

```bash
./run-local.sh
```

Then open **http://127.0.0.1:8080** in your browser.

**Or manually with TLS:**

```bash
go build -o laplace .
./laplace -tls=false -addr=127.0.0.1:8080   # HTTP
# or
./laplace -addr=0.0.0.0:8443                 # HTTPS (default), needs certs
```

Then open **http://127.0.0.1:8080** (HTTP) or **https://localhost:8443** (HTTPS). For self-signed certs, type `thisisunsafe` in Chrome when prompted.

> **Important:** The app must be reached through the server URL. Opening HTML files directly (`file://`) will not work—links and buttons depend on the server.

---

## Route Map

### Public (no login)

| Path | Description |
|------|-------------|
| `/` | Landing — "I'm a client" or "SRM login" |
| `/join` | Client enters session code manually |
| `/connect` | Client connect page (code or `?token=X` prefills) |
| `/start` | Alias for `/connect` |
| `/room/<roomId>` | Redirects to client share page |
| `/stream.html?stream=1&room=X` | Client share screen page |

### SRM (Sales Relationship Manager) — requires login

| Path | Description |
|------|-------------|
| `/srm/login` | SRM login form |
| `/srm` | SRM dashboard (create session, copy link/code/QR) |
| `/srm/session/<roomId>` | Redirects to viewer |
| `/viewer/<roomId>` | Redirects to viewer |
| `/stream.html?id=X` | Viewer mode (watch client screen) |

*Legacy: `/agent/*` redirects to `/srm/*` (301).*

### Admin — requires admin login

| Path | Description |
|------|-------------|
| `/admin/login` | Admin login form |
| `/admin` | Dashboard (stats) |
| `/admin/srms` | Manage SRMs (create, disable, reset password) |
| `/admin/settings` | Global settings (company, brand, session expiry, KYC) |
| `/admin/documents` | Document templates |
| `/admin/onboarding` | Onboarding flow steps |
| `/admin/sessions` | Sessions list + detail (terminate) |
| `/admin/audit` | Audit log |

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check — `{"status":"ok"}` |
| `/api/auth-check` | GET | Returns `authed`, `role`, `user` (for SRM/Admin) |
| `/api/login` | POST | Login (form: email, password) |
| `/api/logout` | GET/POST | Logout |
| `/api/session/create` | POST | Create session (SRM/Admin); returns `token`, `roomId`, `connectUrl`, `sessionCode` |
| `/api/session/validate` | POST | Validate token/code before client connects |
| `/api/session/consent` | POST | Record client consent |
| `/api/admin/*` | Various | Admin API (dashboard, agents, settings, documents, onboarding, sessions, audit) |

---

## Role-Based Access

### Client (public)
- Can: enter code, open connect link, share screen
- Cannot: access SRM or Admin pages

### Sales Relationship Manager (SRM)
- Must login first
- Can: create sessions, copy link/code/QR, open viewer, end session, see session history
- Cannot: manage users, change global settings

### Admin
- Must login at `/admin/login`
- Can: manage SRMs, global settings, onboarding flow, documents, sessions, audit log
- Can terminate any session

**Default credentials (dev):**
- SRM: `sales@orientfinance.com` / `orient@123` (or `AGENT_EMAIL` / `AGENT_PASSWORD` env)
- Admin: `admin@orientfinance.com` / `myadmin123` (or `ADMIN_EMAIL` / `ADMIN_PASSWORD` env)

---

## How SRM Onboards a Client

1. **SRM logs in** → go to `/srm/login`, sign in.
2. **Create Session** → on `/srm` dashboard, click "Create Session".
3. **Share with client**:
   - Copy link (e.g. `https://yourserver/connect?token=482731`)
   - Or copy the session code (e.g. `482731`)
   - Or share the QR code
4. **Client enters code** (or opens link):
   - Client goes to `/join` or `/connect`
   - Enters code manually, or link pre-fills it
   - Clicks "Connect"
5. **Client shares screen**:
   - After validation, client is redirected to share screen page
   - Clicks "Start sharing" → picks screen/tab
6. **SRM views** → click "Open Viewer" or go to `/viewer/<roomId>` or `/srm/session/<roomId>`.
7. **Assist client** → use overlay tools (cursor, laser, highlight, request click).
8. **End session** → client clicks "Stop sharing" or SRM ends from dashboard.

---

## SRM Overlay Tools

When viewing the client stream:

- **Cursor** — Shows SRM cursor on the stream
- **Laser** — Hold `L` for red laser pointer
- **Highlight** — Click "Highlight", then click-drag to draw a fading rectangle
- **Request click** — Sends a prompt to the client (e.g. "Please click here")

---

## Configuration

Edit `files/static/config.js`:

```javascript
window.OrientFinanceConfig = {
  BASE_URL: "",
  CUSTOMER_APP_BASE_URL: "",
  CONNECT_PATH: "/connect",
  STUN_URLS: ["stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302"],
  TURN_URLS: [],
  TURN_USER: "",
  TURN_PASS: "",
};
```

---

## Security

- Session codes are 6-digit numeric (e.g. `482731`), crypto-random, and expire in 15 minutes unless the stream is active.
- Rate limit: 10 connect attempts per IP per minute.
- Admin and SRM use separate session cookies.

---

## Known Limitations

- Screen sharing on **iOS Safari** is limited; use Chrome/Edge on desktop.
- Requires **HTTPS** (or localhost) for `getDisplayMedia` and WebRTC.
- Sessions end when the client closes or navigates away.
- Overlay tools are visual only; no remote control of external sites.

---

## Browser Extension Noise (MetaMask etc.)

If you see console errors like "Failed to connect to MetaMask" or "extension not found", these come from **browser extensions** (e.g. MetaMask, wallet extensions), not from this application. This app does not use MetaMask, `window.ethereum`, or Web3. You can safely ignore such messages.

---

## Test Checklist

- [ ] **SRM:** `/srm/login` → Create Session → copy link
- [ ] **Client:** `/join` or `/connect` → enter code → Connect
- [ ] **Client:** Start sharing → see "Live • Sharing"
- [ ] **SRM:** Open Viewer → see client stream with overlay tools
- [ ] **Client:** "Stop sharing" ends stream
- [ ] **Admin:** `/admin/login` → manage SRMs, settings, sessions, audit
