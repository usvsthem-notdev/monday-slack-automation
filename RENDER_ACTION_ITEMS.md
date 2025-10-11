# Render Dashboard Action Items

**🚨 Complete these 2 manual steps in the Render Dashboard**

---

## 👉 Action Required

### 1. Enable Health Check Path ⚠️

**Why:** Automatic service restart on failures, better uptime

**Steps:**
1. Go to: https://dashboard.render.com/web/srv-d3k1gv6uk2gs739ht9d0
2. Click **"Settings"** in the left sidebar
3. Scroll to **"Health Check Path"**
4. Enter: `/health`
5. Click **"Save Changes"**

**Result:** Render will ping `/health` to monitor service status

---

### 2. Enable Build Caching (Optional but Recommended) 💾

**Why:** 50-70% faster builds, reduced deployment time

**Steps:**
1. Go to: https://dashboard.render.com/web/srv-d3k1gv6uk2gs739ht9d0
2. Click **"Settings"** in the left sidebar
3. Find **"Build & Deploy"** section
4. Look for **"Build Cache"** or **"Cache dependencies"**
5. Change from **"No Cache"** to **"Cache dependencies"**
6. Click **"Save Changes"**

**Result:** Faster deployments after the first build

---

## ✅ Already Optimized

These are already configured and working:

- ✅ **NODE_ENV=production** - Set via API
- ✅ **Auto-deploy enabled** - Deploys on push to main
- ✅ **Build command optimized** - Using yarn install
- ✅ **Region optimized** - Oregon (US West)
- ✅ **All environment variables** - Configured

---

## 📊 Verify After Changes

**After completing the actions above:**

```bash
# 1. Wait for current deployment to finish
# Check status at: https://dashboard.render.com/web/srv-d3k1gv6uk2gs739ht9d0

# 2. Test health check (should return JSON)
curl https://monday-slack-automation.onrender.com/health

# 3. Verify metrics
curl https://monday-slack-automation.onrender.com/metrics

# 4. Check cache
curl https://monday-slack-automation.onrender.com/cache/stats
```

**Expected Results:**
- Health check returns `{"status":"healthy",...}`
- Metrics show request data
- Cache stats show hitRate (starts at 0%, increases over time)

---

## 👀 Monitoring

**Check daily:**
- GitHub Actions: https://github.com/usvsthem-notdev/monday-slack-automation/actions
- Render Dashboard: https://dashboard.render.com/web/srv-d3k1gv6uk2gs739ht9d0
- Health endpoint: https://monday-slack-automation.onrender.com/health

**Success Criteria (24 hours):**
- ✅ Success rate > 95%
- ✅ Average response < 10s
- ✅ Cache hit rate > 60%
- ✅ No errors in logs

---

## 📝 Notes

**Current Deployment Status:**
- Latest commit deployed: `cc63ed5` (Render optimization guide)
- Service: Live (may need wake-up if free tier)
- Version: 4.0.0

**If deployment is in progress:**
- Wait 2-3 minutes
- Check Render logs for progress
- Don't make changes until deployment completes

---

**Priority:** Medium  
**Time Required:** 5 minutes  
**Impact:** High (better monitoring and faster builds)