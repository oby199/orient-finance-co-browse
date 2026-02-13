# Orient Finance Co-Browse

Secure screen sharing for **Orient Finance Broker** — advisors create sessions, share links with clients, and view client screens in real time. Built on WebRTC with Go signaling.

## Quick Start

```bash
cd /Users/ozgur/Downloads/laplace-master
go build -o orient-co-browse main.go
./orient-co-browse -addr=0.0.0.0:8443
```

Open **https://localhost:8443**. For self-signed certs, type `thisisunsafe` in Chrome when prompted.

## Flow

### Agent (Advisor)

1. Go to **https://localhost:8443/advisor** (or `/` and use "Advisor — Create session").
2. Click **Create Session**.
3. Share the **joinUrl** or **session code** with the client (WhatsApp/SMS).

### Client (mobile-first)

1. Open the link (e.g. `https://localhost:8443/connect?token=frosty_cranky_bandicoot`) or go to `/connect` and enter the session code.
2. Click **Connect** → validates and redirects to share screen.
3. Click **Start sharing** → choose screen/tab (one tap) → advisor sees stream.
4. See "Live • Sharing" and **Stop sharing** when connected.

### Advisor (view stream)

1. Use **View session** from the create-session panel, or go to `/session/<sessionId>` or `/?id=<sessionId>`.
2. When the client starts sharing, the stream appears with overlay tools.

## Routes

| Path | Description |
|------|-------------|
| `/` | Landing — start sharing, create session, join |
| `/advisor` | Advisor-only create session page |
| `/connect?token=X` | Client connect page (token in URL) |
| `/connect` | Client connect page (enter session code manually) |
| `/start` | Alias for `/connect` (backward compat) |
| `/session/<id>` | Redirects to `/?id=<id>` (view session) |

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
