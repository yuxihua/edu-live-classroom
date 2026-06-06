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
