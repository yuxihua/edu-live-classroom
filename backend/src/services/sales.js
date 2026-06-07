import pool from "../config/db.js";

function generateOrderNo() {
  const ts = Date.now();
  const rand = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
  return `SO${ts}${rand}`;
}

function monthRange(dateValue) {
  const date = new Date(dateValue || Date.now());
  const start = new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1, 0, 0, 0);
  return {
    start: start.toISOString().slice(0, 19).replace("T", " "),
    end: end.toISOString().slice(0, 19).replace("T", " ")
  };
}

function buildInPlaceholders(size) {
  return new Array(size).fill("?").join(",");
}

async function getCourseInfo(courseId) {
  const [rows] = await pool.query(
    "SELECT id, organization_id, district_id, price_cents FROM courses WHERE id = ? LIMIT 1",
    [courseId]
  );
  return rows[0] || null;
}

async function getStudentSalesAgentUserId(studentUserId) {
  const [rows] = await pool.query(
    "SELECT sales_agent_user_id FROM student_sales_bindings WHERE student_user_id = ? LIMIT 1",
    [studentUserId]
  );
  if (rows.length === 0) return null;
  const id = Number(rows[0].sales_agent_user_id || 0);
  return id > 0 ? id : null;
}

async function getAgentNode(agentUserId, organizationId) {
  const [rows] = await pool.query(
    "SELECT sales_user_id, parent_sales_user_id, level_no, organization_id FROM sales_agents WHERE sales_user_id = ? AND organization_id = ? LIMIT 1",
    [agentUserId, organizationId]
  );
  return rows[0] || null;
}

async function resolveCommissionChain(salesAgentUserId, organizationId) {
  const chain = [];
  let currentAgentUserId = Number(salesAgentUserId || 0);

  for (let levelNo = 1; levelNo <= 3; levelNo += 1) {
    if (!currentAgentUserId) break;
    const node = await getAgentNode(currentAgentUserId, organizationId);
    if (!node) break;

    chain.push({
      beneficiaryUserId: Number(node.sales_user_id),
      parentUserId: Number(node.parent_sales_user_id || 0) || null,
      levelNo
    });

    currentAgentUserId = Number(node.parent_sales_user_id || 0);
  }

  return chain;
}

async function collectDownlineAgentIds(rootAgentUserId, organizationId) {
  const all = new Set([Number(rootAgentUserId)]);
  let frontier = [Number(rootAgentUserId)];

  while (frontier.length > 0) {
    const placeholders = buildInPlaceholders(frontier.length);
    const [rows] = await pool.query(
      `SELECT sales_user_id FROM sales_agents WHERE organization_id = ? AND parent_sales_user_id IN (${placeholders})`,
      [organizationId, ...frontier]
    );

    const nextFrontier = [];
    rows.forEach((row) => {
      const childId = Number(row.sales_user_id || 0);
      if (childId > 0 && !all.has(childId)) {
        all.add(childId);
        nextFrontier.push(childId);
      }
    });

    frontier = nextFrontier;
  }

  return [...all];
}

async function getAgentMonthlyTeamSalesCents(agentUserId, organizationId, paidAt) {
  const downlineIds = await collectDownlineAgentIds(agentUserId, organizationId);
  if (downlineIds.length === 0) return 0;

  const { start, end } = monthRange(paidAt);
  const placeholders = buildInPlaceholders(downlineIds.length);
  const [rows] = await pool.query(
    `SELECT COALESCE(SUM(amount_cents), 0) AS total
     FROM sales_orders
     WHERE organization_id = ?
       AND status = 'paid'
       AND paid_at >= ?
       AND paid_at < ?
       AND sales_agent_user_id IN (${placeholders})`,
    [organizationId, start, end, ...downlineIds]
  );

  return Number(rows[0]?.total || 0);
}

async function resolveCommissionRule(levelNo, organizationId, teamSalesCents) {
  const [rows] = await pool.query(
    `SELECT organization_id, level_no, tier_no, min_sales_cents, max_sales_cents, rate_bps
     FROM sales_commission_rules
     WHERE level_no = ?
       AND (organization_id = ? OR organization_id IS NULL)
     ORDER BY CASE WHEN organization_id = ? THEN 0 ELSE 1 END, min_sales_cents DESC`,
    [levelNo, organizationId, organizationId]
  );

  const matched = rows.find((item) => {
    const min = Number(item.min_sales_cents || 0);
    const maxRaw = item.max_sales_cents;
    const max = maxRaw === null ? null : Number(maxRaw);
    if (teamSalesCents < min) return false;
    if (max !== null && teamSalesCents > max) return false;
    return true;
  });

  if (!matched) {
    return { tierNo: 0, rateBps: 0, minSalesCents: 0, maxSalesCents: null };
  }

  return {
    tierNo: Number(matched.tier_no || 0),
    rateBps: Number(matched.rate_bps || 0),
    minSalesCents: Number(matched.min_sales_cents || 0),
    maxSalesCents: matched.max_sales_cents === null ? null : Number(matched.max_sales_cents)
  };
}

export async function applyOrderCommissions(orderId) {
  const [orderRows] = await pool.query(
    `SELECT id, organization_id, sales_agent_user_id, amount_cents, paid_at, status
     FROM sales_orders
     WHERE id = ?
     LIMIT 1`,
    [orderId]
  );
  if (orderRows.length === 0) return;

  const order = orderRows[0];
  if (order.status !== "paid") return;
  const organizationId = Number(order.organization_id || 0);
  const salesAgentUserId = Number(order.sales_agent_user_id || 0);
  if (!organizationId || !salesAgentUserId) return;

  await pool.query("DELETE FROM sales_order_commissions WHERE order_id = ?", [orderId]);

  const chain = await resolveCommissionChain(salesAgentUserId, organizationId);
  for (const node of chain) {
    const teamSalesCents = await getAgentMonthlyTeamSalesCents(node.beneficiaryUserId, organizationId, order.paid_at);
    const rule = await resolveCommissionRule(node.levelNo, organizationId, teamSalesCents);
    const commissionCents = Math.round(Number(order.amount_cents || 0) * rule.rateBps / 10000);

    await pool.query(
      `INSERT INTO sales_order_commissions
       (order_id, beneficiary_user_id, level_no, tier_no, rate_bps, team_sales_cents, commission_cents, detail)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderId,
        node.beneficiaryUserId,
        node.levelNo,
        rule.tierNo,
        rule.rateBps,
        teamSalesCents,
        commissionCents,
        JSON.stringify({
          minSalesCents: rule.minSalesCents,
          maxSalesCents: rule.maxSalesCents
        })
      ]
    );
  }
}

async function syncCoursePurchase(courseId, buyerUserId, studentUserId, amountCents) {
  await pool.query(
    "INSERT INTO course_purchases (course_id, buyer_user_id, student_user_id, amount_cents, status) VALUES (?, ?, ?, ?, 'paid') ON DUPLICATE KEY UPDATE amount_cents = VALUES(amount_cents), status = 'paid'",
    [courseId, buyerUserId, studentUserId, amountCents]
  );

  await pool.query(
    "INSERT INTO course_enrollments (course_id, user_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE user_id = user_id",
    [courseId, studentUserId]
  );
}

export async function createPaidSalesOrder({
  courseId,
  buyerUserId,
  studentUserId,
  amountCents,
  paymentChannel = "internal",
  source = "purchase",
  createdByUserId = null,
  meta = null
}) {
  const course = await getCourseInfo(courseId);
  if (!course) {
    const error = new Error("Course not found");
    error.code = "COURSE_NOT_FOUND";
    throw error;
  }

  const normalizedAmountCents = Number(amountCents ?? course.price_cents ?? 0);
  const orderNo = generateOrderNo();
  const salesAgentUserId = await getStudentSalesAgentUserId(studentUserId);

  const [result] = await pool.query(
    `INSERT INTO sales_orders
     (order_no, course_id, organization_id, district_id, buyer_user_id, student_user_id, sales_agent_user_id, amount_cents, status, payment_channel, source, paid_at, created_by_user_id, detail)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'paid', ?, ?, NOW(), ?, ?)`,
    [
      orderNo,
      courseId,
      course.organization_id || null,
      course.district_id || null,
      buyerUserId,
      studentUserId,
      salesAgentUserId || null,
      normalizedAmountCents,
      paymentChannel,
      source,
      createdByUserId,
      meta ? JSON.stringify(meta) : null
    ]
  );

  await syncCoursePurchase(courseId, buyerUserId, studentUserId, normalizedAmountCents);
  await applyOrderCommissions(result.insertId);

  return { id: result.insertId, orderNo, amountCents: normalizedAmountCents };
}

export async function createWechatPendingOrder({
  courseId,
  buyerUserId,
  studentUserId,
  amountCents,
  createdByUserId = null,
  meta = null
}) {
  const course = await getCourseInfo(courseId);
  if (!course) {
    const error = new Error("Course not found");
    error.code = "COURSE_NOT_FOUND";
    throw error;
  }

  const normalizedAmountCents = Number(amountCents ?? course.price_cents ?? 0);
  const orderNo = generateOrderNo();
  const salesAgentUserId = await getStudentSalesAgentUserId(studentUserId);

  const [result] = await pool.query(
    `INSERT INTO sales_orders
     (order_no, course_id, organization_id, district_id, buyer_user_id, student_user_id, sales_agent_user_id, amount_cents, status, payment_channel, source, created_by_user_id, detail)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'wechat', 'wechat', ?, ?)`,
    [
      orderNo,
      courseId,
      course.organization_id || null,
      course.district_id || null,
      buyerUserId,
      studentUserId,
      salesAgentUserId || null,
      normalizedAmountCents,
      createdByUserId,
      meta ? JSON.stringify(meta) : null
    ]
  );

  return { id: result.insertId, orderNo, amountCents: normalizedAmountCents };
}

async function finalizeOrderPaid(orderId, transactionId = null, notifyPayload = null) {
  const [rows] = await pool.query(
    `SELECT id, order_no, course_id, buyer_user_id, student_user_id, amount_cents, status
     FROM sales_orders
     WHERE id = ?
     LIMIT 1`,
    [orderId]
  );

  if (rows.length === 0) {
    return { ok: false, message: "Order not found" };
  }

  const order = rows[0];
  if (order.status === "paid") {
    return { ok: true, id: order.id, orderNo: order.order_no, message: "Already paid" };
  }

  await pool.query(
    `UPDATE sales_orders
     SET status = 'paid',
         paid_at = NOW(),
         wechat_transaction_id = ?,
         notify_payload = ?
     WHERE id = ?`,
    [transactionId || null, notifyPayload ? JSON.stringify(notifyPayload) : null, order.id]
  );

  await syncCoursePurchase(order.course_id, order.buyer_user_id, order.student_user_id, Number(order.amount_cents || 0));
  await applyOrderCommissions(order.id);

  return { ok: true, id: order.id, orderNo: order.order_no, message: "Paid" };
}

export async function markOrderPaidByOrderNo(orderNo, transactionId = null, notifyPayload = null) {
  const [rows] = await pool.query(
    "SELECT id FROM sales_orders WHERE order_no = ? LIMIT 1",
    [orderNo]
  );
  if (rows.length === 0) {
    return { ok: false, message: "Order not found" };
  }
  return finalizeOrderPaid(Number(rows[0].id), transactionId, notifyPayload);
}

export async function markOrderPaidById(orderId, transactionId = null, notifyPayload = null) {
  const normalizedOrderId = Number(orderId || 0);
  if (!normalizedOrderId) {
    return { ok: false, message: "Order not found" };
  }
  return finalizeOrderPaid(normalizedOrderId, transactionId, notifyPayload);
}
