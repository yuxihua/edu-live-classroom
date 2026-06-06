import express from "express";
import pool from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

router.post("/check-in", requireAuth, async (req, res) => {
  const { courseId } = req.body;
  if (!courseId) {
    return res.status(400).json({ message: "courseId is required" });
  }

  try {
    await pool.query(
      "INSERT INTO attendance (course_id, user_id, check_in_at) VALUES (?, ?, NOW())",
      [courseId, req.user.userId]
    );
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
    await pool.query(
      "UPDATE attendance SET check_out_at = NOW() WHERE course_id = ? AND user_id = ? AND check_out_at IS NULL ORDER BY id DESC LIMIT 1",
      [courseId, req.user.userId]
    );

    return res.json({ message: "Checked out" });
  } catch (error) {
    return res.status(500).json({ message: "Check out failed" });
  }
});

export default router;
