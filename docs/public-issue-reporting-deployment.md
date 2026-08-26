# Public issue-reporting deployment assumptions

The anonymous intake route trusts exactly one proxy-owned client-IP header. The
default is `x-vercel-forwarded-for`. The application ignores
`x-forwarded-for`, `x-real-ip`, and every other unconfigured address header.
Only set `PUBLIC_REPORT_TRUSTED_IP_HEADER=cf-connecting-ip` when Cloudflare is
the direct edge and is configured to strip incoming copies and overwrite that
header. Do not expose the application directly behind a proxy that forwards a
client-supplied copy of the configured header.

The route enforces a 6 MiB total request ceiling before multipart parsing when
`Content-Length` is present and again after parsing for missing/chunked
requests. The extra space above the 5 MiB image limit covers multipart fields
and boundaries. The hosting platform and any upstream proxy must allow at least
6 MiB request bodies; if its hard limit is lower, the deployment cannot support
the documented 5 MiB photo contract without moving uploads to a separate
server-mediated upload flow.

Set both server-only values before enabling public reporting:

- `PUBLIC_REPORT_FINGERPRINT_SECRET`: a long random secret used only for HMAC
  fingerprints; rotate it only with awareness that active rate windows reset.
- `FIREBASE_STORAGE_BUCKET`: the private Firebase Admin Storage bucket.

Deploy the repository's Firestore and Storage rules with the application. Both
temporary and final evidence paths, evidence-finalization jobs, notification
outbox jobs, rate limits, cooldowns, and open-key documents deny all direct
client access. Job records contain private object paths but never public URLs.
