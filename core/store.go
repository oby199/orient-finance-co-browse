package core

import (
	"strings"
	"sync"
	"time"
)

func normalizeEmail(e string) string {
	return strings.TrimSpace(strings.ToLower(e))
}

// Role represents user role in RBAC
type Role string

const (
	RoleAdmin  Role = "admin"
	RoleSRM  Role = "srm"
	RoleClient Role = "client"
)

// User represents an authenticated user (admin or agent)
type User struct {
	ID        string    `json:"id"`
	Email     string    `json:"email"`
	Role      Role      `json:"role"`
	Active    bool      `json:"active"`
	Password  string    `json:"-"` // hashed; never expose
	CreatedAt time.Time `json:"createdAt"`
}

// GlobalSettings stores system-wide configuration
type GlobalSettings struct {
	CompanyName          string   `json:"companyName"`
	BrandColor           string   `json:"brandColor"`
	LogoPath             string   `json:"logoPath"`
	SessionExpiryMinutes int      `json:"sessionExpiryMinutes"`
	CodeFormat           string   `json:"codeFormat"`
	OnboardingSteps      []string `json:"onboardingSteps"`
	KycModeDefault       string   `json:"kycModeDefault"` // manual | sumsub | mock
	AllowedCountries     []string `json:"allowedCountries,omitempty"`
}

// DocumentTemplate is a global document in the library
type DocumentTemplate struct {
	ID        string    `json:"id"`
	Title     string    `json:"title"`
	URL       string    `json:"url"`
	Type      string    `json:"type"` // html, pdf
	Required  bool      `json:"required"`
	Version   int       `json:"version"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// SessionStatus represents co-browse session lifecycle
type SessionStatus string

const (
	StatusLinkSent    SessionStatus = "LINK_SENT"
	StatusConnected  SessionStatus = "CONNECTED"
	StatusSharing    SessionStatus = "SHARING"
	StatusSubmitted  SessionStatus = "SUBMITTED"
	StatusUnderReview SessionStatus = "UNDER_REVIEW"
	StatusApproved   SessionStatus = "APPROVED"
	StatusRejected   SessionStatus = "REJECTED"
	StatusNeedsInfo  SessionStatus = "NEEDS_INFO"
	StatusEnded      SessionStatus = "ENDED"
)

// CoBrowseSession extends the legacy room/session concept for admin tracking
type CoBrowseSession struct {
	ID                   string       `json:"id"`
	Token                string       `json:"token"`
	AgentID              string       `json:"agentId"`
	Status               SessionStatus `json:"status"`
	ClientIPAtConnect   string       `json:"clientIpAtConnect,omitempty"`
	ClientUserAgent     string       `json:"clientUserAgentAtConnect,omitempty"`
	RequestedDocs        []string     `json:"requestedDocs,omitempty"`
	AppliedDocTemplates  []string     `json:"appliedDocTemplates,omitempty"`
	OnboardingMode      string       `json:"onboardingMode"`
	ApplicationName     string       `json:"applicationName,omitempty"`
	AdminDecision       string       `json:"adminDecision,omitempty"`
	AdminNotes          string       `json:"adminNotes,omitempty"`
	ConsentGiven        bool         `json:"consentGiven"`
	ConsentTimestamp     *time.Time   `json:"consentTimestamp,omitempty"`
	AgentNameSnapshot   string       `json:"agentNameSnapshot,omitempty"`
	CreatedAt           time.Time    `json:"createdAt"`
	ClientConnectedAt   *time.Time   `json:"clientConnectedAt,omitempty"`
	EndedAt             *time.Time   `json:"endedAt,omitempty"`
}

// AuditEvent is an append-only audit log entry
type AuditEvent struct {
	ID        string                 `json:"id"`
	SessionID string                 `json:"sessionId"`
	ActorRole string                 `json:"actorRole"`
	ActorID   string                 `json:"actorId"`
	Action    string                 `json:"action"`
	Payload   map[string]interface{} `json:"payload,omitempty"`
	CreatedAt time.Time              `json:"createdAt"`
}

// OnboardingStepConfig defines which steps are enabled per mode
type OnboardingStepConfig struct {
	Step  string `json:"step"`
	Label string `json:"label"`
	Manual bool `json:"manual"`
	Sumsub bool `json:"sumsub"`
}

var (
	storeMu        sync.RWMutex
	users          = make(map[string]*User)
	usersByEmail   = make(map[string]string)
	globalSettings *GlobalSettings
	docTemplates   = make(map[string]*DocumentTemplate)
	coBrowseSessions  = make(map[string]*CoBrowseSession)
	sessionsByToken   = make(map[string]*CoBrowseSession)
	auditEvents       = make(map[string][]*AuditEvent) // sessionId -> events
	globalAuditEvents []*AuditEvent                    // system-wide audit (logins, settings, etc.)
)

func initStore() {
	if globalSettings == nil {
		globalSettings = &GlobalSettings{
			CompanyName:          "Orient Finance Broker",
			BrandColor:           "#1e3a5f",
			LogoPath:             "/static/orient-finance-logo.png",
			SessionExpiryMinutes: 15,
			CodeFormat:           "numeric_6",
			OnboardingSteps:      []string{"CONNECT", "SHARE", "DOCS", "FORM", "KYC", "SIGN", "REVIEW", "SUBMITTED"},
			KycModeDefault:       "manual",
			AllowedCountries:     []string{},
		}
	}
}

func StoreGetUser(id string) *User {
	storeMu.RLock()
	defer storeMu.RUnlock()
	u := users[id]
	if u == nil {
		return nil
	}
	// Return copy to avoid mutation
	cp := *u
	return &cp
}

func StoreGetUserByEmail(email string) *User {
	storeMu.RLock()
	defer storeMu.RUnlock()
	id, ok := usersByEmail[email]
	if !ok {
		return nil
	}
	u := users[id]
	if u == nil {
		return nil
	}
	cp := *u
	return &cp
}

func StoreCreateUser(email string, role Role, passwordHash string) (*User, error) {
	storeMu.Lock()
	defer storeMu.Unlock()
	initStore()
	email = normalizeEmail(email)
	if _, ok := usersByEmail[email]; ok {
		return nil, nil // already exists
	}
	id := GetRandomName(1)
	for users[id] != nil {
		id = GetRandomName(1)
	}
	u := &User{
		ID:        id,
		Email:     email,
		Role:      role,
		Active:    true,
		Password:  passwordHash,
		CreatedAt: time.Now(),
	}
	users[id] = u
	usersByEmail[email] = id
	cp := *u
	cp.Password = ""
	return &cp, nil
}

func StoreUpdateUser(id string, fn func(*User) bool) bool {
	storeMu.Lock()
	defer storeMu.Unlock()
	u := users[id]
	if u == nil {
		return false
	}
	if !fn(u) {
		return false
	}
	usersByEmail[u.Email] = id
	return true
}

func StoreListUsers(role Role) []User {
	storeMu.RLock()
	defer storeMu.RUnlock()
	var list []User
	for _, u := range users {
		if u == nil {
			continue
		}
		if role != "" && u.Role != role {
			continue
		}
		cp := *u
		cp.Password = ""
		list = append(list, cp)
	}
	return list
}

func StoreGetGlobalSettings() *GlobalSettings {
	storeMu.RLock()
	defer storeMu.RUnlock()
	initStore()
	// Return copy
	cp := *globalSettings
	return &cp
}

func StoreSetGlobalSettings(gs *GlobalSettings) {
	storeMu.Lock()
	defer storeMu.Unlock()
	initStore()
	if gs != nil {
		globalSettings = gs
	}
}

func StoreListDocuments() []DocumentTemplate {
	storeMu.RLock()
	defer storeMu.RUnlock()
	var list []DocumentTemplate
	for _, d := range docTemplates {
		if d != nil {
			list = append(list, *d)
		}
	}
	return list
}

func StoreGetDocument(id string) *DocumentTemplate {
	storeMu.RLock()
	defer storeMu.RUnlock()
	d := docTemplates[id]
	if d == nil {
		return nil
	}
	cp := *d
	return &cp
}

func StoreSaveDocument(d *DocumentTemplate) {
	storeMu.Lock()
	defer storeMu.Unlock()
	if d == nil {
		return
	}
	if d.ID == "" {
		d.ID = GetRandomName(1)
		for docTemplates[d.ID] != nil {
			d.ID = GetRandomName(1)
		}
	}
	d.Version++
	d.UpdatedAt = time.Now()
	docTemplates[d.ID] = d
}

func StoreDeleteDocument(id string) {
	storeMu.Lock()
	defer storeMu.Unlock()
	delete(docTemplates, id)
}

func StoreCreateSession(token, agentID string) *CoBrowseSession {
	storeMu.Lock()
	defer storeMu.Unlock()
	s := &CoBrowseSession{
		ID:      token,
		Token:   token,
		AgentID: agentID,
		Status:  StatusLinkSent,
		CreatedAt: time.Now(),
	}
	coBrowseSessions[token] = s
	sessionsByToken[token] = s
	return s
}

func StoreGetSession(token string) *CoBrowseSession {
	storeMu.RLock()
	defer storeMu.RUnlock()
	s := coBrowseSessions[token]
	if s == nil {
		s = sessionsByToken[token]
	}
	if s == nil {
		return nil
	}
	cp := *s
	return &cp
}

func StoreUpdateSession(token string, fn func(*CoBrowseSession) bool) bool {
	storeMu.Lock()
	defer storeMu.Unlock()
	s := coBrowseSessions[token]
	if s == nil {
		s = sessionsByToken[token]
	}
	if s == nil {
		return false
	}
	return fn(s)
}

func StoreListSessions() []CoBrowseSession {
	storeMu.RLock()
	defer storeMu.RUnlock()
	var list []CoBrowseSession
	for _, s := range coBrowseSessions {
		if s != nil {
			list = append(list, *s)
		}
	}
	return list
}

func StoreListSessionsByAgent(agentID string) []CoBrowseSession {
	storeMu.RLock()
	defer storeMu.RUnlock()
	var list []CoBrowseSession
	for _, s := range coBrowseSessions {
		if s != nil && s.AgentID == agentID {
			list = append(list, *s)
		}
	}
	return list
}

func StoreAppendAudit(sessionID, actorRole, actorID, action string, payload map[string]interface{}) {
	storeMu.Lock()
	defer storeMu.Unlock()
	ev := &AuditEvent{
		ID:        GetRandomName(1),
		SessionID: sessionID,
		ActorRole: actorRole,
		ActorID:   actorID,
		Action:    action,
		Payload:   payload,
		CreatedAt: time.Now(),
	}
	auditEvents[sessionID] = append(auditEvents[sessionID], ev)
}

func StoreGetAuditEvents(sessionID string) []AuditEvent {
	storeMu.RLock()
	defer storeMu.RUnlock()
	evs := auditEvents[sessionID]
	if evs == nil {
		return nil
	}
	list := make([]AuditEvent, len(evs))
	for i, e := range evs {
		list[i] = *e
	}
	return list
}

func StoreAppendGlobalAudit(actorRole, actorID, action string, payload map[string]interface{}) {
	storeMu.Lock()
	defer storeMu.Unlock()
	ev := &AuditEvent{
		ID:        GetRandomName(1),
		SessionID: "",
		ActorRole: actorRole,
		ActorID:   actorID,
		Action:    action,
		Payload:   payload,
		CreatedAt: time.Now(),
	}
	globalAuditEvents = append(globalAuditEvents, ev)
	if len(globalAuditEvents) > 1000 {
		globalAuditEvents = globalAuditEvents[len(globalAuditEvents)-500:]
	}
}

func StoreListGlobalAudit(limit int) []AuditEvent {
	storeMu.RLock()
	defer storeMu.RUnlock()
	if limit <= 0 {
		limit = 100
	}
	evs := globalAuditEvents
	if len(evs) > limit {
		evs = evs[len(evs)-limit:]
	}
	list := make([]AuditEvent, len(evs))
	for i, e := range evs {
		list[i] = *e
	}
	return list
}
