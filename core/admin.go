package core

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"
)

// NOTE: All admin handlers are wrapped with RequireAdmin - RBAC enforced server-side.

// RequireAdmin returns a handler that only allows admin users
func RequireAdmin(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		_, role, ok := GetSessionUser(r)
		if !ok {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]interface{}{"error": "Unauthorized", "authed": false})
			return
		}
		if role != RoleAdmin {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusForbidden)
			json.NewEncoder(w).Encode(map[string]string{"error": "Admin access required"})
			return
		}
		next(w, r)
	}
}

// RequireAgentOrAdmin returns a handler that allows agent or admin
func RequireAgentOrAdmin(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		_, role, ok := GetSessionUser(r)
		if !ok {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]interface{}{"error": "Unauthorized", "authed": false})
			return
		}
		if role != RoleAdmin && role != RoleAgent {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusForbidden)
			json.NewEncoder(w).Encode(map[string]string{"error": "Agent or Admin access required"})
			return
		}
		next(w, r)
	}
}

func adminDashboard(w http.ResponseWriter, r *http.Request) {
	settings := StoreGetGlobalSettings()
	sessions := StoreListSessions()
	now := time.Now()
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	today := 0
	pending := 0
	for _, s := range sessions {
		if !s.CreatedAt.Before(todayStart) {
			today++
		}
		if s.Status == StatusSubmitted || s.Status == StatusUnderReview || s.Status == StatusNeedsInfo {
			pending++
		}
	}
	agents := StoreListUsers(RoleAgent)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"companyName":    settings.CompanyName,
		"sessionsToday":  today,
		"pendingReviews": pending,
		"activeAgents":   len(agents),
	})
}

func adminListAgents(w http.ResponseWriter, r *http.Request) {
	list := StoreListUsers(RoleAgent)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"agents": list})
}

func adminCreateAgent(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Invalid JSON"})
		return
	}
	email := normalizeEmail(body.Email)
	if email == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Email required"})
		return
	}
	if len(body.Password) < 6 {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Password must be at least 6 characters"})
		return
	}
	h, err := hashPassword(body.Password)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Failed to create agent"})
		return
	}
	u, err := StoreCreateUser(email, RoleAgent, h)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Failed to create agent"})
		return
	}
	if u == nil {
		w.WriteHeader(http.StatusConflict)
		json.NewEncoder(w).Encode(map[string]string{"error": "Agent with this email already exists"})
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"id": u.ID, "email": u.Email, "role": string(u.Role), "active": u.Active,
	})
}

func adminUpdateAgent(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut && r.Method != http.MethodPatch {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	path := strings.TrimPrefix(r.URL.Path, "/agents/")
	agentID := strings.Split(path, "/")[0]
	if agentID == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Agent ID required"})
		return
	}
	var body struct {
		Active   *bool   `json:"active"`
		Password *string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Invalid JSON"})
		return
	}
	ok := StoreUpdateUser(agentID, func(u *User) bool {
		if u.Role != RoleAgent {
			return false
		}
		if body.Active != nil {
			u.Active = *body.Active
		}
		if body.Password != nil && len(*body.Password) >= 6 {
			h, _ := hashPassword(*body.Password)
			u.Password = h
		}
		return true
	})
	if !ok {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{"error": "Agent not found"})
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"ok": true})
}

func adminGetSettings(w http.ResponseWriter, r *http.Request) {
	s := StoreGetGlobalSettings()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(s)
}

func adminSetSettings(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut && r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var s GlobalSettings
	if err := json.NewDecoder(r.Body).Decode(&s); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Invalid JSON"})
		return
	}
	StoreSetGlobalSettings(&s)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"ok": true})
}

func adminListDocuments(w http.ResponseWriter, r *http.Request) {
	list := StoreListDocuments()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"documents": list})
}

func adminCreateDocument(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var d DocumentTemplate
	if err := json.NewDecoder(r.Body).Decode(&d); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Invalid JSON"})
		return
	}
	if d.Title == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Title required"})
		return
	}
	StoreSaveDocument(&d)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(d)
}

func adminUpdateDocument(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut && r.Method != http.MethodPatch {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	path := strings.TrimPrefix(r.URL.Path, "/documents/")
	id := strings.Split(path, "/")[0]
	if id == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Document ID required"})
		return
	}
	existing := StoreGetDocument(id)
	if existing == nil {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{"error": "Document not found"})
		return
	}
	var d DocumentTemplate
	if err := json.NewDecoder(r.Body).Decode(&d); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Invalid JSON"})
		return
	}
	d.ID = id
	StoreSaveDocument(&d)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(d)
}

func adminDeleteDocument(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	path := strings.TrimPrefix(r.URL.Path, "/documents/")
	id := strings.Split(path, "/")[0]
	if id == "" {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	StoreDeleteDocument(id)
	w.WriteHeader(http.StatusNoContent)
}

func adminGetOnboardingFlow(w http.ResponseWriter, r *http.Request) {
	s := StoreGetGlobalSettings()
	steps := s.OnboardingSteps
	if len(steps) == 0 {
		steps = []string{"CONNECT", "SHARE", "DOCS", "FORM", "KYC", "SIGN", "REVIEW", "SUBMITTED"}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"steps":     steps,
		"kycMode":   s.KycModeDefault,
	})
}

func adminSetOnboardingFlow(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut && r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		Steps   []string `json:"steps"`
		KycMode string   `json:"kycMode"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Invalid JSON"})
		return
	}
	s := StoreGetGlobalSettings()
	if body.Steps != nil {
		s.OnboardingSteps = body.Steps
	}
	if body.KycMode != "" {
		s.KycModeDefault = body.KycMode
	}
	StoreSetGlobalSettings(s)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"ok": true})
}

func adminListSessions(w http.ResponseWriter, r *http.Request) {
	list := StoreListSessions()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"sessions": list})
}

func adminGetSession(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/sessions/")
	sessionID := strings.Split(path, "/")[0]
	if sessionID == "" {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	s := StoreGetSession(sessionID)
	if s == nil {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{"error": "Session not found"})
		return
	}
	evs := StoreGetAuditEvents(sessionID)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"session": s,
		"audit":   evs,
	})
}

func adminReviewSession(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/review/")
	sessionID := strings.Split(path, "/")[0]
	if sessionID == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Session ID required"})
		return
	}
	userID, _, _ := GetSessionUser(r)

	var body struct {
		Status string   `json:"status"` // APPROVED, REJECTED, NEEDS_INFO
		Notes  string   `json:"notes"`
		Docs   []string `json:"requestMissingDocs"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Invalid JSON"})
		return
	}
	ok := StoreUpdateSession(sessionID, func(s *CoBrowseSession) bool {
		s.AdminDecision = body.Status
		s.AdminNotes = body.Notes
		s.Status = SessionStatus(body.Status)
		if body.Docs != nil {
			s.RequestedDocs = append(s.RequestedDocs, body.Docs...)
		}
		now := time.Now()
		s.EndedAt = &now
		return true
	})
	if !ok {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{"error": "Session not found"})
		return
	}
	StoreAppendAudit(sessionID, "admin", userID, "admin_review", map[string]interface{}{
		"status": body.Status, "notes": body.Notes,
	})
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"ok": true})
}
