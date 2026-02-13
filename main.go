package main

import (
	"flag"
	"laplace/core"
	"log"
	"math/rand"
	"net/http"
	"strings"
	"time"
)

func authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		if path == "" {
			path = "/"
		}

		// Public routes
		if path == "/" ||
			path == "/join" ||
			strings.HasPrefix(path, "/connect") ||
			strings.HasPrefix(path, "/start") ||
			strings.HasPrefix(path, "/room/") ||
			strings.HasPrefix(path, "/static/") ||
			strings.HasPrefix(path, "/api/") ||
			path == "/ws_serve" || path == "/ws_connect" ||
			path == "/ws/serve" || path == "/ws/connect" ||
			path == "/logout" ||
			strings.HasPrefix(path, "/agent/login") {
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
			if !core.IsAuthenticated(r) {
				http.Redirect(w, r, "/agent/login", http.StatusFound)
				return
			}
			next.ServeHTTP(w, r)
			return
		}

		// Protect all /agent/* except /agent/login
		if strings.HasPrefix(path, "/agent") {
			if !core.IsAuthenticated(r) {
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
