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

//go:embed files/admin-login.html
var adminLoginHTML []byte

// nocacheDevWrapper adds Cache-Control: no-store in dev mode to prevent stale HTML/JS.
func nocacheDevWrapper(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
		w.Header().Set("Pragma", "no-cache")
		w.Header().Set("Expires", "0")
		next.ServeHTTP(w, r)
	})
}

// Routing regression checklist (verify after changes):
// - / opens SRM landing (via 302 redirect to /srm)
// - /srm opens SRM landing (Welcome, Join session, SRM login)
// - From /srm → Join session → /join
// - On /join, logo/title "Orient Finance Co-Browse" → /srm (not /)
// - Client Back/Home on join, connect → /srm
// - SRM pages → /srm, Admin pages → /admin
// - No route shows old advisor/landing at /

func authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		if path == "" {
			path = "/"
		}

		// 0) /admin/login FIRST — must match before any other logic
		if path == "/admin/login" || strings.HasPrefix(path, "/admin/login/") {
			w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
			w.Header().Set("Pragma", "no-cache")
			w.Header().Set("Expires", "0")
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.WriteHeader(http.StatusOK)
			w.Write(adminLoginHTML)
			return
		}

		authed := core.IsAuthenticated(r)

		// 1) Redirect / → /srm (Option A: single landing at /srm)
		if path == "/" {
			http.Redirect(w, r, "/srm", http.StatusFound)
			return
		}

		// 2) Redirect /agent/* → /srm/* (permanent)
		if strings.HasPrefix(path, "/agent") {
			srmPath := "/srm" + strings.TrimPrefix(path, "/agent")
			if srmPath == "/srm" {
				srmPath = "/srm"
			}
			http.Redirect(w, r, srmPath, http.StatusMovedPermanently)
			return
		}

		// 3) SRM login page (public)
		if path == "/srm/login" || strings.HasPrefix(path, "/srm/login/") {
			w.Header().Set("Cache-Control", "no-store, no-cache")
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.WriteHeader(http.StatusOK)
			w.Write(agentLoginHTML)
			return
		}

		// 4) /api/auth-check and /api/health - never 404, handled before mux
		if path == "/api/auth-check" {
			core.ApiAuthCheck(w, r)
			return
		}
		if path == "/api/health" {
			core.ApiHealth(w, r)
			return
		}

		// Public routes (no auth). Note: / redirects to /srm above.
		if path == "/join" ||
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
				log.Printf("[redirect] from=%s to=/srm/login authed=false pathname=%s", path, path)
				http.Redirect(w, r, "/srm/login", http.StatusFound)
				return
			}
			next.ServeHTTP(w, r)
			return
		}

		// /srm, /srm/: landing when unauthed, dashboard when authed
		if path == "/srm" || path == "/srm/" {
			if !authed {
				w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate")
				w.Header().Set("Pragma", "no-cache")
				http.ServeFile(w, r, "files/landing.html")
				return
			}
			next.ServeHTTP(w, r)
			return
		}
		// /srm/* (deeper), /viewer: require auth
		if strings.HasPrefix(path, "/srm") || strings.HasPrefix(path, "/viewer") {
			if !authed {
				http.Redirect(w, r, "/srm/login", http.StatusFound)
				return
			}
			next.ServeHTTP(w, r)
			return
		}

		// Protect /admin (NOT /admin/login - handled above). Requires admin role.
		if strings.HasPrefix(path, "/admin") {
			if !authed {
				http.Redirect(w, r, "/admin/login", http.StatusFound)
				return
			}
			_, role, _ := core.GetSessionUser(r)
			if role != core.RoleAdmin {
				http.Redirect(w, r, "/srm", http.StatusFound)
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
	dev := flag.Bool("dev", false, "Dev mode: Cache-Control no-store on all responses to prevent browser cache confusion")
	flag.Parse()

	rand.Seed(time.Now().UnixNano())
	core.SeedAdmin()
	core.SeedDefaultAgent()
	mux := core.GetHttp()
	server := authMiddleware(mux)
	if *dev {
		server = nocacheDevWrapper(server)
	}

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
