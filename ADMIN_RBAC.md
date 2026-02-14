# Admin Role & RBAC — Orient Finance Co-Browse

This document describes the Role-Based Access Control (RBAC) system, roles, permissions, and how to create the first admin user.

## Roles

| Role | Description |
|------|-------------|
| **ADMIN** | Full control: configuration, agents, documents, onboarding flows, session review, KYC settings |
| **AGENT** (Advisor) | Create sessions, assist clients, run onboarding, request documents, submit for review. Cannot change global settings or manage users |
| **CLIENT** | Connect to session, share screen, upload documents, complete onboarding steps. No admin or agent privileges |

## What Admin Can Do

- Manage agents (create, disable/enable, reset password, assign role)
- Manage document templates (add/edit/remove global documents)
- Edit onboarding flow (steps, KYC mode: manual/sumsub/mock)
- View all sessions, audit logs, uploads
- Change final application status (APPROVED / REJECTED / NEEDS_INFO)
- Add internal notes
- Request missing docs (creates client-visible requirement list)
- Override/close sessions
- Configure global settings (branding, session expiry, etc.)

## What Agent Can Do

- Create session
- Share link/code with client
- View client stream
- Use onboarding assistant tools (cursor, highlight, request-click)
- Request documents from client
- Mark steps complete
- Submit session for admin review
- Set "Application Name" at end

## What Agent Cannot Do

- Edit global doc templates
- Edit global onboarding flow
- Create/disable users
- Approve/reject final status (admin only)

## What Client Can Do

- Enter code, connect, share screen
- Upload requested docs
- Complete KYC (manual or Sumsub based on config)
- Provide consent and signature

## What Client Cannot Do

- Edit statuses
- See admin notes
- See other sessions

## Creating the First Admin User

### Option 1: Environment Variables (seed admin)

Set these environment variables before starting the server:

```bash
export ADMIN_EMAIL=admin@orientfinance.com
export ADMIN_PASSWORD=your_secure_password
./laplace  # or your run command
```

On first run, an admin user is created automatically. Log in at `/admin/login` with these credentials.

### Option 2: Upgrade Existing Agent

If `ADMIN_EMAIL` matches an existing agent's email, that user is upgraded to admin on seed.

### Option 3: Create via Existing Admin

Once you have one admin, log in at `/admin/login`, go to **Agents**, and create new agents. To create another admin, you would need to add that capability to the Agents UI or use the same env seed for a different email.

## API Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/login` | POST | — | Login; returns session cookie, redirect URL |
| `/api/auth-check` | GET | — | Returns `{ authed, role, user }` |
| `/api/logout` | POST | — | Clears session |
| `/api/admin/dashboard` | GET | Admin | Dashboard stats |
| `/api/admin/agents` | GET/POST | Admin | List agents / create agent |
| `/api/admin/agents/:id` | PUT | Admin | Update agent (active, password) |
| `/api/admin/settings` | GET/PUT | Admin | Global settings |
| `/api/admin/documents` | GET/POST | Admin | List/create documents |
| `/api/admin/documents/:id` | PUT/DELETE | Admin | Update/delete document |
| `/api/admin/onboarding-flow` | GET/PUT | Admin | Onboarding steps, KYC mode |
| `/api/admin/sessions` | GET | Admin | List sessions |
| `/api/admin/sessions/:id` | GET | Admin | Session details, audit |
| `/api/admin/review/:id` | POST | Admin | Submit review (status, notes) |

## Admin UI Routes

| Route | Description |
|-------|-------------|
| `/admin/login` | Admin login (public) |
| `/admin` | Dashboard |
| `/admin/agents` | Agent management |
| `/admin/settings` | Global settings |
| `/admin/documents` | Document templates |
| `/admin/onboarding-flow` | Onboarding flow config |
| `/admin/sessions` | Session list |
| `/admin/sessions/:id` | Session details |
| `/admin/review/:id` | Review session |

## Backend Enforcement

- All `/api/admin/*` endpoints require `RoleAdmin`. This is enforced in `RequireAdmin()` middleware.
- Session creation (`/api/session/create`, `/api/create-session`) requires agent or admin auth.
- Middleware in `main.go` redirects unauthenticated users from `/admin` to `/admin/login`, and non-admin users to `/agent`.

## Audit Logging

- Client connect (IP, User-Agent) is recorded.
- Admin review decisions are appended to the audit log.
- Audit events are stored per session and viewable in admin session details.
