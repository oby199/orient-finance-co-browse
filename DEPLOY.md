# Deployment Guide

## Option 1: Fly.io (recommended)

1. Install [Fly CLI](https://fly.io/docs/hub/getting-started/): `brew install flyctl`
2. Log in: `fly auth login`
3. Launch (first time only): `fly launch` — creates the app, answer prompts
4. Deploy: `fly deploy`

Your app will be live at `https://<app-name>.fly.dev`

## Option 2: Docker

Build and run locally:

```bash
docker build -t orient-co-browse .
docker run -p 8080:8080 orient-co-browse
```

Or use the image from GitHub Container Registry (after CI runs):

```bash
docker pull ghcr.io/oby199/orient-co-browse:latest
docker run -p 8080:8080 ghcr.io/oby199/orient-co-browse:latest
```

## Option 3: GitHub Actions → Fly.io

1. Get a Fly API token: `fly tokens create deploy`
2. In GitHub: **Settings → Secrets and variables → Actions** → add `FLY_API_TOKEN`
3. Uncomment the `fly-deploy` job in `.github/workflows/deploy.yml`
4. Push to `main` — the workflow builds Docker, pushes to GHCR, and deploys to Fly.io

## Option 4: Manual VPS / server

```bash
git clone https://github.com/oby199/orient-finance-co-browse.git
cd orient-finance-co-browse
go build -o laplace .
./laplace -tls=false -addr=0.0.0.0:8080
```

Use systemd, supervisor, or a reverse proxy (nginx) for production.

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_EMAIL` | advisor@orientfinance.com | Agent login email |
| `AGENT_PASSWORD` | orient2024 | Agent login password |
