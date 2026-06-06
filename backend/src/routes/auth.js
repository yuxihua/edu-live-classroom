import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pool from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

router.post("/register", async (req, res) => {
  const { fullName, email, password, role } = req.body;
  if (!fullName || !email || !password || !role) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  const allowedRoles = ["student", "parent", "assistant", "teacher"];
  if (!allowedRoles.includes(role)) {
    return res.status(403).json({ message: "Registration role not allowed" });
  }

  try {
    const [existing] = await pool.query("SELECT id FROM users WHERE email = ?", [email]);
    if (existing.length > 0) {
      return res.status(409).json({ message: "Email already exists" });
    }

    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      "INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, ?)",
      [fullName, email, hash, role]
    );

    return res.status(201).json({ message: "User registered" });
  } catch (error) {
    return res.status(500).json({ message: "Register failed" });
  }
});

router.post("/login", async (req, res) => {
  const account = String(req.body.account || req.body.email || "").trim();
  const { password } = req.body;
  if (!account || !password) {
    return res.status(400).json({ message: "Account and password required" });
  }

  try {
    const isEmailLike = account.includes("@");
    const [rows] = await pool.query(
      isEmailLike
        ? "SELECT id, full_name, email, password_hash, role, organization_id, district_id, status FROM users WHERE email = ? LIMIT 2"
        : "SELECT id, full_name, email, password_hash, role, organization_id, district_id, status FROM users WHERE full_name = ? LIMIT 2",
      [account]
    );

    if (rows.length > 1) {
      return res.status(409).json({ message: "Account is duplicated" });
    }

    if (rows.length === 0) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role, email: user.email, organizationId: user.organization_id || null, districtId: user.district_id || null, status: user.status || "active" },
      process.env.JWT_SECRET,
      { expiresIn: "12h" }
    );

    return res.json({
      token,
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        role: user.role,
        organizationId: user.organization_id || null,
        districtId: user.district_id || null,
        status: user.status || "active"
      }
    });
  } catch (error) {
    return res.status(500).json({ message: "Login failed" });
  }
});

router.get("/me", requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, full_name, email, role, organization_id, district_id, status FROM users WHERE id = ? LIMIT 1",
      [req.user.userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = rows[0];
    const response = {
      id: user.id,
      fullName: user.full_name,
      email: user.email,
      role: user.role,
      organizationId: user.organization_id || null,
      districtId: user.district_id || null,
      status: user.status || "active"
    };

    if (user.role === "parent") {
      const [links] = await pool.query(
        `SELECT gl.student_user_id, s.full_name AS student_name, s.email AS student_email
         FROM guardian_student_links gl
         LEFT JOIN users s ON s.id = gl.student_user_id
         WHERE gl.parent_user_id = ?
         ORDER BY gl.id DESC`,
        [user.id]
      );
      response.linkedStudents = links;
    }

    return res.json(response);
  } catch (error) {
    return res.status(500).json({ message: "Failed to load profile" });
  }
});

export default router;
