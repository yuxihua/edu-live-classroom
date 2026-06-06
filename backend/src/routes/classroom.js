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

  try {
    const [rows] = await pool.query(
      `SELECT c.id, c.title, c.meeting_url
       FROM courses c
       WHERE c.id = ? ${scope.clause}
       LIMIT 1`,
      [courseId, ...scope.params]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Course not found" });
    }

    const course = rows[0];
    if (!course.meeting_url) {
      return res.status(400).json({ message: "Meeting URL not configured" });
    }

    const ts = Date.now();
    const joinSecret = process.env.OPENMEETINGS_JOIN_SECRET || process.env.JWT_SECRET;
    const base = `${course.id}:${req.user.userId}:${ts}`;
    const sig = crypto.createHmac("sha256", joinSecret).update(base).digest("hex");

    const joinUrl = new URL(course.meeting_url);
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
