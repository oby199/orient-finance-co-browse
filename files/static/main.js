"use strict";

/* Orient Finance Co-Browse — Main Application */

const CONFIG = window.OrientFinanceConfig || {
  BRAND_NAME: "Orient Finance Broker",
  PRODUCT_NAME: "Orient Finance Co-Browse",
  TAGLINE: "Secure screen sharing with your advisor",
};

const iceConfig = {
  iceServers: [{ urls: ["stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302"] }],
  iceCandidatePoolSize: 10,
};

const displayMediaOption = {
  video: { height: 720, frameRate: 30 },
  audio: true,
};

let AppState = {
  roomID: null,
  sessionID: null,
  socket: null,
  mediaStream: null,
  pc: null,
  pcs: {},
  dataChannel: null,
  dataChannels: {},
  pings: {},
  pingHistories: {},
  pingIntervals: {},
  status: { numConn: 0, peers: [] },
  qrcodeObj: null,
};

function getBaseUrl() {
  return `${window.location.protocol}//${window.location.host}`;
}

function getWebsocketUrl() {
  return window.location.protocol === "https:" ? `wss://${window.location.host}` : `ws://${window.location.host}`;
}

function getJoinUrl(roomID) {
  return `${getBaseUrl()}/view?room=${encodeURIComponent(roomID)}`;
}

function avg(arr) {
  return arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length) | 0 : 0;
}

function isMobileOrUnsupported() {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod|Android/i.test(ua) || (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia);
}

// ——— Routing ———

function showView(viewId) {
  document.querySelectorAll(".view").forEach((v) => v.classList.add("view-hidden"));
  const el = document.getElementById(viewId);
  if (el) el.classList.remove("view-hidden");
}

function route() {
  document.getElementById("footer-brand").textContent = CONFIG.BRAND_NAME;

  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  let room = params.get("room") || params.get("id");
  const viewMatch = path.match(/^\/view\/(.+)$/);
  if (!room && viewMatch) room = decodeURIComponent(viewMatch[1]);

  if (path === "/share" || path.startsWith("/share")) {
    showView("view-share");
    initShareView();
    return;
  }
  if (path === "/join" || path.startsWith("/join")) {
    showView("view-join");
    initJoinView();
    return;
  }
  if ((path === "/view" || path.startsWith("/view/") || path === "/") && room) {
    showView("view-viewer");
    initViewerView(room.replace(/^#/, ""));
    return;
  }
  showView("view-landing");
  initLandingView();
}

// ——— Landing ———

function initLandingView() {
  document.getElementById("tagline").textContent = CONFIG.TAGLINE;

  document.getElementById("join-form-landing").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = document.getElementById("input-session-code-landing");
    const errEl = document.getElementById("join-landing-error");
    const code = (input.value || "").trim().replace(/^#/, "");
    if (!code) {
      errEl.textContent = "Please enter a session code.";
      return;
    }
    errEl.textContent = "";
    window.location.href = `/view?room=${encodeURIComponent(code)}`;
  });
}

// ——— Share Wizard ———

function initShareView() {
  showShareError("");
  document.getElementById("share-step-1").classList.remove("wizard-step-hidden");
  document.getElementById("share-step-2").classList.add("wizard-step-hidden");
  document.getElementById("share-step-3").classList.add("wizard-step-hidden");
  document.querySelectorAll(".step-indicator").forEach((s, i) => {
    s.removeAttribute("aria-current");
    s.classList.toggle("active", i === 0);
  });

  document.getElementById("btn-step1-continue").onclick = () => goToShareStep(2);
  document.getElementById("btn-start-screen-share").onclick = () => startScreenShare();
  document.getElementById("btn-copy-code").onclick = () => copyCode();
  document.getElementById("btn-copy-code-live").onclick = () => copyCode();
  document.getElementById("btn-stop-sharing").onclick = () => leaveRoom();

  if (isMobileOrUnsupported()) {
    showShareError("Screen sharing may not be supported on this device. Try Chrome or Edge on desktop.");
  }
}

function goToShareStep(step) {
  document.querySelectorAll(".wizard-step").forEach((s) => s.classList.add("wizard-step-hidden"));
  document.querySelectorAll(".step-indicator").forEach((s, i) => {
    s.removeAttribute("aria-current");
    s.classList.toggle("active", i === step - 1);
    if (i === step - 1) s.setAttribute("aria-current", "step");
  });

  const stepEl = document.getElementById(`share-step-${step}`);
  if (stepEl) stepEl.classList.remove("wizard-step-hidden");
}

function showShareError(msg) {
  const el = document.getElementById("share-error");
  if (msg) {
    el.textContent = msg;
    el.classList.remove("error-hidden");
  } else {
    el.textContent = "";
    el.classList.add("error-hidden");
  }
}

function copyCode() {
  const code = AppState.roomID;
  if (!code) return;
  navigator.clipboard
    .writeText(code)
    .then(() => {
      const btn = document.getElementById("btn-copy-code") || document.getElementById("btn-copy-code-live");
      if (btn) {
        const orig = btn.textContent;
        btn.textContent = "Copied!";
        setTimeout(() => (btn.textContent = orig), 1500);
      }
    })
    .catch(() => showShareError("Could not copy. Please copy the code manually."));
}

async function startScreenShare() {
  showShareError("");

  try {
    AppState.mediaStream = await navigator.mediaDevices.getDisplayMedia(displayMediaOption);
  } catch (err) {
    const msg =
      err.name === "NotAllowedError"
        ? "Screen sharing was denied. Please allow access when prompted."
        : "Screen sharing is not supported or was cancelled.";
    showShareError(msg);
    return;
  }

  AppState.pcs = {};
  AppState.dataChannels = {};
  AppState.pings = {};
  AppState.pingHistories = {};
  AppState.pingIntervals = {};
  AppState.status = { numConn: 0, peers: [] };

  const pcOption = JSON.parse(JSON.stringify(iceConfig));

  AppState.socket = new WebSocket(getWebsocketUrl() + "/ws/serve");
  AppState.socket.onerror = () => {
    showShareError("Connection error. Please try again.");
  };
  AppState.socket.onmessage = async (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.Type === "beat") return;
      if (data.Type === "newRoom") {
        AppState.roomID = data.Value;
        onShareRoomReady(data.Value, displayMediaOption, pcOption);
      } else if (data.Type === "newSession") {
        await handleNewSessionStream(data.SessionID, pcOption);
      } else if (data.Type === "addCalleeIceCandidate") {
        await addCalleeIceCandidate(data.SessionID, JSON.parse(data.Value));
      } else if (data.Type === "gotAnswer") {
        await gotAnswer(data.SessionID, JSON.parse(data.Value));
      }
    } catch (err) {
      console.error(err);
    }
  };
}

function onShareRoomReady(roomID, displayMediaOption, pcOption) {
  goToShareStep(2);
  document.getElementById("share-step2-code").classList.remove("share-code-hidden");
  document.getElementById("display-session-code").textContent = roomID;
  document.getElementById("btn-start-screen-share").style.display = "none";

  const joinUrl = getJoinUrl(roomID);
  const container = document.getElementById("qrcode-container");
  container.innerHTML = "";
  if (typeof QRCode !== "undefined") {
    AppState.qrcodeObj = new QRCode(container, { text: joinUrl, width: 150, height: 150 });
  }

  const liveCodeEl = document.getElementById("display-session-code-live");
  if (liveCodeEl) liveCodeEl.textContent = roomID;

  goToShareStep(3);

  const video = document.getElementById("preview-video");
  const noPreview = document.getElementById("share-no-preview");
  if (AppState.mediaStream) {
    video.srcObject = AppState.mediaStream;
    video.style.display = "block";
    noPreview.style.display = "none";
  } else {
    video.style.display = "none";
    noPreview.style.display = "flex";
  }

  startStreamWithTracks(displayMediaOption, pcOption);
}

async function startStreamWithTracks(displayMediaOption, pcOption) {
  updateSharePeerCount();
}

async function handleNewSessionStream(sessionID, pcOption) {
  AppState.pcs[sessionID] = new RTCPeerConnection(pcOption);
  const pc = AppState.pcs[sessionID];

  pc.onicecandidate = (e) => {
    if (!e.candidate) return;
    AppState.socket.send(JSON.stringify({ Type: "addCallerIceCandidate", SessionID: sessionID, Value: JSON.stringify(e.candidate) }));
  };
  pc.oniceconnectionstatechange = () => {
    if (pc.iceConnectionState === "disconnected") {
      pc.close();
      delete AppState.pcs[sessionID];
      delete AppState.dataChannels[sessionID];
      delete AppState.pings[sessionID];
      delete AppState.pingHistories[sessionID];
      updateSharePeerCount();
    }
  };

  AppState.dataChannels[sessionID] = pc.createDataChannel("ping");
  AppState.dataChannels[sessionID].addEventListener("open", () => {
    AppState.pingHistories[sessionID] = [];
    AppState.pingIntervals[sessionID] = setInterval(() => {
      const now = Date.now();
      AppState.dataChannels[sessionID].send("ping " + now);
      AppState.dataChannels[sessionID].send("status " + JSON.stringify(AppState.status));
    }, 5000);
  });
  AppState.dataChannels[sessionID].addEventListener("message", (e) => {
    if (e.data.startsWith("ping")) AppState.dataChannels[sessionID].send("pong" + e.data.slice(4));
    else if (e.data.startsWith("pong")) {
      const then = parseInt(e.data.slice(4), 10);
      if (!isNaN(then)) {
        AppState.pingHistories[sessionID].push(Date.now() - then);
        if (AppState.pingHistories[sessionID].length > 3) AppState.pingHistories[sessionID].shift();
        AppState.pings[sessionID] = avg(AppState.pingHistories[sessionID]);
        updateSharePeerCount();
      }
    }
  });

  AppState.mediaStream.getTracks().forEach((track) => pc.addTrack(track, AppState.mediaStream));

  const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
  await pc.setLocalDescription(offer);
  AppState.socket.send(JSON.stringify({ Type: "gotOffer", SessionID: sessionID, Value: JSON.stringify(offer) }));

  AppState.status.peers = Object.keys(AppState.pcs).map((s) => s.split("$")[1]);
  AppState.status.numConn = AppState.status.peers.length;
  updateSharePeerCount();
}

async function addCalleeIceCandidate(sessionID, v) {
  if (AppState.pcs[sessionID]) return AppState.pcs[sessionID].addIceCandidate(v);
}

async function gotAnswer(sessionID, v) {
  if (AppState.pcs[sessionID]) return AppState.pcs[sessionID].setRemoteDescription(new RTCSessionDescription(v));
}

function updateSharePeerCount() {
  const peers = Object.keys(AppState.pcs).map((s) => s.split("$")[1]);
  AppState.status.numConn = peers.length;
  const el = document.getElementById("share-peer-count");
  if (el) el.textContent = peers.length;
}

// ——— Join ———

function initJoinView() {
  document.getElementById("join-error").classList.add("error-hidden");
  document.getElementById("join-form-page").addEventListener("submit", (e) => {
    e.preventDefault();
    const code = document.getElementById("input-session-code-join").value.trim().replace(/^#/, "");
    if (!code) return;
    window.location.href = `/view?room=${encodeURIComponent(code)}`;
  });
}

// ——— Viewer ———

function initViewerView(roomID) {
  AppState.roomID = roomID;
  AppState.sessionID = null;
  AppState.mediaStream = new MediaStream();
  AppState.status = { numConn: 0, peers: [] };

  const video = document.getElementById("main-video");
  const placeholder = document.getElementById("viewer-placeholder");
  video.srcObject = AppState.mediaStream;
  placeholder.classList.remove("hidden");

  const statusEl = document.getElementById("viewer-status");
  const latencyEl = document.getElementById("info-latency");
  const peersEl = document.getElementById("info-peers");

  AppState.socket = new WebSocket(getWebsocketUrl() + "/ws/connect?room=" + encodeURIComponent(roomID));

  AppState.socket.onerror = () => {
    showViewerError("Connection error. Please check the session code and try again.");
  };

  AppState.socket.onmessage = async (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.Type === "beat") return;
      if (data.Type === "roomNotFound") {
        showViewerError("Session not found. Please check the code or ask your client to start sharing.");
        return;
      }
      if (data.Type === "roomClosed") {
        showViewerError("Session has ended.");
        return;
      }
      if (data.Type === "newSession") {
        await handleNewSessionJoin(data.SessionID, video, placeholder, statusEl, latencyEl, peersEl);
      } else if (data.Type === "addCallerIceCandidate") {
        await addCallerIceCandidate(data.SessionID, JSON.parse(data.Value), video, placeholder, statusEl);
      } else if (data.Type === "gotOffer") {
        await gotOffer(data.SessionID, JSON.parse(data.Value), video, placeholder, statusEl);
      }
    } catch (err) {
      console.error(err);
    }
  };

  document.getElementById("btn-fullscreen").onclick = () => toggleFullscreen(video);
  document.getElementById("btn-snapshot").onclick = () => takeSnapshot(video);
}

function showViewerError(msg) {
  const el = document.getElementById("viewer-error");
  el.textContent = msg;
  el.classList.remove("error-hidden");
}

async function handleNewSessionJoin(sessionID, video, placeholder, statusEl, latencyEl, peersEl) {
  AppState.sessionID = sessionID;
  AppState.pc = new RTCPeerConnection(iceConfig);

  AppState.pc.onicecandidate = (e) => {
    if (!e.candidate) return;
    AppState.socket.send(JSON.stringify({ Type: "addCalleeIceCandidate", SessionID: sessionID, Value: JSON.stringify(e.candidate) }));
  };
  AppState.pc.oniceconnectionstatechange = () => {
    if (AppState.pc.iceConnectionState === "disconnected") {
      AppState.pc.close();
      AppState.pc = null;
      if (statusEl) statusEl.textContent = "Disconnected";
      if (statusEl) statusEl.className = "status-badge status-waiting";
    }
  };
  AppState.pc.ontrack = (e) => {
    AppState.mediaStream.addTrack(e.track);
    video.srcObject = AppState.mediaStream;
    placeholder.classList.add("hidden");
    if (statusEl) {
      statusEl.textContent = "Connected";
      statusEl.className = "status-badge status-connected";
    }
    video.play().catch(() => {});
  };

  AppState.pc.addEventListener("datachannel", (e) => {
    AppState.dataChannel = e.channel;
    AppState.dataChannel.addEventListener("open", () => {
      AppState.pingHistory = [];
      AppState.pingInterval = setInterval(() => AppState.dataChannel.send("ping " + Date.now()), 1000);
    });
    AppState.dataChannel.addEventListener("close", () => clearInterval(AppState.pingInterval));
    AppState.dataChannel.addEventListener("message", (e) => {
      if (e.data.startsWith("ping")) AppState.dataChannel.send("pong" + e.data.slice(4));
      else if (e.data.startsWith("pong")) {
        const then = parseInt(e.data.slice(4), 10);
        if (!isNaN(then)) {
          AppState.pingHistory.push(Date.now() - then);
          if (AppState.pingHistory.length > 3) AppState.pingHistory.shift();
          const ping = avg(AppState.pingHistory);
          if (latencyEl) latencyEl.textContent = ping + " ms";
        }
      } else if (e.data.startsWith("status")) {
        AppState.status = JSON.parse(e.data.slice(7));
        if (peersEl) peersEl.textContent = AppState.status.numConn || 0;
      }
    });
  });
}

async function addCallerIceCandidate(sID, v, video, placeholder, statusEl) {
  if (AppState.sessionID !== sID || !AppState.pc) return;
  return AppState.pc.addIceCandidate(v);
}

async function gotOffer(sID, v, video, placeholder, statusEl) {
  if (AppState.sessionID !== sID || !AppState.pc) return;
  await AppState.pc.setRemoteDescription(new RTCSessionDescription(v));
  const answer = await AppState.pc.createAnswer();
  await AppState.pc.setLocalDescription(answer);
  AppState.socket.send(JSON.stringify({ Type: "gotAnswer", SessionID: AppState.sessionID, Value: JSON.stringify(answer) }));
}

function toggleFullscreen(video) {
  if (!document.fullscreenElement) {
    video.requestFullscreen ? video.requestFullscreen() : video.webkitRequestFullScreen?.();
  } else {
    document.exitFullscreen?.();
  }
}

function takeSnapshot(video) {
  if (!video.srcObject || !video.srcObject.getVideoTracks().length) return;
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0);
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = "orient-co-browse-snapshot-" + Date.now() + ".png";
  a.click();
}

// ——— Leave ———

function leaveRoom() {
  if (AppState.mediaStream) {
    AppState.mediaStream.getTracks().forEach((t) => t.stop());
    AppState.mediaStream = null;
  }
  if (AppState.socket) {
    AppState.socket.close();
    AppState.socket = null;
  }
  Object.values(AppState.pcs || {}).forEach((pc) => pc.close());
  if (AppState.pc) AppState.pc.close();
  Object.values(AppState.pingIntervals || {}).forEach(clearInterval);
  window.location.href = getBaseUrl();
}

// ——— Init ———

window.addEventListener("popstate", route);
window.addEventListener("load", route);
