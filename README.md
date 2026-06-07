# Edu Live Classroom (Vue + Express + MySQL)

This project provides a starter codebase for a training-school live classroom system.

## Current features

- JWT login and role model: admin, teacher, student
- Course list and create course (admin/teacher only)
- Course search, update and delete (admin/teacher)
- Student enrollment
- Attendance check-in/check-out
- Attendance summary API for each course (admin/teacher)
- Replay list and add replay (admin/teacher create, student read after enrollment)
- Signed classroom join link endpoint for OpenMeetings URL
- Live room creation via OpenMeetings 9.0 WebService API

## Management capabilities (new)

- System account management: admin, org_admin, district_admin, teacher, assistant, student, parent
- Role permission configuration with role_permissions table
- System audit logs (key actions: user/org/district/course/attendance)
- Organization settings management
- District management
- Teacher and fixed classroom assistant support
- Admin center web page (`/admin`) for dashboard, users, permissions, settings, and logs

## Data scope

- Admin can access all data
- Organization admins are scoped to their organization
- District admins are scoped to their district
- Other users are scoped by their assigned organization/district when available

## Structure

- `frontend`: Vue 3 + Vite web app
- `backend`: Express API service
- `database/schema.sql`: MySQL schema and demo admin account
- `deploy/nginx.conf`: Nginx reverse proxy example for Ubuntu

## Quick start (local)

### 1) Database

1. Create MySQL database and user.
2. Run SQL:

```sql
SOURCE database/schema.sql;
```

### 2) Backend

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Set `OPENMEETINGS_JOIN_SECRET` in `.env` for signed join links.
Set `OPENMEETINGS_API_BASE_URL`, `OPENMEETINGS_API_USER`, `OPENMEETINGS_API_PASS` in `.env` to enable direct room creation on OpenMeetings 9.0.
Set `OPENMEETINGS_ROOM_BASE_URL` in `.env` to generate room join URLs after creation.
Health check endpoint for privileged users: `GET /api/courses/openmeetings/health`.
Admin center health endpoint: `GET /api/admin/openmeetings/health`.
Use `GET /api/admin/openmeetings/health?refresh=true` to run a new check and write an audit log entry (`openmeetings.health.check`).
Use `GET /api/admin/openmeetings/health?refresh=false` to read the latest snapshot only.

API health: `http://localhost:3000/api/health`

### 3) Frontend

```bash
cd frontend
npm install
npm run dev
```

Web app: `http://localhost:5173`

## Ubuntu deploy summary

1. Install Node.js 20, Nginx, MySQL.
2. Build frontend: `cd frontend && npm install && npm run build`
3. Start backend with PM2: `cd backend && npm install && pm2 start src/server.js --name edu-live-api`
4. Put `deploy/nginx.conf` into `/etc/nginx/sites-available/` and enable it.
5. Use Certbot to enable HTTPS.

You can also run the helper script:

```bash
sudo bash deploy/ubuntu-deploy.sh
```

## Default admin account

- Email: `admin@example.com`
- Password: `Passw0rd!`

Change this password after first login.
