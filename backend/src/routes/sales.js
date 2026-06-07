import crypto from "crypto";
import express from "express";

import pool from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";
import { hasPermission, requirePermission } from "../middleware/permissions.js";
import {
  createPaidSalesOrder,
  createWechatPendingOrder,
  markOrderPaidById,
  markOrderPaidByOrderNo
} from "../services/sales.js";

const router = express.Router();
const MANAGE_ROLES = ["admin", "org_admin", "district_admin"];

function canManage(req) {
  return MANAGE_ROLES.includes(req.user?.role);
}

async function resolveManageScope(req) {
  if (req.user?.role === "admin") {
    return { role: "admin", organizationId: null, districtId: null };
  }

  if (req.user?.role === "org_admin") {
    const organizationId = Number(req.user.organizationId || 0);
    if (!organizationId) return null;
    return { role: "org_admin", organizationId, districtId: null };
  }

  if (req.user?.role === "district_admin") {
    const districtId = Number(req.user.districtId || 0);
    if (!districtId) return null;

    let organizationId = Number(req.user.organizationId || 0);
    if (!organizationId) {
      const [rows] = await pool.query("SELECT organization_id FROM districts WHERE id = ? LIMIT 1", [districtId]);
      if (rows.length === 0) return null;
      organizationId = Number(rows[0].organization_id || 0);
    }

    if (!organizationId) return null;
    return { role: "district_admin", organizationId, districtId };
  }

  return null;
}

function buildScope(scope, alias = "o") {
  if (!scope || scope.role === "admin") {
    return { clause: "", params: [] };
  }

  if (scope.role === "district_admin") {
    return { clause: ` AND ${alias}.district_id = ?`, params: [scope.districtId] };
  }

  return { clause: ` AND ${alias}.organization_id = ?`, params: [scope.organizationId] };
}

function buildUserScope(scope, alias = "u") {
  if (!scope || scope.role === "admin") {
    return { clause: "", params: [] };
  }

  if (scope.role === "district_admin") {
    return { clause: ` AND ${alias}.district_id = ?`, params: [scope.districtId] };
  }

  return { clause: ` AND ${alias}.organization_id = ?`, params: [scope.organizationId] };
}

function resolveMonthRange(monthText) {
  const matched = String(monthText || "").match(/^(\d{4})-(\d{2})$/);
  if (!matched) return null;
  const year = Number(matched[1]);
  const month = Number(matched[2]);
  if (month < 1 || month > 12) return null;
  const start = new Date(year, month - 1, 1, 0, 0, 0);
  const end = new Date(year, month, 1, 0, 0, 0);
  return {
    start: start.toISOString().slice(0, 19).replace("T", " "),
    end: end.toISOString().slice(0, 19).replace("T", " ")
  };
}

function normalizeDateTimeRange(startDateText, endDateText) {
  const startText = String(startDateText || "").trim();
  const endText = String(endDateText || "").trim();
  if (!startText && !endText) return null;

  const start = startText ? new Date(`${startText}T00:00:00`) : null;
  const end = endText ? new Date(`${endText}T23:59:59`) : null;

  if ((startText && Number.isNaN(start?.getTime())) || (endText && Number.isNaN(end?.getTime()))) {
    return null;
  }

  return {
    start: start ? start.toISOString().slice(0, 19).replace("T", " ") : null,
    end: end ? end.toISOString().slice(0, 19).replace("T", " ") : null
  };
}

function escapeCsvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function buildManageOrderFilters({ status, paymentChannel, source, keyword, courseId = 0, salesUserId = 0, dateRange }) {
  const whereSql = [];
  const whereParams = [];

  if (status) {
    whereSql.push("AND o.status = ?");
    whereParams.push(status);
  }
  if (paymentChannel) {
    whereSql.push("AND o.payment_channel = ?");
    whereParams.push(paymentChannel);
  }
  if (source) {
    whereSql.push("AND o.source = ?");
    whereParams.push(source);
  }
  if (keyword) {
    whereSql.push("AND (o.order_no LIKE CONCAT('%', ?, '%') OR b.full_name LIKE CONCAT('%', ?, '%') OR s.full_name LIKE CONCAT('%', ?, '%') OR c.title LIKE CONCAT('%', ?, '%'))");
    whereParams.push(keyword, keyword, keyword, keyword);
  }
  if (courseId) {
    whereSql.push("AND o.course_id = ?");
    whereParams.push(Number(courseId));
  }
  if (salesUserId) {
    whereSql.push("AND o.sales_agent_user_id = ?");
    whereParams.push(Number(salesUserId));
  }
  if (dateRange?.start) {
    whereSql.push("AND o.created_at >= ?");
    whereParams.push(dateRange.start);
  }
  if (dateRange?.end) {
    whereSql.push("AND o.created_at <= ?");
    whereParams.push(dateRange.end);
  }

  return { whereSql, whereParams };
}

async function ensureCourseInScope(scope, courseId) {
  const scoped = buildScope(scope, "c");
  const [rows] = await pool.query(
    `SELECT id FROM courses c WHERE id = ? ${scoped.clause} LIMIT 1`,
    [courseId, ...scoped.params]
  );
  return rows.length > 0;
}

router.post("/wechat/notify", async (req, res) => {
  const { outTradeNo, transactionId, status } = req.body || {};
  if (!outTradeNo) {
    return res.status(400).json({ code: "FAIL", message: "outTradeNo is required" });
  }

  if (String(status || "SUCCESS").toUpperCase() !== "SUCCESS") {
    return res.json({ code: "SUCCESS", message: "Ignored non-success notify" });
  }

  try {
    const result = await markOrderPaidByOrderNo(String(outTradeNo), transactionId || null, req.body || null);
    if (!result.ok) {
      return res.status(404).json({ code: "FAIL", message: result.message });
    }
    return res.json({ code: "SUCCESS", message: "OK" });
  } catch (error) {
    return res.status(500).json({ code: "FAIL", message: "notify handling failed" });
  }
});

router.use(requireAuth);

router.get("/commission-rules", requirePermission("sales.rules.manage"), async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ message: "Permission denied" });

  const scope = await resolveManageScope(req);
  if (!scope) return res.status(403).json({ message: "Permission denied" });

  const organizationId = scope.role === "admin"
    ? (req.query.organizationId ? Number(req.query.organizationId) : null)
    : Number(scope.organizationId || 0);

  try {
    const [rows] = await pool.query(
      `SELECT id, organization_id, level_no, tier_no, min_sales_cents, max_sales_cents, rate_bps, created_at
       FROM sales_commission_rules
       WHERE (? IS NULL AND organization_id IS NULL) OR organization_id = ?
       ORDER BY organization_id, level_no, tier_no`,
      [organizationId, organizationId]
    );
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch commission rules" });
  }
});

router.put("/commission-rules", requirePermission("sales.rules.manage"), async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ message: "Permission denied" });

  const scope = await resolveManageScope(req);
  if (!scope) return res.status(403).json({ message: "Permission denied" });

  const rules = Array.isArray(req.body?.rules) ? req.body.rules : [];
  if (rules.length === 0) {
    return res.status(400).json({ message: "rules are required" });
  }

  const organizationId = scope.role === "admin"
    ? (req.body.organizationId ? Number(req.body.organizationId) : null)
    : Number(scope.organizationId || 0);

  try {
    if (organizationId) {
      await pool.query("DELETE FROM sales_commission_rules WHERE organization_id = ?", [organizationId]);
    } else {
      await pool.query("DELETE FROM sales_commission_rules WHERE organization_id IS NULL");
    }

    for (const item of rules) {
      const levelNo = Number(item.levelNo || 0);
      const tierNo = Number(item.tierNo || 0);
      const minSalesCents = Number(item.minSalesCents || 0);
      const maxSalesCents = item.maxSalesCents === null || item.maxSalesCents === "" ? null : Number(item.maxSalesCents);
      const rateBps = Number(item.rateBps || 0);
      if (![1, 2, 3].includes(levelNo) || ![1, 2, 3].includes(tierNo)) continue;

      await pool.query(
        `INSERT INTO sales_commission_rules
         (organization_id, level_no, tier_no, min_sales_cents, max_sales_cents, rate_bps)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [organizationId, levelNo, tierNo, minSalesCents, maxSalesCents, rateBps]
      );
    }

    return res.json({ message: "Commission rules updated" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update commission rules" });
  }
});

router.get("/agents", requirePermission("sales.agents.manage"), async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ message: "Permission denied" });

  const scope = await resolveManageScope(req);
  if (!scope) return res.status(403).json({ message: "Permission denied" });

  const scoped = buildUserScope(scope, "u");

  try {
    const [rows] = await pool.query(
      `SELECT sa.sales_user_id, sa.parent_sales_user_id, sa.organization_id, sa.level_no, sa.active, sa.created_at,
              u.full_name AS sales_name,
              pu.full_name AS parent_sales_name
       FROM sales_agents sa
       LEFT JOIN users u ON u.id = sa.sales_user_id
       LEFT JOIN users pu ON pu.id = sa.parent_sales_user_id
       WHERE 1 = 1 ${scoped.clause}
       ORDER BY sa.organization_id, sa.level_no, sa.sales_user_id`,
      [...scoped.params]
    );
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch sales agents" });
  }
});

router.put("/agents/:salesUserId", requirePermission("sales.agents.manage"), async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ message: "Permission denied" });

  const scope = await resolveManageScope(req);
  if (!scope) return res.status(403).json({ message: "Permission denied" });

  const salesUserId = Number(req.params.salesUserId);
  const parentSalesUserId = req.body.parentSalesUserId ? Number(req.body.parentSalesUserId) : null;
  const levelNo = Number(req.body.levelNo || 1);

  if (!Number.isInteger(salesUserId) || salesUserId <= 0) {
    return res.status(400).json({ message: "Invalid salesUserId" });
  }
  if (![1, 2, 3].includes(levelNo)) {
    return res.status(400).json({ message: "levelNo must be 1,2,3" });
  }
  if (parentSalesUserId && parentSalesUserId === salesUserId) {
    return res.status(400).json({ message: "parentSalesUserId cannot equal salesUserId" });
  }

  try {
    const userScoped = buildUserScope(scope, "u");
    const [salesRows] = await pool.query(
      `SELECT u.id, u.organization_id FROM users u WHERE u.id = ? ${userScoped.clause} LIMIT 1`,
      [salesUserId, ...userScoped.params]
    );
    if (salesRows.length === 0) return res.status(403).json({ message: "Permission denied" });

    const organizationId = Number(salesRows[0].organization_id || 0) || null;
    if (!organizationId) return res.status(400).json({ message: "sales user has no organization" });

    if (parentSalesUserId) {
      const [parentRows] = await pool.query(
        "SELECT sales_user_id, organization_id FROM sales_agents WHERE sales_user_id = ? LIMIT 1",
        [parentSalesUserId]
      );
      if (parentRows.length === 0) {
        return res.status(400).json({ message: "parent sales agent not found" });
      }
      if (Number(parentRows[0].organization_id || 0) !== organizationId) {
        return res.status(400).json({ message: "parent and child must be in same organization" });
      }
    }

    await pool.query(
      `INSERT INTO sales_agents (sales_user_id, parent_sales_user_id, organization_id, level_no, active)
       VALUES (?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE parent_sales_user_id = VALUES(parent_sales_user_id), organization_id = VALUES(organization_id), level_no = VALUES(level_no), active = 1`,
      [salesUserId, parentSalesUserId, organizationId, levelNo]
    );

    return res.json({ message: "Sales agent saved" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to save sales agent" });
  }
});

router.get("/student-bindings", requirePermission("sales.bindings.manage"), async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ message: "Permission denied" });

  const scope = await resolveManageScope(req);
  if (!scope) return res.status(403).json({ message: "Permission denied" });

  const scoped = buildUserScope(scope, "s");

  try {
    const [rows] = await pool.query(
      `SELECT sb.student_user_id, sb.sales_agent_user_id, sb.assigned_by_user_id, sb.created_at,
              s.full_name AS student_name,
              a.full_name AS sales_name,
              u.full_name AS assigned_by_name
       FROM student_sales_bindings sb
       LEFT JOIN users s ON s.id = sb.student_user_id
       LEFT JOIN users a ON a.id = sb.sales_agent_user_id
       LEFT JOIN users u ON u.id = sb.assigned_by_user_id
       WHERE 1 = 1 ${scoped.clause}
       ORDER BY sb.created_at DESC`,
      [...scoped.params]
    );
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch student bindings" });
  }
});

router.put("/student-bindings/:studentUserId", requirePermission("sales.bindings.manage"), async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ message: "Permission denied" });

  const scope = await resolveManageScope(req);
  if (!scope) return res.status(403).json({ message: "Permission denied" });

  const studentUserId = Number(req.params.studentUserId);
  const salesUserId = Number(req.body.salesUserId || 0);

  if (!Number.isInteger(studentUserId) || studentUserId <= 0) {
    return res.status(400).json({ message: "Invalid studentUserId" });
  }
  if (!Number.isInteger(salesUserId) || salesUserId <= 0) {
    return res.status(400).json({ message: "Invalid salesUserId" });
  }

  try {
    const scopedStudent = buildUserScope(scope, "u");
    const [studentRows] = await pool.query(
      `SELECT u.id, u.organization_id, u.role FROM users u WHERE u.id = ? ${scopedStudent.clause} LIMIT 1`,
      [studentUserId, ...scopedStudent.params]
    );
    if (studentRows.length === 0 || studentRows[0].role !== "student") {
      return res.status(400).json({ message: "student user not found" });
    }

    const [salesRows] = await pool.query(
      "SELECT id, organization_id FROM users WHERE id = ? LIMIT 1",
      [salesUserId]
    );
    if (salesRows.length === 0) {
      return res.status(400).json({ message: "sales user not found" });
    }

    if (Number(salesRows[0].organization_id || 0) !== Number(studentRows[0].organization_id || 0)) {
      return res.status(400).json({ message: "student and sales user must be in same organization" });
    }

    await pool.query(
      `INSERT INTO student_sales_bindings (student_user_id, sales_agent_user_id, assigned_by_user_id)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE sales_agent_user_id = VALUES(sales_agent_user_id), assigned_by_user_id = VALUES(assigned_by_user_id)`,
      [studentUserId, salesUserId, req.user.userId]
    );

    return res.json({ message: "Student binding saved" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to save student binding" });
  }
});

router.get("/orders", async (req, res) => {
  const role = req.user.role;
  const status = String(req.query.status || "").trim();
  const paymentChannel = String(req.query.paymentChannel || "").trim();
  const source = String(req.query.source || "").trim();
  const keyword = String(req.query.keyword || "").trim();
  const courseId = req.query.courseId ? Number(req.query.courseId) : 0;
  const salesUserId = req.query.salesUserId ? Number(req.query.salesUserId) : 0;
  const startDate = String(req.query.startDate || "").trim();
  const endDate = String(req.query.endDate || "").trim();
  const page = Math.max(Number(req.query.page || 1), 1);
  const pageSize = Math.min(Math.max(Number(req.query.pageSize || 20), 1), 100);
  const offset = (page - 1) * pageSize;
  const dateRange = normalizeDateTimeRange(startDate, endDate);

  if ((startDate || endDate) && !dateRange) {
    return res.status(400).json({ message: "date range is invalid" });
  }

  try {
    if (canManage(req)) {
      const allowed = await hasPermission(role, "sales.orders.view");
      if (!allowed) return res.status(403).json({ message: "Permission denied" });

      const scope = await resolveManageScope(req);
      if (!scope) return res.status(403).json({ message: "Permission denied" });
      const scoped = buildScope(scope, "o");
      const { whereSql, whereParams } = buildManageOrderFilters({ status, paymentChannel, source, keyword, courseId, salesUserId, dateRange });
      const [countRows] = await pool.query(
        `SELECT COUNT(*) AS total
         FROM sales_orders o
         LEFT JOIN users b ON b.id = o.buyer_user_id
         LEFT JOIN users s ON s.id = o.student_user_id
         LEFT JOIN courses c ON c.id = o.course_id
         WHERE 1 = 1 ${scoped.clause} ${whereSql.join(" ")}`,
        [...scoped.params, ...whereParams]
      );

      const [rows] = await pool.query(
        `SELECT o.id, o.order_no, o.course_id, o.organization_id, o.district_id, o.buyer_user_id, o.student_user_id,
                o.sales_agent_user_id, o.amount_cents, o.status, o.payment_channel, o.source, o.wechat_transaction_id,
                o.created_at, o.paid_at,
                b.full_name AS buyer_name,
                s.full_name AS student_name,
                a.full_name AS sales_name,
                c.title AS course_title
         FROM sales_orders o
         LEFT JOIN users b ON b.id = o.buyer_user_id
         LEFT JOIN users s ON s.id = o.student_user_id
         LEFT JOIN users a ON a.id = o.sales_agent_user_id
         LEFT JOIN courses c ON c.id = o.course_id
         WHERE 1 = 1 ${scoped.clause} ${whereSql.join(" ")}
         ORDER BY o.id DESC
         LIMIT ? OFFSET ?`,
        [...scoped.params, ...whereParams, pageSize, offset]
      );
      return res.json({
        items: rows,
        pagination: {
          page,
          pageSize,
          total: Number(countRows[0]?.total || 0)
        }
      });
    }

    if (!["student", "parent"].includes(role)) {
      return res.status(403).json({ message: "Permission denied" });
    }

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM sales_orders o
       WHERE o.buyer_user_id = ?
         AND (? = '' OR o.status = ?)`,
      [req.user.userId, status, status]
    );

    const selfWhereExtra = [];
    const selfParamsExtra = [];
    if (dateRange?.start) {
      selfWhereExtra.push("AND o.created_at >= ?");
      selfParamsExtra.push(dateRange.start);
    }
    if (dateRange?.end) {
      selfWhereExtra.push("AND o.created_at <= ?");
      selfParamsExtra.push(dateRange.end);
    }

    const [selfCountRows] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM sales_orders o
       WHERE o.buyer_user_id = ?
         AND (? = '' OR o.status = ?)
         ${selfWhereExtra.join(" ")}`,
      [req.user.userId, status, status, ...selfParamsExtra]
    );

    const [rows] = await pool.query(
      `SELECT o.id, o.order_no, o.course_id, o.student_user_id, o.amount_cents, o.status, o.payment_channel, o.source, o.created_at, o.paid_at,
              c.title AS course_title
       FROM sales_orders o
       LEFT JOIN courses c ON c.id = o.course_id
       WHERE o.buyer_user_id = ?
         AND (? = '' OR o.status = ?)
         ${selfWhereExtra.join(" ")}
       ORDER BY o.id DESC
       LIMIT ? OFFSET ?`,
      [req.user.userId, status, status, ...selfParamsExtra, pageSize, offset]
    );
    return res.json({
      items: rows,
      pagination: {
        page,
        pageSize,
        total: Number(selfCountRows[0]?.total || 0)
      }
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch orders" });
  }
});

router.get("/orders/export", requirePermission("sales.orders.view"), async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ message: "Permission denied" });

  const scope = await resolveManageScope(req);
  if (!scope) return res.status(403).json({ message: "Permission denied" });

  const status = String(req.query.status || "").trim();
  const courseId = req.query.courseId ? Number(req.query.courseId) : 0;
  const paymentChannel = String(req.query.paymentChannel || "").trim();
  const source = String(req.query.source || "").trim();
  const keyword = String(req.query.keyword || "").trim();
  const salesUserId = req.query.salesUserId ? Number(req.query.salesUserId) : 0;
  const startDate = String(req.query.startDate || "").trim();
  const endDate = String(req.query.endDate || "").trim();
  const dateRange = normalizeDateTimeRange(startDate, endDate);

  if ((startDate || endDate) && !dateRange) {
    return res.status(400).json({ message: "date range is invalid" });
  }

  try {
    const scoped = buildScope(scope, "o");
    const { whereSql, whereParams } = buildManageOrderFilters({ status, paymentChannel, source, keyword, courseId, salesUserId, dateRange });
    const [rows] = await pool.query(
      `SELECT o.order_no, c.title AS course_title, s.full_name AS student_name, b.full_name AS buyer_name,
              a.full_name AS sales_name, o.amount_cents, o.status, o.payment_channel, o.source, o.created_at, o.paid_at
       FROM sales_orders o
       LEFT JOIN users b ON b.id = o.buyer_user_id
       LEFT JOIN users s ON s.id = o.student_user_id
       LEFT JOIN users a ON a.id = o.sales_agent_user_id
       LEFT JOIN courses c ON c.id = o.course_id
       WHERE 1 = 1 ${scoped.clause} ${whereSql.join(" ")}
       ORDER BY o.id DESC
       LIMIT 5000`,
      [...scoped.params, ...whereParams]
    );

    const header = ["订单号", "课程", "学员", "购买人", "销售", "金额(分)", "状态", "支付渠道", "来源", "创建时间", "支付时间"];
    const csv = [header, ...rows.map((item) => ([
      item.order_no,
      item.course_title,
      item.student_name,
      item.buyer_name,
      item.sales_name,
      item.amount_cents,
      item.status,
      item.payment_channel,
      item.source,
      item.created_at,
      item.paid_at
    ]))]
      .map((row) => row.map((cell) => escapeCsvCell(cell)).join(","))
      .join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="sales-orders-${Date.now()}.csv"`);
    return res.send(`\uFEFF${csv}`);
  } catch (error) {
    return res.status(500).json({ message: "Failed to export orders" });
  }
});

router.post("/orders/:id/mark-paid", requirePermission("sales.orders.manage"), async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ message: "Permission denied" });

  const scope = await resolveManageScope(req);
  if (!scope) return res.status(403).json({ message: "Permission denied" });

  const orderId = Number(req.params.id);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return res.status(400).json({ message: "Invalid orderId" });
  }

  const scoped = buildScope(scope, "o");
  const [allowedRows] = await pool.query(
    `SELECT o.id FROM sales_orders o WHERE o.id = ? ${scoped.clause} LIMIT 1`,
    [orderId, ...scoped.params]
  );
  if (allowedRows.length === 0) return res.status(403).json({ message: "Permission denied" });

  try {
    const result = await markOrderPaidById(orderId, String(req.body.transactionId || "").trim() || null, {
      source: "manual_mark_paid",
      actorUserId: req.user.userId,
      actorRole: req.user.role
    });
    if (!result.ok) {
      return res.status(404).json({ message: result.message || "Order not found" });
    }
    return res.json({ message: result.message || "Paid" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to mark order paid" });
  }
});

router.get("/reports/commissions", requirePermission("sales.reports.view"), async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ message: "Permission denied" });

  const scope = await resolveManageScope(req);
  if (!scope) return res.status(403).json({ message: "Permission denied" });

  const month = String(req.query.month || "").trim();
  const courseId = req.query.courseId ? Number(req.query.courseId) : 0;
  const salesUserId = req.query.salesUserId ? Number(req.query.salesUserId) : 0;
  const levelNo = req.query.levelNo ? Number(req.query.levelNo) : 0;
  const groupBy = String(req.query.groupBy || "beneficiary").trim();
  const startDate = String(req.query.startDate || "").trim();
  const endDate = String(req.query.endDate || "").trim();
  const monthRange = resolveMonthRange(month);
  const dateRange = normalizeDateTimeRange(startDate, endDate);
  if (!monthRange && !dateRange) {
    return res.status(400).json({ message: "month must be YYYY-MM" });
  }
  if ((startDate || endDate) && !dateRange) {
    return res.status(400).json({ message: "date range is invalid" });
  }

  const scoped = buildScope(scope, "o");
  const filterSql = [];
  const filterParams = [];
  const reportStart = dateRange?.start || monthRange?.start;
  const reportEnd = dateRange?.end || monthRange?.end;
  if (courseId > 0) {
    filterSql.push("AND o.course_id = ?");
    filterParams.push(courseId);
  }
  if (salesUserId > 0) {
    filterSql.push("AND soc.beneficiary_user_id = ?");
    filterParams.push(salesUserId);
  }
  if ([1, 2, 3].includes(levelNo)) {
    filterSql.push("AND soc.level_no = ?");
    filterParams.push(levelNo);
  }

  try {
    const [detailRows] = await pool.query(
      `SELECT
         soc.beneficiary_user_id,
         soc.order_id,
         soc.level_no,
         soc.commission_cents,
         o.amount_cents,
         c.id AS course_id,
         c.title AS course_title,
         u.full_name AS beneficiary_name
       FROM sales_order_commissions soc
       INNER JOIN sales_orders o ON o.id = soc.order_id
       LEFT JOIN courses c ON c.id = o.course_id
       LEFT JOIN users u ON u.id = soc.beneficiary_user_id
       WHERE o.status = 'paid'
         AND o.paid_at >= ?
         AND o.paid_at < ?
         ${filterSql.join(" ")}
         ${scoped.clause}
       ORDER BY soc.order_id DESC`,
      [reportStart, reportEnd, ...filterParams, ...scoped.params]
    );

    const grouped = new Map();
    for (const item of detailRows) {
      let key = "";
      let label = "";

      if (groupBy === "course") {
        key = `course:${item.course_id || 0}`;
        label = item.course_title || String(item.course_id || "未命名课程");
      } else if (groupBy === "level") {
        key = `level:${item.level_no || 0}`;
        label = `${item.level_no || 0}级分成`;
      } else {
        key = `beneficiary:${item.beneficiary_user_id || 0}:level:${item.level_no || 0}`;
        label = item.beneficiary_name || String(item.beneficiary_user_id || "未知销售");
      }

      if (!grouped.has(key)) {
        grouped.set(key, {
          group_key: key,
          group_label: label,
          beneficiary_user_id: item.beneficiary_user_id,
          beneficiary_name: item.beneficiary_name,
          course_id: item.course_id,
          course_title: item.course_title,
          level_no: item.level_no,
          orderIds: new Set(),
          sales_amount_cents: 0,
          commission_amount_cents: 0
        });
      }

      const bucket = grouped.get(key);
      bucket.orderIds.add(Number(item.order_id || 0));
      bucket.sales_amount_cents += Number(item.amount_cents || 0);
      bucket.commission_amount_cents += Number(item.commission_cents || 0);
    }

    const rows = [...grouped.values()]
      .map((item) => ({
        ...item,
        order_count: item.orderIds.size
      }))
      .sort((a, b) => Number(b.commission_amount_cents || 0) - Number(a.commission_amount_cents || 0));

    const [summaryRows] = await pool.query(
      `SELECT
         COUNT(*) AS paid_order_count,
         COALESCE(SUM(o.amount_cents), 0) AS paid_amount_cents
       FROM sales_orders o
       WHERE o.status = 'paid'
         AND o.paid_at >= ?
         AND o.paid_at < ?
         ${courseId > 0 ? "AND o.course_id = ?" : ""}
         ${scoped.clause}`,
      [reportStart, reportEnd, ...(courseId > 0 ? [courseId] : []), ...scoped.params]
    );

    return res.json({
      month,
      groupBy,
      summary: {
        paidOrderCount: Number(summaryRows[0]?.paid_order_count || 0),
        paidAmountCents: Number(summaryRows[0]?.paid_amount_cents || 0),
        commissionAmountCents: Number(rows.reduce((acc, item) => acc + Number(item.commission_amount_cents || 0), 0))
      },
      items: rows
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch commission report" });
  }
});

router.post("/orders/manual", requirePermission("sales.orders.manage"), async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ message: "Permission denied" });

  const scope = await resolveManageScope(req);
  if (!scope) return res.status(403).json({ message: "Permission denied" });

  const courseId = Number(req.body.courseId || 0);
  const studentUserId = Number(req.body.studentUserId || 0);
  const buyerUserId = Number(req.body.buyerUserId || studentUserId);
  const amountCents = req.body.amountCents === undefined ? null : Number(req.body.amountCents);

  if (!courseId || !studentUserId || !buyerUserId) {
    return res.status(400).json({ message: "courseId, studentUserId and buyerUserId are required" });
  }

  const inScope = await ensureCourseInScope(scope, courseId);
  if (!inScope) return res.status(403).json({ message: "Permission denied" });

  try {
    const order = await createPaidSalesOrder({
      courseId,
      buyerUserId,
      studentUserId,
      amountCents,
      paymentChannel: "manual",
      source: "manual_admin",
      createdByUserId: req.user.userId,
      meta: { createdByRole: req.user.role }
    });

    return res.status(201).json({ id: order.id, orderNo: order.orderNo });
  } catch (error) {
    if (error?.code === "COURSE_NOT_FOUND") {
      return res.status(404).json({ message: "Course not found" });
    }
    return res.status(500).json({ message: "Failed to create manual order" });
  }
});

router.post("/wechat/prepay", async (req, res) => {
  if (!["student", "parent"].includes(req.user.role)) {
    return res.status(403).json({ message: "Only students or parents can prepay" });
  }

  const courseId = Number(req.body.courseId || 0);
  const studentUserId = req.user.role === "student" ? req.user.userId : Number(req.body.studentUserId || 0);

  if (!courseId || !studentUserId) {
    return res.status(400).json({ message: "courseId and studentUserId are required" });
  }

  try {
    if (req.user.role === "parent") {
      const [linkRows] = await pool.query(
        "SELECT id FROM guardian_student_links WHERE parent_user_id = ? AND student_user_id = ? LIMIT 1",
        [req.user.userId, studentUserId]
      );
      if (linkRows.length === 0) {
        return res.status(403).json({ message: "Parent not linked to this student" });
      }
    }

    const order = await createWechatPendingOrder({
      courseId,
      buyerUserId: req.user.userId,
      studentUserId,
      amountCents: req.body.amountCents === undefined ? null : Number(req.body.amountCents),
      createdByUserId: req.user.userId,
      meta: { userRole: req.user.role }
    });

    const nonceStr = crypto.randomBytes(12).toString("hex");
    const nowSeconds = Math.floor(Date.now() / 1000);
    const signType = "MD5";
    const paySign = crypto.createHash("md5").update(`${order.orderNo}|${nonceStr}|${nowSeconds}`).digest("hex");

    return res.status(201).json({
      orderId: order.id,
      outTradeNo: order.orderNo,
      amountCents: order.amountCents,
      appId: process.env.WECHAT_PAY_APP_ID || "mock-app-id",
      mchId: process.env.WECHAT_PAY_MCH_ID || "mock-mch-id",
      nonceStr,
      timeStamp: String(nowSeconds),
      signType,
      paySign
    });
  } catch (error) {
    if (error?.code === "COURSE_NOT_FOUND") {
      return res.status(404).json({ message: "Course not found" });
    }
    return res.status(500).json({ message: "Failed to create wechat prepay order" });
  }
});

export default router;
