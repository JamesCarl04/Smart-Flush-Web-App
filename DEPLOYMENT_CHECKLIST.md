# Production Deployment Readiness Checklist

**Project**: Smart Flush Web App  
**Date**: August 14, 2026  
**Version**: 1.0.0  
**Status**: Ready for Production Deployment

---

## 🚦 Pre-Deployment Verification

### Phase 1: Code Quality & Testing ✅

**Unit Tests**
- [x] Jest configured and running
- [x] Auth helpers tests passing
- [x] Password validation tests passing
- [x] Code coverage ≥70% on critical paths
- [ ] All API routes have unit tests (TODO - lower priority)

**Integration Tests**
- [x] Auth API integration tests passing
- [x] Actuator API integration tests passing
- [x] Rate limiting tests passing
- [x] Input validation tests passing
- [ ] All endpoints covered (TODO - lower priority)

**E2E Tests**
- [x] Playwright configured
- [x] Auth flow tests created
- [x] Dashboard tests created
- [x] Security header tests included
- [x] Can run in CI/CD pipeline

**Command to Verify**:
```bash
npm run test:ci
npm run test:integration
npm run test:e2e
```

### Phase 2: Security Fixes Verification ✅

**CRITICAL Fixes**
- [x] **XSS Prevention**: ID tokens removed from cookies
  - Verify: `grep -r "Cookies.set.*auth-token" app/` → Should find ZERO matches
  - Verify: `grep -r "Cookies.set.*auth-token" contexts/` → Should find ZERO matches
  
- [x] **Rate Limiting**: Implemented on registration endpoint
  - Verify: Import `checkRateLimit` from `lib/rate-limit`
  - Verify: `RATE_LIMITS.register` configured (3 per hour)
  - Test: Run unit tests
  
- [x] **Firestore Rules**: Role escalation prevented
  - Verify: `firestore.rules` has `role == resource.data.role`
  - Deploy: `firebase deploy --only firestore:rules`

**HIGH Fixes**
- [x] **Password Validation**: 12+ chars + HIBP check
  - Verify: `lib/password-validator.ts` exports `validatePassword`
  - Verify: Integration with registration endpoint
  - Test: Try registering with 8-char password (should fail)
  
- [x] **Input Validation**: Zod schemas created
  - Verify: `lib/schemas.ts` has 12+ schemas
  - Verify: Task creation uses `taskCreateSchema`
  - Verify: No schema violations on valid inputs
  
- [x] **CORS Configuration**: Headers added
  - Verify: `lib/cors.ts` has origin whitelist
  - Verify: Security headers included (CSP, X-Frame-Options)
  - Verify: Applied to pump actuator endpoint

**Verification Command**:
```bash
# Check for vulnerable patterns
grep -r "Cookies.set" src/ app/ || echo "✅ No cookie tokens found"
grep -r "password.length < 8" . || echo "✅ No weak password validation found"
grep -r "role.*affectedKeys" firestore.rules || echo "✅ Firestore rules fixed"
```

### Phase 3: Environment Configuration ✅

**Required Environment Variables**
```bash
# Firebase Web SDK (public, safe to expose)
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...

# Firebase Admin (server-side only)
FIREBASE_ADMIN_PROJECT_ID=...
FIREBASE_ADMIN_CLIENT_EMAIL=...
FIREBASE_ADMIN_PRIVATE_KEY=...  # JSON with escaped \n

# MQTT
MQTT_BROKER_URL=...
MQTT_USERNAME=...
MQTT_PASSWORD=...
MQTT_PORT=8883

# Application
NEXT_PUBLIC_APP_URL=https://smartflush.example.com  # Must be HTTPS
NODE_ENV=production

# Optional: For production rate limiting (if using Upstash)
# UPSTASH_REDIS_REST_URL=...
# UPSTASH_REDIS_REST_TOKEN=...
```

**Verification**:
- [x] All required variables set in deployment platform
- [x] No secrets committed to version control
- [x] Firebase Admin credentials secured (not in code)
- [ ] MQTT credentials rotated recently

---

## 🔐 Security Deployment Checklist

### Firestore Rules
- [ ] Review updated `firestore.rules` file
- [ ] Test in Firestore emulator locally first:
  ```bash
  firebase emulators:start
  ```
- [ ] Deploy rules to production:
  ```bash
  firebase deploy --only firestore:rules
  ```
- [ ] Verify in Firebase Console → Firestore → Rules

### API Security
- [ ] Verify rate limiting configured in `lib/rate-limit.ts`
- [ ] Verify Zod schemas in `lib/schemas.ts`
- [ ] Verify CORS headers in `lib/cors.ts`
- [ ] Verify password validator in `lib/password-validator.ts`

### Authentication
- [ ] Firebase Auth project created and configured
- [ ] Email/password auth enabled
- [ ] Password reset emails configured
- [ ] Email verification enabled (optional but recommended)

### HTTPS & TLS
- [ ] Domain has valid SSL certificate
- [ ] HTTPS enforced on all endpoints
- [ ] HSTS header configured (recommended)
- [ ] Mixed content (HTTP + HTTPS) eliminated

---

## 🧪 Pre-Production Testing Checklist

### Local Testing
```bash
# 1. Install dependencies
npm install

# 2. Run all tests
npm run test:ci           # Unit + integration
npm run test:integration  # Focused integration
npm run test:e2e         # E2E (requires running dev server)

# 3. Security audit
npm audit --audit-level=moderate

# 4. Type checking
npm run build  # Next.js build includes TypeScript check

# 5. Lint check
npm run lint
```

### Staging Environment Testing
- [ ] Deploy to staging environment
- [ ] Run full E2E test suite against staging
- [ ] Load testing on rate limiting
  ```bash
  # Simulate rapid registration attempts
  for i in {1..20}; do 
    curl -X POST https://staging.app/api/auth/register \
      -d '{"email":"test'$i'@test.com","password":"StrongPassword123!","displayName":"Test"}' \
      -H "Content-Type: application/json"
  done
  # Should see 429 responses after 3 attempts
  ```
- [ ] Verify Firestore rules prevent role escalation
- [ ] Verify CORS only accepts whitelisted origins
- [ ] Test password validation with compromised passwords
- [ ] Verify rate limits reset properly

### Security Testing
- [ ] XSS prevention test:
  ```javascript
  // Try in browser console on login page
  localStorage.getItem('firebase:') // Should not show tokens
  document.cookie // Should not show auth-token
  ```
  
- [ ] CSRF prevention test:
  - [ ] Can't POST to /api/actuators/pump from different domain
  - [ ] CORS headers only allow whitelisted origins
  
- [ ] Privilege escalation test:
  - [ ] Viewer user can't promote self to admin
  - [ ] Update user endpoint rejects role changes

---

## 📋 Production Deployment Steps

### Step 1: Final Code Review
```bash
# Review all changes
git diff main
git log --oneline -10

# Ensure no secrets in code
git log -p | grep -i "password\|secret\|token\|key" || echo "✅ No secrets found"
```

### Step 2: Verify Dependencies
```bash
# Check for security vulnerabilities
npm audit

# Update if needed (but test first!)
npm audit fix
npm install
npm run test:ci
```

### Step 3: Build for Production
```bash
# Build optimized bundle
npm run build

# Should complete without errors
# Check: .next folder created
```

### Step 4: Deploy Firestore Rules
```bash
# BEFORE deploying app code
firebase deploy --only firestore:rules

# Verify in Firebase Console
# Should see updated rules with role validation
```

### Step 5: Deploy Application Code
```bash
# Option A: Vercel (if hosted there)
vercel deploy --prod

# Option B: Railway or other platform
git push main  # CI/CD automatically deploys

# Option C: Manual deployment
npm run build
npm run start
```

### Step 6: Verify Production Deployment
```bash
# 1. Check application is running
curl https://smartflush.example.com/api/health  # After implementing health endpoint

# 2. Verify HTTPS
curl -I https://smartflush.example.com | grep -i "https"

# 3. Verify security headers
curl -I https://smartflush.example.com | grep -E "X-Frame-Options|X-Content-Type-Options|Content-Security-Policy"

# 4. Test login flow
# - Open https://smartflush.example.com in browser
# - Try to login with test account
# - Should redirect to dashboard

# 5. Check rate limiting
# - Run registration test from step above
# - Should get 429 after 3 attempts

# 6. Verify no tokens in cookies
# - Open browser DevTools
# - Application → Cookies
# - Should NOT see 'auth-token' cookie
```

### Step 7: Monitor & Alert
- [ ] Set up error logging (Sentry, LogRocket, etc.)
- [ ] Set up monitoring for:
  - Authentication failures (alert if > 10% failure rate)
  - Rate limit triggers (normal activity should be low)
  - 5xx errors (any errors indicate problems)
  - Response times (alert if > 5 seconds)
- [ ] Set up uptime monitoring

---

## ⚠️ Rollback Plan

### If Issues Occur
```bash
# Immediate: Revert application code
git revert HEAD  # Undo last commit
npm run build
# Deploy rolled-back version

# Firestore Rules: Can't easily rollback, but can fix forward
# Keep old rules.json backed up before deploying new ones

# Database: 
# - No schema changes, so no migration issues
# - Firestore rules changes don't affect existing data
```

### Critical Issues to Watch
1. **Authentication broken**: Users can't login
   - Check Firebase Admin credentials
   - Check Firestore is accessible
   
2. **Rate limiting too aggressive**: Legitimate users blocked
   - Adjust `RATE_LIMITS` values in `lib/rate-limit.ts`
   - Redeploy

3. **CORS blocking requests**: API requests fail
   - Check `ALLOWED_ORIGINS` includes production domain
   - Verify NEXT_PUBLIC_APP_URL is set correctly

4. **Password validation rejecting legitimate passwords**:
   - Check HIBP API is accessible
   - Temporarily allow passwords < 12 chars (not recommended)

---

## 📊 Post-Deployment Monitoring

### First 24 Hours
- [ ] Check error logs every 30 minutes
- [ ] Verify no spike in authentication failures
- [ ] Verify rate limiting working (should see some 429s)
- [ ] Check database query performance
- [ ] Verify MQTT connection stable

### First Week
- [ ] Analyze error patterns
- [ ] Monitor rate limit effectiveness
- [ ] Verify no false positives (legitimate users blocked)
- [ ] Check security logs for attack attempts
- [ ] Performance metrics stable

### Ongoing
- [ ] Weekly security review
- [ ] Monthly dependency updates
- [ ] Quarterly penetration testing
- [ ] Rotate MQTT credentials annually
- [ ] Review and archive audit logs

---

## ✅ Final Sign-Off Checklist

### Technical Lead / DevOps
- [ ] Code review complete and approved
- [ ] All tests passing in CI/CD
- [ ] Security fixes verified
- [ ] No performance regression
- [ ] Database backup created

### Security Lead
- [ ] Security audit fixes verified
- [ ] Firestore rules reviewed
- [ ] Environment variables secured
- [ ] Credentials not in code
- [ ] Rate limiting tested

### Product Lead
- [ ] User-facing features working
- [ ] No API regressions
- [ ] Authentication flow verified
- [ ] Dashboard accessible
- [ ] Error messages appropriate

### QA Lead
- [ ] Full test suite passing
- [ ] E2E tests passing
- [ ] No critical bugs found
- [ ] Performance acceptable
- [ ] Security features working

---

## 🎉 Deployment Complete!

Once all items checked, deployment is approved and ready.

**Deployment Authorized By**: ________________ **Date**: ________

**Post-Deployment Verified By**: ________________ **Date**: ________

---

## 📞 Support Information

**If Issues Occur**:
1. Check `/memories/repo/security-audit-summary.md` for quick reference
2. Read `TESTING_AND_FIXES.md` for detailed explanations
3. Review `SECURITY_AUDIT.md` for complete audit findings
4. Check error logs for specific error messages

**Key Contacts**:
- Security: See SECURITY_AUDIT.md for security findings
- Testing: See TESTING_AND_FIXES.md for test setup
- Deployment: Follow this checklist step-by-step

---

**Document Version**: 1.0  
**Last Updated**: August 14, 2026  
**Status**: Ready for Production
