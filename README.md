# Orient Finance Co-Browse

Secure screen sharing for **Orient Finance Broker** — enable your advisors to view a client's screen in real time during support sessions. Built on WebRTC for low-latency peer-to-peer connections with WebSocket signaling in Go.

## What It Does

- **Clients** start a support session and share their screen with a simple 3-step flow.
- **Advisors** join using a session code shared by the client.
- No installation or registration required — works in modern desktop browsers.
- Direct peer-to-peer streaming for low latency.

## Quick Start

### Run locally

```bash
$ cd laplace
$ go build -o orient-co-browse main.go
$ ./orient-co-browse -addr=0.0.0.0:8443
```

Then open **https://localhost:8443** in your browser.

For development with a self-signed certificate, you may need to accept the browser warning (in Chrome, type `thisisunsafe` on the warning page).

### With Docker

```bash
$ docker build -t orient-co-browse .
$ docker run -p 8443:443 orient-co-browse
```

## Usage

### Client (share screen)

1. Open the app and click **Start Sharing**.
2. Follow the wizard: prepare → start screen share (allow when prompted) → share the session code.
3. Share the session code or QR code with your advisor.

### Advisor (view screen)

1. Open the app and enter the session code in **Enter Session Code**, then click **Join Session**.
2. Or go directly to `/view?room=SESSION_CODE`.
3. When the client starts sharing, the stream appears in the viewer.

## Routes

| Path            | Description                    |
|----------------|--------------------------------|
| `/`            | Landing page — choose share or join |
| `/share`       | Client 3-step share wizard     |
| `/join`        | Advisor session code entry     |
| `/view?room=X` | Advisor view for room X        |

## Configuration

Brand settings are in `files/static/config.js`:

```javascript
window.OrientFinanceConfig = {
  BRAND_NAME: "Orient Finance Broker",
  PRODUCT_NAME: "Orient Finance Co-Browse",
  LOGO_PATH: "/static/logo-placeholder.svg",
  TAGLINE: "Secure screen sharing with your advisor",
};
```

Replace `LOGO_PATH` with your logo when ready.

## How to Test End-to-End Locally

1. Start the server: `./orient-co-browse -addr=0.0.0.0:8443`
2. Open two browser tabs (or two devices on the same network).
3. **Tab 1 (Client):** Go to `/share` → Continue → Start Screen Share → allow → note the session code.
4. **Tab 2 (Advisor):** Go to `/` → enter the session code → Join Session.
5. The advisor tab should show the client's screen.

## Known Limitations

- Screen sharing on **iOS Safari** is limited; use Chrome/Edge on desktop for best support.
- System audio sharing works only in certain browser/OS combinations (e.g. Chrome on Windows).
- Requires **HTTPS** (or localhost) for `getDisplayMedia` and WebRTC.
- Sessions end when the client closes or navigates away.

## License

[MIT](https://choosealicense.com/licenses/mit/)
