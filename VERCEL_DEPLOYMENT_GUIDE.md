# Vercel Deployment Guide

## Overview
The dark-matter-ui has been configured for Vercel deployment with a committed demo-state snapshot fixture.

## Setup Complete
✅ Vercel CLI installed globally  
✅ `vercel.json` config in place at `apps/dark-matter-ui/`  
✅ Demo snapshot committed at `apps/dark-matter-ui/app/api/session/demo-state.snapshot.json` (3 RFQs, 3 agreements)  
✅ Session API fallback loading implemented  
✅ All code pushed to main (commit 28d3a1d)  

## Deployment Steps

### Option A: From Dev Container (Recommended)
```bash
cd /workspace/projects/agentic-dark-matter-oracle/apps/dark-matter-ui

# 1. Authenticate with Vercel
vercel login

# 2. Follow the device authentication flow (visit vercel.com/device with the provided code)

# 3. Deploy to production
vercel --prod
```

### Option B: From GitHub Actions / CI/CD
Push commits to main and link your GitHub repo to Vercel dashboard to enable auto-deployment.

### Option C: Using Vercel Dashboard
1. Connect your GitHub repo to Vercel at https://vercel.com/new
2. Set project root to `apps/dark-matter-ui`
3. Configure build settings (vercel.json handles this automatically)
4. Deploy

## What Gets Deployed
- **UI**: Next.js application with demo escrow data display
- **API Routes**: Session endpoint (`/api/session`) returns pool state
- **Demo Data**: Snapshot fixture with 3 RFQs and 3 agreements at various lifecycle stages
  - Agreement 001: completed (released)
  - Agreement 002: settling (one approval, proof submitted)
  - Agreement 003: live (deployed, no approvals)

## Environment Variables
The `vercel.json` config sets:
- `DARK_MATTER_LOCAL_SOURCE: "chain"`
- `DARK_MATTER_POOL_SOURCE: "local"`

No additional secrets needed for demo deployment.

## Fallback Loading Logic
The session API (`route.ts`) implements a three-tier fallback chain:
1. **First**: Try loading from `/tmp/adm-agent-state.json` (local dev state)
2. **Second**: Try env override via `DARK_MATTER_DEMO_STATE_FILE`
3. **Third**: Fall back to committed `demo-state.snapshot.json` (Vercel deployment)

This ensures the UI always has data to display, whether running locally or on Vercel.

## Verification
After deployment:
1. Visit the deployed URL
2. Check `/api/session` endpoint returns 3 agreements
3. Verify UI displays all pool items from snapshot

## Rollback
If needed, revert to previous commit and redeploy:
```bash
git revert <commit-hash>
git push origin main
vercel --prod  # Auto-redeploys on push if linked to GitHub
```
