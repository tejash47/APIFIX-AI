# 🚀 Digital Class Diary - Deployment Guide

## Prerequisites
- GitHub account
- MongoDB Atlas account (free tier available)
- Gemini API key (free tier available)

---

## Step 1: Push to GitHub

```bash
# Initialize git (if not already)
cd digital-class-diary
git init
git add .
git commit -m "Initial commit"

# Create a new repository on GitHub, then:
git remote add origin https://github.com/YOUR_USERNAME/digital-class-diary.git
git branch -M main
git push -u origin main
```

---

## Step 2: Set Up MongoDB Atlas

1. Go to [cloud.mongodb.com](https://cloud.mongodb.com)
2. Create a free cluster (M0 tier)
3. Create a database user:
   - Username: `dcd_user`
   - Password: (generate a secure password)
4. Under "Network Access", add `0.0.0.0/0` (allow all IPs)
5. Click "Connect" → "Connect your application"
6. Copy the connection string

**Connection string format:**
```
mongodb+srv://dcd_user:YOUR_PASSWORD@cluster0.xxxxx.mongodb.net/?appName=Cluster0
```

---

## Step 3: Deploy to Render (Recommended)

### Option A: One-Click Deploy (Easiest)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

1. Click the button above
2. Connect your GitHub account
3. Select your repository
4. Fill in the environment variables:

| Variable | Value |
|----------|-------|
| `NODE_ENV` | `production` |
| `PORT` | `10000` |
| `MONGODB_URI` | Your MongoDB Atlas connection string |
| `GEMINI_API_KEY` | Your Gemini API key from [aistudio.google.com](https://aistudio.google.com) |
| `JWT_SECRET` | Any random secure string (Render can auto-generate) |
| `APP_URL` | Leave blank or use `https://your-app.onrender.com` |

5. Click "Create Web Service"
6. Wait for deployment (~3-5 minutes)

### Option B: Manual Deploy via CLI

```bash
# Install Render CLI
npm install -g @render/create-service

# Deploy
render deploy --service-type=web --plan=free
```

---

## Step 4: Get Your Gemini API Key

1. Go to [aistudio.google.com](https://aistudio.google.com)
2. Click "Get API key" in the sidebar
3. Create a new API key
4. Copy and use it in Render environment variables

---

## Step 5: Verify Deployment

After deployment, visit:
```
https://your-app-name.onrender.com
```

Check the health endpoint:
```
https://your-app-name.onrender.com/api/db-status
```

Should return:
```json
{"connected":true,"type":"MongoDB Atlas"}
```

---

## Troubleshooting

### Common Issues

**1. "MONGODB_URI is required" error**
- Make sure the env var is set in Render dashboard
- Check for typos in the connection string
- Ensure MongoDB Atlas cluster is not paused

**2. "GEMINI_API_KEY is not defined" warning**
- AI summaries will use fallback templates (app still works)
- Add the API key in Render environment variables

**3. App shows "Local JSON Fallback"**
- MongoDB connection failed
- Check Network Access in MongoDB Atlas (allow all IPs)
- Verify username/password in connection string

**4. Build fails on Render**
- Ensure `npm run build` works locally first
- Check that `node_modules` is in `.gitignore`
- Verify TypeScript compilation: `npm run lint`

### Free Tier Limitations (Render)

- Service sleeps after 15 minutes of inactivity
- First deployment takes 3-5 minutes
- 750 hours per month free

---

## Updating Your App

```bash
# Make changes, commit, push
git add .
git commit -m "Your update message"
git push origin main

# Render automatically deploys on push!
```

---

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGODB_URI` | ✅ Yes | MongoDB Atlas connection string |
| `GEMINI_API_KEY` | Recommended | For AI-powered lesson summaries |
| `JWT_SECRET` | Auto-generated | Secret for JWT token signing |
| `APP_URL` | Optional | Your deployed app URL |
| `PORT` | `10000` | Render assigns this automatically |
| `NODE_ENV` | `production` | Required for production mode |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Render Cloud                      │
│  ┌───────────────────────────────────────────────┐  │
│  │            Express Server (Node.js)            │  │
│  │  ┌─────────────┐     ┌─────────────────────┐  │  │
│  │  │  React App  │     │    API Routes       │  │  │
│  │  │  (Frontend) │     │  - Auth (JWT)        │  │  │
│  │  │             │     │  - Classrooms        │  │  │
│  │  │             │     │  - Lessons           │  │  │
│  │  │             │     │  - Assignments       │  │  │
│  │  │             │     │  - AI Summaries      │  │  │
│  │  └─────────────┘     └─────────────────────┘  │  │
│  └───────────────────────┬───────────────────────┘  │
│                          │                           │
└──────────────────────────┼───────────────────────────┘
                           │
                    ┌──────▼──────┐
                    │  MongoDB    │
                    │  Atlas      │
                    │  (Cloud)    │
                    └─────────────┘
```

---

## Need Help?

- [Render Documentation](https://render.com/docs)
- [MongoDB Atlas Documentation](https://docs.atlas.mongodb.com)
- [Gemini API Documentation](https://ai.google.dev/docs)
