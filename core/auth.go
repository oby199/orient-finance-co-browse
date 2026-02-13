package core

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

const (
	cookieName  = "orient_agent_session"
	cookiePath  = "/"
	maxAge      = 86400 * 7 // 7 days
	sessionSize = 32
)

type sessionInfo struct {
	Email   string
	Expires time.Time
}

var (
	sessions   = make(map[string]*sessionInfo)
	sessionsMu sync.RWMutex
)

func defaultAgentEmail() string {
	if e := os.Getenv("AGENT_EMAIL"); e != "" {
		return e
	}
	return "advisor@orientfinance.com"
}

func defaultAgentPassword() string {
	if p := os.Getenv("AGENT_PASSWORD"); p != "" {
		return p
	}
	return "orient2024"
}

func newSessionID() string {
	b := make([]byte, sessionSize)
	rand.Read(b)
	return base64.URLEncoding.EncodeToString(b)[:sessionSize]
}

func setSessionCookie(w http.ResponseWriter, r *http.Request, sessionID string) {
	secure := r.TLS != nil
	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    sessionID,
		Path:     cookiePath,
		MaxAge:   maxAge,
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
	})
}

func clearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    "",
		Path:     cookiePath,
		MaxAge:   -1,
		HttpOnly: true,
	})
}

func getSessionFromRequest(r *http.Request) string {
	c, err := r.Cookie(cookieName)
	if err != nil || c == nil || c.Value == "" {
		return ""
	}
	return c.Value
}

func IsAuthenticated(r *http.Request) bool {
	sid := getSessionFromRequest(r)
	if sid == "" {
		return false
	}
	sessionsMu.RLock()
	info, ok := sessions[sid]
	sessionsMu.RUnlock()
	if !ok || info == nil || time.Now().After(info.Expires) {
		return false
	}
	return true
}

func CreateSession(email string) string {
	sid := newSessionID()
	sessionsMu.Lock()
	sessions[sid] = &sessionInfo{
		Email:   email,
		Expires: time.Now().Add(time.Duration(maxAge) * time.Second),
	}
	sessionsMu.Unlock()
	return sid
}

func getSessionInfo(sessionID string) (email string, ok bool) {
	sessionsMu.RLock()
	info, ok := sessions[sessionID]
	sessionsMu.RUnlock()
	if !ok || info == nil || time.Now().After(info.Expires) {
		return "", false
	}
	return info.Email, true
}

func DestroySession(sessionID string) {
	sessionsMu.Lock()
	delete(sessions, sessionID)
	sessionsMu.Unlock()
}

func apiLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	if err := r.ParseForm(); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	email := strings.TrimSpace(strings.ToLower(r.FormValue("email")))
	password := r.FormValue("password")

	validEmail := defaultAgentEmail()
	validPass := defaultAgentPassword()

	if email != validEmail || password != validPass {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"error": "Invalid email or password"})
		return
	}

	sid := CreateSession(email)
	setSessionCookie(w, r, sid)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"ok": "true", "redirect": "/agent"})
}

func apiLogout(w http.ResponseWriter, r *http.Request) {
	sid := getSessionFromRequest(r)
	if sid != "" {
		DestroySession(sid)
	}
	clearSessionCookie(w)
	http.Redirect(w, r, "/agent/login", http.StatusFound)
}

// ApiAuthCheck handles GET /api/auth-check; 200 + {authed:true} if logged in, 401 + {authed:false} if not. Never 404.
func ApiAuthCheck(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	log.Printf("[auth-check] GET %s", r.URL.Path)
	w.Header().Set("Content-Type", "application/json")
	sid := getSessionFromRequest(r)
	if _, ok := getSessionInfo(sid); ok {
		log.Printf("[auth-check] authed=true -> 200")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]interface{}{"authed": true})
		return
	}
	log.Printf("[auth-check] authed=false -> 401")
	w.WriteHeader(http.StatusUnauthorized)
	json.NewEncoder(w).Encode(map[string]interface{}{"authed": false})
}
