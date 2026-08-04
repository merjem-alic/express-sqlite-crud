# Express SQLite CRUD — Auth API

A secure REST API built with Node.js and Express, using **Supabase Auth** as an Identity Provider to handle user signup, login, logout, and token-protected routes. Extends an existing CRUD API with a full authentication layer: JWT-based auth, reusable middleware for route protection, and interactive API docs via Swagger UI.

## What this project does

- Lets users sign up and log in via email/password, handled by Supabase Auth
- Issues a JWT (access token) on login, which the client attaches to protected requests
- Verifies that JWT server-side before granting access to protected routes
- Exposes both public (no auth) and protected (auth required) endpoints
- Documents every route interactively at `/docs` via Swagger UI, with working bearer-token authorization

## Setup

### 1. Clone the repo
```bash
git clone https://github.com/merjem-alic/express-sqlite-crud.git
cd express-sqlite-crud
```

### 2. Install dependencies
```bash
npm install
```

### 3. Set up environment variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Then fill in your own values:
```
SUPABASE_URL=your_project_url
SUPABASE_KEY=your_anon_key
PORT=3000
DATABASE_URL=postgres://postgres:dev@localhost:5432/tasks
```

Get your `SUPABASE_URL` and `SUPABASE_KEY` (publishable/anon key) from your Supabase Dashboard under **Project Settings → API**.

**Important:** In your Supabase project, go to **Authentication → Sign In / Providers → User Signups**, and toggle **off** "Confirm email" for local testing — otherwise signups will require email confirmation before login works.

### 4. Run it
```bash
npm start
```
You should see:
```
Server running and connected to Supabase on http://localhost:3000
```

## API Reference

| Method | Route | Auth Required | Description |
|--------|-------|:---:|-------------|
| POST | `/auth/signup` | No | Create a new user account |
| POST | `/auth/login` | No | Authenticate and receive a JWT |
| POST | `/auth/logout` | Yes | Terminate the current session |
| GET | `/public/info` | No | Public, unprotected data |
| GET | `/protected/profile` | Yes | Read the logged-in user's profile |
| GET | `/protected/dashboard` | Yes | Example second protected route |

For protected routes, send the token like this:
```
Authorization: Bearer <your_access_token>
```

## Interactive Docs

Once the server is running, visit:
```
http://localhost:3000/docs
```
Click **Authorize**, paste in an access token (from `/auth/login`), and use "Try it out" on any route directly from the browser.

![Swagger UI](./swagger-screenshot.png)

## Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success (login, profile read) |
| 201 | User created (signup) |
| 204 | Logout successful, no content returned |
| 400 | Missing or invalid input |
| 401 | Missing, invalid, or expired token |

## Notes

- Passwords and credentials are never handled or stored by this server directly — Supabase manages authentication, hashing, and token issuance.
- `.env` is excluded from version control via `.gitignore`. Never commit real Supabase keys.