# Smart Flush Security Audit - Quick Reference

## 🚨 IMMEDIATE ACTION REQUIRED (Do Before Production)

| Issue | Severity | Fix Time | Fix |
|-------|----------|----------|-----|
| ID tokens in regular cookies (XSS risk) | 🔴 CRITICAL | 30 min | Remove from [contexts/AuthContext.tsx](contexts/AuthContext.tsx), let Firebase SDK manage tokens |
| No rate limiting on API routes | 🟠 HIGH | 4-6 hrs | Implement with Upstash Redis or middleware |
| Firestore role update rule vulnerable | 🟠 HIGH | 1 hr | Rewrite rule in [firestore.rules](firestore.rules) to check `role == original_role` |

**⏱️ Total Time to Fix: 6-8 hours**

---

## ⚠️ Important Security Issues (Fix This Sprint)

1. **Missing Input Validation** (MEDIUM) - Implement Zod schemas for all API routes
2. **Weak Password Requirements** (MEDIUM) - Increase to 12 chars + HIBP check
3. **No CORS Configuration** (MEDIUM) - Add explicit origin whitelist
4. **MQTT Credentials Exposure** (MEDIUM) - Create rotation policy

---

## ✅ What's Working Well

✓ Server-side token verification on every request  
✓ Role-based access control (API + Firestore)  
✓ MQTT TLS encryption (port 8883)  
✓ Admin SDK kept server-side only  
✓ No critical data exposed in logs  
✓ Firestore write restrictions on sensor data  

---

## 📊 Summary Statistics

| Category | Count | Status |
|----------|-------|--------|
| Critical Findings | 1 | 🔴 Must fix |
| High Findings | 2 | 🟠 Must fix |
| Medium Findings | 4 | 🟡 Fix soon |
| Design Issues | 7 | 🟢 Improve later |
| **Security Strengths** | **10** | ✅ Solid foundation |

---

## 🎯 Estimated Production Readiness

**Current Status**: ⚠️ 70% production-ready  
**After Fixes**: ✅ 95% production-ready

- Fix CRITICAL (1 issue): +20%
- Fix HIGH (2 issues): +8%
- Fix MEDIUM (4 issues): +4%
- Design improvements: +1%

---

## 📝 Files to Review/Update

**Must Change**:
- [contexts/AuthContext.tsx](contexts/AuthContext.tsx) - Cookie handling
- [firestore.rules](firestore.rules) - Role update rule
- [lib/auth-helpers.ts](lib/auth-helpers.ts) - Add rate limiting helper

**Should Create**:
- `lib/schemas.ts` - Zod validation schemas
- `lib/password-validator.ts` - HIBP password checking
- `middleware.ts` - Rate limiting middleware
- `lib/audit-log.ts` - Audit logging

**Should Document**:
- `.env.example` - Firestore throttling parameters
- `DEPLOYMENT.md` - Security deployment checklist

---

## 🔧 Quick Implementation Guide

### Fix #1: Remove Cookie Token (30 min)

**File**: [contexts/AuthContext.tsx](contexts/AuthContext.tsx#L24-L30)

```typescript
// ❌ DELETE these lines:
const token = await user.getIdToken();
Cookies.set('auth-token', token, { expires: 1 });

// ✅ Firebase SDK manages tokens internally in IndexedDB
// (No code needed - this is the default secure behavior)
```

**Verify**: Open DevTools → Application → Cookies → No 'auth-token' present

---

### Fix #2: Add Rate Limiting (4-6 hrs)

**Option A: Upstash Redis** (Recommended for Vercel)

```bash
npm install @upstash/ratelimit @upstash/redis
```

**Create file**: `lib/rate-limit.ts`

```typescript
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export const registerLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(3, '1h'), // 3 per hour
  analytics: true,
  prefix: 'register',
});

export const passwordResetLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '1h'), // 5 per hour
  analytics: true,
  prefix: 'password-reset',
});

export const actuatorLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '1m'), // 10 per minute
  analytics: true,
  prefix: 'actuator',
});
```

**Use in route**:

```typescript
// app/api/auth/register/route.ts
import { registerLimit } from '@/lib/rate-limit';

export async function POST(request: Request) {
  const ip = request.ip || 'unknown';
  const { success, limit, reset } = await registerLimit.limit(ip);
  
  if (!success) {
    return NextResponse.json(
      { success: false, error: 'Too many registration attempts' },
      { status: 429, headers: { 'Retry-After': reset.toString() } }
    );
  }
  
  // ... rest of registration logic ...
}
```

---

### Fix #3: Update Firestore Rule (1 hr)

**File**: [firestore.rules](firestore.rules#L24-L33)

```firestore
// ❌ OLD (Vulnerable):
match /users/{userId} {
  allow update: if isAdmin()
    || (
      isSelf(userId)
      && !request.resource.data.diff(resource.data).affectedKeys().hasAny(['role'])
    );
}

// ✅ NEW (Secure):
match /users/{userId} {
  allow update: if isAdmin()
    || (
      isSelf(userId)
      && request.resource.data.role == resource.data.role
      && request.resource.data.email == resource.data.email
    );
}
```

**Deploy**: `firebase deploy --only firestore:rules`

---

## 📞 Questions?

See full audit in [SECURITY_AUDIT.md](SECURITY_AUDIT.md) for detailed analysis and recommendations.

---

**Last Updated**: August 14, 2026
