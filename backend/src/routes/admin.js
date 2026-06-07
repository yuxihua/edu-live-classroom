import express from "express";
import bcrypt from "bcryptjs";
import pool from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";
import { clearPermissionCache, requirePermission } from "../middleware/permissions.js";
import { checkOpenMeetingsConnection } from "../services/openmeetings.js";

const router = express.Router();
const MANAGE_ROLES = ["admin", "org_admin", "district_admin"];

function canManage(req) {
  return MANAGE_ROLES.includes(req.user?.role);
}

function canAssignRole(actorRole, targetRole) {
  if (actorRole === "admin") return true;
  if (actorRole === "org_admin") {
    return ["district_admin", "teacher", "assistant", "student", "parent"].includes(targetRole);
  }
  if (actorRole === "district_admin") {
    return ["teacher", "assistant", "student", "parent"].includes(targetRole);
  }
  return false;
}

async function resolveManageScope(req) {
  if (req.user?.role === "admin") {
    return { role: "admin", organizationId: null, districtId: null };
  }

  if (req.user?.role === "org_admin") {
    const organizationId = Number(req.user.organizationId || 0);
    if (organizationId <= 0) return null;
    return { role: "org_admin", organizationId, districtId: null };
  }

  if (req.user?.role === "district_admin") {
    const districtId = Number(req.user.districtId || 0);
    if (districtId <= 0) return null;

    let organizationId = Number(req.user.organizationId || 0);
    if (organizationId <= 0) {
      const [rows] = await pool.query("SELECT organization_id FROM districts WHERE id = ? LIMIT 1", [districtId]);
      if (rows.length === 0) return null;
      organizationId = Number(rows[0].organization_id || 0);
    }

    if (organizationId <= 0) return null;
    return { role: "district_admin", organizationId, districtId };
  }

  return null;
}

function buildEntityScope(scope, orgColumn, districtColumn) {
  if (!scope || scope.role === "admin") {
    return { clause: "", params: [] };
  }

  if (scope.role === "district_admin") {
    return { clause: ` AND ${districtColumn} = ?`, params: [scope.districtId] };
  }

  return { clause: ` AND ${orgColumn} = ?`, params: [scope.organizationId] };
}

function buildOrganizationScope(scope, orgColumn) {
  if (!scope || scope.role === "admin") {
    return { clause: "", params: [] };
  }
  return { clause: ` AND ${orgColumn} = ?`, params: [scope.organizationId] };
}

function buildDualUserScope(scope, leftAlias, rightAlias) {
  if (!scope || scope.role === "admin") {
    return { clause: "", params: [] };
  }

  if (scope.role === "district_admin") {
    return {
      clause: ` AND ${leftAlias}.district_id = ? AND ${rightAlias}.district_id = ?`,
      params: [scope.districtId, scope.districtId]
    };
  }

  return {
    clause: ` AND ${leftAlias}.organization_id = ? AND ${rightAlias}.organization_id = ?`,
    params: [scope.organizationId, scope.organizationId]
  };
}

async function isOrganizationAllowed(scope, organizationId) {
  if (!organizationId) return true;
  if (scope.role === "admin") return true;
  return Number(organizationId) === Number(scope.organizationId);
}

async function isDistrictAllowed(scope, districtId) {
  if (!districtId) return true;

  const [rows] = await pool.query("SELECT id, organization_id FROM districts WHERE id = ? LIMIT 1", [districtId]);
  if (rows.length === 0) return false;

  if (scope.role === "admin") return true;
  if (scope.role === "org_admin") return Number(rows[0].organization_id || 0) === Number(scope.organizationId);
  return Number(rows[0].id || 0) === Number(scope.districtId);
}

async function isUserAllowed(scope, userId) {
  const [rows] = await pool.query("SELECT id, organization_id, district_id FROM users WHERE id = ? LIMIT 1", [userId]);
  if (rows.length === 0) return false;

  if (scope.role === "admin") return true;
  if (scope.role === "org_admin") return Number(rows[0].organization_id || 0) === Number(scope.organizationId);
  return Number(rows[0].district_id || 0) === Number(scope.districtId);
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

const createDefaultOpenMeetingsSnapshot = () => ({
  ok: false,
  checked: false,
  message: "未检测",
  checkedAt: null,
  durationMs: null,
  failureCount: 0,
  lastSuccessAt: null,
  lastErrorAt: null,
  apiBaseUrl: null,
  roomBaseUrl: null
});

let openMeetingsHealthSnapshot = createDefaultOpenMeetingsSnapshot();

const getOpenMeetingsHealthSnapshot = () => ({ ...openMeetingsHealthSnapshot });

const refreshOpenMeetingsHealthSnapshot = async () => {
  const startedAt = Date.now();
  const checkedAt = new Date().toISOString();
  const previousSnapshot = openMeetingsHealthSnapshot;

  try {
    const result = await checkOpenMeetingsConnection();
    openMeetingsHealthSnapshot = {
      ...previousSnapshot,
      ok: true,
      checked: true,
      message: "连接成功",
      checkedAt,
      durationMs: Date.now() - startedAt,
      failureCount: 0,
      lastSuccessAt: checkedAt,
      apiBaseUrl: result.apiBaseUrl || null,
      roomBaseUrl: result.roomBaseUrl || null
    };
  } catch (error) {
    openMeetingsHealthSnapshot = {
      ...previousSnapshot,
      ok: false,
      checked: true,
      message: error.message || "检测 OpenMeetings 接口失败",
      checkedAt,
      durationMs: Date.now() - startedAt,
      failureCount: Number(previousSnapshot.failureCount || 0) + 1,
      lastErrorAt: checkedAt
    };
  }

  return getOpenMeetingsHealthSnapshot();
};

const runOpenMeetingsHealthCheck = async (req, source = "manual") => {
  const snapshot = await refreshOpenMeetingsHealthSnapshot();
  await recordAudit(req, "openmeetings.health.check", "integration", null, {
    source,
    ok: snapshot.ok,
    message: snapshot.message,
    checkedAt: snapshot.checkedAt,
    durationMs: snapshot.durationMs,
    failureCount: snapshot.failureCount,
    lastSuccessAt: snapshot.lastSuccessAt,
    lastErrorAt: snapshot.lastErrorAt,
    apiBaseUrl: snapshot.apiBaseUrl,
    roomBaseUrl: snapshot.roomBaseUrl
  });
  return snapshot;
};

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
      "replay.manage",
      "sales.rules.manage",
      "sales.agents.manage",
      "sales.bindings.manage",
      "sales.reports.view",
      "sales.orders.manage",
      "sales.orders.view"
    ]
  });
});

router.get("/dashboard", requirePermission("system.manage"), async (req, res) => {
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

    const openMeetings = getOpenMeetingsHealthSnapshot();

    return res.json({
      districts: districts[0].count,
      organizations: organizations[0].count,
      users: users[0].count,
      courses: courses[0].count,
      logs: logs[0].count,
      openMeetings
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load dashboard" });
  }
});

router.get("/openmeetings/health", requirePermission("system.manage"), async (req, res) => {
  if (!canManage(req)) {
    return res.status(403).json({ message: "Permission denied" });
  }

  try {
    const shouldRefresh = String(req.query.refresh ?? "true").trim().toLowerCase() !== "false";
    const snapshot = shouldRefresh
      ? await runOpenMeetingsHealthCheck(req, String(req.query.source || "manual"))
      : getOpenMeetingsHealthSnapshot();
    return res.json(snapshot);
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message || "Failed to check OpenMeetings health" });
  }
});

router.get("/districts", requirePermission("district.manage"), async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ message: "Permission denied" });

  const scope = await resolveManageScope(req);
  if (!scope) return res.status(403).json({ message: "Permission denied" });

  const scoped = buildEntityScope(scope, "d.organization_id", "d.id");

  try {
    const [rows] = await pool.query(
      `SELECT d.id, d.name, d.code, d.organization_id, d.created_at, o.name AS organization_name
       FROM districts d
       LEFT JOIN organizations o ON o.id = d.organization_id
       WHERE 1 = 1 ${scoped.clause}
       ORDER BY d.id DESC`
      ,
      [...scoped.params]
    );
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch districts" });
  }
});

router.post("/districts", requirePermission("district.manage"), async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ message: "Permission denied" });

  const scope = await resolveManageScope(req);
  if (!scope) return res.status(403).json({ message: "Permission denied" });

  const { name, code, organizationId } = req.body;
  if (!name || !code || !organizationId) {
    return res.status(400).json({ message: "name, code and organizationId are required" });
  }

  const orgAllowed = await isOrganizationAllowed(scope, Number(organizationId));
  if (!orgAllowed) return res.status(403).json({ message: "Permission denied" });

  try {
    const [result] = await pool.query(
      "INSERT INTO districts (name, code, organization_id) VALUES (?, ?, ?)",
      [name, code, organizationId]
    );
    await recordAudit(req, "create", "district", result.insertId, { name, code, organizationId });
    return res.status(201).json({ id: result.insertId });
  } catch (error) {
    return res.status(500).json({ message: "Failed to create district" });
  }
});

router.put("/districts/:id", requirePermission("district.manage"), async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ message: "Permission denied" });

  const scope = await resolveManageScope(req);
  if (!scope) return res.status(403).json({ message: "Permission denied" });

  const districtId = Number(req.params.id);
  const { name, code, organizationId } = req.body;
  if (!Number.isInteger(districtId) || districtId <= 0) return res.status(400).json({ message: "Invalid districtId" });
  if (!name || !code || !organizationId) return res.status(400).json({ message: "name, code and organizationId are required" });

  const districtAllowed = await isDistrictAllowed(scope, districtId);
  const orgAllowed = await isOrganizationAllowed(scope, Number(organizationId));
  if (!districtAllowed || !orgAllowed) return res.status(403).json({ message: "Permission denied" });

  try {
    const [result] = await pool.query(
      "UPDATE districts SET name = ?, code = ?, organization_id = ? WHERE id = ?",
      [name, code, organizationId, districtId]
    );
    if (result.affectedRows === 0) return res.status(404).json({ message: "District not found" });
    await recordAudit(req, "update", "district", districtId, { name, code, organizationId });
    return res.json({ message: "District updated" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update district" });
  }
});

router.delete("/districts/:id", requirePermission("district.manage"), async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ message: "Permission denied" });

  const scope = await resolveManageScope(req);
  if (!scope) return res.status(403).json({ message: "Permission denied" });

  const districtId = Number(req.params.id);
  if (!Number.isInteger(districtId) || districtId <= 0) return res.status(400).json({ message: "Invalid districtId" });

  const districtAllowed = await isDistrictAllowed(scope, districtId);
  if (!districtAllowed) return res.status(403).json({ message: "Permission denied" });

  try {
    const [result] = await pool.query("DELETE FROM districts WHERE id = ?", [districtId]);
    if (result.affectedRows === 0) return res.status(404).json({ message: "District not found" });
    await recordAudit(req, "delete", "district", districtId);
    return res.json({ message: "District deleted" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete district" });
  }
});

router.get("/organizations", requirePermission("organization.manage"), async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ message: "Permission denied" });

  const scope = await resolveManageScope(req);
  if (!scope) return res.status(403).json({ message: "Permission denied" });

  const scoped = buildOrganizationScope(scope, "o.id");

  try {
    const [rows] = await pool.query(
      `SELECT o.id, o.name, o.code, o.category, o.created_at,
              (SELECT COUNT(*) FROM districts d WHERE d.organization_id = o.id) AS district_count
       FROM organizations o
       WHERE 1 = 1 ${scoped.clause}
       ORDER BY o.id DESC`
      ,
      [...scoped.params]
    );
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch organizations" });
  }
});

router.get("/classrooms", requirePermission("organization.manage"), async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ message: "Permission denied" });

  const scope = await resolveManageScope(req);
  if (!scope) return res.status(403).json({ message: "Permission denied" });

  const scoped = buildEntityScope(scope, "c.organization_id", "c.district_id");

  try {
    const [rows] = await pool.query(
      `SELECT c.id, c.name, c.code, c.organization_id, c.district_id, c.assistant_user_id, c.created_at,
              o.name AS organization_name, d.name AS district_name, u.full_name AS assistant_name
       FROM fixed_classrooms c
       LEFT JOIN organizations o ON o.id = c.organization_id
       LEFT JOIN districts d ON d.id = c.district_id
       LEFT JOIN users u ON u.id = c.assistant_user_id
       WHERE 1 = 1 ${scoped.clause}
       ORDER BY c.id DESC`
      ,
      [...scoped.params]
    );
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch classrooms" });
  }
});

router.post("/classrooms", requirePermission("organization.manage"), async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ message: "Permission denied" });

  const scope = await resolveManageScope(req);
  if (!scope) return res.status(403).json({ message: "Permission denied" });

  const { name, code, organizationId, districtId, assistantUserId } = req.body;
  if (!name || !code || !organizationId || !districtId) {
    return res.status(400).json({ message: "name, code, organizationId and districtId are required" });
  }

  const orgAllowed = await isOrganizationAllowed(scope, Number(organizationId));
  const districtAllowed = await isDistrictAllowed(scope, Number(districtId));
  if (!orgAllowed || !districtAllowed) return res.status(403).json({ message: "Permission denied" });

  try {
    const [result] = await pool.query(
      "INSERT INTO fixed_classrooms (name, code, organization_id, district_id, assistant_user_id) VALUES (?, ?, ?, ?, ?)",
      [name, code, organizationId, districtId, assistantUserId || null]
    );
    await recordAudit(req, "create", "classroom", result.insertId, { name, code, organizationId, districtId, assistantUserId: assistantUserId || null });
    return res.status(201).json({ id: result.insertId });
  } catch (error) {
    return res.status(500).json({ message: "Failed to create classroom" });
  }
});

router.put("/classrooms/:id", requirePermission("organization.manage"), async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ message: "Permission denied" });

  const scope = await resolveManageScope(req);
  if (!scope) return res.status(403).json({ message: "Permission denied" });

  const classroomId = Number(req.params.id);
  const { name, code, organizationId, districtId, assistantUserId } = req.body;
  if (!Number.isInteger(classroomId) || classroomId <= 0) return res.status(400).json({ message: "Invalid classroomId" });
  if (!name || !code || !organizationId || !districtId) return res.status(400).json({ message: "name, code, organizationId and districtId are required" });

  const scoped = buildEntityScope(scope, "organization_id", "district_id");
  const [targetRows] = await pool.query(
    `SELECT id FROM fixed_classrooms WHERE id = ? ${scoped.clause} LIMIT 1`,
    [classroomId, ...scoped.params]
  );
  if (targetRows.length === 0) return res.status(403).json({ message: "Permission denied" });

  const orgAllowed = await isOrganizationAllowed(scope, Number(organizationId));
  const districtAllowed = await isDistrictAllowed(scope, Number(districtId));
  if (!orgAllowed || !districtAllowed) return res.status(403).json({ message: "Permission denied" });

  try {
    const [result] = await pool.query(
      "UPDATE fixed_classrooms SET name = ?, code = ?, organization_id = ?, district_id = ?, assistant_user_id = ? WHERE id = ?",
      [name, code, organizationId, districtId, assistantUserId || null, classroomId]
    );
    if (result.affectedRows === 0) return res.status(404).json({ message: "Classroom not found" });
    await recordAudit(req, "update", "classroom", classroomId, { name, code, organizationId, districtId, assistantUserId: assistantUserId || null });
    return res.json({ message: "Classroom updated" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update classroom" });
  }
});

router.delete("/classrooms/:id", requirePermission("organization.manage"), async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ message: "Permission denied" });

  const scope = await resolveManageScope(req);
  if (!scope) return res.status(403).json({ message: "Permission denied" });

  const classroomId = Number(req.params.id);
  if (!Number.isInteger(classroomId) || classroomId <= 0) return res.status(400).json({ message: "Invalid classroomId" });

  const scoped = buildEntityScope(scope, "organization_id", "district_id");
  const [targetRows] = await pool.query(
    `SELECT id FROM fixed_classrooms WHERE id = ? ${scoped.clause} LIMIT 1`,
    [classroomId, ...scoped.params]
  );
  if (targetRows.length === 0) return res.status(403).json({ message: "Permission denied" });

  try {
    const [result] = await pool.query("DELETE FROM fixed_classrooms WHERE id = ?", [classroomId]);
    if (result.affectedRows === 0) return res.status(404).json({ message: "Classroom not found" });
    await recordAudit(req, "delete", "classroom", classroomId);
    return res.json({ message: "Classroom deleted" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete classroom" });
  }
});

router.post("/organizations", requirePermission("organization.manage"), async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ message: "Permission denied" });

  const scope = await resolveManageScope(req);
  if (!scope || scope.role !== "admin") return res.status(403).json({ message: "Permission denied" });

  const { name, code, category } = req.body;
  if (!name || !code) return res.status(400).json({ message: "name and code are required" });

  try {
    const [result] = await pool.query(
      "INSERT INTO organizations (name, code, category, district_id) VALUES (?, ?, ?, NULL)",
      [name, code, category || "school"]
    );
    await recordAudit(req, "create", "organization", result.insertId, { name, code, category });
    return res.status(201).json({ id: result.insertId });
  } catch (error) {
    return res.status(500).json({ message: "Failed to create organization" });
  }
});

router.put("/organizations/:id", requirePermission("organization.manage"), async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ message: "Permission denied" });

  const scope = await resolveManageScope(req);
  if (!scope) return res.status(403).json({ message: "Permission denied" });

  const organizationId = Number(req.params.id);
  const { name, code, category } = req.body;
  if (!Number.isInteger(organizationId) || organizationId <= 0) return res.status(400).json({ message: "Invalid organizationId" });
  if (!name || !code) return res.status(400).json({ message: "name and code are required" });

  const orgAllowed = await isOrganizationAllowed(scope, organizationId);
  if (!orgAllowed) return res.status(403).json({ message: "Permission denied" });

  try {
    const [result] = await pool.query(
      "UPDATE organizations SET name = ?, code = ?, category = ? WHERE id = ?",
      [name, code, category || "school", organizationId]
    );
    if (result.affectedRows === 0) return res.status(404).json({ message: "Organization not found" });
    await recordAudit(req, "update", "organization", organizationId, { name, code, category });
    return res.json({ message: "Organization updated" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update organization" });
  }
});

router.delete("/organizations/:id", requirePermission("organization.manage"), async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ message: "Permission denied" });

  const scope = await resolveManageScope(req);
  if (!scope) return res.status(403).json({ message: "Permission denied" });

  const organizationId = Number(req.params.id);
  if (!Number.isInteger(organizationId) || organizationId <= 0) return res.status(400).json({ message: "Invalid organizationId" });

  const orgAllowed = await isOrganizationAllowed(scope, organizationId);
  if (!orgAllowed) return res.status(403).json({ message: "Permission denied" });

  try {
    const [result] = await pool.query("DELETE FROM organizations WHERE id = ?", [organizationId]);
    if (result.affectedRows === 0) return res.status(404).json({ message: "Organization not found" });
    await recordAudit(req, "delete", "organization", organizationId);
    return res.json({ message: "Organization deleted" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete organization" });
  }
});

router.get("/users", requirePermission("user.manage"), async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ message: "Permission denied" });

  const scope = await resolveManageScope(req);
  if (!scope) return res.status(403).json({ message: "Permission denied" });

  const scoped = buildEntityScope(scope, "u.organization_id", "u.district_id");

  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.full_name, u.email, u.role, u.status, u.organization_id, u.district_id, u.created_at,
              o.name AS organization_name, d.name AS district_name
       FROM users u
       LEFT JOIN organizations o ON o.id = u.organization_id
       LEFT JOIN districts d ON d.id = u.district_id
       WHERE 1 = 1 ${scoped.clause}
       ORDER BY u.id DESC`
      ,
      [...scoped.params]
    );
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch users" });
  }
});

router.get("/guardian-links", requirePermission("user.manage"), async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ message: "Permission denied" });

  const scope = await resolveManageScope(req);
  if (!scope) return res.status(403).json({ message: "Permission denied" });

  const scoped = buildDualUserScope(scope, "p", "s");

  try {
    const [rows] = await pool.query(
      `SELECT gl.id, gl.parent_user_id, gl.student_user_id, gl.created_at,
              p.full_name AS parent_name, p.email AS parent_email,
              s.full_name AS student_name, s.email AS student_email
       FROM guardian_student_links gl
       LEFT JOIN users p ON p.id = gl.parent_user_id
       LEFT JOIN users s ON s.id = gl.student_user_id
       WHERE 1 = 1 ${scoped.clause}
       ORDER BY gl.id DESC`
      ,
      [...scoped.params]
    );
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch guardian links" });
  }
});

router.post("/guardian-links", requirePermission("user.manage"), async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ message: "Permission denied" });

  const scope = await resolveManageScope(req);
  if (!scope) return res.status(403).json({ message: "Permission denied" });

  const { parentUserId, studentUserId } = req.body;
  if (!parentUserId || !studentUserId) {
    return res.status(400).json({ message: "parentUserId and studentUserId are required" });
  }

  const parentAllowed = await isUserAllowed(scope, Number(parentUserId));
  const studentAllowed = await isUserAllowed(scope, Number(studentUserId));
  if (!parentAllowed || !studentAllowed) return res.status(403).json({ message: "Permission denied" });

  try {
    const [result] = await pool.query(
      "INSERT INTO guardian_student_links (parent_user_id, student_user_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE student_user_id = student_user_id",
      [parentUserId, studentUserId]
    );
    await recordAudit(req, "create", "guardian_link", result.insertId || null, { parentUserId, studentUserId });
    return res.status(201).json({ message: "Guardian link created" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to create guardian link" });
  }
});

router.delete("/guardian-links/:id", requirePermission("user.manage"), async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ message: "Permission denied" });

  const scope = await resolveManageScope(req);
  if (!scope) return res.status(403).json({ message: "Permission denied" });

  const linkId = Number(req.params.id);
  if (!Number.isInteger(linkId) || linkId <= 0) return res.status(400).json({ message: "Invalid linkId" });

  const scoped = buildDualUserScope(scope, "p", "s");
  const [scopeRows] = await pool.query(
    `SELECT gl.id
     FROM guardian_student_links gl
     LEFT JOIN users p ON p.id = gl.parent_user_id
     LEFT JOIN users s ON s.id = gl.student_user_id
     WHERE gl.id = ? ${scoped.clause}
     LIMIT 1`,
    [linkId, ...scoped.params]
  );
  if (scopeRows.length === 0) return res.status(403).json({ message: "Permission denied" });

  try {
    const [result] = await pool.query("DELETE FROM guardian_student_links WHERE id = ?", [linkId]);
    if (result.affectedRows === 0) return res.status(404).json({ message: "Guardian link not found" });
    await recordAudit(req, "delete", "guardian_link", linkId);
    return res.json({ message: "Guardian link deleted" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete guardian link" });
  }
});

router.post("/users", requirePermission("user.manage"), async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ message: "Permission denied" });

  const scope = await resolveManageScope(req);
  if (!scope) return res.status(403).json({ message: "Permission denied" });

  const { fullName, email, password, role, organizationId, districtId, status } = req.body;
  const normalizedEmail = String(email || "").trim() || null;
  if (!fullName || !password || !role) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  if (!canAssignRole(scope.role, role)) {
    return res.status(403).json({ message: "Permission denied" });
  }

  const orgAllowed = await isOrganizationAllowed(scope, organizationId ? Number(organizationId) : null);
  const districtAllowed = await isDistrictAllowed(scope, districtId ? Number(districtId) : null);
  if (!orgAllowed || !districtAllowed) return res.status(403).json({ message: "Permission denied" });

  try {
    const [existingName] = await pool.query("SELECT id FROM users WHERE full_name = ? LIMIT 1", [fullName]);
    if (existingName.length > 0) {
      return res.status(409).json({ message: "Full name already exists" });
    }

    if (normalizedEmail) {
      const [existing] = await pool.query("SELECT id FROM users WHERE email = ?", [normalizedEmail]);
      if (existing.length > 0) {
        return res.status(409).json({ message: "Email already exists" });
      }
    }

    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      "INSERT INTO users (full_name, email, password_hash, role, organization_id, district_id, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [fullName, normalizedEmail, hash, role, organizationId || null, districtId || null, status || "active"]
    );

    await recordAudit(req, "create", "user", result.insertId, { fullName, email: normalizedEmail, role, organizationId, districtId, status: status || "active" });
    return res.status(201).json({ id: result.insertId });
  } catch (error) {
    return res.status(500).json({ message: "Failed to create user" });
  }
});

router.put("/users/:id", requirePermission("user.manage"), async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ message: "Permission denied" });

  const scope = await resolveManageScope(req);
  if (!scope) return res.status(403).json({ message: "Permission denied" });

  const userId = Number(req.params.id);
  const { fullName, email, password, role, organizationId, districtId, status } = req.body;
  const normalizedEmail = String(email || "").trim() || null;
  if (!Number.isInteger(userId) || userId <= 0) return res.status(400).json({ message: "Invalid userId" });
  if (!fullName || !role) return res.status(400).json({ message: "Missing required fields" });

  const targetAllowed = await isUserAllowed(scope, userId);
  if (!targetAllowed) return res.status(403).json({ message: "Permission denied" });

  if (!canAssignRole(scope.role, role)) {
    return res.status(403).json({ message: "Permission denied" });
  }

  const orgAllowed = await isOrganizationAllowed(scope, organizationId ? Number(organizationId) : null);
  const districtAllowed = await isDistrictAllowed(scope, districtId ? Number(districtId) : null);
  if (!orgAllowed || !districtAllowed) return res.status(403).json({ message: "Permission denied" });

  try {
    const [existingName] = await pool.query("SELECT id FROM users WHERE full_name = ? AND id <> ? LIMIT 1", [fullName, userId]);
    if (existingName.length > 0) {
      return res.status(409).json({ message: "Full name already exists" });
    }

    if (normalizedEmail) {
      const [existing] = await pool.query("SELECT id FROM users WHERE email = ? AND id <> ? LIMIT 1", [normalizedEmail, userId]);
      if (existing.length > 0) {
        return res.status(409).json({ message: "Email already exists" });
      }
    }

    const hashPart = password ? await bcrypt.hash(password, 10) : null;
    const params = [fullName, normalizedEmail, role, organizationId || null, districtId || null, status || "active"];
    let sql = "UPDATE users SET full_name = ?, email = ?, role = ?, organization_id = ?, district_id = ?, status = ?";
    if (hashPart) {
      sql += ", password_hash = ?";
      params.push(hashPart);
    }
    sql += " WHERE id = ?";
    params.push(userId);

    const [result] = await pool.query(sql, params);
    if (result.affectedRows === 0) return res.status(404).json({ message: "User not found" });

    await recordAudit(req, "update", "user", userId, { fullName, email: normalizedEmail, role, organizationId, districtId, status: status || "active" });
    return res.json({ message: "User updated" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update user" });
  }
});

router.delete("/users/:id", requirePermission("user.manage"), async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ message: "Permission denied" });

  const scope = await resolveManageScope(req);
  if (!scope) return res.status(403).json({ message: "Permission denied" });

  const userId = Number(req.params.id);
  if (!Number.isInteger(userId) || userId <= 0) return res.status(400).json({ message: "Invalid userId" });

  const targetAllowed = await isUserAllowed(scope, userId);
  if (!targetAllowed) return res.status(403).json({ message: "Permission denied" });

  try {
    const [result] = await pool.query("DELETE FROM users WHERE id = ?", [userId]);
    if (result.affectedRows === 0) return res.status(404).json({ message: "User not found" });
    await recordAudit(req, "delete", "user", userId);
    return res.json({ message: "User deleted" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete user" });
  }
});

router.get("/settings", requirePermission("settings.manage"), async (req, res) => {
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

router.put("/settings/:key", requirePermission("settings.manage"), async (req, res) => {
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

router.get("/permissions", requirePermission("permission.manage"), async (req, res) => {
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

router.put("/permissions", requirePermission("permission.manage"), async (req, res) => {
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
    clearPermissionCache(roleName);
    await recordAudit(req, "update", "permission", null, { roleName, permissions });
    return res.json({ message: "Permissions updated" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update permissions" });
  }
});

router.get("/logs", requirePermission("log.view"), async (req, res) => {
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