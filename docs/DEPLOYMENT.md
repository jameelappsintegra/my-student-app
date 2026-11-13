# Deploying EduPro

> **Do not expose EduPro to the public internet until authentication ships.** Today the API has no login. Deploy it behind a VPN, private network or an authenticating proxy (for example Cloudflare Access or an identity-aware proxy) so only school staff can reach it.

## 1. Components

| Component | Runs as | Needs |
| --- | --- | --- |
| API (`server/`) | `node src/server.js` (Node 18+), stateless, can run several instances | MongoDB replica set, env vars below |
| Web (`client/`) | `next build` then `next start` (or any Node host / Vercel) | `NEXT_PUBLIC_API_URL` at **build** time |
| Database | MongoDB Atlas (recommended) or a self-managed 3-node replica set | Transactions, so it must be a replica set |

## 2. Configuration

API (validated at start-up; an invalid value stops the process with a clear message):

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `NODE_ENV` | yes in prod | `development` | `production` gives JSON logs |
| `MONGODB_URI` | yes | – | Use a database user with `readWrite` on the EduPro database only |
| `PORT` | no | `5000` | |
| `CORS_ORIGIN` | yes in prod | `http://localhost:3000` | Exact web origin(s), comma-separated. No wildcards. |
| `TRUST_PROXY` | behind a proxy | `0` | Number of proxies, so rate limiting sees real client IPs |
| `LOG_LEVEL` | no | `info` in prod | |
| `RATE_LIMIT_MAX` | no | `300` | Per IP per 15 minutes. With several instances, each counts separately (in-memory store). |
| `SHUTDOWN_TIMEOUT_MS` | no | `10000` | Keep below your orchestrator's kill grace period |

Web: `NEXT_PUBLIC_API_URL=https://api.your-school.example/api`. It is inlined at build time, so rebuild when it changes. Never put secrets in `NEXT_PUBLIC_*`.

Keep secrets in your platform's secret store, not in files in the repo. `.env` files are git-ignored.

## 3. Release steps

```bash
# API
cd server && npm ci --omit=dev
npm run db:maintain          # sync indexes, backfill search tokens; safe to re-run
NODE_ENV=production node src/server.js

# Web
cd client && npm ci && NEXT_PUBLIC_API_URL=… npm run build && npm start
```

Run `db:maintain` once per release, before starting new API instances. It builds the unique indexes that enforce duplicate and roll-number rules.

## 4. Behind a load balancer / orchestrator

- **Liveness probe:** `GET /api/health`. It does not touch the database, so a database blip won't restart healthy pods.
- **Readiness probe:** `GET /api/ready`. It returns 503 while MongoDB is unreachable, so traffic is routed away.
- **Shutdown:** on `SIGTERM` the API stops accepting connections, finishes in-flight requests, closes MongoDB, and exits 0. It force-exits after `SHUTDOWN_TIMEOUT_MS`.
- **Timeouts:** keep-alive is 65 s, which suits load balancers with a 60 s idle timeout.
- **TLS:** terminate HTTPS at the proxy and set `TRUST_PROXY`. Serve the web app and API over HTTPS only.

## 5. Logging and monitoring

- Production logs are one JSON object per line on stdout (pino): `level`, `time`, `service`, `req.id`, `req.method`, `req.url`, `res.statusCode`, `responseTime`.
  - `Authorization` and cookie headers are redacted.
  - Request bodies are never logged, because they contain children's personal data.
- Ship stdout to your log platform (CloudWatch, Datadog, Loki and so on) and alert on:
  - `level >= 50` (errors)
  - a rising 5xx rate
  - `/api/ready` returning 503
  - repeated `MongoDB disconnected` warnings
- `X-Request-Id` is returned to clients and appears in every log line for that request.

## 6. Backups and recovery

- **Atlas:** enable Cloud Backup with continuous backup (point-in-time restore). Keep daily snapshots for at least 30 days and monthly snapshots for at least 12 months, or whatever your school's records policy requires.
- **Self-managed:** run `mongodump --uri "$MONGODB_URI" --gzip --archive=edupro-$(date +%F).gz` nightly from a secondary. Encrypt the archives, copy them off-site, and keep the same retention.
- **Test restores** at least once a term: restore into a separate cluster, run `npm run db:maintain` against it, and spot-check records.
- Soft-deleted students are still in the database (`deletedAt` set). A restore is only needed for real data loss.
- Write down who may trigger a restore, and how fast you need to recover (RPO/RTO).

## 7. File storage (for the upcoming documents module)

There are no uploads yet. When document upload is added it should:

- Store files in private object storage (S3, GCS or Azure Blob) with encryption at rest and public access blocked. Do not store them on the API's local disk (instances are stateless) or in a public bucket.
- Keep only metadata in MongoDB: owner record, type, size, checksum, storage key and uploader.
- Validate size (for example ≤ 5 MB) and type by content sniffing, not by file extension. Allow only PDF, JPEG and PNG. Strip image metadata. Generate thumbnails server-side and serve resized images instead of the originals.
- Serve downloads through short-lived signed URLs, after a permission check.
- Optionally scan uploads for malware before marking them available.

## 8. Security checklist before go-live

- [ ] The exposed Atlas password from the early commits has been rotated (see docs/AUDIT.md §2)
- [ ] Atlas network access is restricted to the API's egress IPs, not `0.0.0.0/0`
- [ ] The database user has least privilege (`readWrite` on one database)
- [ ] `CORS_ORIGIN` is the exact production web origin
- [ ] HTTPS everywhere; `TRUST_PROXY` set correctly
- [ ] Access restricted to staff (VPN or authenticating proxy) **until app authentication ships**
- [ ] Backups enabled and a restore tested
- [ ] Log shipping and alerts configured
