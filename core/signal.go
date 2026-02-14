package core

import (
    "encoding/json"
    "log"
    "net/http"
    "net/url"
    "strings"
    "time"

    "github.com/gorilla/websocket"
)

type WSMessage struct {
    SessionID string
    Type      string
    Value     string
}

func apiHealth(w http.ResponseWriter, r *http.Request) {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(http.StatusOK)
    json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func apiValidate(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodGet {
        w.WriteHeader(http.StatusMethodNotAllowed)
        return
    }
    token := r.URL.Query().Get("token")
    if token == "" {
        w.WriteHeader(http.StatusBadRequest)
        return
    }
    ip := r.RemoteAddr
    if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
        if idx := strings.Index(xff, ","); idx >= 0 {
            ip = strings.TrimSpace(xff[:idx])
        } else {
            ip = strings.TrimSpace(xff)
        }
    }
    if !ValidateAndClaimTokenFromIP(token, ip) {
        w.WriteHeader(http.StatusNotFound)
        return
    }
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(map[string]string{"sessionId": token, "roomId": token, "valid": "true"})
}

func apiSessionValidate(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPost {
        w.WriteHeader(http.StatusMethodNotAllowed)
        return
    }
    if err := r.ParseForm(); err != nil {
        w.WriteHeader(http.StatusBadRequest)
        return
    }
    token := strings.TrimSpace(r.FormValue("token"))
    if token == "" {
        token = strings.TrimSpace(r.FormValue("code"))
    }
    if token == "" {
        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusBadRequest)
        json.NewEncoder(w).Encode(map[string]string{"error": "token or code required"})
        return
    }
    ip := r.RemoteAddr
    if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
        if idx := strings.Index(xff, ","); idx >= 0 {
            ip = strings.TrimSpace(xff[:idx])
        } else {
            ip = strings.TrimSpace(xff)
        }
    }
    if !ValidateAndClaimTokenFromIP(token, ip) {
        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusNotFound)
        json.NewEncoder(w).Encode(map[string]string{"error": "Session not found or expired"})
        return
    }
    userAgent := r.Header.Get("User-Agent")
    StoreUpdateSession(token, func(s *CoBrowseSession) bool {
        s.ClientIPAtConnect = ip
        s.ClientUserAgent = userAgent
        s.Status = StatusConnected
        now := time.Now()
        s.ClientConnectedAt = &now
        agent := StoreGetUser(s.AgentID)
        if agent != nil {
            s.AgentNameSnapshot = agent.Email
        }
        return true
    })
    StoreAppendAudit(token, "client", ip, "client_connect", map[string]interface{}{
        "ip": ip, "userAgent": userAgent,
    })
    ses := StoreGetSession(token)
    agentName := ""
    if ses != nil {
        agentName = ses.AgentNameSnapshot
    }
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(http.StatusOK)
    json.NewEncoder(w).Encode(map[string]interface{}{
        "roomId": token, "sessionId": token, "valid": "true",
        "agentName": agentName,
    })
}

func apiSessionConsent(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPost {
        w.WriteHeader(http.StatusMethodNotAllowed)
        return
    }
    if err := r.ParseForm(); err != nil {
        w.WriteHeader(http.StatusBadRequest)
        return
    }
    token := strings.TrimSpace(r.FormValue("token"))
    if token == "" {
        token = strings.TrimSpace(r.FormValue("code"))
    }
    consent := r.FormValue("consent") == "true" || r.FormValue("consent") == "1"
    agentName := strings.TrimSpace(r.FormValue("agentName"))
    if token == "" {
        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusBadRequest)
        json.NewEncoder(w).Encode(map[string]string{"error": "token required"})
        return
    }
    ok := StoreUpdateSession(token, func(s *CoBrowseSession) bool {
        s.ConsentGiven = consent
        if consent {
            now := time.Now()
            s.ConsentTimestamp = &now
            if agentName != "" {
                s.AgentNameSnapshot = agentName
            }
        }
        return true
    })
    if !ok {
        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusNotFound)
        json.NewEncoder(w).Encode(map[string]string{"error": "Session not found"})
        return
    }
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(http.StatusOK)
    json.NewEncoder(w).Encode(map[string]bool{"ok": true})
}

func apiSessionCreate(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPost && r.Method != http.MethodGet && r.Method != http.MethodOptions {
        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusMethodNotAllowed)
        json.NewEncoder(w).Encode(map[string]string{"error": "method not allowed"})
        return
    }
    if r.Method == http.MethodOptions {
        w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
        w.WriteHeader(http.StatusOK)
        return
    }
    userID, role, authed := GetSessionUser(r)
    if !authed || (role != RoleAgent && role != RoleAdmin) {
        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusUnauthorized)
        json.NewEncoder(w).Encode(map[string]string{"error": "Agent or Admin login required"})
        return
    }
    w.Header().Set("Content-Type", "application/json")
    w.Header().Set("Access-Control-Allow-Origin", "*")
    token := CreatePendingSession()
    StoreCreateSession(token, userID)
    log.Println("session/create: roomId=", token, "agentId=", userID)
    scheme := "https"
    if r.TLS == nil {
        scheme = "http"
    }
    host := r.Host
    if host == "" {
        host = "localhost"
    }
    connectUrl := scheme + "://" + host + "/connect?token=" + url.QueryEscape(token)
    w.WriteHeader(http.StatusOK)
    resp := map[string]interface{}{
        "token":      token,
        "roomId":     token,
        "sessionId":  token,
        "sessionCode": token,
        "code":       token,
        "connectUrl": connectUrl,
    }
    if err := json.NewEncoder(w).Encode(resp); err != nil {
        log.Println("session/create encode error:", err)
    }
}

func apiCreateSession(w http.ResponseWriter, r *http.Request) {
    w.Header().Set("Content-Type", "application/json")
    w.Header().Set("Access-Control-Allow-Origin", "*")
    if r.Method != http.MethodPost && r.Method != http.MethodGet && r.Method != http.MethodOptions {
        w.WriteHeader(http.StatusMethodNotAllowed)
        json.NewEncoder(w).Encode(map[string]string{"error": "method not allowed"})
        return
    }
    if r.Method == http.MethodOptions {
        w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        w.WriteHeader(http.StatusOK)
        return
    }
    userID, role, authed := GetSessionUser(r)
    if !authed || (role != RoleAgent && role != RoleAdmin) {
        w.WriteHeader(http.StatusUnauthorized)
        json.NewEncoder(w).Encode(map[string]string{"error": "Agent or Admin login required"})
        return
    }
    token := CreatePendingSession()
    StoreCreateSession(token, userID)
    log.Println("create-session: created token=", token)
    w.WriteHeader(http.StatusOK)
    resp := map[string]string{"token": token, "sessionId": token, "sessionCode": token}
    if err := json.NewEncoder(w).Encode(resp); err != nil {
        log.Println("create-session encode error:", err)
    }
}

var upgrader = websocket.Upgrader{
    ReadBufferSize:  1024,
    WriteBufferSize: 1024,
}

func sendHeartBeatWS(ticker *time.Ticker, conn *websocket.Conn, quit chan struct{}) {
    for {
        select {
        case <- ticker.C:
            _ = conn.WriteJSON(WSMessage{
                Type: "beat",
            })
        case <- quit:
            log.Println("heartbeat stopped")
            return
        }
    }
}

func GetHttp() *http.ServeMux {
    server := http.NewServeMux()

    server.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.Dir("files/static"))))

    // Register /api/auth-check first so it reliably matches
    server.HandleFunc("/api/auth-check", ApiAuthCheck)

    // API sub-mux: /api/*
    apiMux := http.NewServeMux()
    apiMux.HandleFunc("/health", apiHealth)
    apiMux.HandleFunc("/validate", apiValidate)
    apiMux.HandleFunc("/create-session", apiCreateSession)
    sessionApi := http.NewServeMux()
    sessionApi.HandleFunc("/create", apiSessionCreate)
    sessionApi.HandleFunc("/validate", apiSessionValidate)
    sessionApi.HandleFunc("/consent", apiSessionConsent)
    apiMux.Handle("/session/", http.StripPrefix("/session", sessionApi))
    apiMux.HandleFunc("/login", apiLogin)
    apiMux.HandleFunc("/logout", apiLogout)
    apiMux.HandleFunc("/auth-check", ApiAuthCheck)

    // Admin API (RBAC enforced)
    adminApi := http.NewServeMux()
    adminApi.HandleFunc("/dashboard", RequireAdmin(adminDashboard))
    adminApi.HandleFunc("/agents/", RequireAdmin(func(w http.ResponseWriter, r *http.Request) {
        if r.Method == http.MethodPut || r.Method == http.MethodPatch {
            adminUpdateAgent(w, r)
        } else {
            w.WriteHeader(http.StatusMethodNotAllowed)
        }
    }))
    adminApi.HandleFunc("/agents", RequireAdmin(func(w http.ResponseWriter, r *http.Request) {
        if r.Method == http.MethodGet {
            adminListAgents(w, r)
        } else if r.Method == http.MethodPost {
            adminCreateAgent(w, r)
        } else {
            w.WriteHeader(http.StatusMethodNotAllowed)
        }
    }))
    adminApi.HandleFunc("/settings", RequireAdmin(func(w http.ResponseWriter, r *http.Request) {
        if r.Method == http.MethodGet {
            adminGetSettings(w, r)
        } else {
            adminSetSettings(w, r)
        }
    }))
    adminApi.HandleFunc("/documents", RequireAdmin(func(w http.ResponseWriter, r *http.Request) {
        if r.Method == http.MethodGet {
            adminListDocuments(w, r)
        } else if r.Method == http.MethodPost {
            adminCreateDocument(w, r)
        } else {
            w.WriteHeader(http.StatusMethodNotAllowed)
        }
    }))
    adminApi.HandleFunc("/documents/", RequireAdmin(func(w http.ResponseWriter, r *http.Request) {
        if r.Method == http.MethodPut || r.Method == http.MethodPatch {
            adminUpdateDocument(w, r)
        } else if r.Method == http.MethodDelete {
            adminDeleteDocument(w, r)
        } else {
            w.WriteHeader(http.StatusMethodNotAllowed)
        }
    }))
    adminApi.HandleFunc("/onboarding-flow", RequireAdmin(func(w http.ResponseWriter, r *http.Request) {
        if r.Method == http.MethodGet {
            adminGetOnboardingFlow(w, r)
        } else {
            adminSetOnboardingFlow(w, r)
        }
    }))
    adminApi.HandleFunc("/sessions", RequireAdmin(adminListSessions))
    adminApi.HandleFunc("/sessions/", RequireAdmin(adminGetSession))
    adminApi.HandleFunc("/review/", RequireAdmin(func(w http.ResponseWriter, r *http.Request) {
        if r.Method == http.MethodPut || r.Method == http.MethodPost {
            adminReviewSession(w, r)
        } else {
            w.WriteHeader(http.StatusMethodNotAllowed)
        }
    }))
    apiMux.Handle("/admin/", http.StripPrefix("/admin", adminApi))

    server.Handle("/api/", http.StripPrefix("/api", apiMux))

    server.HandleFunc("/logout", apiLogout)

    connectHandler := func(w http.ResponseWriter, r *http.Request) { http.ServeFile(w, r, "files/connect.html") }
    server.HandleFunc("/connect", connectHandler)
    server.HandleFunc("/connect/", connectHandler)
    server.HandleFunc("/start", connectHandler)
    server.HandleFunc("/start/", connectHandler)

    server.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) { http.ServeFile(w, r, "files/landing.html") })
    server.HandleFunc("/join", func(w http.ResponseWriter, r *http.Request) { http.ServeFile(w, r, "files/join.html") })

    server.HandleFunc("/room/", func(w http.ResponseWriter, r *http.Request) {
        roomId := strings.TrimPrefix(r.URL.Path, "/room/")
        if idx := strings.Index(roomId, "/"); idx >= 0 {
            roomId = roomId[:idx]
        }
        roomId = strings.TrimSpace(roomId)
        if roomId == "" {
            http.Redirect(w, r, "/join", http.StatusFound)
            return
        }
        http.Redirect(w, r, "/stream.html?stream=1&room="+url.QueryEscape(roomId), http.StatusFound)
    })

    server.HandleFunc("/stream.html", func(w http.ResponseWriter, r *http.Request) { http.ServeFile(w, r, "files/main.html") })

    // /agent/login: serve ONLY login page (fallback if middleware bypassed; middleware also handles)
    server.HandleFunc("/agent/login", func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("Cache-Control", "no-store, no-cache")
        http.ServeFile(w, r, "files/agent-login.html")
    })
    server.HandleFunc("/agent/login/", func(w http.ResponseWriter, r *http.Request) {
        http.Redirect(w, r, "/agent/login", http.StatusMovedPermanently)
        return
    })

    // Agent routes: /agent, /agent/session/* (NOT /agent/login - handled above)
    agentRoutes := func(w http.ResponseWriter, r *http.Request) {
        path := r.URL.Path
        if path == "/agent/login" || strings.HasPrefix(path, "/agent/login/") {
            http.Redirect(w, r, "/agent/login", http.StatusFound)
            return
        }
        w.Header().Set("Cache-Control", "no-store, no-cache")
        if strings.HasPrefix(path, "/agent/session/") {
            roomId := strings.TrimPrefix(path, "/agent/session/")
            if idx := strings.Index(roomId, "/"); idx >= 0 {
                roomId = roomId[:idx]
            }
            roomId = strings.TrimSpace(roomId)
            if roomId != "" {
                http.Redirect(w, r, "/stream.html?id="+url.QueryEscape(roomId), http.StatusFound)
                return
            }
        }
        if path == "/agent" || path == "/agent/" || strings.HasPrefix(path, "/agent/") {
            http.ServeFile(w, r, "files/agent.html")
            return
        }
        http.Redirect(w, r, "/agent", http.StatusFound)
    }
    server.HandleFunc("/agent", agentRoutes)
    server.HandleFunc("/agent/", agentRoutes)

    // /admin/login: explicit route (must come before /admin/ to take precedence)
    server.HandleFunc("/admin/login", func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("Cache-Control", "no-store, no-cache")
        w.Header().Set("Content-Type", "text/html; charset=utf-8")
        http.ServeFile(w, r, "files/admin-login.html")
    })
    server.HandleFunc("/admin/login/", func(w http.ResponseWriter, r *http.Request) {
        http.Redirect(w, r, "/admin/login", http.StatusMovedPermanently)
        return
    })

    // Admin SPA: /admin, /admin/agents, /admin/settings, etc. all serve admin.html
    adminRoutes := func(w http.ResponseWriter, r *http.Request) {
        path := r.URL.Path
        if path == "/admin/login" || strings.HasPrefix(path, "/admin/login/") {
            http.ServeFile(w, r, "files/admin-login.html")
            return
        }
        w.Header().Set("Cache-Control", "no-store, no-cache")
        http.ServeFile(w, r, "files/admin.html")
    }
    server.HandleFunc("/admin", adminRoutes)
    server.HandleFunc("/admin/", adminRoutes)

    wsServe := func(writer http.ResponseWriter, request *http.Request) {
        conn, _ := upgrader.Upgrade(writer, request, nil)
        claim := request.URL.Query().Get("claim")
        var room *Room
        if claim != "" && ValidateAndClaimToken(claim) && GetRoom(claim) == nil {
            ClaimPendingSession(claim)
            room = NewRoomWithID(conn, claim)
        } else {
            room = NewRoom(conn)
        }
        if err := conn.WriteJSON(WSMessage{
            SessionID: "",
            Type:      "newRoom",
            Value:     room.ID,
        }); err != nil {
            log.Println("newSessionWriteJsonError.", err)
            return
        }

        go func(r *Room) {
            ticker := time.NewTicker(10 * time.Second)
            quit := make(chan struct{})
            defer func() {
                ticker.Stop()
                _ = room.CallerConn.Close()
                close(quit)
                RemoveRoom(r.ID)
                for sID, s := range r.Sessions {
                    _ = s.CalleeConn.WriteJSON(WSMessage{
                        Type: "roomClosed",
                        SessionID: sID,
                    })
                }
            }()

            go sendHeartBeatWS(ticker, conn, quit)

            //noinspection ALL
            defer room.CallerConn.Close()
            for {
                var msg WSMessage
                if err := room.CallerConn.ReadJSON(&msg); err != nil {
                    log.Println("websocketError.", err)
                    return
                }
                //log.Println(msg)
                s := room.GetSession(msg.SessionID)
                if s == nil {
                    log.Println("session nil.", msg.SessionID)
                    continue
                }
                if msg.Type == "addCallerIceCandidate" {
                    s.CallerIceCandidates = append(s.CallerIceCandidates, msg.Value)
                } else if msg.Type == "gotOffer" {
                    s.Offer = msg.Value
                }
                if err := s.CalleeConn.WriteJSON(msg); err != nil {
                    log.Println("serveEchoWriteJsonError.", err)
                }
            }
        }(room)
    }
    server.HandleFunc("/ws/serve", wsServe)

    wsConnect := func(writer http.ResponseWriter, request *http.Request) {
        conn, _ := upgrader.Upgrade(writer, request, nil)

        ids, ok := request.URL.Query()["id"]
        if !ok || len(ids) == 0 || ids[0] == "" {
            ids, ok = request.URL.Query()["room"]
            if !ok || len(ids) == 0 || ids[0] == "" {
                return
            }
        }

        room := GetRoom(ids[0])
        if room == nil {
            _ = conn.WriteJSON(WSMessage{
                Type: "roomNotFound",
            })
            return
        }
        session := room.NewSession(conn)

        if err := room.CallerConn.WriteJSON(WSMessage{
            SessionID: session.ID,
            Type:      "newSession",
            Value:     session.ID,
        }); err != nil {
            log.Println("callerWriteJsonError.", err)
            return
        }

        if err := conn.WriteJSON(WSMessage{
            SessionID: session.ID,
            Type:      "newSession",
            Value:     session.ID,
        }); err != nil {
            log.Println("calleeWriteJsonError.", err)
            return
        }

        go func(s *StreamSession) {
            //noinspection ALL
            defer s.CalleeConn.Close()
            for {
                var msg WSMessage
                if err := conn.ReadJSON(&msg); err != nil {
                    log.Println("websocketError.", err)
                    return
                }
                //log.Println(msg)
                if msg.SessionID == s.ID {
                    if msg.Type == "addCalleeIceCandidate" {
                        s.CalleeIceCandidates = append(s.CalleeIceCandidates, msg.Value)
                    } else if msg.Type == "gotAnswer" {
                        s.Answer = msg.Value
                    }
                    if err := s.CallerConn.WriteJSON(msg); err != nil {
                        log.Println("connectEchoWriteJsonError.", err)
                    }
                }
            }
        }(session)
    }
    server.HandleFunc("/ws/connect", wsConnect)

    return server
}
