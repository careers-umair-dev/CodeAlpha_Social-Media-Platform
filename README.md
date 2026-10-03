# MiniSocial — Premium Mini Social Media Platform

A full-stack social media platform built with **Node.js, Express.js, MongoDB, Mongoose, HTML, CSS, and Vanilla JavaScript**.

MiniSocial includes modern social networking features with a secure backend and fully responsive frontend. The Express server serves the frontend, making it a **single-deployable application**.

## ✨ Features

* 📝 Create, edit & delete text/photo posts
* ❤️ Likes, comments & saved posts
* 👥 Follow/unfollow users
* 🔔 Notifications with unread count
* 🔎 User, post & hashtag search
* 🔥 Trending topics
* 📰 For You, Following & Latest feeds
* 👤 Profiles, followers & following
* ⚙️ Account settings & password management
* 🔐 Logout everywhere & account deletion
* 🌙 Light, Dark & System themes
* 📱 Fully responsive UI

## 🛠️ Tech Stack

**Backend:** Node.js, Express.js, MongoDB, Mongoose, JWT, bcrypt
**Frontend:** HTML5, CSS3, Vanilla JavaScript
**Security:** Helmet, CORS, Rate Limiting, Input Validation
**Testing:** Node.js Tests, Playwright, Python

## 📂 Structure

```text
MiniSocial/
├── backend/
│   ├── server.js
│   ├── config/
│   ├── controllers/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   ├── services/
│   ├── scripts/
│   └── tests/
├── frontend/
│   ├── *.html
│   ├── css/
│   └── js/
└── README.md
```

## 🚀 Quick Start

```bash
git clone <your-repository-url>
cd MiniSocial/backend
npm install
```

Create `backend/.env`:

```env
MONGO_URI=<your-mongodb-uri>
JWT_SECRET=<your-secret>
PORT=5000
NODE_ENV=development
JWT_EXPIRES_IN=7d
SERVE_FRONTEND=true
```

Start the application:

```bash
npm start
```

Open **http://localhost:5000**

Development mode:

```bash
npm run dev
```

## 🗄️ Database

Supports both **MongoDB Local** and **MongoDB Atlas**.

For an existing database:

```bash
npm run migrate
```

Uploaded images are stored in MongoDB's `media` collection.

## 🧪 Testing

API tests:

```bash
npm test
```

Browser tests:

```bash
pip install playwright pillow
playwright install chromium
python3 tests/ui_e2e.py
```

## 🚀 Deployment

Recommended platforms:

* Render
* Railway
* Fly.io
* Heroku
* VPS

For Render/Railway:

```text
Root Directory: backend
Build Command: npm install
Start Command: npm start
```

Set production environment variables including `MONGO_URI`, `JWT_SECRET`, `NODE_ENV=production`, and `TRUST_PROXY=1`.

> Vercel support exists through `backend/api/index.js`, but Vercel deployment is not included or verified.

## 🔐 Security

MiniSocial uses **JWT authentication, bcrypt password hashing, server-side authorization, input validation, NoSQL injection protection, Helmet, CSP, rate limiting, and secure file validation**.

**Never commit `.env` or production secrets.**

## 📄 License

Available for educational, portfolio, and development purposes.

---

### ⭐ MiniSocial

A modern full-stack social media platform demonstrating **REST APIs, authentication, MongoDB, responsive frontend development, security, testing, and deployment**.
