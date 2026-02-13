package core

import (
    "encoding/json"
    "github.com/gorilla/websocket"
    "log"
    "net/http"
    "net/url"
    "strings"
    "time"
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
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(http.StatusOK)
    json.NewEncoder(w).Encode(map[string]string{"sessionId": token, "roomId": token, "valid": "true"})
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
    w.Header().Set("Content-Type", "application/json")
    w.Header().Set("Access-Control-Allow-Origin", "*")
    token := CreatePendingSession()
    log.Println("session/create: roomId=", token)
    w.WriteHeader(http.StatusOK)
    resp := map[string]string{"token": token, "sessionId": token, "sessionCode": token, "roomId": token}
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
    token := CreatePendingSession()
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

    // Register /api/auth-check first so it reliably matches (avoids prefix routing quirks)
    server.HandleFunc("/api/auth-check", apiAuthCheck)

    // API sub-mux: /api/* never falls through to root catch-all
    apiMux := http.NewServeMux()
    apiMux.HandleFunc("/health", apiHealth)
    apiMux.HandleFunc("/validate", apiValidate)
    apiMux.HandleFunc("/create-session", apiCreateSession)
    sessionApi := http.NewServeMux()
    sessionApi.HandleFunc("/create", apiSessionCreate)
    sessionApi.HandleFunc("/validate", apiSessionValidate)
    apiMux.Handle("/session/", http.StripPrefix("/session", sessionApi))
    apiMux.HandleFunc("/login", apiLogin)
    apiMux.HandleFunc("/logout", apiLogout)
    apiMux.HandleFunc("/auth-check", apiAuthCheck)
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

    server.HandleFunc("/agent/login", func(w http.ResponseWriter, r *http.Request) { http.ServeFile(w, r, "files/agent-login.html") })
    server.HandleFunc("/agent/login/", func(w http.ResponseWriter, r *http.Request) { http.ServeFile(w, r, "files/agent-login.html") })
    server.HandleFunc("/agent", func(w http.ResponseWriter, r *http.Request) { http.ServeFile(w, r, "files/agent.html") })
    server.HandleFunc("/agent/", func(w http.ResponseWriter, r *http.Request) {
        p := strings.TrimPrefix(r.URL.Path, "/agent/")
        if strings.HasPrefix(p, "session/") {
            roomId := strings.TrimPrefix(p, "session/")
            if idx := strings.Index(roomId, "/"); idx >= 0 {
                roomId = roomId[:idx]
            }
            roomId = strings.TrimSpace(roomId)
            if roomId != "" {
                http.Redirect(w, r, "/stream.html?id="+url.QueryEscape(roomId), http.StatusFound)
                return
            }
        }
        http.Redirect(w, r, "/agent", http.StatusFound)
    })

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
    server.HandleFunc("/ws_serve", wsServe)
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
    server.HandleFunc("/ws_connect", wsConnect)
    server.HandleFunc("/ws/connect", wsConnect)

    return server
}
