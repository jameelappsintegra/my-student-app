# EduPro – school management (my-student-app)

EduPro is a school management app: a Next.js frontend (`client/`) and an Express + MongoDB API (`server/`).

So far it covers the admission workflow (apply → review → approve → enrol), a student list, and a live dashboard. See [docs/AUDIT.md](docs/AUDIT.md) for the audit, what has changed, and the roadmap.

> ⚠️ There is no login yet. Run the API locally or on a private network only until authentication is added.

## Requirements

- Node.js 18 or later
- MongoDB running as a **replica set**, because enrolment uses a transaction. Any MongoDB Atlas cluster works. For a local `mongod`, start it with `--replSet rs0` and run `rs.initiate()` once.

## Run the API

```bash
cd server
cp .env.example .env    # then set MONGODB_URI (and CORS_ORIGIN if the client is not on :3000)
npm install
npm run dev             # or: npm start
```

The API runs on `http://localhost:5000/api`. `GET /api/health` reports whether the database is connected.

## Run the web app

```bash
cd client
cp .env.example .env.local   # NEXT_PUBLIC_API_URL, defaults to http://localhost:5000/api
npm install
npm run dev
```

Then open http://localhost:3000.

## Tests

```bash
cd server && npm test
```

The tests start a throwaway in-memory MongoDB. If your network blocks the binary download, point `MONGOMS_SYSTEM_BINARY` at a local `mongod`.
