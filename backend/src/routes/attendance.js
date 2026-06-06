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

async function hasCourseAccess(req, courseId) {
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

router.post("/check-in", requireAuth, async (req, res) => {
  const { courseId } = req.body;
  if (!courseId) {
    return res.status(400).json({ message: "courseId is required" });
  }

  try {
    const courseAllowed = await hasCourseAccess(req, Number(courseId));
    if (!courseAllowed) {
      return res.status(404).json({ message: "Course not found" });
    }

    await pool.query(
      "INSERT INTO attendance (course_id, user_id, check_in_at) VALUES (?, ?, NOW())",
      [courseId, req.user.userId]
    );
    await recordAudit(req, "check_in", "attendance", Number(courseId), { userId: req.user.userId });
    return res.status(201).json({ message: "Checked in" });
  } catch (error) {
    return res.status(500).json({ message: "Check in failed" });
  }
});

router.post("/check-out", requireAuth, async (req, res) => {
  const { courseId } = req.body;
  if (!courseId) {
    return res.status(400).json({ message: "courseId is required" });
  }

  try {
    const courseAllowed = await hasCourseAccess(req, Number(courseId));
    if (!courseAllowed) {
      return res.status(404).json({ message: "Course not found" });
    }

    await pool.query(
      "UPDATE attendance SET check_out_at = NOW() WHERE course_id = ? AND user_id = ? AND check_out_at IS NULL ORDER BY id DESC LIMIT 1",
      [courseId, req.user.userId]
    );

    await recordAudit(req, "check_out", "attendance", Number(courseId), { userId: req.user.userId });

    return res.json({ message: "Checked out" });
  } catch (error) {
    return res.status(500).json({ message: "Check out failed" });
  }
});

export default router;
