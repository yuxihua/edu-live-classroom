import express from "express";
import bcrypt from "bcryptjs";
import pool from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();
const MANAGE_ROLES = ["admin", "org_admin", "district_admin"];

function canManage(req) {
  return MANAGE_ROLES.includes(req.user?.role);
}

async function recordAudit(req, action, resourceType, resourceId = null, detail = null) {
  try {
    await pool.query(
      "INSERT INTO audit_logs (actor_user_id, action, resource_type, resource_id, detail, ip_address) VALUES (?, ?, ?, ?, ?, ?)",
      [req.user?.userId || null, action, resourceType, resourceId, detail ? JSON.stringify(detail) : null, req.ip || null]
    );
  } catch (error) {
    // audit logging should not block the business action
  }
}

router.use(requireAuth);

router.get("/meta", async (req, res) => {
  return res.json({
    roles: ["admin", "org_admin", "district_admin", "teacher", "assistant", "student", "parent"],
    manageRoles: MANAGE_ROLES,
    permissions: [
      "system.manage",
      "organization.manage",
      "district.manage",
      "user.manage",
      "course.manage",
      "log.view",
      "settings.manage",
      "permission.manage",
      "attendance.manage",
      "replay.manage"
    ]
  });
});

router.get("/dashboard", async (req, res) => {
  if (!canManage(req)) {
    return res.status(403).json({ message: "Permission denied" });
  }

  try {
    const [[districts], [organizations], [users], [courses], [logs]] = await Promise.all([
      pool.query("SELECT COUNT(*) AS count FROM districts"),
      pool.query("SELECT COUNT(*) AS count FROM organizations"),
      pool.query("SELECT COUNT(*) AS count FROM users"),
      pool.query("SELECT COUNT(*) AS count FROM courses"),
      pool.query("SELECT COUNT(*) AS count FROM audit_logs")
    ]);

    return res.json({
      districts: districts[0].count,
      organizations: organizations[0].count,
      users: users[0].count,
      courses: courses[0].count,
      logs: logs[0].count
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load dashboard" });
  }
});

router.get("/districts", async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ message: "Permission denied" });

  try {
    const [rows] = await pool.query("SELECT id, name, code, created_at FROM districts ORDER BY id DESC");
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch districts" });
  }
});

router.post("/districts", async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ message: "Permission denied" });

  const { name, code } = req.body;
  if (!name || !code) {
    return res.status(400).json({ message: "name and code are required" });
  }

  try {
    const [result] = await pool.query("INSERT INTO districts (name, code) VALUES (?, ?)", [name, code]);
    await recordAudit(req, "create", "district", result.insertId, { name, code });
    return res.status(201).json({ id: result.insertId });
  } catch (error) {
    return res.status(500).json({ message: "Failed to create district" });
  }
});

router.put("/districts/:id", async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ message: "Permission denied" });

  const districtId = Number(req.params.id);
  const { name, code } = req.body;
  if (!Number.isInteger(districtId) || districtId <= 0) return res.status(400).json({ message: "Invalid districtId" });
  if (!name || !code) return res.status(400).json({ message: "name and code are required" });

  try {
    const [result] = await pool.query("UPDATE districts SET name = ?, code = ? WHERE id = ?", [name, code, districtId]);
    if (result.affectedRows === 0) return res.status(404).json({ message: "District not found" });
    await recordAudit(req, "update", "district", districtId, { name, code });
    return res.json({ message: "District updated" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update district" });
  }
});

router.delete("/districts/:id", async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ message: "Permission denied" });

  const districtId = Number(req.params.id);
  if (!Number.isInteger(districtId) || districtId <= 0) return res.status(400).json({ message: "Invalid districtId" });

  try {
    const [result] = await pool.query("DELETE FROM districts WHERE id = ?", [districtId]);
    if (result.affectedRows === 0) return res.status(404).json({ message: "District not found" });
    await recordAudit(req, "delete", "district", districtId);
    return res.json({ message: "District deleted" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete district" });
  }
});

router.get("/organizations", async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ message: "Permission denied" });

  try {
    const [rows] = await pool.query(
      `SELECT o.id, o.name, o.code, o.category, o.district_id, d.name AS district_name, o.created_at
       FROM organizations o
       LEFT JOIN districts d ON d.id = o.district_id
       ORDER BY o.id DESC`
    );
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch organizations" });
  }
});

router.post("/organizations", async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ message: "Permission denied" });

  const { name, code, category, districtId } = req.body;
  if (!name || !code) return res.status(400).json({ message: "name and code are required" });

  try {
    const [result] = await pool.query(
      "INSERT INTO organizations (name, code, category, district_id) VALUES (?, ?, ?, ?)",
      [name, code, category || "school", districtId || null]
    );
    await recordAudit(req, "create", "organization", result.insertId, { name, code, category, districtId });
    return res.status(201).json({ id: result.insertId });
  } catch (error) {
    return res.status(500).json({ message: "Failed to create organization" });
  }
});

router.put("/organizations/:id", async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ message: "Permission denied" });

  const organizationId = Number(req.params.id);
  const { name, code, category, districtId } = req.body;
  if (!Number.isInteger(organizationId) || organizationId <= 0) return res.status(400).json({ message: "Invalid organizationId" });
  if (!name || !code) return res.status(400).json({ message: "name and code are required" });

  try {
    const [result] = await pool.query(
      "UPDATE organizations SET name = ?, code = ?, category = ?, district_id = ? WHERE id = ?",
      [name, code, category || "school", districtId || null, organizationId]
    );
    if (result.affectedRows === 0) return res.status(404).json({ message: "Organization not found" });
    await recordAudit(req, "update", "organization", organizationId, { name, code, category, districtId });
    return res.json({ message: "Organization updated" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update organization" });
  }
});

router.delete("/organizations/:id", async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ message: "Permission denied" });

  const organizationId = Number(req.params.id);
  if (!Number.isInteger(organizationId) || organizationId <= 0) return res.status(400).json({ message: "Invalid organizationId" });

  try {
    const [result] = await pool.query("DELETE FROM organizations WHERE id = ?", [organizationId]);
    if (result.affectedRows === 0) return res.status(404).json({ message: "Organization not found" });
    await recordAudit(req, "delete", "organization", organizationId);
    return res.json({ message: "Organization deleted" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete organization" });
  }
});

router.get("/users", async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ message: "Permission denied" });

  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.full_name, u.email, u.role, u.status, u.organization_id, u.district_id, u.created_at,
              o.name AS organization_name, d.name AS district_name
       FROM users u
       LEFT JOIN organizations o ON o.id = u.organization_id
       LEFT JOIN districts d ON d.id = u.district_id
       ORDER BY u.id DESC`
    );
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch users" });
  }
});

router.post("/users", async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ message: "Permission denied" });

  const { fullName, email, password, role, organizationId, districtId, status } = req.body;
  if (!fullName || !email || !password || !role) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  try {
    const [existing] = await pool.query("SELECT id FROM users WHERE email = ?", [email]);
    if (existing.length > 0) {
      return res.status(409).json({ message: "Email already exists" });
    }

    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      "INSERT INTO users (full_name, email, password_hash, role, organization_id, district_id, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [fullName, email, hash, role, organizationId || null, districtId || null, status || "active"]
    );

    await recordAudit(req, "create", "user", result.insertId, { fullName, email, role, organizationId, districtId, status: status || "active" });
    return res.status(201).json({ id: result.insertId });
  } catch (error) {
    return res.status(500).json({ message: "Failed to create user" });
  }
});

router.put("/users/:id", async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ message: "Permission denied" });

  const userId = Number(req.params.id);
  const { fullName, email, password, role, organizationId, districtId, status } = req.body;
  if (!Number.isInteger(userId) || userId <= 0) return res.status(400).json({ message: "Invalid userId" });
  if (!fullName || !email || !role) return res.status(400).json({ message: "Missing required fields" });

  try {
    const hashPart = password ? await bcrypt.hash(password, 10) : null;
    const params = [fullName, email, role, organizationId || null, districtId || null, status || "active"];
    let sql = "UPDATE users SET full_name = ?, email = ?, role = ?, organization_id = ?, district_id = ?, status = ?";
    if (hashPart) {
      sql += ", password_hash = ?";
      params.push(hashPart);
    }
    sql += " WHERE id = ?";
    params.push(userId);

    const [result] = await pool.query(sql, params);
    if (result.affectedRows === 0) return res.status(404).json({ message: "User not found" });

    await recordAudit(req, "update", "user", userId, { fullName, email, role, organizationId, districtId, status: status || "active" });
    return res.json({ message: "User updated" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update user" });
  }
});

router.delete("/users/:id", async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ message: "Permission denied" });

  const userId = Number(req.params.id);
  if (!Number.isInteger(userId) || userId <= 0) return res.status(400).json({ message: "Invalid userId" });

  try {
    const [result] = await pool.query("DELETE FROM users WHERE id = ?", [userId]);
    if (result.affectedRows === 0) return res.status(404).json({ message: "User not found" });
    await recordAudit(req, "delete", "user", userId);
    return res.json({ message: "User deleted" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete user" });
  }
});

router.get("/settings", async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ message: "Permission denied" });

  try {
    const [rows] = await pool.query(
      "SELECT setting_key, setting_value, category, updated_at FROM system_settings ORDER BY category, setting_key"
    );
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ message: "Failed to load settings" });
  }
});

router.put("/settings/:key", async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ message: "Permission denied" });

  const key = String(req.params.key || "").trim();
  const { settingValue, category } = req.body;
  if (!key) return res.status(400).json({ message: "Invalid setting key" });

  try {
    await pool.query(
      `INSERT INTO system_settings (setting_key, setting_value, category, updated_by)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), category = VALUES(category), updated_by = VALUES(updated_by), updated_at = CURRENT_TIMESTAMP`,
      [key, settingValue ?? null, category || "general", req.user.userId]
    );
    await recordAudit(req, "update", "setting", null, { key, settingValue, category });
    return res.json({ message: "Setting updated" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update setting" });
  }
});

router.get("/permissions", async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ message: "Permission denied" });

  try {
    const [rows] = await pool.query(
      "SELECT id, role_name, permission_key, permission_value, created_at FROM role_permissions ORDER BY role_name, permission_key"
    );
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch permissions" });
  }
});

router.put("/permissions", async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ message: "Permission denied" });

  const { roleName, permissions } = req.body;
  if (!roleName || !Array.isArray(permissions)) {
    return res.status(400).json({ message: "roleName and permissions are required" });
  }

  try {
    await pool.query("DELETE FROM role_permissions WHERE role_name = ?", [roleName]);
    for (const item of permissions) {
      if (!item?.permissionKey) continue;
      await pool.query(
        "INSERT INTO role_permissions (role_name, permission_key, permission_value) VALUES (?, ?, ?)",
        [roleName, item.permissionKey, item.permissionValue === false ? 0 : 1]
      );
    }
    await recordAudit(req, "update", "permission", null, { roleName, permissions });
    return res.json({ message: "Permissions updated" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update permissions" });
  }
});

router.get("/logs", async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ message: "Permission denied" });

  try {
    const [rows] = await pool.query(
      `SELECT l.id, l.action, l.resource_type, l.resource_id, l.detail, l.ip_address, l.created_at,
              u.full_name AS actor_name, u.email AS actor_email
       FROM audit_logs l
       LEFT JOIN users u ON u.id = l.actor_user_id
       ORDER BY l.created_at DESC
       LIMIT 200`
    );
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch logs" });
  }
});

export default router;