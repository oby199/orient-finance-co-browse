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

	"golang.org/x/crypto/bcrypt"
)

const (
	cookieName  = "orient_agent_session"
	cookiePath  = "/"
	maxAge      = 86400 * 7 // 7 days
	sessionSize = 32
)

type sessionInfo struct {
	Email   string
	UserID  string
	Role    Role
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
	return "sales@orientfinance.com"
}

func defaultAgentPassword() string {
	if p := os.Getenv("AGENT_PASSWORD"); p != "" {
		return p
	}
	return "orient@123"
}

func adminEmail() string {
	if e := os.Getenv("ADMIN_EMAIL"); e != "" {
		return strings.TrimSpace(strings.ToLower(e))
	}
	return ""
}

func adminPassword() string {
	return os.Getenv("ADMIN_PASSWORD")
}

func hashPassword(password string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func checkPassword(hashed, plain string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(hashed), []byte(plain))
	return err == nil
}

// SeedAdmin ensures an admin user exists from ADMIN_EMAIL/ADMIN_PASSWORD env vars
func SeedAdmin() {
	em := adminEmail()
	pw := adminPassword()
	if em == "" || pw == "" {
		return
	}
	u := StoreGetUserByEmail(em)
	if u != nil && u.Role == RoleAdmin {
		return
	}
	if u != nil {
		StoreUpdateUser(u.ID, func(usr *User) bool {
			usr.Role = RoleAdmin
			usr.Active = true
			h, _ := hashPassword(pw)
			usr.Password = h
			return true
		})
		log.Printf("[seed] Admin user updated: %s", em)
		return
	}
	h, err := hashPassword(pw)
	if err != nil {
		log.Printf("[seed] Failed to hash admin password: %v", err)
		return
	}
	_, err = StoreCreateUser(em, RoleAdmin, h)
	if err != nil {
		log.Printf("[seed] Failed to create admin: %v", err)
		return
	}
	log.Printf("[seed] Admin user created: %s", em)
}

// SeedDefaultAgent ensures default agent exists from AGENT_EMAIL/AGENT_PASSWORD
func SeedDefaultAgent() {
	em := defaultAgentEmail()
	pw := defaultAgentPassword()
	em = strings.TrimSpace(strings.ToLower(em))
	u := StoreGetUserByEmail(em)
	if u != nil && u.Role == RoleAgent {
		return
	}
	if u != nil {
		StoreUpdateUser(u.ID, func(usr *User) bool {
			usr.Role = RoleAgent
			usr.Active = true
			h, _ := hashPassword(pw)
			usr.Password = h
			return true
		})
		log.Printf("[seed] Agent user updated: %s", em)
		return
	}
	h, err := hashPassword(pw)
	if err != nil {
		log.Printf("[seed] Failed to hash agent password: %v", err)
		return
	}
	_, _ = StoreCreateUser(em, RoleAgent, h)
	log.Printf("[seed] Agent user created: %s", em)
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

func CreateSession(email, userID string, role Role) string {
	sid := newSessionID()
	sessionsMu.Lock()
	sessions[sid] = &sessionInfo{
		Email:   email,
		UserID:  userID,
		Role:    role,
		Expires: time.Now().Add(time.Duration(maxAge) * time.Second),
	}
	sessionsMu.Unlock()
	return sid
}

func getSessionInfo(sessionID string) (email, userID string, role Role, ok bool) {
	sessionsMu.RLock()
	info, ok := sessions[sessionID]
	sessionsMu.RUnlock()
	if !ok || info == nil || time.Now().After(info.Expires) {
		return "", "", "", false
	}
	return info.Email, info.UserID, info.Role, true
}

func GetSessionUser(r *http.Request) (userID string, role Role, ok bool) {
	sid := getSessionFromRequest(r)
	if sid == "" {
		return "", "", false
	}
	_, uid, role, ok := getSessionInfo(sid)
	return uid, role, ok
}

func DestroySession(sessionID string) {
	sessionsMu.Lock()
	delete(sessions, sessionID)
	sessionsMu.Unlock()
}

func authenticateUser(email, password string) (*User, string) {
	email = strings.TrimSpace(strings.ToLower(email))
	password = strings.TrimSpace(password)
	if email == "" || password == "" {
		return nil, "Invalid email or password"
	}
	// 1. Check admin env (seed)
	if ae := adminEmail(); ae != "" && email == ae {
		if adminPassword() == password {
			u := StoreGetUserByEmail(email)
			if u == nil {
				SeedAdmin()
				u = StoreGetUserByEmail(email)
			}
			if u != nil {
				return u, ""
			}
			// Create on the fly if store failed
			h, _ := hashPassword(password)
			nu, _ := StoreCreateUser(email, RoleAdmin, h)
			if nu != nil {
				return nu, ""
			}
		}
	}
	// 2. Check agent env
	ae := defaultAgentEmail()
	ap := defaultAgentPassword()
	ae = strings.TrimSpace(strings.ToLower(ae))
	if email == ae && password == ap {
		u := StoreGetUserByEmail(email)
		if u == nil {
			SeedDefaultAgent()
			u = StoreGetUserByEmail(email)
		}
		if u != nil {
			return u, ""
		}
	}
	// 3. Check store
	u := StoreGetUserByEmail(email)
	if u == nil {
		return nil, "Invalid email or password"
	}
	if !u.Active {
		return nil, "Account is disabled"
	}
	if !checkPassword(u.Password, password) {
		return nil, "Invalid email or password"
	}
	return u, ""
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
	password := strings.TrimSpace(r.FormValue("password"))

	u, errMsg := authenticateUser(email, password)
	if u == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"error": errMsg})
		return
	}

	sid := CreateSession(u.Email, u.ID, u.Role)
	setSessionCookie(w, r, sid)

	redirect := "/agent"
	if u.Role == RoleAdmin {
		redirect = "/admin"
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"ok":       true,
		"redirect": redirect,
		"role":     string(u.Role),
	})
}

func apiLogout(w http.ResponseWriter, r *http.Request) {
	sid := getSessionFromRequest(r)
	if sid != "" {
		DestroySession(sid)
	}
	clearSessionCookie(w)
	if r.Method == http.MethodPost && r.Header.Get("Accept") == "application/json" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]bool{"ok": true})
		return
	}
	http.Redirect(w, r, "/agent/login", http.StatusFound)
}

// ApiAuthCheck handles GET /api/auth-check
func ApiAuthCheck(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	sid := getSessionFromRequest(r)
	email, userID, role, ok := getSessionInfo(sid)
	if !ok {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]interface{}{"authed": false})
		return
	}
	resp := map[string]interface{}{
		"authed": true,
		"role":   string(role),
		"user": map[string]interface{}{
			"id":    userID,
			"email": email,
		},
	}
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(resp)
}
