# University Knowledge Hub — Sprint 1

A web prototype of the university knowledge hub: students and staff sign in with their university account and search official documents (policies, regulations, guides). This repository covers the first three user stories of Sprint 1.

## User stories

| # | Story | Iteration | Responsible | What is implemented |
|---|-------|-----------|-------------|---------------------|
| US1 | **Login** — As a student/staff, I want to log in with my university credentials, so that I can access the knowledge hub securely. | 1 | Vakhitova Dilyara | Login form (username above password), Login button disabled until both fields are filled, SSO / LDAP check, “Invalid username or password” error, redirect to the search page, Logout, 30-minute inactivity timeout with “Session expired, please log in again”, JWT-style session token. Passwords are never stored in the hub database. |
| US2 | **User Role** — As an admin, I want to assign roles to users, so that each user sees only the content relevant to their role. | 1 | Vakhitova Dilyara | Roles Student / Staff / Admin, one role per user, admin page for role assignment, role saved to the `users` table at once and applied at the next login, an admin cannot change their own role, “Access Denied” for non-admins, role-based filtering of search results. |
| US3 | **Search information** — As a user, I want a clean search page with a search bar, so that I can start finding information immediately. | 2 | Oteukyzy Dana | Search bar at the top with the placeholder “Ask your question...”, search on Enter or the Search button, empty query is not sent and shows “Please enter your question”, FAQ and History links in the navigation, responsive layout (desktop, tablet, mobile 375px), page load time shown in the footer. |

## Demo accounts

| Username | Password | Role |
|----------|----------|------|
| `student1` | `student123` | Student |
| `staff1` | `staff123` | Staff |
| `admin` | `admin123` | Admin |

## How to run

No build step and no dependencies. Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## How to check the QA scenarios

Click **QA checks** in the bottom-right corner. The panel lists every scenario from the US1–US3 QA test sheets with buttons to run them, for example “Simulate 30 min idle”, “Simulate SSO outage”, “Go to #admin” as a student, and “Submit empty query”. It also shows the number of API requests sent, so you can see that an empty query is not sent.

| Story | Scenario | Expected result |
|-------|----------|-----------------|
| US1 | S1 Valid credentials | Redirect to the main search page |
| US1 | S2 Invalid credentials | “Invalid username or password” |
| US1 | S3 Logout | Session ends, login page opens |
| US1 | S4 Session timeout | Login page with “Session expired, please log in again” |
| US2 | S1 Admin assigns Staff | Role saved; the user sees staff documents after the next login |
| US2 | S2 Student opens `#admin` | “Access Denied” |
| US2 | S3 Role filtering | “Staff Workload Regulations” is hidden for Students, visible for Staff |
| US3 | S1 Main page | Search bar at the top, FAQ and History links visible |
| US3 | S2 Empty query | Query not sent, “Please enter your question” |
| US3 | S3 Mobile 375px | Search bar usable, no horizontal overflow |

## Project structure

```
index.html      page markup
css/style.css   styles, light and dark theme, responsive rules
js/app.js       application logic
```

`js/app.js` is split into layers that mirror the future backend:

- **SSO** — mock university SSO / LDAP directory. Password hashes live only here.
- **DB** — the hub's `users` table (`id, username, full_name, role, last_login`), no password column. Saved in `localStorage` for the demo.
- **API** — “backend” functions (`login`, `search`, `listUsers`, `setRole`). Every call verifies the token; role checks and document filtering happen here, not in the UI.
- **Session / Router / Views** — the front end.

## How it works

There is no real server yet. The browser runs everything, and a "request" is the page calling a function of the `API` object. The API always checks the session token first.

```
Page (Views)  ──►  API  ──►  SSO (checks the password)
                    │
                    └──►  DB  (users table, roles)
```

**Login**
1. The user enters a username and password and clicks Login.
2. `API.login` asks `SSO` whether the password is correct. If it is wrong, the page shows “Invalid username or password”.
3. The API finds the user in `DB` (a first-time user is created as Student) and saves `last_login`.
4. The API returns a signed token with the user's id, name and role. The page keeps it in `sessionStorage` and opens the search page.

**Search**
1. An empty query is not sent. The page shows “Please enter your question”.
2. Otherwise the page calls `API.search(token, query)`.
3. The API checks the token and reads the role: Student sees public documents, Staff sees public and staff documents, Admin sees all.
4. The documents are ranked by matching words (title +3, tags +2, text +1) and returned to the page, and the query is added to History.

**Changing a role (admin)**
1. The admin picks a role and clicks Save. The page calls `API.setRole(token, userId, role)`.
2. The API checks that the token belongs to an Admin and that the admin is not changing their own role. Otherwise it returns “Access Denied”.
3. The role is saved in `DB`. The user gets it at their next login, because the old token still has the old role.

**Session timeout**
Every click or key press updates the last-activity time. After 30 minutes without activity, the session ends and the login page shows “Session expired, please log in again”.

When the real backend is added, the `API` functions become HTTP endpoints (for example `POST /api/login`, `GET /api/search?q=`), `DB` becomes a real database and `SSO` becomes the university login. The flow stays the same.

## Limitations of the prototype

- SSO / LDAP, the database and the API are simulated in the browser. In the next iterations they will be replaced by the real university SSO and a server with a database.
- FAQ (US10) and saved History (US9) are placeholders planned for iteration 4; the links are in place as required by US3.
- Search is keyword-based over sample documents. Natural-language and semantic search come in US4–US5.
