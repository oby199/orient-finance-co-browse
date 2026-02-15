package core

import (
	"crypto/rand"
	"fmt"
	"math/big"
	"sync"
	"time"
)

// PendingSession holds agent-created sessions before client connects
type PendingSession struct {
	Token       string
	CreatedAt   time.Time
	ExpiresAt   time.Time
	ConnectedAt *time.Time
}

// SessionStore interface — swap to Firestore or other backend later
type SessionStore interface {
	Create(token string, ttl time.Duration) error
	Get(token string) (*PendingSession, bool)
	Validate(token string) bool
	Delete(token string)
}

type inMemoryStore struct {
	mu       sync.RWMutex
	sessions map[string]*PendingSession
}

func (s *inMemoryStore) Create(token string, ttl time.Duration) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now()
	s.sessions[token] = &PendingSession{
		Token:     token,
		CreatedAt: now,
		ExpiresAt: now.Add(ttl),
	}
	return nil
}

func (s *inMemoryStore) Get(token string) (*PendingSession, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	ps, ok := s.sessions[token]
	return ps, ok
}

func (s *inMemoryStore) Validate(token string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	ps, ok := s.sessions[token]
	if !ok || ps == nil {
		return GetRoom(token) != nil
	}
	if time.Now().After(ps.ExpiresAt) {
		delete(s.sessions, token)
		return false
	}
	return true
}

func (s *inMemoryStore) Delete(token string) {
	s.mu.Lock()
	delete(s.sessions, token)
	s.mu.Unlock()
}

var (
	defaultStore = &inMemoryStore{sessions: make(map[string]*PendingSession)}
	sessionTTL   = 15 * time.Minute
	connectRate   = make(map[string][]time.Time)
	rateMu        sync.Mutex
	rateLimit     = 10
	rateWindow    = time.Minute
)

// GenerateNumericSessionCode returns a crypto-secure 6-digit numeric code
func GenerateNumericSessionCode() string {
	n, err := rand.Int(rand.Reader, big.NewInt(1000000))
	if err != nil {
		return fmt.Sprintf("%06d", time.Now().UnixNano()%1000000)
	}
	return fmt.Sprintf("%06d", n.Int64())
}

// CreatePendingSession creates a new session token for the agent to share (numeric 6-digit code)
func CreatePendingSession() string {
	var token string
	for {
		token = GenerateNumericSessionCode()
		if GetRoom(token) == nil {
			if _, exists := defaultStore.Get(token); !exists {
				break
			}
		}
	}
	_ = defaultStore.Create(token, sessionTTL)
	return token
}

// ValidateAndClaimToken validates the token and marks it as claimed
// Returns true if valid and not expired. Rate-limits connect attempts per IP.
func ValidateAndClaimToken(token string) bool {
	return ValidateAndClaimTokenFromIP(token, "")
}

func ValidateAndClaimTokenFromIP(token string, ip string) bool {
	rateMu.Lock()
	if ip != "" {
		now := time.Now()
		cut := now.Add(-rateWindow)
		times := connectRate[ip]
		n := 0
		for _, t := range times {
			if t.After(cut) {
				times[n] = t
				n++
			}
		}
		times = times[:n]
		if len(times) >= rateLimit {
			rateMu.Unlock()
			return false
		}
		connectRate[ip] = append(times, now)
	}
	rateMu.Unlock()

	return defaultStore.Validate(token)
}

// ClaimPendingSession removes from pending when client connects (creates room)
func ClaimPendingSession(token string) {
	defaultStore.Delete(token)
}
