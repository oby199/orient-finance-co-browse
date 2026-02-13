# Orient Finance Co-Browse — Full User Flow

## Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     LANDING PAGE (/)                             │
│  ┌─────────────────────┐    ┌─────────────────────┐              │
│  │ Start a Support     │    │ Join as Advisor     │              │
│  │ Session             │    │ [Enter Session Code] │              │
│  │ [Start Sharing]     │    │ [Join Session]      │              │
│  └─────────┬───────────┘    └──────────┬──────────┘              │
└────────────┼───────────────────────────┼─────────────────────────┘
             │                           │
             ▼                           ▼
      /share (Client)              /view?room=X (Advisor)
             │                           │
             │  ┌────────────────────────┘
             │  │  Session code links them
             ▼  ▼
      WebRTC peer-to-peer connection
```

---

## A) Landing Page (`/`)

**Role:** Entry point for both client and advisor

- **Header:** Orient Finance logo + "Orient Finance Co-Browse" + "Secure screen sharing with your advisor"
- **Card 1 — Start a Support Session (Client)**
  - Button: "Start Sharing"
  - Action: Navigate to `/share`
- **Card 2 — Join as Advisor**
  - Input: "Enter Session Code"
  - Button: "Join Session"
  - Action: Navigate to `/view?room=CODE`

---

## B) Client Flow (`/share`)

### Step 1: Prepare
- Short explanation of what will happen
- Privacy notice: "Only your screen is shared. You can stop anytime."
- Button: **Continue** → Step 2

### Step 2: Choose what to share
- Button: **Start Screen Share**
- Browser prompts for screen/window/tab via `getDisplayMedia`
- After permission:
  - Session code generated and shown
  - QR code displayed
  - "Share this code with your advisor"
- Auto-advance to Step 3

### Step 3: Sharing live
- Status: "● Sharing live"
- Preview of shared screen (or "Sharing active" if not available)
- Session code + Copy button
- Buttons: **Stop sharing**, **Copy session code**
- Peer count: "X advisor(s) connected"
- Troubleshooting section (expandable)

---

## C) Advisor Flow

### Entry options
1. **Landing:** Enter code → Join Session
2. **Direct URL:** `/view?room=SESSION_CODE` or `/view/SESSION_CODE`
3. **Standalone:** `/join` → enter code → Join Session

### Viewer (`/view?room=X`)
- Status badge: "Waiting for client" → "Connected" when stream starts
- Large video area for shared screen
- Controls:
  - **Fullscreen**
  - **Take snapshot**
  - **Connection info** (latency, peer count)
- Error: "Session not found" if code is invalid

---

## Technical Flow (Backend)

```
Client                          Server                         Advisor
  │                                │                                │
  │  WebSocket /ws_serve            │                                │
  │───────────────────────────────►│                                │
  │  newRoom (RoomID)               │                                │
  │◄──────────────────────────────│                                │
  │                                │   Advisor: /ws_connect?room=X   │
  │                                │◄───────────────────────────────│
  │  newSession (SessionID)         │  newSession                    │
  │◄──────────────────────────────│───────────────────────────────►│
  │                                │                                │
  │  WebRTC Offer/Answer + ICE      │  (signaling only)              │
  │◄───────────────────────────────────────────────────────────────►│
  │                                │                                │
  │  Direct P2P media stream        │                                │
  │◄═══════════════════════════════════════════════════════════════►│
```

---

## Routes Reference

| Path | Purpose |
|------|---------|
| `/` | Landing — choose share or join |
| `/share` | Client 3-step share wizard |
| `/join` | Advisor session code entry |
| `/view?room=CODE` | Advisor viewer |
| `/view/CODE` | Same as above (path style) |
