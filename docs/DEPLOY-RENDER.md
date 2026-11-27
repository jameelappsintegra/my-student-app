# Put EduPro online (free, about 10 minutes)

You get a permanent link like `https://edupro-xxxx.onrender.com`. Everything runs from this repository's `Dockerfile` and `render.yaml`.

## 1. Free database (MongoDB Atlas)

1. Sign up at https://www.mongodb.com/cloud/atlas/register and create a **free M0** cluster. Pick a region near your users, for example Mumbai.
2. **Database Access → Add user**: choose a username and a strong password. Use a new password; never reuse the one that was exposed in this repository's history.
3. **Network Access → Add IP address → Allow access from anywhere (0.0.0.0/0)**. Render's free tier has no fixed IP. Narrow this later if you move to a paid plan.
4. **Connect → Drivers** and copy the connection string. Replace `<password>`, and add a database name after `.net/`, for example:
   `mongodb+srv://edupro:YOUR-PASSWORD@cluster0.abcde.mongodb.net/edupro?retryWrites=true&w=majority`

## 2. Deploy (Render)

1. Sign up at https://render.com with your GitHub account and allow access to `my-student-app`.
2. **New → Blueprint**, pick the repository and the branch `claude/app-summary-3jf06g` (or `main` once it's merged).
3. Render reads `render.yaml` and asks for these values:
   - `MONGODB_URI`: the connection string from step 1.
   - `ADMIN_PASSWORD`: 12+ characters. This is the password for the `admin` login.
   - `SEED_USER_PASSWORD`: 12+ characters. All the demo accounts use it.
4. Click **Apply**. The first build takes about 5–10 minutes. When the status is **Live**, open the URL shown at the top.

## 3. Sign in

| Username | Role |
| --- | --- |
| `admin` | Admin, all schools (`ADMIN_PASSWORD`) |
| `principal.gvps` / `principal.smms` | Principals of Green Valley / St. Mary's |
| `teacher.gvps` / `teacher.smms` | Teachers at those schools (`teacher.gvps` can import CSV) |
| `parent.demo` | Parent of two Green Valley children |

All the demo accounts use `SEED_USER_PASSWORD`.

## Notes

- **Free tier sleeps** after about 15 idle minutes. The first visit after that takes 30–60 seconds to wake it up.
- **Sample data** is added only when the database has no schools yet. For real use, set `SEED_DEMO_DATA` to `false` in the Render dashboard and start with an empty database, or delete the sample schools.
- **Changing the admin password**: update `ADMIN_PASSWORD` and redeploy. This resets the password and signs the admin out everywhere.
- **Aadhaar signature check**: add the UIDAI certificate as a Render secret file and set `UIDAI_OFFLINE_KYC_CERT` to its path.
- **Other hosts** (Railway, Fly.io, a VPS with Docker): build the `Dockerfile` and set the same environment variables. The container serves everything on `$PORT`.
