import express from "express";
import pool from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";

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

function canManageCourse(role) {
  return ["admin", "teacher"].includes(role);
}

function canViewReplay(role) {
  return ["admin", "teacher", "student"].includes(role);
}

router.get("/", requireAuth, async (req, res) => {
  const keyword = String(req.query.keyword || "").trim();

  try {
    const [rows] = await pool.query(
      `SELECT
         c.id,
         c.title,
         c.subject,
         c.teacher_name,
         c.start_time,
         c.end_time,
         c.meeting_url,
         c.created_at,
         EXISTS(
           SELECT 1 FROM course_enrollments ce
           WHERE ce.course_id = c.id AND ce.user_id = ?
         ) AS enrolled
       FROM courses c
       WHERE (? = '' OR c.title LIKE CONCAT('%', ?, '%') OR c.subject LIKE CONCAT('%', ?, '%'))
       ORDER BY c.start_time DESC`,
      [req.user.userId, keyword, keyword, keyword]
    );
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch courses" });
  }
});

router.post("/", requireAuth, async (req, res) => {
  if (!canManageCourse(req.user.role)) {
    return res.status(403).json({ message: "Only admin or teacher can create course" });
  }

  const { title, subject, teacherName, startTime, endTime, meetingUrl } = req.body;
  if (!title || !teacherName || !startTime || !endTime) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  const hasOpenMeetingsBaseUrl = Boolean(process.env.OPENMEETINGS_ROOM_BASE_URL);
  if (!meetingUrl && !hasOpenMeetingsBaseUrl) {
    return res.status(500).json({
      message: "OPENMEETINGS_ROOM_BASE_URL is not configured"
    });
  }

  try {
    const [result] = await pool.query(
      "INSERT INTO courses (title, subject, teacher_name, start_time, end_time, meeting_url) VALUES (?, ?, ?, ?, ?, ?)",
      [title, subject || null, teacherName, startTime, endTime, meetingUrl || null]
    );

    if (!meetingUrl && hasOpenMeetingsBaseUrl) {
      const autoMeetingUrl = buildOpenMeetingsRoomUrl(result.insertId);
      if (autoMeetingUrl) {
        await pool.query("UPDATE courses SET meeting_url = ? WHERE id = ?", [autoMeetingUrl, result.insertId]);
      }
    }

    return res.status(201).json({ id: result.insertId });
  } catch (error) {
    return res.status(500).json({ message: "Failed to create course" });
  }
});

router.put("/:id", requireAuth, async (req, res) => {
  if (!canManageCourse(req.user.role)) {
    return res.status(403).json({ message: "Only admin or teacher can update course" });
  }

  const courseId = Number(req.params.id);
  if (!Number.isInteger(courseId) || courseId <= 0) {
    return res.status(400).json({ message: "Invalid courseId" });
  }

  const { title, subject, teacherName, startTime, endTime, meetingUrl } = req.body;
  if (!title || !teacherName || !startTime || !endTime) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  try {
    const [result] = await pool.query(
      "UPDATE courses SET title = ?, subject = ?, teacher_name = ?, start_time = ?, end_time = ?, meeting_url = ? WHERE id = ?",
      [title, subject || null, teacherName, startTime, endTime, meetingUrl || null, courseId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Course not found" });
    }

    return res.json({ message: "Course updated" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update course" });
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  if (!canManageCourse(req.user.role)) {
    return res.status(403).json({ message: "Only admin or teacher can delete course" });
  }

  const courseId = Number(req.params.id);
  if (!Number.isInteger(courseId) || courseId <= 0) {
    return res.status(400).json({ message: "Invalid courseId" });
  }

  try {
    const [result] = await pool.query("DELETE FROM courses WHERE id = ?", [courseId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Course not found" });
    }
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
    return res.status(201).json({ message: "Enrolled" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to enroll" });
  }
});

router.get("/:id/attendance-summary", requireAuth, async (req, res) => {
  if (!canManageCourse(req.user.role)) {
    return res.status(403).json({ message: "Only admin or teacher can view summary" });
  }

  const courseId = Number(req.params.id);
  if (!Number.isInteger(courseId) || courseId <= 0) {
    return res.status(400).json({ message: "Invalid courseId" });
  }

  try {
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
  if (!canViewReplay(req.user.role)) {
    return res.status(403).json({ message: "No permission to view replays" });
  }

  const courseId = Number(req.params.id);
  if (!Number.isInteger(courseId) || courseId <= 0) {
    return res.status(400).json({ message: "Invalid courseId" });
  }

  try {
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
  if (!canManageCourse(req.user.role)) {
    return res.status(403).json({ message: "Only admin or teacher can add replay" });
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
    const [result] = await pool.query(
      "INSERT INTO course_replays (course_id, title, replay_url, duration_seconds) VALUES (?, ?, ?, ?)",
      [courseId, title, replayUrl, durationSeconds || null]
    );
    return res.status(201).json({ id: result.insertId });
  } catch (error) {
    return res.status(500).json({ message: "Failed to add replay" });
  }
});

export default router;
