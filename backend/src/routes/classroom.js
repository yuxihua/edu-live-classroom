import crypto from "crypto";
import express from "express";
import pool from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

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

router.get("/:courseId/join-link", requireAuth, async (req, res) => {
  const courseId = Number(req.params.courseId);
  if (!Number.isInteger(courseId) || courseId <= 0) {
    return res.status(400).json({ message: "Invalid courseId" });
  }

  const scope = buildScopeForAlias(req.user, "c");
  const roomId = Number(req.query.roomId || 0);

  try {
    const [rows] = await pool.query(
      `SELECT c.id, c.title, c.meeting_url, c.assistant_user_id, c.teacher_user_id
       FROM courses c
       WHERE c.id = ? ${scope.clause}
       LIMIT 1`,
      [courseId, ...scope.params]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Course not found" });
    }

    const course = rows[0];
    const isTeacher = Number(course.teacher_user_id || 0) === Number(req.user.userId);
    const isAssistant = Number(course.assistant_user_id || 0) === Number(req.user.userId);
    let allowed = isTeacher || isAssistant || req.user.role === "admin";

    if (!allowed && req.user.role === "student") {
      const [purchaseRows] = await pool.query(
        "SELECT id FROM course_purchases WHERE course_id = ? AND student_user_id = ? AND status = 'paid' LIMIT 1",
        [courseId, req.user.userId]
      );
      allowed = purchaseRows.length > 0;
    }

    if (!allowed && req.user.role === "parent") {
      const [purchaseRows] = await pool.query(
        `SELECT cp.id
         FROM course_purchases cp
         JOIN guardian_student_links gsl ON gsl.student_user_id = cp.student_user_id
         WHERE cp.course_id = ? AND cp.status = 'paid' AND gsl.parent_user_id = ?
         LIMIT 1`,
        [courseId, req.user.userId]
      );
      allowed = purchaseRows.length > 0;
    }

    if (!allowed) {
      return res.status(403).json({ message: "No permission to join this classroom" });
    }

    let resolvedMeetingUrl = course.meeting_url;
    if (roomId > 0) {
      const [roomRows] = await pool.query(
        "SELECT id, meeting_url FROM live_rooms WHERE id = ? AND course_id = ? LIMIT 1",
        [roomId, courseId]
      );
      if (roomRows.length === 0) {
        return res.status(404).json({ message: "Live room not found" });
      }
      resolvedMeetingUrl = roomRows[0].meeting_url;
    } else {
      const [roomRows] = await pool.query(
        "SELECT id, meeting_url FROM live_rooms WHERE course_id = ? ORDER BY id ASC LIMIT 1",
        [courseId]
      );
      if (roomRows.length > 0) {
        resolvedMeetingUrl = roomRows[0].meeting_url;
      }
    }

    if (!resolvedMeetingUrl) {
      return res.status(400).json({ message: "Meeting URL not configured" });
    }

    const ts = Date.now();
    const joinSecret = process.env.OPENMEETINGS_JOIN_SECRET || process.env.JWT_SECRET;
    const base = `${course.id}:${req.user.userId}:${ts}`;
    const sig = crypto.createHmac("sha256", joinSecret).update(base).digest("hex");

    const joinUrl = new URL(resolvedMeetingUrl);
    joinUrl.searchParams.set("uid", String(req.user.userId));
    joinUrl.searchParams.set("role", req.user.role);
    joinUrl.searchParams.set("ts", String(ts));
    joinUrl.searchParams.set("sig", sig);

    return res.json({
      courseId: course.id,
      title: course.title,
      joinUrl: joinUrl.toString(),
      expiresInMs: 5 * 60 * 1000
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to generate join link" });
  }
});

export default router;
