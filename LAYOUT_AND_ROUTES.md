# Orient Finance Co-Browse — Layout & Route Summary

## Layout Structure

### Admin & SRM (Sidebar Layout)

```
<body>
  <div class="app-layout has-sidebar">
    <aside class="sidebar">
      <div class="sidebar-header">Logo + title</div>
      <nav class="sidebar-nav">Menu items</nav>
      <div class="sidebar-footer">Logout</div>
    </aside>
    <div class="sidebar-overlay"></div>  <!-- Mobile: click to close -->
    <main class="main-content">
      <header class="topbar">
        <button class="topbar-hamburger">☰</button>  <!-- Mobile only -->
        <h1 class="topbar-title">Page title</h1>
        <span class="topbar-user">User email</span>
      </header>
      <section class="page-content">
        <!-- Dynamic content -->
      </section>
    </main>
  </div>
</body>
```

### Public Pages (No Sidebar)

- `/`, `/join`, `/connect`, `/stream` (client mode): Simple centered layout, no sidebar.

---

## Route Protection Summary

| Route pattern | Auth required | Role |
|---------------|---------------|------|
| `/`, `/join`, `/connect`, `/start`, `/room/*`, `/stream.html?stream=1&room=*` | No | Public |
| `/srm/login` | No | Public (login page) |
| `/admin/login` | No | Public (login page) |
| `/srm`, `/srm/*`, `/viewer/*` | Yes | SRM or Admin |
| `/stream.html?id=*` (viewer) | Yes | SRM or Admin |
| `/admin`, `/admin/*` (except login) | Yes | Admin only |

---

## Sidebar Menu

### Admin (`/admin/*`)

| Item | Route |
|------|-------|
| 🏠 Dashboard | `/admin` |
| 👤 Sales Relationship Managers | `/admin/srms` |
| ⚙ Settings | `/admin/settings` |
| 📄 Documents | `/admin/documents` |
| 🔁 Onboarding Flow | `/admin/onboarding` |
| 📊 Sessions | `/admin/sessions` |
| 📝 Audit Log | `/admin/audit` |
| 🚪 Logout | `/logout` |

### SRM (`/srm/*`)

| Item | Route / Action |
|------|----------------|
| 🏠 Dashboard | `/srm` |
| ➕ Create Session | Primary button → Dashboard + create |
| 📊 My Sessions | `/srm/sessions` |
| 👤 Profile | `/srm/profile` |
| 🚪 Logout | `/logout` |

---

## Responsive Behavior

- **≥1024px**: Sidebar fixed left (240px), main content has `margin-left: 240px`.
- **<1024px**: Sidebar becomes overlay drawer. Hamburger in topbar toggles it. Clicking overlay closes sidebar.

---

## CSS Files

| File | Purpose |
|------|---------|
| `layout.css` | App layout, topbar, page-content, hamburger |
| `sidebar.css` | Sidebar, nav links, overlay, mobile drawer |
| `components.css` | Cards, stats, tables, badges, buttons |
| `admin.css` | Admin-specific overrides |

---

## No Broken Navigation

- All sidebar links use client-side routing (history.pushState) where applicable.
- Session "View" links and "Back to sessions" use SPA navigation.
- External links (/logout, /viewer/:id in new tab) use normal navigation.
- Active route highlighting: `data-route` + `path.startsWith(route)` for sub-routes.
