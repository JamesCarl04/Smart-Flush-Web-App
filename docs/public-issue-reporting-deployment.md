# Public issue-reporting deployment assumptions

The anonymous intake route trusts exactly one proxy-owned client-IP header. The
default is `x-vercel-forwarded-for`. The application ignores
`x-forwarded-for`, `x-real-ip`, and every other unconfigured address header.
Only set `PUBLIC_REPORT_TRUSTED_IP_HEADER=cf-connecting-ip` when Cloudflare is
the direct edge and is configured to strip incoming copies and overwrite that
header. Do not expose the application directly behind a proxy that forwards a
client-supplied copy of the configured header.

The route enforces a 6 MiB request ceiling before multipart parsing when
`Content-Length` is present. Its post-parse check is a conservative
approximation based on decoded field names, field values, and file sizes; it
cannot reconstruct every byte of multipart framing. The hosting platform and
any upstream proxy must therefore enforce a hard body cap and allow at least
6 MiB if the documented 5 MiB photo contract is enabled. A lower platform cap
requires a separate server-mediated upload flow.

Set all server-only values before enabling public reporting:

- `PUBLIC_REPORT_FINGERPRINT_SECRET`: a long random secret used only for HMAC
  fingerprints; rotate it only with awareness that active rate windows reset.
- `FIREBASE_STORAGE_BUCKET`: the private Firebase Admin Storage bucket.
- `CRON_SECRET`: a separate long random secret used by Vercel Cron as the
  bearer credential for `GET /api/cron/public-issue-report-jobs`.

The included Vercel Cron schedule invokes the recovery endpoint every minute.
That cadence requires Vercel Pro. Vercel Hobby cron jobs are limited to daily
runs, which is too slow for prompt leak notifications and evidence recovery;
Hobby deployments must call the same secured GET endpoint every minute from an
external scheduler and send `Authorization: Bearer ${CRON_SECRET}`.

Each invocation queries at most 20 pending evidence jobs and 20 pending or
expired-lease notification jobs. Processing is idempotent. Evidence reservations
are persisted before their exact private object path is accessed; a missing
object becomes `upload_failed` after the reservation timeout, while an
ambiguous upload is recovered by checking that tracked object. Notification
delivery is at-least-once: an FCM success followed by a metadata-write crash can
be retried, so the stable outbox ID is also sent as Android/APNS collapse
metadata to reduce visible duplicates.

Deploy the repository's Firestore and Storage rules with the application. Final
evidence paths, evidence jobs, notification outbox jobs, rate limits, cooldowns,
and open-key documents deny all direct client access. Job records contain
private object paths but never public URLs.
