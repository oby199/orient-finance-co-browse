# Orient Finance Co-Browse

Secure screen sharing for **Orient Finance Broker** — advisors create sessions, share links with clients, and view client screens in real time. Built on WebRTC with Go signaling.

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

> **Important:** The app must be reached through the server URL (e.g. http://127.0.0.1:8080). Opening HTML files directly (`file://`) will not work—links and buttons depend on the server.

## Flow

### Agent (Advisor)

1. Go to **http://127.0.0.1:8080** → click **Advisor login** → sign in (default: advisor@orientfinance.com / orient2024).
2. On `/agent`, click **Create Session**.
3. Share the **connect link** or **session code** with the client (WhatsApp/SMS).

### Client (mobile-first)

1. Open the link (e.g. `http://127.0.0.1:8080/connect?token=frosty_cranky_bandicoot`) or go to `/connect` or `/join` and enter the session code.
2. Click **Connect** → validates and redirects to share screen.
3. Click **Start sharing** → choose screen/tab (one tap) → advisor sees stream.
4. See "Live • Sharing" and **Stop sharing** when connected.

### Advisor (view stream)

1. Use **View session** or **Open Agent Session** from the create-session panel, or go to `/agent/session/<roomId>`.
2. When the client starts sharing, the stream appears with overlay tools.

## Routes

| Path | Description |
|------|-------------|
| `/` | Landing — Join session, Advisor login |
| `/join` | Client manual code entry |
| `/connect` | Client connect page (enter code or `?token=X`) |
| `/start` | Alias for `/connect` |
| `/agent/login` | Agent login form |
| `/agent` | Agent dashboard (create session) |
| `/agent/session/<roomId>` | Redirects to stream viewer |
| `/room/<roomId>` | Redirects to client share page |
| `/stream.html` | Client share or agent viewer (depends on query params) |

## API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/create-session` | POST/GET | Create session; returns `token`, `sessionId`, `sessionCode` |
| `/api/validate?token=X` | GET | Validate token before client connects |
| `/api/health` | GET | Health check |

## Configuration

Edit `files/static/config.js`:

```javascript
window.OrientFinanceConfig = {
  BASE_URL: "",                    // Leave empty for current origin
  CUSTOMER_APP_BASE_URL: "",       // For client links (e.g. production domain)
  CONNECT_PATH: "/connect",
  STUN_URLS: ["stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302"],
  TURN_URLS: [],                   // Optional: ["turn:your-turn-server:3478"]
  TURN_USER: "",
  TURN_PASS: "",
};
```

## Agent Overlay Tools

When viewing the client stream, advisors can use:

- **Cursor** — Shows agent cursor on the stream.
- **Laser** — Hold `L` for a red laser pointer.
- **Highlight** — Click "Highlight", then click-drag to draw a fading rectangle.
- **Request click** — Sends a prompt to the client (e.g. "Please click here").

## Session Store

Sessions use an in-memory store by default. The `SessionStore` interface in `core/session.go` allows swapping to Firestore or another backend.

## Security

- Session tokens are random (e.g. `frosty_cranky_bandicoot`) and expire in 15 minutes unless the stream is active.
- Rate limit: 10 connect attempts per IP per minute.

## How to test (checklist)

- [ ] **Advisor:** `/advisor` → Create Session → copy link
- [ ] **Client:** Open link → Connect → redirected to "Share your screen"
- [ ] **Client:** Click "Start sharing" → pick screen/tab → see "Live • Sharing"
- [ ] **Advisor:** View session → see client stream with overlay tools
- [ ] **Client:** "Need help?" opens bottom sheet
- [ ] **Client:** "Stop sharing" ends stream
- [ ] **Debug:** Add `?debug=1` to stream URL to see config panel

## Known Limitations

- Screen sharing on **iOS Safari** is limited; use Chrome/Edge on desktop.
- Requires **HTTPS** (or localhost) for `getDisplayMedia` and WebRTC.
- Sessions end when the client closes or navigates away.
- No true remote control of external sites (e.g. clientportal.orientfinance.net); overlay tools are visual only.

## Files Changed (summary)

- `core/signal.go` — routing, API, rate limit
- `core/session.go` — `SessionStore` interface, 15 min TTL
- `files/advisor.html` — new advisor page
- `files/static/advisor.js` — create session logic
- `files/connect.html`, `files/static/connect.js`, `files/static/connect.css` — session code input, two-step flow
- `files/static/laplace-legacy.js` — overlay (highlight box), ice config
- `files/static/config.js` — STUN/TURN
- `files/main.html` — copy, highlight button
