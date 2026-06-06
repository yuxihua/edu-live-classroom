import pool from "../config/db.js";

const DEFAULT_ROLE_PERMISSIONS = {
  admin: ["system.manage", "organization.manage", "district.manage", "user.manage", "course.manage", "log.view", "settings.manage", "permission.manage"],
  org_admin: ["organization.manage", "district.manage", "user.manage", "course.manage", "log.view", "settings.manage", "permission.manage"],
  district_admin: ["district.manage", "user.manage", "course.manage", "log.view", "settings.manage"],
  teacher: ["course.manage", "course.view", "replay.manage", "attendance.manage"],
  assistant: ["course.view", "attendance.manage"],
  student: ["course.view", "replay.view", "attendance.self"],
  parent: ["course.view", "replay.view"]
};

export async function hasPermission(role, permissionKey) {
  const [rows] = await pool.query(
    "SELECT permission_value FROM role_permissions WHERE role_name = ? AND permission_key = ? LIMIT 1",
    [role, permissionKey]
  );

  if (rows.length > 0) {
    return Number(rows[0].permission_value) === 1;
  }

  const defaultPermissions = DEFAULT_ROLE_PERMISSIONS[role] || [];
  return defaultPermissions.includes(permissionKey) || defaultPermissions.includes("*");
}

export function requirePermission(permissionKey) {
  return async (req, res, next) => {
    try {
      if (!req.user?.role) {
        return res.status(401).json({ message: "Missing token" });
      }

      const allowed = await hasPermission(req.user.role, permissionKey);
      if (!allowed) {
        return res.status(403).json({ message: "Permission denied" });
      }

      return next();
    } catch (error) {
      return res.status(500).json({ message: "Permission check failed" });
    }
  };
}
