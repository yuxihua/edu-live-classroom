import pool from "../config/db.js";

const permissionCache = new Map();
const CACHE_TTL_MS = 30 * 1000;
const DEFAULT_ROLE_PERMISSIONS = {
  admin: ["*"],
  org_admin: ["system.manage", "organization.manage", "district.manage", "user.manage", "log.view", "settings.manage", "permission.manage", "sales.rules.manage", "sales.agents.manage", "sales.bindings.manage", "sales.reports.view", "sales.orders.manage", "sales.orders.view"],
  district_admin: ["system.manage", "district.manage", "user.manage", "log.view", "settings.manage", "sales.rules.manage", "sales.agents.manage", "sales.bindings.manage", "sales.reports.view", "sales.orders.manage", "sales.orders.view"],
  teacher: ["course.manage", "course.view", "replay.manage", "attendance.manage"],
  assistant: ["course.view", "attendance.manage"],
  student: ["course.view", "replay.view", "attendance.self"],
  parent: ["course.view", "replay.view"]
};

async function getRolePermissionSet(roleName) {
  const cacheKey = String(roleName || "");
  const cached = permissionCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.permissionSet;
  }

  const [rows] = await pool.query(
    `SELECT permission_key
     FROM role_permissions
     WHERE role_name = ? AND permission_value = 1`,
    [cacheKey]
  );

  const permissionSet = rows.length > 0
    ? new Set(rows.map((item) => item.permission_key))
    : new Set(DEFAULT_ROLE_PERMISSIONS[cacheKey] || []);
  permissionCache.set(cacheKey, {
    permissionSet,
    expiresAt: Date.now() + CACHE_TTL_MS
  });
  return permissionSet;
}

export function clearPermissionCache(roleName = null) {
  if (!roleName) {
    permissionCache.clear();
    return;
  }
  permissionCache.delete(String(roleName));
}

export async function hasPermission(roleName, permissionKey) {
  const permissionSet = await getRolePermissionSet(roleName);
  return permissionSet.has("*") || permissionSet.has(permissionKey);
}

export function requirePermission(permissionKey) {
  return async (req, res, next) => {
    if (req.user?.role === "admin") {
      return next();
    }

    const roleName = String(req.user?.role || "").trim();
    if (!roleName) {
      return res.status(403).json({ message: "Permission denied" });
    }

    try {
      const [roleRows] = await pool.query(
        `SELECT 1
         FROM role_permissions
         WHERE role_name = ?
         LIMIT 1`,
        [roleName]
      );

      if (roleRows.length === 0) {
        return next();
      }

      const allowed = await hasPermission(roleName, permissionKey);
      if (!allowed) {
        return res.status(403).json({ message: "Permission denied" });
      }

      return next();
    } catch (error) {
      return res.status(500).json({ message: "Failed to verify permissions" });
    }
  };
}
