# A4KU // 12 Welcomer Multi-Node Cluster

High-performance Discord Welcomer hosting platform and container access grid. Features 12 isolated node containers, multi-token rotation, randomized welcome messages, live console streams, and an encrypted administrative leasing portal.

---

## 🚀 One-Click Deployment to Render.com

Deploy this project as a **Web Service** on Render in under 2 minutes:

### 1. Push to GitHub
Create a new GitHub repository (public or private) and push this project directory:
```bash
git init
git add .
git commit -m "feat: initial commit for A4KU welcomer matrix"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo-name>.git
git push -u origin main
```

### 2. Create Web Service on Render
1. Go to [dashboard.render.com](https://dashboard.render.com).
2. Click **New +** → **Web Service**.
3. Connect your GitHub repository.
4. Configure the settings:
   - **Name**: `a4ku-welcomer` (or your preferred name)
   - **Environment**: `Node`
   - **Region**: Choose the region closest to your users
   - **Branch**: `main`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Instance Type**: `Free` (or `Starter` for dedicated 24/7 processes)

### 3. Environment Variables (Optional)
In the **Environment** tab on Render, add:
| Key | Value | Description |
| :--- | :--- | :--- |
| `ADMIN_PASSWORD` | `YourSecretMasterKey123!` | Sets your master administrator password. |
| `NODE_VERSION` | `20.18.0` | (Optional) Recommended LTS Node version. |

Click **Deploy Web Service**!

---

## ⚡ Keeping Render Free Tier Awake (24/7 Bot Uptime)

Render's Free tier spins down after 15 minutes of inactivity. To keep your Discord bots online 24/7 for free:

1. Sign up for free at [Cron-Job.org](https://cron-job.org) or [UptimeRobot.com](https://uptimerobot.com).
2. Create a new HTTP monitor pointing to your public health ping endpoint:
   ```text
   https://<your-app-name>.onrender.com/api/ping
   ```
3. Set the interval to **every 5 minutes** or **every 10 minutes**.
4. This keeps the Node.js process warm and prevents container suspension.

---

## 🔑 Administrative Control Station

- **URL**: `https://<your-app-name>.onrender.com/admin.html`
- **Security**:
  - Encrypted SHA-256 salted password hashing.
  - Proxy-aware brute-force rate limiter (5 failed attempts max).
  - Secure HttpOnly session tokens.
  - In-browser **Change Master Key** rotation modal.
  - Generates buyer receipts and unique activation keys (`KEY-S01-XXXX-XXXX`).

---

## 🌐 Public Leasing Portal

- **URL**: `https://<your-app-name>.onrender.com/slots.html`
- Directs prospective buyers to **`https://discord.gg/unq`**.
- Authenticated users access their isolated control room at `/dashboard.html?slot=<id>`.
