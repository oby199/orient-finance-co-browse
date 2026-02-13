"use strict";

function getIceConfig() {
  const cfg = window.OrientFinanceConfig || {};
  const servers = [];
  const stunUrls = cfg.STUN_URLS || ["stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302"];
  servers.push({ urls: stunUrls });
  if (cfg.TURN_URLS && cfg.TURN_URLS.length) {
    servers.push({
      urls: cfg.TURN_URLS,
      username: cfg.TURN_USER || "",
      credential: cfg.TURN_PASS || "",
    });
  }
  return { iceServers: servers, iceCandidatePoolSize: 10 };
}

const iceConfig = getIceConfig();

const displayMediaOptions = {
  noConstraint: { video: true, audio: true },
  v720p30: { video: { height: 720, frameRate: 30 }, audio: true },
  v480p60: { video: { height: 480, frameRate: 60 }, audio: true },
};

const rtpPeerConnectionOptions = {
  stunGoogle: (() => {
    const c = getIceConfig();
    return { iceServers: c.iceServers, iceCandidatePoolSize: 10 };
  })(),
  noStun: { iceServers: [] },
};

const preset = {
  balanced: { displayMediaOption: displayMediaOptions.v720p30, rtpPeerConnectionOption: rtpPeerConnectionOptions.stunGoogle },
  performance: { displayMediaOption: displayMediaOptions.v480p60, rtpPeerConnectionOption: rtpPeerConnectionOptions.stunGoogle },
  highQuality: { displayMediaOption: displayMediaOptions.noConstraint, rtpPeerConnectionOption: rtpPeerConnectionOptions.stunGoogle },
  balancedLanOnly: { displayMediaOption: displayMediaOptions.v720p30, rtpPeerConnectionOption: rtpPeerConnectionOptions.noStun },
  performanceLanOnly: { displayMediaOption: displayMediaOptions.v480p60, rtpPeerConnectionOption: rtpPeerConnectionOptions.noStun },
  highQualityLanOnly: { displayMediaOption: displayMediaOptions.noConstraint, rtpPeerConnectionOption: rtpPeerConnectionOptions.noStun },
};

const LaplaceVar = { ui: {}, lastApiError: "", pingIntervals: {}, _overlayInterval: null };

function updateDebugPanel(route, auth, err) {
  if (!isDebugMode()) return;
  const el = document.getElementById("debug-panel");
  if (!el) return;
  el.style.display = "block";
  const routeEl = document.getElementById("debug-route");
  const authEl = document.getElementById("debug-auth");
  const errEl = document.getElementById("debug-last-error");
  if (routeEl) routeEl.textContent = route || window.location.pathname + window.location.search;
  if (authEl) authEl.textContent = auth != null ? String(auth) : "-";
  if (errEl) errEl.textContent = err || LaplaceVar.lastApiError || "-";
}

function showErrorPanel(msg, onRetry) {
  LaplaceVar.lastApiError = msg || "";
  updateDebugPanel(null, null, msg);
  const panel = document.getElementById("error-panel");
  const msgEl = document.getElementById("error-panel-message");
  const retryBtn = document.getElementById("error-panel-retry");
  if (!panel || !msgEl) return;
  msgEl.textContent = msg || "Something went wrong. Please try again.";
  panel.style.display = "block";
  if (retryBtn) {
    retryBtn.onclick = () => {
      panel.style.display = "none";
      if (onRetry) onRetry();
    };
  }
}

function hideErrorPanel() {
  const panel = document.getElementById("error-panel");
  if (panel) panel.style.display = "none";
}

function showClientToast(msg) {
  const el = document.getElementById("client-toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("visible");
  setTimeout(() => el.classList.remove("visible"), 5000);
}

function avg(arr) {
  return arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length) | 0 : 0;
}

function print(s) {
  LaplaceVar.ui.output.innerHTML += s + "\n";
}

function getBaseUrl() {
  return `${window.location.protocol}//${window.location.host}`;
}

function getStreamUrl() {
  return `${getBaseUrl()}/?stream=1`;
}

function getJoinUrl(roomID) {
  return `${getBaseUrl()}/connect?token=${encodeURIComponent(roomID)}`;
}

function isClientFlow() {
  return !!LaplaceVar.claimToken;
}

function isDebugMode() {
  return new URLSearchParams(window.location.search).get("debug") === "1";
}

function updateRoomUI() {
  LaplaceVar.ui.panel.style.display = "none";
  LaplaceVar.ui.videoContainer.style.display = "block";

  if (isClientFlow()) {
    LaplaceVar.ui.streamPageUI.style.display = "none";
  } else {
    LaplaceVar.ui.streamPageUI.style.display = "block";
  }

  if (LaplaceVar.roomID) {
    const joinUrl = getJoinUrl(LaplaceVar.roomID);
    if (LaplaceVar.ui.qrcodeObj) LaplaceVar.ui.qrcodeObj.clear();
    LaplaceVar.ui.qrcodeObj = new QRCode(LaplaceVar.ui.qrcode, { text: joinUrl, width: 128, height: 128 });
    LaplaceVar.ui.roomText.innerHTML = "RoomID: #" + LaplaceVar.roomID;
    LaplaceVar.ui.joinLinkText.innerHTML = joinUrl;
    LaplaceVar.ui.joinLinkText.href = joinUrl;
  }
}

function initUI() {
  LaplaceVar.ui.btnStream = document.getElementById("btnStream");
  LaplaceVar.ui.btnStartStream = document.getElementById("btnStartStream");
  LaplaceVar.ui.inputRoomID = document.getElementById("inputRoomID");
  LaplaceVar.ui.inputDisplayMediaOption = document.getElementById("inputDisplayMediaOption");
  LaplaceVar.ui.inputRTPPeerConnectionOption = document.getElementById("inputRTPPeerConnectionOption");
  LaplaceVar.ui.joinLinkText = document.getElementById("join-link");
  LaplaceVar.ui.joinForm = document.getElementById("joinForm");
  LaplaceVar.ui.output = document.getElementById("output");
  LaplaceVar.ui.qrcode = document.getElementById("qrcode");
  LaplaceVar.ui.panel = document.getElementById("panel");
  LaplaceVar.ui.roomText = document.getElementById("room-text");
  LaplaceVar.ui.statusNumConn = document.getElementById("statusNumConn");
  LaplaceVar.ui.statusPeers = document.getElementById("statusPeers");
  LaplaceVar.ui.statusPing = document.getElementById("statusPing");
  LaplaceVar.ui.selectOptionPreset = document.getElementById("inputOptionPreset");
  LaplaceVar.ui.streamPageUI = document.getElementById("stream-page-ui");
  LaplaceVar.ui.streamServePageUI = document.getElementById("stream-serve-page-ui");
  LaplaceVar.ui.streamSimpleUI = document.getElementById("stream-simple-ui");
  LaplaceVar.ui.streamStep2 = document.getElementById("stream-step2");
  LaplaceVar.ui.streamStep3 = document.getElementById("stream-step3");
  LaplaceVar.ui.btnStartShareSimple = document.getElementById("btnStartShareSimple");
  LaplaceVar.ui.btnStopShare = document.getElementById("btnStopShare");
  LaplaceVar.ui.streamCompatMsg = document.getElementById("stream-compat-msg");
  LaplaceVar.ui.streamDebugInfo = document.getElementById("stream-debug-info");
  LaplaceVar.ui.streamConnectedMsg = document.getElementById("streamConnectedMsg");
  LaplaceVar.ui.video = document.getElementById("mainVideo");
  LaplaceVar.ui.videoContainer = document.getElementById("video-container");

  LaplaceVar.ui.joinForm.onsubmit = async (e) => {
    e.preventDefault();
    LaplaceVar.roomID = LaplaceVar.ui.inputRoomID.value;
    window.history.pushState("", "", getJoinUrl(LaplaceVar.roomID));
    await doJoin(LaplaceVar.roomID);
  };
  LaplaceVar.ui.btnStream.onclick = async () => {
    LaplaceVar.claimToken = null;
    window.history.pushState("", "", getStreamUrl());
    await doStream();
  };
  document.getElementById("btnCreateSession")?.addEventListener("click", async () => {
    const btn = document.getElementById("btnCreateSession");
    const area = document.getElementById("agent-link-area");
    const input = document.getElementById("agentLink");
    const errEl = document.getElementById("agent-create-error");
    const codeEl = document.getElementById("agentSessionCode");
    const qrEl = document.getElementById("agent-qr");
    if (!btn || !area || !input) return;
    if (errEl) { errEl.style.display = "none"; errEl.textContent = ""; }
    btn.disabled = true;
    btn.textContent = "Creating…";

    const apiUrl = (window.location.origin || getBaseUrl()) + "/api/session/create";

    const handleError = (msg, err, showRetry) => {
      console.error("[Create Session]", msg, err);
      LaplaceVar.lastApiError = msg || "";
      updateDebugPanel(null, null, msg);
      if (errEl) {
        errEl.textContent = msg;
        errEl.style.display = "block";
      }
      btn.disabled = false;
      btn.textContent = "Create Session";
      if (showRetry) showErrorPanel(msg || "Failed to create session. Please try again.", () => document.getElementById("btnCreateSession")?.click());
    };

    try {
      let res = await fetch(apiUrl, { method: "POST" }).catch((e) => null);
      if (!res) {
        res = await fetch(apiUrl, { method: "GET" }).catch((e) => null);
      }
      if (!res) {
        handleError("Cannot reach server. Is it running? Check console for details.", new Error("fetch failed"), true);
        return;
      }
      const text = await res.text();
      if (!res.ok) {
        handleError("Server error (" + res.status + "). " + (text || res.statusText), new Error(text), true);
        return;
      }
      if (text.trimStart().startsWith("<")) {
        handleError("Server returned HTML instead of JSON. The API route may not be registered correctly. Check that the Go server is running.", new Error(text.slice(0, 100)), true);
        return;
      }
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        handleError("Invalid response from server. " + (e?.message || ""), e);
        return;
      }
      const token = data?.token || data?.roomId || data?.sessionId;
      const shareUrl = data?.connectUrl || ((window.location.origin || getBaseUrl()) + "/connect?token=" + encodeURIComponent(token));
      const code = data?.code || data?.sessionCode || token;
      if (!token) {
        handleError("No session token returned. Check server.", new Error(JSON.stringify(data)), true);
        return;
      }
      input.value = shareUrl;
      if (codeEl) codeEl.textContent = code;
      if (qrEl) {
        qrEl.innerHTML = "";
        if (typeof QRCode !== "undefined") new QRCode(qrEl, { text: shareUrl, width: 128, height: 128 });
      }
      const viewLink = document.getElementById("agent-view-link");
      if (viewLink) {
        viewLink.href = "/agent/session/" + encodeURIComponent(token);
        viewLink.target = "_blank";
        viewLink.style.display = "inline-block";
      }
      area.style.display = "block";
    } catch (err) {
      handleError("Failed to create session. " + (err?.message || "Unknown error."), err, true);
      return;
    }
    btn.disabled = false;
    btn.textContent = "Create Session";
  });
  document.getElementById("btnCopyLink")?.addEventListener("click", () => {
    const input = document.getElementById("agentLink");
    if (!input?.value) return;
    navigator.clipboard.writeText(input.value).then(() => {
      const btn = document.getElementById("btnCopyLink");
      if (btn) { btn.textContent = "Copied!"; setTimeout(() => btn.textContent = "Copy", 2000); }
    });
  });
  document.getElementById("btnCopyOtp")?.addEventListener("click", () => {
    const el = document.getElementById("agentSessionCode");
    if (!el?.textContent) return;
    navigator.clipboard.writeText(el.textContent).then(() => {
      const btn = document.getElementById("btnCopyOtp");
      if (btn) { btn.textContent = "Copied!"; setTimeout(() => btn.textContent = "Copy code", 2000); }
    });
  });
  LaplaceVar.ui.btnStartStream.onclick = () => {
    LaplaceVar.ui.streamServePageUI.style.display = "none";
    const mediaOption = JSON.parse(LaplaceVar.ui.inputDisplayMediaOption.value);
    const pcOption = JSON.parse(LaplaceVar.ui.inputRTPPeerConnectionOption.value);
    return startStream(mediaOption, pcOption);
  };

  LaplaceVar.ui.btnStartShareSimple?.addEventListener("click", () => startStreamSimple());
  LaplaceVar.ui.btnStopShare?.addEventListener("click", leaveRoom);
  document.getElementById("btnNeedHelp")?.addEventListener("click", () => {
    document.getElementById("stream-help-sheet")?.classList.add("open");
  });
  document.getElementById("btnCloseHelp")?.addEventListener("click", () => {
    document.getElementById("stream-help-sheet")?.classList.remove("open");
  });
  document.querySelector(".stream-help-backdrop")?.addEventListener("click", () => {
    document.getElementById("stream-help-sheet")?.classList.remove("open");
  });

  for (const presetName of Object.keys(preset)) {
    const optionElement = document.createElement("option");
    optionElement.appendChild(document.createTextNode(presetName));
    optionElement.value = presetName;
    LaplaceVar.ui.selectOptionPreset.appendChild(optionElement);
  }
  LaplaceVar.ui.selectOptionPreset.onchange = () => {
    const v = LaplaceVar.ui.selectOptionPreset.value;
    if (preset[v] != null) {
      LaplaceVar.ui.inputDisplayMediaOption.value = JSON.stringify(preset[v].displayMediaOption, null, 1);
      LaplaceVar.ui.inputRTPPeerConnectionOption.value = JSON.stringify(preset[v].rtpPeerConnectionOption, null, 1);
    }
  };
  const defaultPresetValue = Object.keys(preset)[0];
  LaplaceVar.ui.inputDisplayMediaOption.value = JSON.stringify(preset[defaultPresetValue].displayMediaOption, null, 1);
  LaplaceVar.ui.inputRTPPeerConnectionOption.value = JSON.stringify(preset[defaultPresetValue].rtpPeerConnectionOption, null, 1);

  print("Logs:");
  print("[+] Page loaded");
}

function updateStatusUIStream() {
  LaplaceVar.status.peers = Object.keys(LaplaceVar.pcs).map((s) => s.split("$")[1]);
  LaplaceVar.status.numConn = LaplaceVar.status.peers.length;
  LaplaceVar.ui.statusPeers.innerHTML = LaplaceVar.status.peers.map((s) => `${s} (${LaplaceVar.pings[LaplaceVar.roomID + "$" + s]} ms)`).join(", ");
  LaplaceVar.ui.statusNumConn.innerHTML = LaplaceVar.status.numConn;
}

function updateStatusUIJoin() {
  LaplaceVar.ui.statusNumConn.innerHTML = LaplaceVar.status.numConn;
  LaplaceVar.ui.statusPeers.innerHTML = LaplaceVar.status.peers.map((s) => (LaplaceVar.sessionID.endsWith(s) ? s + " (you)" : s)).join(", ");
}

function getWebsocketUrl() {
  return window.location.protocol === "https:" ? `wss://${window.location.host}` : `ws://${window.location.host}`;
}

async function newRoom(rID) {
  print("[+] Get room ID: " + rID);
  LaplaceVar.roomID = rID;
  updateRoomUI();
}

async function newSessionStream(sessionID, pcOption) {
  print("[+] New session: " + sessionID);
  LaplaceVar.pcs[sessionID] = new RTCPeerConnection(pcOption);
  LaplaceVar.pcs[sessionID].onicecandidate = (e) => {
    if (!e.candidate) return;
    LaplaceVar.socket.send(JSON.stringify({ Type: "addCallerIceCandidate", SessionID: sessionID, Value: JSON.stringify(e.candidate) }));
  };
  LaplaceVar.pcs[sessionID].oniceconnectionstatechange = () => {
    if (LaplaceVar.pcs[sessionID].iceConnectionState === "disconnected") {
      if (LaplaceVar.pingIntervals && LaplaceVar.pingIntervals[sessionID]) {
        clearInterval(LaplaceVar.pingIntervals[sessionID]);
        delete LaplaceVar.pingIntervals[sessionID];
      }
      LaplaceVar.pcs[sessionID].close();
      delete LaplaceVar.pcs[sessionID];
      delete LaplaceVar.dataChannels[sessionID];
      delete LaplaceVar.pings[sessionID];
      delete LaplaceVar.pingHistories[sessionID];
      updateStatusUIStream();
    }
  };
  updateStatusUIStream();
  if (LaplaceVar.ui.streamConnectedMsg) LaplaceVar.ui.streamConnectedMsg.textContent = "Connected to advisor";
  LaplaceVar.dataChannels[sessionID] = LaplaceVar.pcs[sessionID].createDataChannel("ping");
  LaplaceVar.dataChannels[sessionID].addEventListener("open", () => {
    LaplaceVar.pingHistories[sessionID] = [];
    LaplaceVar.pingIntervals[sessionID] = window.setInterval(() => {
      LaplaceVar.dataChannels[sessionID].send("ping " + Date.now());
      LaplaceVar.dataChannels[sessionID].send("status " + JSON.stringify(LaplaceVar.status));
    }, 5000);
  });
  LaplaceVar.dataChannels[sessionID].addEventListener("message", (e) => {
    if (e.data.startsWith("ping")) LaplaceVar.dataChannels[sessionID].send("pong" + e.data.slice(4));
    else if (e.data.startsWith("assistant:")) {
      try {
        const cmd = JSON.parse(e.data.slice(10));
        if (cmd.type === "requestClick" && cmd.message) showClientToast(cmd.message);
      } catch (_) {}
    } else if (e.data.startsWith("pong")) {
      const then = parseInt(e.data.slice(4), 10);
      if (!isNaN(then)) {
        LaplaceVar.pingHistories[sessionID].push(Date.now() - then);
        if (LaplaceVar.pingHistories[sessionID].length > 3) LaplaceVar.pingHistories[sessionID].shift();
        LaplaceVar.pings[sessionID] = avg(LaplaceVar.pingHistories[sessionID]);
        updateStatusUIStream();
      }
    } else if (e.data.startsWith("assistant:")) {
      try {
        const cmd = JSON.parse(e.data.slice(10));
        if (cmd.type === "requestClick" && cmd.message) showClientToast(cmd.message);
      } catch (_) {}
    }
  });

  LaplaceVar.mediaStream.getTracks().forEach((track) => LaplaceVar.pcs[sessionID].addTrack(track, LaplaceVar.mediaStream));

  const offer = await LaplaceVar.pcs[sessionID].createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
  await LaplaceVar.pcs[sessionID].setLocalDescription(offer);
  LaplaceVar.socket.send(JSON.stringify({ Type: "gotOffer", SessionID: sessionID, Value: JSON.stringify(offer) }));
}

async function addCalleeIceCandidate(sessionID, v) {
  return LaplaceVar.pcs[sessionID].addIceCandidate(v);
}

async function gotAnswer(sessionID, v) {
  return LaplaceVar.pcs[sessionID].setRemoteDescription(new RTCSessionDescription(v));
}

async function doStream() {
  LaplaceVar.ui.panel.style.display = "none";

  if (isClientFlow() && !isDebugMode()) {
    LaplaceVar.ui.streamServePageUI.style.display = "none";
    LaplaceVar.ui.streamSimpleUI.style.display = "flex";
    LaplaceVar.ui.streamStep2.style.display = "block";
    LaplaceVar.ui.streamStep3.style.display = "none";
    LaplaceVar.ui.videoContainer.style.display = "none";
    setTimeout(() => startStreamSimple(), 100);
  } else {
    LaplaceVar.ui.streamSimpleUI.style.display = "none";
    LaplaceVar.ui.streamServePageUI.style.display = "block";
  }
}

const DEFAULT_DISPLAY_MEDIA = { video: { frameRate: 24 }, audio: false };
const DEFAULT_PC_OPTION = (() => {
  const c = getIceConfig();
  return { iceServers: c.iceServers, iceCandidatePoolSize: 10 };
})();

function supportsDisplayMedia() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
}

function isLikelyMobile() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

async function startStreamSimple() {
  const btn = LaplaceVar.ui.btnStartShareSimple;
  const compatMsg = LaplaceVar.ui.streamCompatMsg;
  if (btn) { btn.disabled = true; btn.textContent = "Starting share…"; }
  if (compatMsg) { compatMsg.style.display = "none"; compatMsg.textContent = ""; }
  showClientToast("Starting share…");

  const withAudio = document.getElementById("streamAudioCheck")?.checked || false;
  const displayMediaOption = { video: { frameRate: 24 }, audio: withAudio };
  const pcOption = DEFAULT_PC_OPTION;

  let mediaStream = null;
  if (supportsDisplayMedia()) {
    try {
      mediaStream = await navigator.mediaDevices.getDisplayMedia(displayMediaOption);
    } catch (e) {
      if (e.name === "NotAllowedError") {
        showClientToast("Screen share was cancelled.");
        if (btn) { btn.disabled = false; btn.textContent = "Start sharing"; }
        return;
      }
      if (isLikelyMobile()) {
        if (compatMsg) {
          compatMsg.textContent = "Screen sharing isn't supported on this device. Please use Chrome on Android or a desktop computer (Chrome, Edge, or Safari).";
          compatMsg.style.display = "block";
        }
        if (btn) { btn.disabled = false; btn.textContent = "Start sharing"; }
        return;
      }
      showClientToast("Could not share screen. Please try again.");
      if (btn) { btn.disabled = false; btn.textContent = "Start sharing"; }
      return;
    }
  } else {
    if (compatMsg) {
      compatMsg.textContent = "Screen sharing isn't supported in this browser. Please use Chrome, Edge, or Safari on a desktop or Android.";
      compatMsg.style.display = "block";
    }
    if (btn) { btn.disabled = false; btn.textContent = "Start sharing"; }
    return;
  }

  LaplaceVar.ui.streamStep2.style.display = "none";
  LaplaceVar.ui.streamStep3.style.display = "block";
  LaplaceVar.ui.streamSimpleUI.style.display = "flex";
  LaplaceVar.ui.videoContainer.style.display = "block";
  showClientToast("Connected. Your advisor can now see your screen.");

  LaplaceVar.mediaStream = mediaStream;
  await startStream(displayMediaOption, pcOption);
  if (btn) { btn.disabled = false; btn.textContent = "Start sharing"; }
}

async function startStream(displayMediaOption, pcOption) {
  LaplaceVar.isAdvisor = false;
  LaplaceVar.pcs = {};
  LaplaceVar.dataChannels = {};
  LaplaceVar.pings = {};
  LaplaceVar.pingHistories = {};
  LaplaceVar.pingIntervals = {};
  LaplaceVar.status = { numConn: 0, peers: [] };

  if (LaplaceVar.claimToken) {
    LaplaceVar.roomID = LaplaceVar.claimToken;
  }
  updateRoomUI();

  if (!LaplaceVar.mediaStream) {
    try {
      LaplaceVar.mediaStream = await navigator.mediaDevices.getDisplayMedia(displayMediaOption);
    } catch {
      alert("Streaming from this device is not supported.\n\nGoogle reference: getDisplayMedia");
      leaveRoom();
      return;
    }
  }
  LaplaceVar.ui.video.srcObject = LaplaceVar.mediaStream;
  LaplaceVar.ui.video.muted = true;

  const wsPath = LaplaceVar.claimToken
    ? "/ws/serve?claim=" + encodeURIComponent(LaplaceVar.claimToken)
    : "/ws/serve";
  LaplaceVar.socket = new WebSocket(getWebsocketUrl() + wsPath);
  LaplaceVar.socket.onerror = () => {
    showClientToast("Connection error. Please try again.");
    leaveRoom();
  };
  LaplaceVar.socket.onmessage = async function (e) {
    try {
      const jsonData = JSON.parse(e.data);
      if (jsonData.Type === "newRoom") await newRoom(jsonData.Value);
      else if (jsonData.Type === "newSession") await newSessionStream(jsonData.SessionID, pcOption);
      else if (jsonData.Type === "addCalleeIceCandidate") await addCalleeIceCandidate(jsonData.SessionID, JSON.parse(jsonData.Value));
      else if (jsonData.Type === "gotAnswer") await gotAnswer(jsonData.SessionID, JSON.parse(jsonData.Value));
    } catch (err) {
      console.error(err);
    }
  };

  if (isDebugMode() && LaplaceVar.ui.streamDebugInfo) {
    LaplaceVar.ui.streamDebugInfo.style.display = "block";
    LaplaceVar.ui.streamDebugInfo.textContent = "Room: " + LaplaceVar.roomID + " | WS: " + wsPath;
  }
}

async function newSessionJoin(sID) {
  LaplaceVar.sessionID = sID;
  LaplaceVar.pc = new RTCPeerConnection(iceConfig);
  LaplaceVar.pc.onicecandidate = (e) => {
    if (!e.candidate) return;
    LaplaceVar.socket.send(JSON.stringify({ Type: "addCalleeIceCandidate", SessionID: LaplaceVar.sessionID, Value: JSON.stringify(e.candidate) }));
  };
  LaplaceVar.pc.oniceconnectionstatechange = () => {
    if (LaplaceVar.pc.iceConnectionState === "disconnected") {
      LaplaceVar.pc.close();
      LaplaceVar.pc = null;
    }
  };
  LaplaceVar.pc.ontrack = (e) => {
    LaplaceVar.mediaStream.addTrack(e.track);
    LaplaceVar.ui.video.srcObject = LaplaceVar.mediaStream;
    LaplaceVar.ui.video.play().catch(() => {});
  };
  LaplaceVar.pc.addEventListener("datachannel", (e) => {
    LaplaceVar.dataChannel = e.channel;
    LaplaceVar.dataChannel.addEventListener("open", () => {
      LaplaceVar.pingHistory = [];
      LaplaceVar.pingInterval = setInterval(() => LaplaceVar.dataChannel.send("ping " + Date.now()), 1000);
      initAgentOverlay();
    });
    LaplaceVar.dataChannel.addEventListener("close", () => clearInterval(LaplaceVar.pingInterval));
    LaplaceVar.dataChannel.addEventListener("message", (e) => {
      if (e.data.startsWith("ping")) LaplaceVar.dataChannel.send("pong" + e.data.slice(4));
      else if (e.data.startsWith("pong")) {
        const then = parseInt(e.data.slice(4), 10);
        if (!isNaN(then)) {
          LaplaceVar.pingHistory.push(Date.now() - then);
          if (LaplaceVar.pingHistory.length > 3) LaplaceVar.pingHistory.shift();
          LaplaceVar.ui.statusPing.innerHTML = avg(LaplaceVar.pingHistory) + " ms";
        }
      } else if (e.data.startsWith("status")) {
        LaplaceVar.status = JSON.parse(e.data.slice(7));
        updateStatusUIJoin();
      }
    });
  });
}

async function addCallerIceCandidate(sID, v) {
  if (LaplaceVar.sessionID !== sID) return;
  return LaplaceVar.pc.addIceCandidate(v);
}

async function gotOffer(sID, v) {
  if (LaplaceVar.sessionID !== sID) return;
  await LaplaceVar.pc.setRemoteDescription(new RTCSessionDescription(v));
  const answer = await LaplaceVar.pc.createAnswer();
  await LaplaceVar.pc.setLocalDescription(answer);
  LaplaceVar.socket.send(JSON.stringify({ Type: "gotAnswer", SessionID: LaplaceVar.sessionID, Value: JSON.stringify(answer) }));
}

async function doJoin(roomID) {
  if (!roomID) return alert("roomID is not provided");
  LaplaceVar.roomID = roomID.startsWith("#") ? roomID.slice(1) : roomID;
  LaplaceVar.status = { numConn: 0, peers: [] };
  LaplaceVar.isAdvisor = true;

  updateRoomUI();

  LaplaceVar.mediaStream = new MediaStream();
  LaplaceVar.ui.video.srcObject = LaplaceVar.mediaStream;

  LaplaceVar.socket = new WebSocket(getWebsocketUrl() + "/ws/connect?id=" + LaplaceVar.roomID);
  LaplaceVar.socket.onerror = () => {
    alert("WebSocket error");
    leaveRoom();
  };
  LaplaceVar.socket.onmessage = async function (e) {
    try {
      const jsonData = JSON.parse(e.data);
      if (jsonData.Type === "newSession") await newSessionJoin(jsonData.SessionID);
      else if (jsonData.Type === "addCallerIceCandidate") await addCallerIceCandidate(jsonData.SessionID, JSON.parse(jsonData.Value));
      else if (jsonData.Type === "gotOffer") await gotOffer(jsonData.SessionID, JSON.parse(jsonData.Value));
      else if (jsonData.Type === "roomNotFound") {
        alert("Room not found");
        leaveRoom();
      } else if (jsonData.Type === "roomClosed") alert("Room closed");
    } catch (err) {
      console.error(err);
    }
  };
}

function routeByUrl() {
  const u = new URL(window.location);
  if (u.searchParams.get("id")) return doJoin(u.searchParams.get("id"));
  if (u.searchParams.get("stream")) {
    LaplaceVar.claimToken = u.searchParams.get("room") || null;
    return doStream();
  }
}

function leaveRoom() {
  window.location.href = getBaseUrl();
}

function initAgentOverlay() {
  const wrapper = document.getElementById("video-wrapper");
  const video = document.getElementById("mainVideo");
  const canvas = document.getElementById("agent-overlay");
  const tools = document.getElementById("agent-tools");
  const btnRequest = document.getElementById("btnRequestClick");
  const btnHighlight = document.getElementById("btnHighlight");
  if (!wrapper || !canvas || !LaplaceVar.dataChannel) return;
  if (tools) tools.style.display = "flex";

  const resizeCanvas = () => {
    if (!video || !video.parentElement) return;
    const w = video.offsetWidth || video.clientWidth || 640;
    const h = video.offsetHeight || video.clientHeight || 360;
    if (w > 0 && h > 0) {
      canvas.width = w;
      canvas.height = h;
    }
  };

  video.addEventListener("loadedmetadata", resizeCanvas);
  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();

  let laserOn = false;
  let highlightMode = false;
  let highlightStart = null;
  let lastCursor = { x: 0, y: 0 };
  const ctx = canvas.getContext("2d");
  const highlights = [];
  const HIGHLIGHT_FADE_MS = 5000;

  function drawOverlay(cursorX, cursorY) {
    lastCursor.x = cursorX;
    lastCursor.y = cursorY;
    if (!ctx || canvas.width === 0) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.arc(cursorX, cursorY, 8, 0, Math.PI * 2);
    ctx.fill();
    if (laserOn) {
      ctx.strokeStyle = "#ff0000";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cursorX, cursorY);
      ctx.lineTo(cursorX, 0);
      ctx.stroke();
    }
    const now = Date.now();
    for (let i = highlights.length - 1; i >= 0; i--) {
      const h = highlights[i];
      const age = now - h.t;
      if (age > HIGHLIGHT_FADE_MS) {
        highlights.splice(i, 1);
        continue;
      }
      const alpha = 0.4 * (1 - age / HIGHLIGHT_FADE_MS);
      ctx.strokeStyle = `rgba(255, 200, 0, ${alpha})`;
      ctx.lineWidth = 3;
      ctx.strokeRect(h.x, h.y, h.w, h.h);
    }
  }

  function toCanvasCoords(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height
    };
  }

  wrapper.addEventListener("mousemove", (e) => {
    const { x, y } = toCanvasCoords(e);
    if (highlightStart) return;
    drawOverlay(x, y);
  });

  wrapper.addEventListener("mousedown", (e) => {
    if (!highlightMode || e.button !== 0) return;
    const { x, y } = toCanvasCoords(e);
    highlightStart = { x, y };
  });

  wrapper.addEventListener("mouseup", (e) => {
    if (!highlightStart || e.button !== 0) return;
    const { x, y } = toCanvasCoords(e);
    const w = Math.abs(x - highlightStart.x);
    const h = Math.abs(y - highlightStart.y);
    if (w > 5 && h > 5) {
      highlights.push({
        x: Math.min(highlightStart.x, x),
        y: Math.min(highlightStart.y, y),
        w, h,
        t: Date.now()
      });
    }
    highlightStart = null;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / rect.width * canvas.width;
    const my = (e.clientY - rect.top) / rect.height * canvas.height;
    drawOverlay(mx, my);
  });

  if (LaplaceVar._overlayInterval) clearInterval(LaplaceVar._overlayInterval);
  LaplaceVar._overlayInterval = setInterval(() => {
    if (!ctx || canvas.width === 0) return;
    if (highlights.length > 0) drawOverlay(lastCursor.x, lastCursor.y);
  }, 200);

  document.addEventListener("keydown", (e) => { if (e.key === "l" || e.key === "L") laserOn = true; });
  document.addEventListener("keyup", (e) => { if (e.key === "l" || e.key === "L") laserOn = false; });

  if (btnRequest) btnRequest.onclick = () => {
    const msg = prompt("Message for client:", "Please click here");
    if (msg && LaplaceVar.dataChannel) {
      LaplaceVar.dataChannel.send("assistant:" + JSON.stringify({ type: "requestClick", message: msg }));
    }
  };

  if (btnHighlight) {
    btnHighlight.onclick = () => {
      highlightMode = !highlightMode;
      btnHighlight.classList.toggle("active", highlightMode);
      btnHighlight.textContent = highlightMode ? "Highlight (on)" : "Highlight";
    };
  }
}

(function ensureAuth() {
  const pathname = window.location.pathname || "/";
  const targetLogin = "/agent/login";

  // This script runs ONLY on /stream.html (main.html). /agent/login is served by middleware - never loads this.
  if (pathname === targetLogin || pathname.startsWith(targetLogin + "/")) {
    return;
  }

  // Client flow: stream=1&room - no auth needed, hide Logout
  const u = new URL(window.location.href);
  const stream = u.searchParams.get("stream");
  const room = u.searchParams.get("room");
  if (stream === "1" && room) {
    const logoutEl = document.getElementById("navbar-logout");
    if (logoutEl) logoutEl.style.display = "none";
    updateDebugPanel(window.location.pathname + window.location.search, false, null);
    initUI();
    routeByUrl();
    return;
  }

  let authCheckFired = false;
  (async function runAuthCheckOnce() {
    if (authCheckFired) return;
    authCheckFired = true;
    try {
      const r = await fetch("/api/auth-check", { credentials: "include" });
      const d = await r.json().catch(() => ({}));
      console.log("[ensureAuth] auth-check response (once):", r.status, JSON.stringify(d));
      if (r.status === 404) {
        LaplaceVar.lastApiError = "API /api/auth-check not found (404). Rebuild and restart the server.";
        updateDebugPanel(pathname, false, LaplaceVar.lastApiError);
        showErrorPanel(LaplaceVar.lastApiError, () => window.location.reload());
        return;
      }
      const isAuthed = r.ok && (d?.authed === true || d?.authed === "true");
      if (!isAuthed) {
        console.log("[ensureAuth] redirect from=" + pathname + " to=" + targetLogin + " (401 or not authed)");
        window.location.replace(targetLogin);
        return;
      }
    } catch (e) {
      LaplaceVar.lastApiError = "Auth check failed: " + (e?.message || "network error");
      updateDebugPanel(pathname, false, LaplaceVar.lastApiError);
      showErrorPanel(LaplaceVar.lastApiError + " Check server is running.", () => window.location.reload());
      return;
    }
    const logoutEl = document.getElementById("navbar-logout");
    if (logoutEl) logoutEl.style.display = "";
    updateDebugPanel(window.location.pathname + window.location.search, true, null);
    initUI();
    routeByUrl();
  })();
})();

(function cleanupOnUnload() {
  function clearAllIntervals() {
    if (LaplaceVar._overlayInterval) {
      clearInterval(LaplaceVar._overlayInterval);
      LaplaceVar._overlayInterval = null;
    }
    if (LaplaceVar.pingIntervals) {
      Object.values(LaplaceVar.pingIntervals).forEach(clearInterval);
      LaplaceVar.pingIntervals = {};
    }
    if (LaplaceVar.pingInterval) {
      clearInterval(LaplaceVar.pingInterval);
      LaplaceVar.pingInterval = null;
    }
  }
  window.addEventListener("pagehide", clearAllIntervals);
  window.addEventListener("beforeunload", clearAllIntervals);
})();
