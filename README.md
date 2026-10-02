# MiniSocial — Premium Mini Social Media Platform

A full-stack social network built on the original stack: **Node.js + Express + MongoDB (Mongoose)** with a
**framework-free HTML/CSS/JavaScript frontend** (no build step). The backend serves the frontend, so it is a
single deployable app.

## Features
Posts (text + photos, edit/delete) · likes · comments (edit/delete) · follow/unfollow · saved posts ·
notifications (follow / like / comment, unread badge) · user + post + #hashtag search · trending topics ·
For you / Following / Latest feeds · profiles (avatar, bio, stats, Posts/Media tabs, followers/following lists) ·
settings (theme, password, log out everywhere, delete account) · light/dark/system themes · fully responsive.

## Quick start
```bash
cd backend
npm install
cp .env.example .env          # then edit MONGO_URI and JWT_SECRET (see below)
npm start                     # http://localhost:5000
```
Open <http://localhost:5000> and register. `npm run dev` restarts on file changes (nodemon).

## Environment variables (`backend/.env`)
| Variable | Required | Description |
|---|---|---|
| `MONGO_URI` | ✅ | MongoDB connection string (local or Atlas). |
| `JWT_SECRET` | ✅ | Long random string (32+ chars; enforced in production). Generate: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `PORT` | – | Default `5000`. |
| `NODE_ENV` | – | Set `production` when deployed. |
| `JWT_EXPIRES_IN` | – | Default `7d`. |
| `CORS_ORIGIN` | – | Comma-separated origins, only if the frontend is hosted on a different domain. |
| `SERVE_FRONTEND` | – | `true` (default). Set `false` if you host `frontend/` elsewhere. |
| `TRUST_PROXY` | – | `1` when behind Render/Railway/Heroku/Nginx (correct rate-limit IPs). |

## MongoDB setup
* **Local:** install MongoDB Community, start `mongod`, use `MONGO_URI=mongodb://127.0.0.1:27017/mini-social-media`.
* **Atlas (free tier):** create a cluster → *Database Access*: add a user → *Network Access*: allow your IP
  (or `0.0.0.0/0` for hosting platforms) → *Connect → Drivers* and copy the URI, put your password in it.
* Collections and indexes are created automatically on first run. Nothing else to configure.
* Uploaded images are stored in MongoDB (`media` collection), so no disk/S3 is needed.
* **Upgrading an existing database** from the original project: run `npm run migrate` once (idempotent).
  It recalculates like/comment/follower counters and hashtags and builds the new indexes. Existing users,
  passwords and posts keep working unchanged.

## Testing
```bash
# API suite (108 checks) — run against a THROWAWAY database with the server running
RATE_LIMIT_DISABLED=true npm start     # terminal 1
npm test                               # terminal 2

# Browser suite (41 checks, needs: pip install playwright pillow && playwright install chromium)
python3 tests/ui_e2e.py
```

## Deployment
The app is a single long-running Node process, which suits **Render, Railway, Fly.io, Heroku or any VPS**:
1. Push the repo to GitHub; create a *Web Service* with **root directory `backend`**,
   build command `npm install`, start command `npm start`.
2. Set `NODE_ENV=production`, `MONGO_URI`, `JWT_SECRET`, `TRUST_PROXY=1`.
3. Allow the host in MongoDB Atlas *Network Access*. Open the service URL — done (HTTPS is provided by the host).

VPS: `npm install --omit=dev`, run with `pm2 start server.js --name minisocial`, and put Nginx/Caddy with HTTPS in front.

*Vercel/serverless:* `backend/api/index.js` exports the Express app and the DB connection is reused between
invocations, but a Vercel config is **not included and was not tested**; Render/Railway is the verified path.
If you host the frontend separately, add `<meta name="api-base" content="https://your-api/api">` to the pages,
set `SERVE_FRONTEND=false` and `CORS_ORIGIN=https://your-frontend`.

## Security notes
* Passwords: bcrypt (cost 12), min 8 chars with a letter + number; constant-time-ish login to avoid user enumeration.
* JWT (HS256) with a per-user `tokenVersion`: changing the password or "Log out everywhere" revokes every token.
* Every write route is authenticated server-side; ownership is checked in the controller (never trusted from the client).
* Input validated server-side; query operators are rejected (NoSQL-injection safe); regex search input is escaped;
  mass-assignment blocked (only whitelisted profile fields).
* Helmet + strict CSP (no inline scripts), rate limiting on auth/upload/API, body-size limits, uploads verified by file signature.
* Errors never leak stack traces. `.env` is git-ignored — **never commit it**.

## Project layout
```
backend/  server.js · config/ · controllers/ · middleware/ · models/ · routes/ · services/ · utils/ · scripts/migrate.js · tests/
frontend/ *.html (9 pages) · css/style.css (design system) · js/ (api, ui, components, layout + one script per page) · fonts/
```
