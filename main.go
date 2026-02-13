package main

import (
	_ "embed"
	"flag"
	"laplace/core"
	"log"
	"math/rand"
	"net/http"
	"strings"
	"time"
)

//go:embed files/agent-login.html
var agentLoginHTML []byte

func authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		if path == "" {
			path = "/"
		}
		authed := core.IsAuthenticated(r)

		// 1) DETERMINISTIC: /agent/login → ONLY agent-login.html (embedded in binary; no wrong template)
		if path == "/agent/login" || strings.HasPrefix(path, "/agent/login/") {
			log.Printf("[route] /agent/login -> agent-login.html (embedded)")
			w.Header().Set("Cache-Control", "no-store, no-cache")
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.WriteHeader(http.StatusOK)
			w.Write(agentLoginHTML)
			return
		}

		// 2) /api/auth-check - never 404, handled before mux
		if path == "/api/auth-check" {
			core.ApiAuthCheck(w, r)
			return
		}

		// Public routes (no auth)
		if path == "/" ||
			path == "/join" ||
			strings.HasPrefix(path, "/connect") ||
			strings.HasPrefix(path, "/start") ||
			strings.HasPrefix(path, "/room/") ||
			strings.HasPrefix(path, "/static/") ||
			strings.HasPrefix(path, "/api/") ||
			path == "/ws/serve" || path == "/ws/connect" ||
			path == "/logout" {
			next.ServeHTTP(w, r)
			return
		}

		// /stream.html: client (stream=1&room) = public, agent (id=) = protected
		if path == "/stream.html" {
			stream, room := r.URL.Query().Get("stream"), r.URL.Query().Get("room")
			if stream == "1" && room != "" {
				next.ServeHTTP(w, r)
				return
			}
			if !authed {
				log.Printf("[redirect] from=%s to=/agent/login authed=false pathname=%s", path, path)
				http.Redirect(w, r, "/agent/login", http.StatusFound)
				return
			}
			next.ServeHTTP(w, r)
			return
		}

		// Protect /agent, /agent/, /agent/session/* (NOT /agent/login - handled above)
		if strings.HasPrefix(path, "/agent") {
			if !authed {
				log.Printf("[redirect] from=%s to=/agent/login authed=false pathname=%s", path, path)
				http.Redirect(w, r, "/agent/login", http.StatusFound)
				return
			}
			next.ServeHTTP(w, r)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func main() {
	addr := flag.String("addr", "0.0.0.0:443", "Listen address")
	tls := flag.Bool("tls", true, "Use TLS")
	certFile := flag.String("certFile", "files/server.crt", "TLS cert file")
	keyFile := flag.String("keyFile", "files/server.key", "TLS key file")
	flag.Parse()

	rand.Seed(time.Now().UnixNano())
	mux := core.GetHttp()
	server := authMiddleware(mux)

	if *tls {
		log.Println("Listening on TLS:", *addr)
		if err := http.ListenAndServeTLS(*addr, *certFile, *keyFile, server); err != nil {
			log.Fatalln(err)
		}
	} else {
		log.Println("Listening:", *addr)
		if err := http.ListenAndServe(*addr, server); err != nil {
			log.Fatalln(err)
		}
	}
}
