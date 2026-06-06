import express from "express";
import pool from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";
import { hasPermission } from "../middleware/permissions.js";

const router = express.Router();

function buildOpenMeetingsRoomUrl(courseId) {
  const baseUrl = process.env.OPENMEETINGS_ROOM_BASE_URL;
  if (!baseUrl) {
    return null;
  }

  try {
    const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
    return `${normalizedBaseUrl}/${courseId}`;
  } catch (error) {
    return null;
  }
}

async function canManageCourse(req) {
  if (["admin", "org_admin", "district_admin", "teacher"].includes(req.user.role)) {
    return true;
  }
  return hasPermission(req.user.role, "course.manage");
}

async function canViewReplay(req) {
  if (["admin", "org_admin", "district_admin", "teacher", "assistant", "student", "parent"].includes(req.user.role)) {
    return true;
  }
  return hasPermission(req.user.role, "replay.view");
}

function buildScopeForAlias(user, alias) {
  if (user.role === "admin") {
    return { clause: "", params: [] };
  }

  if (user.role === "org_admin" && user.organizationId) {
    return { clause: ` AND ${alias}.organization_id = ?`, params: [user.organizationId] };
  }

  if (user.role === "district_admin" && user.districtId) {
    return { clause: ` AND ${alias}.district_id = ?`, params: [user.districtId] };
  }

  if (user.organizationId) {
    return { clause: ` AND ${alias}.organization_id = ?`, params: [user.organizationId] };
  }

  if (user.districtId) {
    return { clause: ` AND ${alias}.district_id = ?`, params: [user.districtId] };
  }

  return { clause: "", params: [] };
}

function resolveCourseOwner(req) {
  const organizationId = req.user.organizationId ? Number(req.user.organizationId) : null;
  const districtId = req.user.districtId ? Number(req.user.districtId) : null;
  return { organizationId, districtId };
}

async function ensureClassroomScope(req, classroomId) {
  if (!classroomId) return true;
  const scope = buildScopeForAlias(req.user, "fc");
  const [rows] = await pool.query(
    `SELECT fc.id FROM fixed_classrooms fc WHERE fc.id = ? ${scope.clause} LIMIT 1`,
    [classroomId, ...scope.params]
  );
  return rows.length > 0;
}

async function ensureCourseScope(req, courseId) {
  const scope = buildScopeForAlias(req.user, "c");
  const [rows] = await pool.query(
    `SELECT c.id FROM courses c WHERE c.id = ? ${scope.clause} LIMIT 1`,
    [courseId, ...scope.params]
  );
  return rows.length > 0;
}

async function recordAudit(req, action, resourceType, resourceId = null, detail = null) {
  try {
    await pool.query(
      "INSERT INTO audit_logs (actor_user_id, action, resource_type, resource_id, detail, ip_address) VALUES (?, ?, ?, ?, ?, ?)",
      [req.user?.userId || null, action, resourceType, resourceId, detail ? JSON.stringify(detail) : null, req.ip || null]
    );
  } catch (error) {
    // ignore audit errors
  }
}

router.get("/", requireAuth, async (req, res) => {
  const keyword = String(req.query.keyword || "").trim();
  const scope = buildScopeForAlias(req.user, "c");

  try {
    const [rows] = await pool.query(
      `SELECT
         c.id,
         c.organization_id,
         c.district_id,
         c.classroom_id,
         c.title,
         c.subject,
         c.teacher_name,
         c.assistant_name,
         c.start_time,
         c.end_time,
         c.meeting_url,
         c.price_cents,
         fc.name AS classroom_name,
         fc.code AS classroom_code,
         c.created_at,
         EXISTS(
           SELECT 1 FROM course_enrollments ce
           WHERE ce.course_id = c.id AND ce.user_id = ?
         ) AS enrolled
       FROM courses c
       LEFT JOIN fixed_classrooms fc ON fc.id = c.classroom_id
       WHERE (? = '' OR c.title LIKE CONCAT('%', ?, '%') OR c.subject LIKE CONCAT('%', ?, '%'))
         ${scope.clause}
       ORDER BY c.start_time DESC`,
      [req.user.userId, keyword, keyword, keyword, ...scope.params]
    );
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch courses" });
  }
});

router.post("/", requireAuth, async (req, res) => {
  if (!(await canManageCourse(req))) {
    return res.status(403).json({ message: "Only admin, organization admin, district admin or teacher can create course" });
  }

  const { title, subject, teacherName, assistantName, classroomId, startTime, endTime, meetingUrl, priceCents } = req.body;
  if (!title || !teacherName || !startTime || !endTime) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  const hasOpenMeetingsBaseUrl = Boolean(process.env.OPENMEETINGS_ROOM_BASE_URL);
  if (!meetingUrl && !hasOpenMeetingsBaseUrl) {
    return res.status(500).json({
      message: "OPENMEETINGS_ROOM_BASE_URL is not configured"
    });
  }

  const requestedOrganizationId = req.body.organizationId ? Number(req.body.organizationId) : null;
  const requestedDistrictId = req.body.districtId ? Number(req.body.districtId) : null;
  const owner = resolveCourseOwner(req);

  if (req.user.role === "admin") {
    owner.organizationId = Number.isInteger(requestedOrganizationId) ? requestedOrganizationId : null;
    owner.districtId = Number.isInteger(requestedDistrictId) ? requestedDistrictId : null;
  }

  if (req.user.role === "org_admin" && Number.isInteger(requestedOrganizationId) && requestedOrganizationId !== Number(req.user.organizationId || 0)) {
    return res.status(403).json({ message: "Classroom not found in scope" });
  }

  if (req.user.role === "district_admin" && Number.isInteger(requestedDistrictId) && requestedDistrictId !== Number(req.user.districtId || 0)) {
    return res.status(403).json({ message: "Classroom not found in scope" });
  }

  try {
    const classroomAllowed = await ensureClassroomScope(req, classroomId ? Number(classroomId) : null);
    if (!classroomAllowed) {
      return res.status(400).json({ message: "Classroom not found in scope" });
    }

    const [result] = await pool.query(
      "INSERT INTO courses (organization_id, district_id, classroom_id, title, subject, teacher_name, teacher_user_id, assistant_name, start_time, end_time, meeting_url, created_by_user_id, price_cents) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [owner.organizationId, owner.districtId, classroomId || null, title, subject || null, teacherName, req.user.role === "teacher" ? req.user.userId : null, assistantName || null, startTime, endTime, meetingUrl || null, req.user.userId, Number(priceCents || 0)]
    );

    if (!meetingUrl && hasOpenMeetingsBaseUrl) {
      const autoMeetingUrl = buildOpenMeetingsRoomUrl(result.insertId);
      if (autoMeetingUrl) {
        await pool.query("UPDATE courses SET meeting_url = ? WHERE id = ?", [autoMeetingUrl, result.insertId]);
      }
    }

    await recordAudit(req, "create", "course", result.insertId, { title, subject, teacherName, assistantName: assistantName || null });

    return res.status(201).json({ id: result.insertId });
  } catch (error) {
    return res.status(500).json({ message: "Failed to create course" });
  }
});

router.put("/:id", requireAuth, async (req, res) => {
  if (!(await canManageCourse(req))) {
    return res.status(403).json({ message: "Only admin, organization admin, district admin or teacher can update course" });
  }

  const courseId = Number(req.params.id);
  if (!Number.isInteger(courseId) || courseId <= 0) {
    return res.status(400).json({ message: "Invalid courseId" });
  }

  const { title, subject, teacherName, assistantName, classroomId, startTime, endTime, meetingUrl, priceCents } = req.body;
  if (!title || !teacherName || !startTime || !endTime) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  const requestedOrganizationId = req.body.organizationId ? Number(req.body.organizationId) : null;
  const requestedDistrictId = req.body.districtId ? Number(req.body.districtId) : null;
  const owner = resolveCourseOwner(req);

  if (req.user.role === "admin") {
    owner.organizationId = Number.isInteger(requestedOrganizationId) ? requestedOrganizationId : null;
    owner.districtId = Number.isInteger(requestedDistrictId) ? requestedDistrictId : null;
  }

  if (req.user.role === "org_admin" && Number.isInteger(requestedOrganizationId) && requestedOrganizationId !== Number(req.user.organizationId || 0)) {
    return res.status(403).json({ message: "Classroom not found in scope" });
  }

  if (req.user.role === "district_admin" && Number.isInteger(requestedDistrictId) && requestedDistrictId !== Number(req.user.districtId || 0)) {
    return res.status(403).json({ message: "Classroom not found in scope" });
  }

  try {
    const inScope = await ensureCourseScope(req, courseId);
    if (!inScope) {
      return res.status(404).json({ message: "Course not found" });
    }

    const classroomAllowed = await ensureClassroomScope(req, classroomId ? Number(classroomId) : null);
    if (!classroomAllowed) {
      return res.status(400).json({ message: "Classroom not found in scope" });
    }

    const [result] = await pool.query(
      "UPDATE courses SET organization_id = ?, district_id = ?, classroom_id = ?, title = ?, subject = ?, teacher_name = ?, assistant_name = ?, start_time = ?, end_time = ?, meeting_url = ?, price_cents = ? WHERE id = ?",
      [owner.organizationId, owner.districtId, classroomId || null, title, subject || null, teacherName, assistantName || null, startTime, endTime, meetingUrl || null, Number(priceCents || 0), courseId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Course not found" });
    }

    await recordAudit(req, "update", "course", courseId, { title, subject, teacherName, assistantName: assistantName || null });

    return res.json({ message: "Course updated" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update course" });
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  if (!(await canManageCourse(req))) {
    return res.status(403).json({ message: "Only admin, organization admin, district admin or teacher can delete course" });
  }

  const courseId = Number(req.params.id);
  if (!Number.isInteger(courseId) || courseId <= 0) {
    return res.status(400).json({ message: "Invalid courseId" });
  }

  try {
    const inScope = await ensureCourseScope(req, courseId);
    if (!inScope) {
      return res.status(404).json({ message: "Course not found" });
    }

    const [result] = await pool.query("DELETE FROM courses WHERE id = ?", [courseId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Course not found" });
    }

    await recordAudit(req, "delete", "course", courseId);
    return res.json({ message: "Course deleted" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete course" });
  }
});

router.post("/:id/enroll", requireAuth, async (req, res) => {
  if (req.user.role !== "student") {
    return res.status(403).json({ message: "Only students can enroll" });
  }

  const courseId = Number(req.params.id);
  if (!Number.isInteger(courseId) || courseId <= 0) {
    return res.status(400).json({ message: "Invalid courseId" });
  }

  try {
    await pool.query(
      "INSERT INTO course_enrollments (course_id, user_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE user_id = user_id",
      [courseId, req.user.userId]
    );

    await recordAudit(req, "enroll", "course", courseId, { userId: req.user.userId });
    return res.status(201).json({ message: "Enrolled" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to enroll" });
  }
});

router.post("/:id/purchase", requireAuth, async (req, res) => {
  if (!["student", "parent"].includes(req.user.role)) {
    return res.status(403).json({ message: "Only students or parents can purchase" });
  }

  const courseId = Number(req.params.id);
  if (!Number.isInteger(courseId) || courseId <= 0) {
    return res.status(400).json({ message: "Invalid courseId" });
  }

  const targetStudentId = req.user.role === "student" ? req.user.userId : Number(req.body.studentUserId || 0);
  if (!Number.isInteger(targetStudentId) || targetStudentId <= 0) {
    return res.status(400).json({ message: "studentUserId is required" });
  }

  try {
    if (req.user.role === "parent") {
      const [linkRows] = await pool.query(
        "SELECT id FROM guardian_student_links WHERE parent_user_id = ? AND student_user_id = ? LIMIT 1",
        [req.user.userId, targetStudentId]
      );
      if (linkRows.length === 0) {
        return res.status(403).json({ message: "Parent not linked to this student" });
      }
    }

    const [courseRows] = await pool.query("SELECT id, price_cents FROM courses WHERE id = ? LIMIT 1", [courseId]);
    if (courseRows.length === 0) {
      return res.status(404).json({ message: "Course not found" });
    }

    await pool.query(
      "INSERT INTO course_purchases (course_id, buyer_user_id, student_user_id, amount_cents, status) VALUES (?, ?, ?, ?, 'paid') ON DUPLICATE KEY UPDATE amount_cents = VALUES(amount_cents), status = 'paid'",
      [courseId, req.user.userId, targetStudentId, Number(courseRows[0].price_cents || 0)]
    );

    await pool.query(
      "INSERT INTO course_enrollments (course_id, user_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE user_id = user_id",
      [courseId, targetStudentId]
    );

    await recordAudit(req, "purchase", "course", courseId, { buyerUserId: req.user.userId, studentUserId: targetStudentId });
    return res.status(201).json({ message: "Purchased" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to purchase course" });
  }
});

router.get("/:id/live-rooms", requireAuth, async (req, res) => {
  const courseId = Number(req.params.id);
  if (!Number.isInteger(courseId) || courseId <= 0) {
    return res.status(400).json({ message: "Invalid courseId" });
  }

  try {
    const inScope = await ensureCourseScope(req, courseId);
    if (!inScope) {
      return res.status(404).json({ message: "Course not found" });
    }

    const [rows] = await pool.query(
      "SELECT id, name, meeting_url, created_by_user_id, created_at FROM live_rooms WHERE course_id = ? ORDER BY id ASC",
      [courseId]
    );
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch live rooms" });
  }
});

router.post("/:id/live-rooms", requireAuth, async (req, res) => {
  if (!(await canManageCourse(req))) {
    return res.status(403).json({ message: "Only admin, organization admin, district admin or teacher can create live room" });
  }

  const courseId = Number(req.params.id);
  if (!Number.isInteger(courseId) || courseId <= 0) {
    return res.status(400).json({ message: "Invalid courseId" });
  }

  const { name, meetingUrl } = req.body;
  if (!name || !meetingUrl) {
    return res.status(400).json({ message: "name and meetingUrl are required" });
  }

  try {
    const inScope = await ensureCourseScope(req, courseId);
    if (!inScope) {
      return res.status(404).json({ message: "Course not found" });
    }

    const [result] = await pool.query(
      "INSERT INTO live_rooms (course_id, name, meeting_url, created_by_user_id) VALUES (?, ?, ?, ?)",
      [courseId, name, meetingUrl, req.user.userId]
    );

    await recordAudit(req, "create", "live_room", result.insertId, { courseId, name });
    return res.status(201).json({ id: result.insertId });
  } catch (error) {
    return res.status(500).json({ message: "Failed to create live room" });
  }
});

router.get("/:id/attendance-summary", requireAuth, async (req, res) => {
  if (!(await canManageCourse(req))) {
    return res.status(403).json({ message: "Only admin, organization admin, district admin or teacher can view summary" });
  }

  const courseId = Number(req.params.id);
  if (!Number.isInteger(courseId) || courseId <= 0) {
    return res.status(400).json({ message: "Invalid courseId" });
  }

  try {
    const inScope = await ensureCourseScope(req, courseId);
    if (!inScope) {
      return res.status(404).json({ message: "Course not found" });
    }

    const [rows] = await pool.query(
      `SELECT
         COUNT(*) AS total_checkins,
         COUNT(DISTINCT user_id) AS unique_students,
         ROUND(AVG(TIMESTAMPDIFF(MINUTE, check_in_at, COALESCE(check_out_at, NOW()))), 1) AS avg_stay_minutes
       FROM attendance
       WHERE course_id = ?`,
      [courseId]
    );

    return res.json(rows[0]);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch attendance summary" });
  }
});

router.get("/:id/replays", requireAuth, async (req, res) => {
  if (!(await canViewReplay(req))) {
    return res.status(403).json({ message: "No permission to view replays" });
  }

  const courseId = Number(req.params.id);
  if (!Number.isInteger(courseId) || courseId <= 0) {
    return res.status(400).json({ message: "Invalid courseId" });
  }

  try {
    const inScope = await ensureCourseScope(req, courseId);
    if (!inScope) {
      return res.status(404).json({ message: "Course not found" });
    }

    if (req.user.role === "student") {
      const [enrollRows] = await pool.query(
        "SELECT id FROM course_enrollments WHERE course_id = ? AND user_id = ? LIMIT 1",
        [courseId, req.user.userId]
      );
      if (enrollRows.length === 0) {
        return res.status(403).json({ message: "Student must enroll before viewing replays" });
      }
    }

    const [rows] = await pool.query(
      "SELECT id, title, replay_url, duration_seconds, created_at FROM course_replays WHERE course_id = ? ORDER BY created_at DESC",
      [courseId]
    );
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch replays" });
  }
});

router.post("/:id/replays", requireAuth, async (req, res) => {
  if (!(await canManageCourse(req))) {
    return res.status(403).json({ message: "Only admin, organization admin, district admin or teacher can add replay" });
  }

  const courseId = Number(req.params.id);
  if (!Number.isInteger(courseId) || courseId <= 0) {
    return res.status(400).json({ message: "Invalid courseId" });
  }

  const { title, replayUrl, durationSeconds } = req.body;
  if (!title || !replayUrl) {
    return res.status(400).json({ message: "title and replayUrl are required" });
  }

  try {
    const inScope = await ensureCourseScope(req, courseId);
    if (!inScope) {
      return res.status(404).json({ message: "Course not found" });
    }

    const [result] = await pool.query(
      "INSERT INTO course_replays (course_id, title, replay_url, duration_seconds) VALUES (?, ?, ?, ?)",
      [courseId, title, replayUrl, durationSeconds || null]
    );

    await recordAudit(req, "add", "replay", courseId, { title, replayUrl, durationSeconds: durationSeconds || null });
    return res.status(201).json({ id: result.insertId });
  } catch (error) {
    return res.status(500).json({ message: "Failed to add replay" });
  }
});

export default router;
