<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import http from "../api/http.js";
import ConfirmDialog from "../components/ConfirmDialog.vue";

const router = useRouter();
const activeTab = ref("dashboard");
const activeSalesTab = ref("rules");
const dashboard = ref({ districts: 0, organizations: 0, users: 0, courses: 0, logs: 0, openMeetings: null });
const districts = ref([]);
const organizations = ref([]);
const users = ref([]);
const classrooms = ref([]);
const guardianLinks = ref([]);
const settings = ref([]);
const permissions = ref([]);
const logs = ref([]);
const expandedLogDetails = ref({});
const copiedLogDetailId = ref(0);
const logDetailCopyTimer = ref(null);
const logsFilter = ref("all");
const logsQuery = ref("");
const logsDateRange = ref({ startDate: "", endDate: "" });
const coursesForSales = ref([]);
const salesCommissionRules = ref([]);
const salesAgents = ref([]);
const studentSalesBindings = ref([]);
const salesOrders = ref([]);
const commissionReport = ref({ month: new Date().toISOString().slice(0, 7), startDate: "", endDate: "", courseId: "", salesUserId: "", levelNo: "", groupBy: "beneficiary" });
const commissionReportSummary = ref({ paidOrderCount: 0, paidAmountCents: 0, commissionAmountCents: 0 });
const commissionReportItems = ref([]);
const salesOrderFilter = ref({ status: "", paymentChannel: "", source: "", courseId: "", salesUserId: "", keyword: "", startDate: "", endDate: "" });
const salesOrderPagination = ref({ page: 1, pageSize: 20, total: 0 });
const formMessage = ref("");
const errorText = ref("");
const editingUserId = ref(0);
const openMeetingsChecking = ref(false);
const openMeetingsPollTimer = ref(null);

const openMeetingsStatusText = (status) => {
  if (!status || !status.checked) return "未检测";
  return status.ok ? "正常" : "异常";
};

const openMeetingsFailureCount = computed(() => Number(dashboard.value.openMeetings?.failureCount || 0));

const openMeetingsAlertLevel = computed(() => {
  const status = dashboard.value.openMeetings;
  if (!status?.checked || status.ok) return "ok";
  const count = openMeetingsFailureCount.value;
  if (count >= 5) return "critical";
  if (count >= 3) return "warning";
  return "notice";
});

const openMeetingsAlertText = computed(() => {
  if (openMeetingsAlertLevel.value === "critical") return "严重告警：OpenMeetings 连续失败 >= 5 次";
  if (openMeetingsAlertLevel.value === "warning") return "告警：OpenMeetings 连续失败 >= 3 次";
  if (openMeetingsAlertLevel.value === "notice") return "提示：OpenMeetings 最近检测失败";
  return "";
});

const openMeetingsDiagnosticsText = computed(() => {
  const status = dashboard.value.openMeetings || {};
  return [
    `状态: ${openMeetingsStatusText(status)}`,
    `消息: ${status.message || "暂无状态"}`,
    `检测时间: ${status.checkedAt || "-"}`,
    `最近成功: ${status.lastSuccessAt || "-"}`,
    `最近失败: ${status.lastErrorAt || "-"}`,
    `连续失败: ${Number(status.failureCount || 0)}`,
    `耗时: ${status.durationMs ?? "-"} ms`,
    `API 地址: ${status.apiBaseUrl || "-"}`,
    `房间地址: ${status.roomBaseUrl || "-"}`
  ].join("\n");
});

const parseLogTime = (value) => {
  const text = String(value || "").trim();
  if (!text) return null;
  const timestamp = new Date(text).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
};

const parseFilterDate = (value, endOfDay = false) => {
  const dateText = String(value || "").trim();
  if (!dateText) return null;
  const suffix = endOfDay ? "T23:59:59.999" : "T00:00:00.000";
  const timestamp = new Date(`${dateText}${suffix}`).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
};

const filteredLogs = computed(() => {
  const keyword = String(logsQuery.value || "").trim().toLowerCase();
  const startAt = parseFilterDate(logsDateRange.value.startDate, false);
  const endAt = parseFilterDate(logsDateRange.value.endDate, true);

  return logs.value.filter((item) => {
    if (logsFilter.value === "openmeetings-health" && item.action !== "openmeetings.health.check") {
      return false;
    }

    const createdAt = parseLogTime(item.created_at);
    if (startAt !== null && createdAt !== null && createdAt < startAt) {
      return false;
    }
    if (endAt !== null && createdAt !== null && createdAt > endAt) {
      return false;
    }

    if (!keyword) return true;
    const haystack = [
      item.created_at,
      item.actor_name,
      item.actor_email,
      item.action,
      item.resource_type,
      item.resource_id,
      item.detail,
      item.ip_address
    ].map((part) => String(part || "").toLowerCase()).join(" ");
    return haystack.includes(keyword);
  });
});

const normalizeLogDetailText = (value) => {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    const parsed = JSON.parse(text);
    return JSON.stringify(parsed, null, 2);
  } catch (error) {
    return text;
  }
};

const hasLogDetail = (item) => Boolean(String(item?.detail || "").trim());

const isLogDetailExpanded = (logId) => Boolean(expandedLogDetails.value[logId]);

const toggleLogDetail = (logId) => {
  expandedLogDetails.value = {
    ...expandedLogDetails.value,
    [logId]: !expandedLogDetails.value[logId]
  };
};

const logDetailText = (item) => normalizeLogDetailText(item?.detail);

const copiedLogDetailRecently = (logId) => Number(copiedLogDetailId.value) === Number(logId);

const copyLogDetail = async (item) => {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    errorText.value = "当前浏览器不支持复制到剪贴板";
    return;
  }

  const text = logDetailText(item);
  if (!text) {
    errorText.value = "该日志没有可复制的详情";
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    copiedLogDetailId.value = Number(item.id || 0);
    formMessage.value = "日志详情已复制";
    errorText.value = "";
    if (logDetailCopyTimer.value) {
      clearTimeout(logDetailCopyTimer.value);
    }
    logDetailCopyTimer.value = setTimeout(() => {
      copiedLogDetailId.value = 0;
      logDetailCopyTimer.value = null;
    }, 1500);
  } catch (error) {
    errorText.value = "复制日志详情失败";
  }
};

const districtForm = ref({ name: "", code: "", organizationId: "" });
const organizationForm = ref({ name: "", code: "", category: "school" });
const classroomForm = ref({
  name: "",
  code: "",
  organizationId: "",
  districtId: "",
  assistantUserId: ""
});
const guardianLinkForm = ref({ parentUserId: "", studentUserId: "" });
const userForm = ref({
  fullName: "",
  email: "",
  password: "",
  role: "teacher",
  organizationId: "",
  districtId: "",
  status: "active"
});
const settingForm = ref({ key: "", value: "", category: "general" });
const permissionForm = ref({ roleName: "teacher" });
const commissionForm = ref({ organizationId: "" });
const salesAgentForm = ref({ salesUserId: "", parentSalesUserId: "", levelNo: 1 });
const selectedSalesAgentId = ref(0);
const studentSalesForm = ref({ studentUserId: "", salesUserId: "" });
const manualOrderForm = ref({ courseId: "", buyerUserId: "", studentUserId: "", amountCents: "" });
const selectedPermissions = ref({});
const collapsedPermissionGroups = ref({});
const collapsedSalesAgents = ref({});
const draggingSalesAgentId = ref(0);
const dragOverSalesAgentId = ref(0);
const lastSalesDragMove = ref(null);
const salesConfirmDialog = ref({
  visible: false,
  title: "请确认",
  message: "",
  detailItems: [],
  confirmText: "确认",
  pending: false,
  onConfirm: null,
  onCancel: null
});
const currentUser = JSON.parse(localStorage.getItem("user") || "{}");

const roleOptions = ["admin", "org_admin", "district_admin", "teacher", "assistant", "student", "parent"];
const categoryOptions = ["school", "center", "district", "company"];
const mainTabs = [
  { key: "dashboard", label: "概览", permissionKey: "system.manage" },
  { key: "organizations", label: "机构设置", permissionKey: "organization.manage" },
  { key: "districts", label: "学区管理", permissionKey: "district.manage" },
  { key: "classrooms", label: "固定教室", permissionKey: "organization.manage" },
  { key: "users", label: "系统帐号", permissionKey: "user.manage" },
  { key: "guardianLinks", label: "家长学员关系", permissionKey: "user.manage" },
  { key: "sales", label: "销售分成" },
  { key: "settings", label: "系统设置", permissionKey: "settings.manage" },
  { key: "permissions", label: "权限管理", permissionKey: "permission.manage" },
  { key: "logs", label: "系统日志", permissionKey: "log.view" }
];
const salesSubTabs = [
  { key: "rules", label: "分成规则", permissionKey: "sales.rules.manage" },
  { key: "agents", label: "销售层级", permissionKey: "sales.agents.manage" },
  { key: "bindings", label: "学员归属", permissionKey: "sales.bindings.manage" },
  { key: "reports", label: "分成报表", permissionKey: "sales.reports.view" },
  { key: "manualOrder", label: "订单录入", permissionKey: "sales.orders.manage" },
  { key: "orders", label: "订单记录", permissionKey: "sales.orders.view" }
];
const permissionGroups = [
  {
    key: "platform",
    title: "平台权限",
    items: [
      { key: "system.manage", label: "系统管理" },
      { key: "settings.manage", label: "系统设置" },
      { key: "permission.manage", label: "权限管理" },
      { key: "log.view", label: "系统日志查看" }
    ]
  },
  {
    key: "org",
    title: "机构与账号",
    items: [
      { key: "organization.manage", label: "机构管理" },
      { key: "district.manage", label: "学区管理" },
      { key: "user.manage", label: "账号管理" }
    ]
  },
  {
    key: "teaching",
    title: "教学业务",
    items: [
      { key: "course.manage", label: "课程管理" },
      { key: "course.view", label: "课程查看" },
      { key: "replay.manage", label: "回放管理" },
      { key: "replay.view", label: "回放查看" },
      { key: "attendance.manage", label: "签到管理" },
      { key: "attendance.self", label: "个人签到" }
    ]
  },
  {
    key: "sales",
    title: "销售分成",
    items: [
      { key: "sales.rules.manage", label: "分成规则管理" },
      { key: "sales.agents.manage", label: "销售层级管理" },
      { key: "sales.bindings.manage", label: "学员归属管理" },
      { key: "sales.reports.view", label: "分成报表查看" },
      { key: "sales.orders.manage", label: "销售订单管理" },
      { key: "sales.orders.view", label: "销售订单查看" }
    ]
  }
];

const messageMap = {
  "Permission denied": "没有权限访问管理中心",
  "Failed to load dashboard": "加载管理概览失败",
  "Failed to fetch districts": "加载学区失败",
  "Failed to create district": "创建学区失败",
  "Failed to delete district": "删除学区失败",
  "Failed to fetch organizations": "加载机构失败",
  "Failed to create organization": "创建机构失败",
  "Failed to delete organization": "删除机构失败",
  "Failed to fetch classrooms": "加载固定教室失败",
  "Failed to create classroom": "创建固定教室失败",
  "Failed to delete classroom": "删除固定教室失败",
  "Failed to fetch users": "加载账号失败",
  "Failed to create user": "创建账号失败",
  "Failed to update user": "更新账号失败",
  "Failed to delete user": "删除账号失败",
  "Email already exists": "邮箱已存在",
  "Full name already exists": "账号名已存在",
  "Failed to load settings": "加载系统设置失败",
  "Failed to update setting": "更新系统设置失败",
  "Failed to fetch permissions": "加载权限失败",
  "Failed to update permissions": "更新权限失败",
  "Failed to fetch guardian links": "加载家长学员关系失败",
  "Failed to create guardian link": "创建家长学员关系失败",
  "Failed to delete guardian link": "删除家长学员关系失败",
  "Failed to fetch logs": "加载系统日志失败",
  "Failed to fetch commission rules": "加载分成规则失败",
  "Failed to update commission rules": "更新分成规则失败",
  "Failed to fetch sales agents": "加载销售员关系失败",
  "Failed to save sales agent": "保存销售员关系失败",
  "Failed to fetch student bindings": "加载学员归属失败",
  "Failed to save student binding": "保存学员归属失败",
  "Failed to fetch orders": "加载订单失败",
  "Failed to export orders": "导出订单失败",
  "Failed to mark order paid": "标记订单支付失败",
  "Failed to create manual order": "手工录单失败",
  "Failed to fetch commission report": "加载分成报表失败",
  "month must be YYYY-MM": "月份格式应为 YYYY-MM",
  "date range is invalid": "日期区间格式无效",
  "rules are required": "请至少配置一条分成规则",
  "courseId, studentUserId and buyerUserId are required": "课程、学员、购买人不能为空",
  "name and code are required": "名称和编码不能为空",
  "name, code and organizationId are required": "名称、编码和所属机构不能为空",
  "name, code, organizationId and districtId are required": "名称、编码、所属机构和学区不能为空",
  "Please select organization": "请选择所属机构",
  "Please select district": "请选择所属学区",
  "District not in organization": "所选学区不属于该机构",
  "parentUserId and studentUserId are required": "家长和学员不能为空",
  "Invalid classroomId": "固定教室编号无效",
  "Invalid districtId": "学区编号无效",
  "Invalid organizationId": "机构编号无效",
  "Invalid userId": "账号编号无效",
  "parent sales agent cannot be a descendant": "上级销售不能是当前销售的下级",
  "Failed to delete sales agent": "移除销售关系失败",
  "Invalid setting key": "设置键无效",
  "roleName and permissions are required": "角色和权限不能为空"
};

const toChineseMessage = (message, fallback) => {
  if (!message) return fallback;
  return messageMap[message] || message;
};

const allPermissionKeys = computed(() => permissionGroups.flatMap((group) => group.items.map((item) => item.key)));

const resetSelectedPermissions = () => {
  const next = {};
  allPermissionKeys.value.forEach((key) => {
    next[key] = false;
  });
  selectedPermissions.value = next;
};

const initializePermissionGroupCollapse = () => {
  const next = {};
  permissionGroups.forEach((group) => {
    next[group.key] = false;
  });
  collapsedPermissionGroups.value = next;
};

const applyPermissionsForRole = () => {
  resetSelectedPermissions();
  const roleName = permissionForm.value.roleName;
  permissions.value
    .filter((item) => item.role_name === roleName && Number(item.permission_value) === 1)
    .forEach((item) => {
      if (Object.prototype.hasOwnProperty.call(selectedPermissions.value, item.permission_key)) {
        selectedPermissions.value[item.permission_key] = true;
      }
    });
};

const isGroupChecked = (group) => group.items.every((item) => selectedPermissions.value[item.key]);

const isGroupIndeterminate = (group) => {
  const checkedCount = checkedCountByGroup(group);
  return checkedCount > 0 && checkedCount < group.items.length;
};

const checkedCountByGroup = (group) => group.items.filter((item) => selectedPermissions.value[item.key]).length;

const toggleGroup = (group, checked) => {
  group.items.forEach((item) => {
    selectedPermissions.value[item.key] = checked;
  });
};

const togglePermissionGroupCollapse = (groupKey) => {
  collapsedPermissionGroups.value[groupKey] = !collapsedPermissionGroups.value[groupKey];
};

const syncGroupCheckboxState = (el, group) => {
  if (!el) return;
  el.indeterminate = isGroupIndeterminate(group);
};

const fetchDashboard = async () => {
  const { data } = await http.get("/admin/dashboard");
  dashboard.value = data;
};

const refreshOpenMeetingsHealth = async (options = {}) => {
  const { silent = false, source = "manual" } = options;
  if (openMeetingsChecking.value) return;
  openMeetingsChecking.value = true;
  try {
    const { data } = await http.get("/admin/openmeetings/health", {
      params: { refresh: true, source }
    });
    dashboard.value = {
      ...dashboard.value,
      openMeetings: data
    };
    if (!silent) {
      formMessage.value = "OpenMeetings 状态已更新";
    }
    errorText.value = "";
  } catch (error) {
    errorText.value = toChineseMessage(error.response?.data?.message, "检测 OpenMeetings 状态失败");
  } finally {
    openMeetingsChecking.value = false;
  }
};

const stopOpenMeetingsPolling = () => {
  if (openMeetingsPollTimer.value) {
    clearInterval(openMeetingsPollTimer.value);
    openMeetingsPollTimer.value = null;
  }
};

const startOpenMeetingsPolling = () => {
  stopOpenMeetingsPolling();
  openMeetingsPollTimer.value = setInterval(() => {
    if (activeTab.value !== "dashboard") return;
    refreshOpenMeetingsHealth({ silent: true, source: "polling" });
  }, 60000);
};

const copyOpenMeetingsDiagnostics = async () => {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    errorText.value = "当前浏览器不支持复制到剪贴板";
    return;
  }

  try {
    await navigator.clipboard.writeText(openMeetingsDiagnosticsText.value);
    formMessage.value = "OpenMeetings 诊断信息已复制";
    errorText.value = "";
  } catch (error) {
    errorText.value = "复制 OpenMeetings 诊断信息失败";
  }
};

const fetchDistricts = async () => {
  const { data } = await http.get("/admin/districts");
  districts.value = data;
};

const fetchOrganizations = async () => {
  const { data } = await http.get("/admin/organizations");
  organizations.value = data;
};

const fetchUsers = async () => {
  const { data } = await http.get("/admin/users");
  users.value = data;
};

const fetchClassrooms = async () => {
  const { data } = await http.get("/admin/classrooms");
  classrooms.value = data;
};

const fetchGuardianLinks = async () => {
  const { data } = await http.get("/admin/guardian-links");
  guardianLinks.value = data;
};

const fetchSettings = async () => {
  const { data } = await http.get("/admin/settings");
  settings.value = data;
};

const fetchPermissions = async () => {
  const { data } = await http.get("/admin/permissions");
  permissions.value = data;
  applyPermissionsForRole();
};

const fetchPermissionMatrix = async () => {
  const { data } = await http.get("/admin/permissions");
  permissions.value = data || [];
};

const fetchLogs = async () => {
  const { data } = await http.get("/admin/logs");
  logs.value = data;
  expandedLogDetails.value = {};
};

const setLogsFilter = (filter) => {
  logsFilter.value = filter;
};

const clearLogsFilters = () => {
  logsFilter.value = "all";
  logsQuery.value = "";
  logsDateRange.value = { startDate: "", endDate: "" };
};

const defaultCommissionRules = () => ([
  { levelNo: 1, tierNo: 1, minSalesCents: 0, maxSalesCents: 9999999, rateBps: 300 },
  { levelNo: 1, tierNo: 2, minSalesCents: 10000000, maxSalesCents: 29999999, rateBps: 500 },
  { levelNo: 1, tierNo: 3, minSalesCents: 30000000, maxSalesCents: null, rateBps: 800 },
  { levelNo: 2, tierNo: 1, minSalesCents: 0, maxSalesCents: 9999999, rateBps: 150 },
  { levelNo: 2, tierNo: 2, minSalesCents: 10000000, maxSalesCents: 29999999, rateBps: 300 },
  { levelNo: 2, tierNo: 3, minSalesCents: 30000000, maxSalesCents: null, rateBps: 500 },
  { levelNo: 3, tierNo: 1, minSalesCents: 0, maxSalesCents: 9999999, rateBps: 100 },
  { levelNo: 3, tierNo: 2, minSalesCents: 10000000, maxSalesCents: 29999999, rateBps: 200 },
  { levelNo: 3, tierNo: 3, minSalesCents: 30000000, maxSalesCents: null, rateBps: 300 }
]);

const fetchCoursesForSales = async () => {
  const { data } = await http.get("/courses");
  coursesForSales.value = data || [];
};

const fetchCommissionRules = async () => {
  const params = {};
  if (commissionForm.value.organizationId) {
    params.organizationId = commissionForm.value.organizationId;
  }
  const { data } = await http.get("/sales/commission-rules", { params });
  salesCommissionRules.value = (data?.length ? data : defaultCommissionRules()).map((item) => ({
    levelNo: Number(item.level_no ?? item.levelNo ?? 1),
    tierNo: Number(item.tier_no ?? item.tierNo ?? 1),
    minSalesCents: Number(item.min_sales_cents ?? item.minSalesCents ?? 0),
    maxSalesCents: item.max_sales_cents ?? item.maxSalesCents ?? null,
    rateBps: Number(item.rate_bps ?? item.rateBps ?? 0)
  }));
};

const fetchSalesAgents = async () => {
  const { data } = await http.get("/sales/agents");
  salesAgents.value = data || [];
};

const fetchStudentSalesBindings = async () => {
  const { data } = await http.get("/sales/student-bindings");
  studentSalesBindings.value = data || [];
};

const fetchSalesOrders = async () => {
  const params = {
    status: salesOrderFilter.value.status || "",
    paymentChannel: salesOrderFilter.value.paymentChannel || "",
    source: salesOrderFilter.value.source || "",
    courseId: salesOrderFilter.value.courseId || "",
    salesUserId: salesOrderFilter.value.salesUserId || "",
    keyword: salesOrderFilter.value.keyword || "",
    startDate: salesOrderFilter.value.startDate || "",
    endDate: salesOrderFilter.value.endDate || "",
    page: salesOrderPagination.value.page,
    pageSize: salesOrderPagination.value.pageSize
  };
  const { data } = await http.get("/sales/orders", { params });
  salesOrders.value = data?.items || [];
  salesOrderPagination.value = {
    page: Number(data?.pagination?.page || 1),
    pageSize: Number(data?.pagination?.pageSize || salesOrderPagination.value.pageSize || 20),
    total: Number(data?.pagination?.total || 0)
  };
};

const fetchCommissionReport = async () => {
  const month = String(commissionReport.value.month || "").trim();
  if (!month) return;
  const { data } = await http.get("/sales/reports/commissions", {
    params: {
      month,
      startDate: commissionReport.value.startDate || "",
      endDate: commissionReport.value.endDate || "",
      courseId: commissionReport.value.courseId || "",
      salesUserId: commissionReport.value.salesUserId || "",
      levelNo: commissionReport.value.levelNo || "",
      groupBy: commissionReport.value.groupBy || "beneficiary"
    }
  });
  commissionReportSummary.value = data?.summary || { paidOrderCount: 0, paidAmountCents: 0, commissionAmountCents: 0 };
  commissionReportItems.value = data?.items || [];
};

const exportCommissionReportCsv = () => {
  const dimensionLabel = {
    beneficiary: "受益人",
    course: "课程",
    level: "层级"
  }[commissionReport.value.groupBy || "beneficiary"];
  const header = ["月份", dimensionLabel, "层级", "订单数", "销售额(分)", "分成额(分)"];
  const rows = commissionReportItems.value.map((item) => [
    commissionReport.value.month,
    item.group_label || item.beneficiary_name || item.course_title || item.level_no,
    item.level_no || "-",
    item.order_count || 0,
    item.sales_amount_cents || 0,
    item.commission_amount_cents || 0
  ]);
  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `commission-report-${commissionReport.value.month || "report"}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
};

const exportSalesOrdersCsv = async () => {
  const response = await http.get("/sales/orders/export", {
    params: {
      status: salesOrderFilter.value.status || "",
      paymentChannel: salesOrderFilter.value.paymentChannel || "",
      source: salesOrderFilter.value.source || "",
      keyword: salesOrderFilter.value.keyword || "",
      startDate: salesOrderFilter.value.startDate || "",
      endDate: salesOrderFilter.value.endDate || ""
    },
    responseType: "blob"
  });

  const blob = new Blob([response.data], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `sales-orders-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
};

const changeSalesOrderPage = async (delta) => {
  const nextPage = Math.max(1, Number(salesOrderPagination.value.page || 1) + delta);
  if (nextPage === salesOrderPagination.value.page) return;
  salesOrderPagination.value.page = nextPage;
  await fetchSalesOrders();
};

const applySalesOrderFilters = async () => {
  salesOrderPagination.value.page = 1;
  await fetchSalesOrders();
};

const refreshActiveTab = async () => {
  errorText.value = "";
  formMessage.value = "";
  try {
    if (activeTab.value === "dashboard") await fetchDashboard();
    if (activeTab.value === "districts") {
      await Promise.all([fetchOrganizations(), fetchDistricts()]);
    }
    if (activeTab.value === "organizations") {
      await fetchDistricts();
      await fetchOrganizations();
    }
    if (activeTab.value === "users") {
      await Promise.all([fetchDistricts(), fetchOrganizations(), fetchUsers()]);
    }
    if (activeTab.value === "classrooms") {
      await Promise.all([fetchOrganizations(), fetchDistricts(), fetchUsers(), fetchClassrooms()]);
    }
    if (activeTab.value === "guardianLinks") {
      await Promise.all([fetchUsers(), fetchGuardianLinks()]);
    }
    if (activeTab.value === "settings") await fetchSettings();
    if (activeTab.value === "permissions") await fetchPermissions();
    if (activeTab.value === "logs") await fetchLogs();
    if (activeTab.value === "sales") {
      await Promise.all([
        fetchOrganizations(),
        fetchDistricts(),
        fetchUsers(),
        fetchCoursesForSales(),
        fetchSalesAgents(),
        fetchStudentSalesBindings(),
        fetchSalesOrders()
      ]);
      await Promise.all([fetchCommissionRules(), fetchCommissionReport()]);
    }
  } catch (error) {
    errorText.value = toChineseMessage(error.response?.data?.message, "加载失败");
  }
};

const createDistrict = async () => {
  if (!districtForm.value.organizationId) {
    errorText.value = toChineseMessage("Please select organization", "请选择所属机构");
    return;
  }

  await http.post("/admin/districts", districtForm.value);
  districtForm.value = { name: "", code: "", organizationId: "" };
  formMessage.value = "学区已创建";
  await fetchDistricts();
};

const deleteDistrict = async (id) => {
  await http.delete(`/admin/districts/${id}`);
  await fetchDistricts();
};

const createOrganization = async () => {
  await http.post("/admin/organizations", {
    ...organizationForm.value
  });
  organizationForm.value = { name: "", code: "", category: "school" };
  formMessage.value = "机构已创建";
  await fetchOrganizations();
};

const deleteOrganization = async (id) => {
  await http.delete(`/admin/organizations/${id}`);
  await fetchOrganizations();
};

const createClassroom = async () => {
  if (!classroomForm.value.organizationId) {
    errorText.value = toChineseMessage("Please select organization", "请选择所属机构");
    return;
  }

  if (!classroomForm.value.districtId) {
    errorText.value = toChineseMessage("Please select district", "请选择所属学区");
    return;
  }

  const inSelectedOrganization = districtOptionsByOrganization(classroomForm.value.organizationId)
    .some((item) => Number(item.id) === Number(classroomForm.value.districtId));

  if (!inSelectedOrganization) {
    errorText.value = toChineseMessage("District not in organization", "所选学区不属于该机构");
    return;
  }

  await http.post("/admin/classrooms", {
    ...classroomForm.value,
    assistantUserId: classroomForm.value.assistantUserId || null
  });
  classroomForm.value = {
    name: "",
    code: "",
    organizationId: "",
    districtId: "",
    assistantUserId: ""
  };
  formMessage.value = "固定教室已创建";
  await fetchClassrooms();
};

const deleteClassroom = async (id) => {
  await http.delete(`/admin/classrooms/${id}`);
  await fetchClassrooms();
};

const createUser = async () => {
  errorText.value = "";
  formMessage.value = "";

  if (currentUser.role === "org_admin") {
    userForm.value.organizationId = String(myOrganizationId.value || "");
  }

  if (currentUser.role === "district_admin") {
    userForm.value.organizationId = String(myOrganizationId.value || "");
    userForm.value.districtId = String(myDistrictId.value || "");
  }

  if (userForm.value.districtId && !userForm.value.organizationId) {
    errorText.value = toChineseMessage("Please select organization", "请选择所属机构");
    return;
  }

  try {
    if (editingUserId.value > 0) {
      await http.put(`/admin/users/${editingUserId.value}`, {
        ...userForm.value,
        email: userForm.value.email || null,
        organizationId: userForm.value.organizationId || null,
        districtId: userForm.value.districtId || null
      });
      formMessage.value = "账号已更新";
    } else {
      await http.post("/admin/users", {
        ...userForm.value,
        email: userForm.value.email || null,
        organizationId: userForm.value.organizationId || null,
        districtId: userForm.value.districtId || null
      });
      formMessage.value = "账号已创建";
    }

    userForm.value = {
      fullName: "",
      email: "",
      password: "",
      role: "teacher",
      organizationId: "",
      districtId: "",
      status: "active"
    };
    editingUserId.value = 0;
    await fetchUsers();
  } catch (error) {
    errorText.value = toChineseMessage(error.response?.data?.message, editingUserId.value > 0 ? "更新账号失败" : "创建账号失败");
  }
};

const startEditUser = (item) => {
  if (currentUser.role === "district_admin" && Number(item.district_id || 0) !== myDistrictId.value) {
    errorText.value = "不能编辑本学区之外的账号";
    return;
  }

  if (currentUser.role === "org_admin" && Number(item.organization_id || 0) !== myOrganizationId.value) {
    errorText.value = "不能编辑本机构之外的账号";
    return;
  }

  editingUserId.value = item.id;
  userForm.value = {
    fullName: item.full_name,
    email: item.email,
    password: "",
    role: item.role,
    organizationId: item.organization_id || "",
    districtId: item.district_id || "",
    status: item.status || "active"
  };
  formMessage.value = "正在编辑账号，可留空密码表示不修改密码";
};

const cancelEditUser = () => {
  editingUserId.value = 0;
  userForm.value = {
    fullName: "",
    email: "",
    password: "",
    role: "teacher",
    organizationId: "",
    districtId: "",
    status: "active"
  };
};

const deleteUser = async (id) => {
  const target = users.value.find((item) => Number(item.id) === Number(id));
  if (currentUser.role === "district_admin" && Number(target?.district_id || 0) !== myDistrictId.value) {
    errorText.value = "不能删除本学区之外的账号";
    return;
  }

  if (currentUser.role === "org_admin" && Number(target?.organization_id || 0) !== myOrganizationId.value) {
    errorText.value = "不能删除本机构之外的账号";
    return;
  }

  await http.delete(`/admin/users/${id}`);
  await fetchUsers();
};

const createGuardianLink = async () => {
  await http.post("/admin/guardian-links", guardianLinkForm.value);
  guardianLinkForm.value = { parentUserId: "", studentUserId: "" };
  formMessage.value = "家长学员关系已创建";
  await fetchGuardianLinks();
};

const deleteGuardianLink = async (id) => {
  await http.delete(`/admin/guardian-links/${id}`);
  await fetchGuardianLinks();
};

const districtOptionsByOrganization = (organizationId) => {
  if (!organizationId) return [];
  return districts.value.filter((item) => Number(item.organization_id) === Number(organizationId));
};

const myOrganizationId = computed(() => {
  const direct = Number(currentUser.organizationId || 0);
  if (direct > 0) return direct;
  if (currentUser.role !== "district_admin") return 0;
  const district = districts.value.find((item) => Number(item.id) === Number(currentUser.districtId || 0));
  return Number(district?.organization_id || 0);
});

const myDistrictId = computed(() => Number(currentUser.districtId || 0));

const scopedOrganizations = computed(() => {
  if (currentUser.role === "admin") return organizations.value;
  if (["org_admin", "district_admin"].includes(currentUser.role) && myOrganizationId.value > 0) {
    return organizations.value.filter((item) => Number(item.id) === myOrganizationId.value);
  }
  return organizations.value;
});

const scopedDistricts = computed(() => {
  if (currentUser.role === "admin") return districts.value;
  if (currentUser.role === "district_admin" && myDistrictId.value > 0) {
    return districts.value.filter((item) => Number(item.id) === myDistrictId.value);
  }
  if (currentUser.role === "org_admin" && myOrganizationId.value > 0) {
    return districts.value.filter((item) => Number(item.organization_id) === myOrganizationId.value);
  }
  return districts.value;
});

const scopedRoleOptions = computed(() => {
  if (currentUser.role === "admin") return roleOptions;
  if (currentUser.role === "org_admin") {
    return ["district_admin", "teacher", "assistant", "student", "parent"];
  }
  if (currentUser.role === "district_admin") {
    return ["teacher", "assistant", "student", "parent"];
  }
  return ["teacher", "assistant", "student", "parent"];
});

const visibleUsers = computed(() => {
  if (currentUser.role === "admin") return users.value;
  if (currentUser.role === "district_admin" && myDistrictId.value > 0) {
    return users.value.filter((item) => Number(item.district_id) === myDistrictId.value);
  }
  if (currentUser.role === "org_admin" && myOrganizationId.value > 0) {
    return users.value.filter((item) => Number(item.organization_id) === myOrganizationId.value);
  }
  return users.value;
});

const scopedDistrictOptionsByOrganization = (organizationId) => {
  const orgId = Number(organizationId || 0);
  const base = scopedDistricts.value;
  if (!orgId) return base;
  return base.filter((item) => Number(item.organization_id) === orgId);
};

const classroomDistrictOptions = computed(() => scopedDistrictOptionsByOrganization(classroomForm.value.organizationId));
const userDistrictOptions = computed(() => scopedDistrictOptionsByOrganization(userForm.value.organizationId));

watch(
  () => classroomForm.value.organizationId,
  (value, oldValue) => {
    if (value !== oldValue) {
      classroomForm.value.districtId = "";
    }
  }
);

watch(
  () => userForm.value.organizationId,
  (value, oldValue) => {
    if (value !== oldValue) {
      userForm.value.districtId = "";
    }
  }
);

const assistantUsers = () => users.value.filter((item) => item.role === "assistant");
const parentUsers = () => users.value.filter((item) => item.role === "parent");
const studentUsers = () => users.value.filter((item) => item.role === "student");

const updateSetting = async () => {
  await http.put(`/admin/settings/${encodeURIComponent(settingForm.value.key)}`, {
    settingValue: settingForm.value.value,
    category: settingForm.value.category
  });
  settingForm.value = { key: "", value: "", category: "general" };
  formMessage.value = "系统设置已更新";
  await fetchSettings();
};

const updatePermissions = async () => {
  const permissionList = allPermissionKeys.value
    .filter((key) => selectedPermissions.value[key])
    .map((permissionKey) => ({ permissionKey, permissionValue: true }));

  await http.put("/admin/permissions", {
    roleName: permissionForm.value.roleName,
    permissions: permissionList
  });
  formMessage.value = "权限已更新";
  await fetchPermissions();
};

const saveCommissionRules = async () => {
  await http.put("/sales/commission-rules", {
    organizationId: commissionForm.value.organizationId || null,
    rules: salesCommissionRules.value.map((item) => ({
      levelNo: Number(item.levelNo || 1),
      tierNo: Number(item.tierNo || 1),
      minSalesCents: Number(item.minSalesCents || 0),
      maxSalesCents: item.maxSalesCents === "" || item.maxSalesCents === null ? null : Number(item.maxSalesCents),
      rateBps: Number(item.rateBps || 0)
    }))
  });
  formMessage.value = "分成规则已更新";
  await fetchCommissionRules();
};

const saveSalesAgent = async () => {
  await http.put(`/sales/agents/${salesAgentForm.value.salesUserId}`, {
    parentSalesUserId: salesAgentForm.value.parentSalesUserId || null,
    levelNo: Number(salesAgentForm.value.levelNo || 1)
  });
  lastSalesDragMove.value = null;
  selectedSalesAgentId.value = 0;
  salesAgentForm.value = { salesUserId: "", parentSalesUserId: "", levelNo: 1 };
  formMessage.value = "销售员关系已保存";
  await fetchSalesAgents();
};

const setSalesAgentAsRoot = (item) => {
  const impactedCount = salesDescendantCount(item.sales_user_id);
  const detailItems = salesDescendantPreviewItems(item.sales_user_id);
  openSalesConfirmDialog({
    title: "确认设为顶级销售",
    message: `确认将 ${salesAgentDisplayName(item)} 调整为顶级销售吗？将影响 ${impactedCount} 名下级的层级路径。`,
    detailItems,
    confirmText: "确认调整",
    onConfirm: async () => {
      await http.put(`/sales/agents/${item.sales_user_id}`, {
        parentSalesUserId: null,
        levelNo: 1
      });
      lastSalesDragMove.value = null;
      selectSalesAgentNode({
        ...item,
        parent_sales_user_id: null,
        level_no: 1
      });
      formMessage.value = `${salesAgentDisplayName(item)} 已设为顶级销售`;
      errorText.value = "";
      await fetchSalesAgents();
    }
  });
};

const deleteSalesAgent = (item) => {
  const impactedCount = salesDescendantCount(item.sales_user_id);
  const detailItems = salesDescendantPreviewItems(item.sales_user_id);
  openSalesConfirmDialog({
    title: "确认移除销售关系",
    message: `确认移除 ${salesAgentDisplayName(item)} 的销售层级关系吗？将影响 ${impactedCount} 名下级（其上级将被重置）。`,
    detailItems,
    confirmText: "确认移除",
    onConfirm: async () => {
      try {
        await http.delete(`/sales/agents/${item.sales_user_id}`);
        lastSalesDragMove.value = null;
        if (Number(selectedSalesAgentId.value || 0) === Number(item.sales_user_id || 0)) {
          resetSalesAgentForm();
        }
        formMessage.value = `${salesAgentDisplayName(item)} 的销售层级关系已移除`;
        errorText.value = "";
        await fetchSalesAgents();
      } catch (error) {
        errorText.value = toChineseMessage(error.response?.data?.message, "移除销售关系失败");
      }
    }
  });
};

const saveStudentSalesBinding = async () => {
  await http.put(`/sales/student-bindings/${studentSalesForm.value.studentUserId}`, {
    salesUserId: Number(studentSalesForm.value.salesUserId || 0)
  });
  studentSalesForm.value = { studentUserId: "", salesUserId: "" };
  formMessage.value = "学员归属已保存";
  await fetchStudentSalesBindings();
};

const createManualOrder = async () => {
  await http.post("/sales/orders/manual", {
    courseId: Number(manualOrderForm.value.courseId || 0),
    buyerUserId: Number(manualOrderForm.value.buyerUserId || 0),
    studentUserId: Number(manualOrderForm.value.studentUserId || 0),
    amountCents: manualOrderForm.value.amountCents === "" ? null : Number(manualOrderForm.value.amountCents)
  });
  manualOrderForm.value = { courseId: "", buyerUserId: "", studentUserId: "", amountCents: "" };
  formMessage.value = "手工订单已录入";
  await fetchSalesOrders();
};

const markSalesOrderPaid = async (id) => {
  await http.post(`/sales/orders/${id}/mark-paid`, {});
  formMessage.value = "订单已标记为已支付";
  await Promise.all([fetchSalesOrders(), fetchCommissionReport()]);
};

const salesUserCandidates = computed(() => users.value.filter((item) => !["student", "parent"].includes(item.role)));
const studentUserCandidates = computed(() => users.value.filter((item) => item.role === "student"));
const buyerUserCandidates = computed(() => users.value.filter((item) => ["student", "parent"].includes(item.role)));
const salesAgentTree = computed(() => {
  const nodeMap = new Map();

  salesAgents.value.forEach((item) => {
    nodeMap.set(Number(item.sales_user_id), {
      ...item,
      children: []
    });
  });

  const roots = [];
  nodeMap.forEach((node) => {
    const parentId = Number(node.parent_sales_user_id || 0);
    if (parentId > 0 && nodeMap.has(parentId) && parentId !== Number(node.sales_user_id)) {
      nodeMap.get(parentId).children.push(node);
      return;
    }
    roots.push(node);
  });

  const sortNodes = (nodes) => {
    nodes.sort((left, right) => {
      const levelDiff = Number(left.level_no || 0) - Number(right.level_no || 0);
      if (levelDiff !== 0) return levelDiff;
      return String(left.sales_name || left.sales_user_id).localeCompare(String(right.sales_name || right.sales_user_id), "zh-Hans-CN");
    });
    nodes.forEach((node) => sortNodes(node.children));
    return nodes;
  };

  return sortNodes(roots);
});

const salesTreeStats = computed(() => {
  return {
    total: salesAgents.value.length,
    roots: salesAgentTree.value.length
  };
});

const salesAgentById = computed(() => {
  const map = new Map();
  salesAgents.value.forEach((item) => {
    map.set(Number(item.sales_user_id || 0), item);
  });
  return map;
});

const salesAgentDescendantMap = computed(() => {
  const map = new Map();
  const walk = (node) => {
    const descendants = new Set();
    (node.children || []).forEach((child) => {
      descendants.add(Number(child.sales_user_id || 0));
      const childDescendants = walk(child);
      childDescendants.forEach((id) => descendants.add(id));
    });
    map.set(Number(node.sales_user_id || 0), descendants);
    return descendants;
  };

  salesAgentTree.value.forEach((root) => walk(root));
  return map;
});

const salesDescendantCount = (salesUserId) => {
  return (salesAgentDescendantMap.value.get(Number(salesUserId || 0)) || new Set()).size;
};

const salesDescendantPreviewItems = (salesUserId, limit = 5) => {
  const sourceId = Number(salesUserId || 0);
  if (!sourceId || limit <= 0) return [];

  const descendants = salesAgentDescendantMap.value.get(sourceId) || new Set();
  if (descendants.size === 0) return [];

  const childrenByParentId = new Map();
  salesAgents.value.forEach((item) => {
    const parentId = item.parent_sales_user_id ? Number(item.parent_sales_user_id) : 0;
    if (!childrenByParentId.has(parentId)) {
      childrenByParentId.set(parentId, []);
    }
    childrenByParentId.get(parentId).push(item);
  });

  childrenByParentId.forEach((list) => {
    list.sort((a, b) => {
      const nameCompare = salesAgentDisplayName(a).localeCompare(salesAgentDisplayName(b), "zh-Hans-CN");
      if (nameCompare !== 0) return nameCompare;
      return Number(a.sales_user_id || 0) - Number(b.sales_user_id || 0);
    });
  });

  const previewItems = [];
  const queue = [...(childrenByParentId.get(sourceId) || [])];
  while (queue.length > 0 && previewItems.length < limit) {
    const current = queue.shift();
    const currentId = Number(current?.sales_user_id || 0);
    if (descendants.has(currentId)) {
      previewItems.push(current);
    }
    queue.push(...(childrenByParentId.get(currentId) || []));
  }

  const detailItems = previewItems.map((item) => ({
    label: salesAgentDisplayName(item),
    meta: salesAgentBadge(item)
  }));
  const remain = Math.max(0, descendants.size - detailItems.length);
  if (remain > 0) {
    detailItems.push({
      label: `其余 ${remain} 人`,
      meta: "未展开"
    });
  }
  return detailItems;
};

const salesAgentDisplayName = (item) => item.sales_name || `销售员#${item.sales_user_id}`;
const salesAgentBadge = (item) => `${item.level_no || "-"}级销售`;
const hasSalesChildren = (item) => Array.isArray(item?.children) && item.children.length > 0;
const isSalesAgentCollapsed = (salesUserId) => Boolean(collapsedSalesAgents.value[salesUserId]);
const isSelectedSalesAgent = (salesUserId) => Number(selectedSalesAgentId.value || 0) === Number(salesUserId || 0);
const toggleSalesAgentCollapse = (salesUserId) => {
  collapsedSalesAgents.value = {
    ...collapsedSalesAgents.value,
    [salesUserId]: !collapsedSalesAgents.value[salesUserId]
  };
};

const canDropSalesAgent = (sourceId, targetId) => {
  const fromId = Number(sourceId || 0);
  const toId = Number(targetId || 0);
  if (!fromId || !toId) return false;
  if (fromId === toId) return false;
  const descendants = salesAgentDescendantMap.value.get(fromId) || new Set();
  return !descendants.has(toId);
};

const resetSalesConfirmDialog = () => {
  salesConfirmDialog.value = {
    visible: false,
    title: "请确认",
    message: "",
    detailItems: [],
    confirmText: "确认",
    pending: false,
    onConfirm: null,
    onCancel: null
  };
};

const openSalesConfirmDialog = ({ title = "请确认", message, detailItems = [], confirmText = "确认", onConfirm, onCancel = null }) => {
  salesConfirmDialog.value = {
    visible: true,
    title,
    message: String(message || ""),
    detailItems: Array.isArray(detailItems) ? detailItems : [],
    confirmText,
    pending: false,
    onConfirm,
    onCancel
  };
};

const cancelSalesConfirmDialog = () => {
  if (salesConfirmDialog.value.pending) return;
  const onCancel = salesConfirmDialog.value.onCancel;
  resetSalesConfirmDialog();
  if (typeof onCancel === "function") {
    onCancel();
  }
};

const confirmSalesConfirmDialog = async () => {
  const onConfirm = salesConfirmDialog.value.onConfirm;
  if (typeof onConfirm !== "function") {
    resetSalesConfirmDialog();
    return;
  }

  salesConfirmDialog.value.pending = true;
  try {
    await onConfirm();
  } finally {
    resetSalesConfirmDialog();
  }
};

const applySalesParentChange = async (salesUserId, parentSalesUserId, levelNo, successText, options = {}) => {
  try {
    const source = salesAgentById.value.get(Number(salesUserId || 0)) || null;
    const prevState = source
      ? {
          salesUserId: Number(source.sales_user_id || 0),
          parentSalesUserId: source.parent_sales_user_id ? Number(source.parent_sales_user_id) : null,
          levelNo: Number(source.level_no || 1),
          salesName: salesAgentDisplayName(source)
        }
      : null;

    await http.put(`/sales/agents/${salesUserId}`, {
      parentSalesUserId,
      levelNo
    });

    if (options.trackUndo && prevState) {
      const target = parentSalesUserId ? salesAgentById.value.get(Number(parentSalesUserId)) : null;
      lastSalesDragMove.value = {
        prevState,
        changedTo: {
          parentSalesUserId: parentSalesUserId ? Number(parentSalesUserId) : null,
          levelNo: Number(levelNo || 1)
        },
        targetName: target ? salesAgentDisplayName(target) : "顶级节点"
      };
    }

    formMessage.value = successText;
    errorText.value = "";
    await fetchSalesAgents();
  } catch (error) {
    errorText.value = toChineseMessage(error.response?.data?.message, "更新销售层级失败");
  }
};

const undoLastSalesDragMove = async () => {
  const snapshot = lastSalesDragMove.value;
  if (!snapshot?.prevState?.salesUserId) return;

  openSalesConfirmDialog({
    title: "撤销销售层级变更",
    message: `确认撤销：将 ${snapshot.prevState.salesName} 恢复到原上级关系？`,
    confirmText: "确认撤销",
    onConfirm: async () => {
      await applySalesParentChange(
        snapshot.prevState.salesUserId,
        snapshot.prevState.parentSalesUserId,
        snapshot.prevState.levelNo,
        `${snapshot.prevState.salesName} 已撤销到上一步关系`
      );
      lastSalesDragMove.value = null;
    }
  });
};

const onSalesDragStart = (item) => {
  draggingSalesAgentId.value = Number(item.sales_user_id || 0);
  dragOverSalesAgentId.value = 0;
};

const onSalesDragEnd = () => {
  draggingSalesAgentId.value = 0;
  dragOverSalesAgentId.value = 0;
};

const onSalesDragEnter = (item) => {
  const targetId = Number(item.sales_user_id || 0);
  if (!canDropSalesAgent(draggingSalesAgentId.value, targetId)) {
    dragOverSalesAgentId.value = 0;
    return;
  }
  dragOverSalesAgentId.value = targetId;
};

const onSalesDrop = async (item) => {
  const sourceId = Number(draggingSalesAgentId.value || 0);
  const targetId = Number(item.sales_user_id || 0);
  if (!canDropSalesAgent(sourceId, targetId)) {
    onSalesDragEnd();
    return;
  }

  const target = salesAgentById.value.get(targetId);
  const source = salesAgentById.value.get(sourceId);
  if (!target || !source) {
    onSalesDragEnd();
    return;
  }

  const nextLevel = Math.min(3, Number(target.level_no || 1) + 1);
  const impactedCount = salesDescendantCount(sourceId);
  const detailItems = salesDescendantPreviewItems(sourceId);
  openSalesConfirmDialog({
    title: "确认调整销售层级",
    message: `确认将 ${salesAgentDisplayName(source)} 调整到 ${salesAgentDisplayName(target)} 下级吗？将同时移动 ${impactedCount} 名下级。`,
    detailItems,
    confirmText: "确认调整",
    onCancel: () => {
      onSalesDragEnd();
    },
    onConfirm: async () => {
      await applySalesParentChange(
        sourceId,
        targetId,
        nextLevel,
        `${salesAgentDisplayName(source)} 已拖拽调整到 ${salesAgentDisplayName(target)} 下级`,
        { trackUndo: true }
      );
      onSalesDragEnd();
    }
  });
};

const onSalesDropToRoot = async () => {
  const sourceId = Number(draggingSalesAgentId.value || 0);
  if (!sourceId) return;
  const source = salesAgentById.value.get(sourceId);
  if (!source) {
    onSalesDragEnd();
    return;
  }

  const impactedCount = salesDescendantCount(sourceId);
  const detailItems = salesDescendantPreviewItems(sourceId);
  openSalesConfirmDialog({
    title: "确认设为顶级销售",
    message: `确认将 ${salesAgentDisplayName(source)} 调整为顶级销售吗？将同时移动 ${impactedCount} 名下级。`,
    detailItems,
    confirmText: "确认调整",
    onCancel: () => {
      onSalesDragEnd();
    },
    onConfirm: async () => {
      await applySalesParentChange(sourceId, null, 1, `${salesAgentDisplayName(source)} 已设为顶级销售`, { trackUndo: true });
      onSalesDragEnd();
    }
  });
};

const resetSalesAgentForm = () => {
  selectedSalesAgentId.value = 0;
  salesAgentForm.value = { salesUserId: "", parentSalesUserId: "", levelNo: 1 };
};

const selectSalesAgentNode = (item) => {
  selectedSalesAgentId.value = Number(item.sales_user_id || 0);
  salesAgentForm.value = {
    salesUserId: String(item.sales_user_id || ""),
    parentSalesUserId: item.parent_sales_user_id ? String(item.parent_sales_user_id) : "",
    levelNo: Number(item.level_no || 1)
  };
  formMessage.value = `正在编辑 ${salesAgentDisplayName(item)} 的层级关系`;
  errorText.value = "";
};

const prepareCreateChildSalesAgent = (item) => {
  selectedSalesAgentId.value = 0;
  salesAgentForm.value = {
    salesUserId: "",
    parentSalesUserId: String(item.sales_user_id || ""),
    levelNo: Math.min(3, Number(item.level_no || 1) + 1)
  };
  formMessage.value = `正在为 ${salesAgentDisplayName(item)} 新增下级销售`;
  errorText.value = "";
};

const selectedSalesAgentDescendantIds = computed(() => {
  const targetId = Number(selectedSalesAgentId.value || 0);
  if (!targetId) return new Set();

  const result = new Set();
  const collect = (nodes) => {
    nodes.forEach((node) => {
      if (Number(node.sales_user_id) === targetId) {
        const walk = (children) => {
          children.forEach((child) => {
            result.add(Number(child.sales_user_id));
            walk(child.children || []);
          });
        };
        walk(node.children || []);
      } else {
        collect(node.children || []);
      }
    });
  };

  collect(salesAgentTree.value);
  return result;
});

const availableParentSalesAgents = computed(() => {
  const currentId = Number(selectedSalesAgentId.value || 0);
  return salesAgents.value.filter((item) => {
    const candidateId = Number(item.sales_user_id || 0);
    if (!currentId) return true;
    if (candidateId === currentId) return false;
    return !selectedSalesAgentDescendantIds.value.has(candidateId);
  });
});

const forbiddenSalesUserCandidateIds = computed(() => {
  const blocked = new Set();
  const currentId = Number(selectedSalesAgentId.value || 0);
  const parentId = Number(salesAgentForm.value.parentSalesUserId || 0);

  if (currentId > 0) {
    blocked.add(currentId);
    selectedSalesAgentDescendantIds.value.forEach((item) => blocked.add(Number(item)));
  }

  if (parentId > 0) {
    let cursor = salesAgentById.value.get(parentId);
    while (cursor) {
      blocked.add(Number(cursor.sales_user_id || 0));
      const nextParentId = Number(cursor.parent_sales_user_id || 0);
      cursor = nextParentId > 0 ? salesAgentById.value.get(nextParentId) : null;
    }
  }

  return blocked;
});

const availableSalesUserCandidates = computed(() => {
  const currentId = Number(selectedSalesAgentId.value || 0);
  if (currentId > 0) {
    return salesUserCandidates.value;
  }
  return salesUserCandidates.value.filter((item) => !forbiddenSalesUserCandidateIds.value.has(Number(item.id || 0)));
});

const setSalesTreeCollapsed = (collapsed) => {
  const next = {};
  const collect = (nodes) => {
    nodes.forEach((node) => {
      if (hasSalesChildren(node)) {
        next[node.sales_user_id] = collapsed;
        collect(node.children);
      }
    });
  };
  collect(salesAgentTree.value);
  collapsedSalesAgents.value = next;
};

const salesAgentTreeRows = computed(() => {
  const rows = [];
  const travel = (nodes, depth = 0) => {
    nodes.forEach((node) => {
      rows.push({
        ...node,
        depth,
        hasChildren: hasSalesChildren(node),
        collapsed: isSalesAgentCollapsed(node.sales_user_id)
      });
      if (hasSalesChildren(node) && !isSalesAgentCollapsed(node.sales_user_id)) {
        travel(node.children, depth + 1);
      }
    });
  };
  travel(salesAgentTree.value);
  return rows;
});
const commissionRulesByLevel = computed(() => {
  const groups = { 1: [], 2: [], 3: [] };
  salesCommissionRules.value.forEach((item) => {
    const key = Number(item.levelNo || 1);
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  });
  Object.keys(groups).forEach((key) => {
    groups[key] = groups[key].sort((a, b) => Number(a.tierNo || 0) - Number(b.tierNo || 0));
  });
  return groups;
});

const commissionReportTopItems = computed(() => {
  return [...commissionReportItems.value]
    .sort((a, b) => Number(b.commission_amount_cents || 0) - Number(a.commission_amount_cents || 0))
    .slice(0, 5)
    .map((item) => ({
      ...item,
      barWidth: 0
    }));
});

const commissionReportTopMax = computed(() => {
  return commissionReportTopItems.value.reduce((maxValue, item) => Math.max(maxValue, Number(item.commission_amount_cents || 0)), 0);
});

const commissionBarWidth = (value) => {
  const maxValue = Number(commissionReportTopMax.value || 0);
  if (maxValue <= 0) return 12;
  return Math.max(12, Math.round((Number(value || 0) / maxValue) * 100));
};

const currentRolePermissions = computed(() => {
  const roleName = String(currentUser.role || "");
  return permissions.value.filter((item) => item.role_name === roleName && Number(item.permission_value) === 1);
});

const hasRolePermissionData = computed(() => {
  const roleName = String(currentUser.role || "");
  return permissions.value.some((item) => item.role_name === roleName);
});

const grantedPermissionSet = computed(() => {
  return new Set(currentRolePermissions.value.map((item) => item.permission_key));
});

const canAccessPermission = (permissionKey) => {
  if (!permissionKey) return true;
  if (currentUser.role === "admin") return true;
  if (!hasRolePermissionData.value) return true;
  return grantedPermissionSet.value.has(permissionKey);
};

const visibleSalesSubTabs = computed(() => {
  return salesSubTabs.filter((item) => canAccessPermission(item.permissionKey));
});

const visibleMainTabs = computed(() => {
  return mainTabs.filter((item) => {
    if (item.key === "sales") {
      return visibleSalesSubTabs.value.length > 0;
    }
    return canAccessPermission(item.permissionKey);
  });
});

const activeSalesTabLabel = computed(() => {
  return salesSubTabs.find((item) => item.key === activeSalesTab.value)?.label || "分成规则";
});

const setActiveTab = async (tabKey) => {
  const allowedTabs = visibleMainTabs.value.map((item) => item.key);
  if (!allowedTabs.includes(tabKey)) return;
  activeTab.value = tabKey;
  if (tabKey === "sales") {
    const firstSalesTab = visibleSalesSubTabs.value[0]?.key || "rules";
    if (!visibleSalesSubTabs.value.some((item) => item.key === activeSalesTab.value)) {
      activeSalesTab.value = firstSalesTab;
    }
  }
  await refreshActiveTab();
};

const setActiveSalesTab = (subTabKey) => {
  if (!visibleSalesSubTabs.value.some((item) => item.key === subTabKey)) return;
  activeSalesTab.value = subTabKey;
};

watch(
  () => permissionForm.value.roleName,
  () => {
    applyPermissionsForRole();
  }
);

watch(
  salesAgentTree,
  (tree) => {
    const validKeys = new Set();
    const collect = (nodes) => {
      nodes.forEach((node) => {
        if (hasSalesChildren(node)) {
          validKeys.add(String(node.sales_user_id));
          collect(node.children);
        }
      });
    };
    collect(tree);

    const next = {};
    Object.keys(collapsedSalesAgents.value).forEach((key) => {
      if (validKeys.has(String(key))) {
        next[key] = collapsedSalesAgents.value[key];
      }
    });
    collapsedSalesAgents.value = next;
  },
  { immediate: true }
);

const logout = () => {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  router.push("/login");
};

onMounted(refreshActiveTab);
onMounted(async () => {
  initializePermissionGroupCollapse();
  await Promise.all([fetchOrganizations(), fetchDistricts(), fetchPermissionMatrix()]);

  const allowedMainTabs = visibleMainTabs.value.map((item) => item.key);
  if (!allowedMainTabs.includes(activeTab.value)) {
    activeTab.value = allowedMainTabs[0] || "dashboard";
  }

  if (activeTab.value === "sales" && !visibleSalesSubTabs.value.some((item) => item.key === activeSalesTab.value)) {
    activeSalesTab.value = visibleSalesSubTabs.value[0]?.key || "rules";
  }

  if (currentUser.role === "org_admin") {
    districtForm.value.organizationId = String(myOrganizationId.value || "");
    classroomForm.value.organizationId = String(myOrganizationId.value || "");
    userForm.value.organizationId = String(myOrganizationId.value || "");
  }

  if (currentUser.role === "district_admin") {
    districtForm.value.organizationId = String(myOrganizationId.value || "");
    classroomForm.value.organizationId = String(myOrganizationId.value || "");
    classroomForm.value.districtId = String(myDistrictId.value || "");
    userForm.value.organizationId = String(myOrganizationId.value || "");
    userForm.value.districtId = String(myDistrictId.value || "");
  }

  if (["org_admin", "district_admin"].includes(currentUser.role)) {
    commissionForm.value.organizationId = String(myOrganizationId.value || "");
  }

  await refreshActiveTab();

  if (activeTab.value === "dashboard") {
    await refreshOpenMeetingsHealth({ silent: true, source: "dashboard-init" });
    startOpenMeetingsPolling();
  }
});

onBeforeUnmount(() => {
  stopOpenMeetingsPolling();
  if (logDetailCopyTimer.value) {
    clearTimeout(logDetailCopyTimer.value);
    logDetailCopyTimer.value = null;
  }
});

watch(
  () => activeTab.value,
  async (tab) => {
    if (tab === "dashboard") {
      await refreshOpenMeetingsHealth({ silent: true, source: "dashboard-tab" });
      startOpenMeetingsPolling();
      return;
    }
    stopOpenMeetingsPolling();
  }
);

watch(
  () => commissionForm.value.organizationId,
  async (value, oldValue) => {
    if (activeTab.value !== "sales") return;
    if (value === oldValue) return;
    try {
      await fetchCommissionRules();
    } catch (error) {
      errorText.value = toChineseMessage(error.response?.data?.message, "加载分成规则失败");
    }
  }
);

</script>

<template>
  <main class="page">
    <header class="topbar">
      <div>
        <h1>管理中心</h1>
        <p>系统帐号管理、权限管理、系统日志、机构设置、学区管理、固定教室管理、家长学员关系管理</p>
      </div>
      <div class="actions">
        <button class="ghost" @click="router.push('/dashboard')">返回课程管理</button>
        <button @click="logout">退出登录</button>
      </div>
    </header>

    <nav class="tabs">
      <button
        v-for="tab in visibleMainTabs"
        :key="tab.key"
        :class="['tab', { active: activeTab === tab.key }]"
        @click="setActiveTab(tab.key)"
      >
        {{ tab.label }}
      </button>
    </nav>

    <p v-if="errorText" class="error">{{ errorText }}</p>
    <p v-if="formMessage" class="success">{{ formMessage }}</p>

    <section v-if="activeTab === 'dashboard'" class="grid">
      <div class="card" v-for="item in [
        ['学区', dashboard.districts],
        ['机构', dashboard.organizations],
        ['账号', dashboard.users],
        ['课程', dashboard.courses],
        ['日志', dashboard.logs]
      ]" :key="item[0]">
        <h3>{{ item[0] }}</h3>
        <strong>{{ item[1] }}</strong>
      </div>
      <div class="card openmeetings-card" :class="[`openmeetings-${openMeetingsAlertLevel}`]">
        <h3>OpenMeetings</h3>
        <strong>{{ openMeetingsStatusText(dashboard.openMeetings) }}</strong>
        <p v-if="openMeetingsAlertText" class="openmeetings-alert">{{ openMeetingsAlertText }}</p>
        <p>{{ dashboard.openMeetings?.message || '暂无状态' }}</p>
        <p v-if="dashboard.openMeetings?.durationMs !== null && dashboard.openMeetings?.durationMs !== undefined">检测耗时：{{ dashboard.openMeetings.durationMs }} ms</p>
        <p>连续失败：{{ Number(dashboard.openMeetings?.failureCount || 0) }}</p>
        <p v-if="dashboard.openMeetings?.checkedAt">检查时间：{{ dashboard.openMeetings.checkedAt }}</p>
        <p v-if="dashboard.openMeetings?.lastSuccessAt">最近成功：{{ dashboard.openMeetings.lastSuccessAt }}</p>
        <p v-if="dashboard.openMeetings?.lastErrorAt">最近失败：{{ dashboard.openMeetings.lastErrorAt }}</p>
        <p v-if="dashboard.openMeetings?.apiBaseUrl">API 地址：{{ dashboard.openMeetings.apiBaseUrl }}</p>
        <p v-if="dashboard.openMeetings?.roomBaseUrl">房间地址：{{ dashboard.openMeetings.roomBaseUrl }}</p>
        <div class="inline-actions">
          <button class="ghost" type="button" :disabled="openMeetingsChecking" @click="refreshOpenMeetingsHealth({ source: 'manual' })">{{ openMeetingsChecking ? '检测中...' : '立即检测' }}</button>
          <button class="ghost" type="button" @click="copyOpenMeetingsDiagnostics">复制诊断</button>
        </div>
      </div>
    </section>

    <section v-else-if="activeTab === 'districts'" class="card">
      <h2>学区管理</h2>
      <form class="form" @submit.prevent="createDistrict">
        <select v-model="districtForm.organizationId" required>
          <option value="">选择所属机构</option>
          <option v-for="item in scopedOrganizations" :key="item.id" :value="item.id">{{ item.name }}</option>
        </select>
        <input v-model="districtForm.name" placeholder="学区名称" required />
        <input v-model="districtForm.code" placeholder="学区编码" required />
        <button type="submit">创建学区</button>
      </form>
      <ul class="list">
        <li v-for="item in districts" :key="item.id">
          <span>{{ item.name }} / {{ item.code }} / {{ item.organization_name || '未绑定机构' }}</span>
          <button class="danger" @click="deleteDistrict(item.id)">删除</button>
        </li>
      </ul>
    </section>

    <section v-else-if="activeTab === 'organizations'" class="card">
      <h2>机构设置</h2>
      <form class="form" @submit.prevent="createOrganization">
        <input v-model="organizationForm.name" placeholder="机构名称" required />
        <input v-model="organizationForm.code" placeholder="机构编码" required />
        <select v-model="organizationForm.category">
          <option v-for="item in categoryOptions" :key="item" :value="item">{{ item }}</option>
        </select>
        <button type="submit">创建机构</button>
      </form>
      <ul class="list">
        <li v-for="item in organizations" :key="item.id">
          <span>{{ item.name }} / {{ item.code }} / {{ item.category }} / 学区数量: {{ item.district_count || 0 }}</span>
          <button class="danger" @click="deleteOrganization(item.id)">删除</button>
        </li>
      </ul>
    </section>

    <section v-else-if="activeTab === 'users'" class="card">
      <h2>系统帐号管理</h2>
      <form class="form form-wide" @submit.prevent="createUser">
        <input v-model="userForm.fullName" placeholder="姓名" required />
        <input v-model="userForm.email" placeholder="邮箱（选填）" />
        <input v-model="userForm.password" :placeholder="editingUserId ? '新密码（不改可留空）' : '初始密码'" type="password" :required="!editingUserId" />
        <select v-model="userForm.role">
          <option v-for="item in scopedRoleOptions" :key="item" :value="item">{{ item }}</option>
        </select>
        <select v-model="userForm.organizationId">
          <option value="">选择机构</option>
          <option v-for="item in scopedOrganizations" :key="item.id" :value="item.id">{{ item.name }}</option>
        </select>
        <select v-model="userForm.districtId">
          <option value="">选择学区</option>
          <option v-for="item in userDistrictOptions" :key="item.id" :value="item.id">{{ item.name }}</option>
        </select>
        <select v-model="userForm.status">
          <option value="active">启用</option>
          <option value="disabled">停用</option>
        </select>
        <button type="submit">{{ editingUserId ? '保存账号' : '创建账号' }}</button>
        <button v-if="editingUserId" type="button" class="ghost" @click="cancelEditUser">取消编辑</button>
      </form>
      <ul class="list">
        <li v-for="item in visibleUsers" :key="item.id">
          <span>{{ item.full_name }} / {{ item.email }} / {{ item.role }} / {{ item.status }}</span>
          <div class="inline-actions">
            <button class="ghost" @click="startEditUser(item)">编辑</button>
            <button class="danger" @click="deleteUser(item.id)">删除</button>
          </div>
        </li>
      </ul>
    </section>

    <section v-else-if="activeTab === 'classrooms'" class="card">
      <h2>固定教室管理</h2>
      <form class="form" @submit.prevent="createClassroom">
        <select v-model="classroomForm.organizationId" required>
          <option value="">选择所属机构</option>
          <option v-for="item in scopedOrganizations" :key="item.id" :value="item.id">{{ item.name }}</option>
        </select>
        <select v-model="classroomForm.districtId" required>
          <option value="">选择所属学区</option>
          <option v-for="item in classroomDistrictOptions" :key="item.id" :value="item.id">{{ item.name }}</option>
        </select>
        <input v-model="classroomForm.name" placeholder="固定教室名称" required />
        <input v-model="classroomForm.code" placeholder="固定教室编码" required />
        <select v-model="classroomForm.assistantUserId">
          <option value="">选择助教（可选）</option>
          <option v-for="item in assistantUsers()" :key="item.id" :value="item.id">{{ item.full_name }} / {{ item.email }}</option>
        </select>
        <button type="submit">创建固定教室</button>
      </form>
      <ul class="list">
        <li v-for="item in classrooms" :key="item.id">
          <span>{{ item.name }} / {{ item.code }} / {{ item.organization_name || '-' }} / {{ item.district_name || '-' }} / 助教: {{ item.assistant_name || '未绑定' }}</span>
          <button class="danger" @click="deleteClassroom(item.id)">删除</button>
        </li>
      </ul>
    </section>

    <section v-else-if="activeTab === 'guardianLinks'" class="card">
      <h2>家长学员关系管理</h2>
      <form class="form" @submit.prevent="createGuardianLink">
        <select v-model="guardianLinkForm.parentUserId" required>
          <option value="">选择家长</option>
          <option v-for="item in parentUsers()" :key="item.id" :value="item.id">{{ item.full_name }} / {{ item.email }}</option>
        </select>
        <select v-model="guardianLinkForm.studentUserId" required>
          <option value="">选择学员</option>
          <option v-for="item in studentUsers()" :key="item.id" :value="item.id">{{ item.full_name }} / {{ item.email }}</option>
        </select>
        <button type="submit">创建关系</button>
      </form>
      <ul class="list">
        <li v-for="item in guardianLinks" :key="item.id">
          <span>{{ item.parent_name || '-' }} (家长) -> {{ item.student_name || '-' }} (学员)</span>
          <button class="danger" @click="deleteGuardianLink(item.id)">删除</button>
        </li>
      </ul>
    </section>

    <section v-else-if="activeTab === 'sales'" class="card sales-card">
      <h2>销售分成管理 · {{ activeSalesTabLabel }}</h2>
      <nav class="sub-tabs">
        <button
          v-for="tab in visibleSalesSubTabs"
          :key="tab.key"
          :class="['sub-tab', { active: activeSalesTab === tab.key }]"
          @click="setActiveSalesTab(tab.key)"
        >
          {{ tab.label }}
        </button>
      </nav>

      <div v-if="activeSalesTab === 'rules'" class="sales-block">
        <h3>分成规则（三层级 / 每级三档）</h3>
        <form class="form form-wide" @submit.prevent="saveCommissionRules">
          <select v-model="commissionForm.organizationId" :disabled="currentUser.role !== 'admin'">
            <option value="">全局默认规则</option>
            <option v-for="item in scopedOrganizations" :key="item.id" :value="item.id">{{ item.name }}</option>
          </select>
          <button type="submit">保存分成规则</button>
        </form>

        <div class="rule-level" v-for="level in [1,2,3]" :key="level">
          <h4>{{ level }} 级分成</h4>
          <div class="rule-row head">
            <span>档位</span>
            <span>销量下限（分）</span>
            <span>销量上限（分）</span>
            <span>提成比例（万分比）</span>
          </div>
          <div class="rule-row" v-for="item in commissionRulesByLevel[level]" :key="`${level}-${item.tierNo}`">
            <span>第 {{ item.tierNo }} 档</span>
            <input type="number" min="0" v-model.number="item.minSalesCents" />
            <input type="number" min="0" v-model="item.maxSalesCents" placeholder="空=不封顶" />
            <input type="number" min="0" v-model.number="item.rateBps" />
          </div>
        </div>
      </div>

      <section v-else-if="activeSalesTab === 'agents'" class="sales-block">
        <h3>销售员层级关系</h3>
        <form class="form form-wide" @submit.prevent="saveSalesAgent">
          <select v-model="salesAgentForm.salesUserId" :disabled="Boolean(selectedSalesAgentId)" required>
            <option value="">选择销售员</option>
            <option v-for="item in availableSalesUserCandidates" :key="item.id" :value="item.id">{{ item.full_name }} / {{ item.role }}</option>
          </select>
          <select v-model="salesAgentForm.parentSalesUserId">
            <option value="">上级销售（无）</option>
            <option v-for="item in availableParentSalesAgents" :key="item.sales_user_id" :value="item.sales_user_id">{{ item.sales_name || item.sales_user_id }}</option>
          </select>
          <select v-model="salesAgentForm.levelNo">
            <option :value="1">一级销售</option>
            <option :value="2">二级销售</option>
            <option :value="3">三级销售</option>
          </select>
          <button type="submit">{{ selectedSalesAgentId ? '更新关系' : '保存关系' }}</button>
          <button v-if="selectedSalesAgentId" type="button" class="ghost" @click="resetSalesAgentForm">取消编辑</button>
        </form>
        <div class="sales-tree-toolbar">
          <small>共 {{ salesTreeStats.total }} 名销售员，顶层 {{ salesTreeStats.roots }} 名</small>
          <div class="inline-actions">
            <button v-if="lastSalesDragMove" type="button" class="ghost tree-action" @click="undoLastSalesDragMove">撤销上一步</button>
            <button type="button" class="ghost tree-action" @click="setSalesTreeCollapsed(false)">全部展开</button>
            <button type="button" class="ghost tree-action" @click="setSalesTreeCollapsed(true)">全部收起</button>
          </div>
        </div>
        <div v-if="salesAgentTree.length" class="sales-tree">
          <div class="sales-root-drop" @dragover.prevent @drop.prevent="onSalesDropToRoot">
            拖到这里可设为顶级销售
          </div>
          <ul class="sales-tree-list root flat">
            <li v-for="item in salesAgentTreeRows" :key="item.sales_user_id" class="sales-tree-node">
              <div
                class="sales-tree-card"
                :class="{ selected: isSelectedSalesAgent(item.sales_user_id), 'drag-source': draggingSalesAgentId === item.sales_user_id, 'drop-target': dragOverSalesAgentId === item.sales_user_id }"
                :style="{ marginLeft: `${item.depth * 24}px` }"
                draggable="true"
                @dragstart="onSalesDragStart(item)"
                @dragend="onSalesDragEnd"
                @dragover.prevent
                @dragenter.prevent="onSalesDragEnter(item)"
                @drop.prevent="onSalesDrop(item)"
                @click="selectSalesAgentNode(item)"
              >
                <div class="sales-tree-main">
                  <button
                    v-if="item.hasChildren"
                    type="button"
                    class="tree-toggle"
                    @click.stop="toggleSalesAgentCollapse(item.sales_user_id)"
                  >
                    {{ item.collapsed ? '+' : '-' }}
                  </button>
                  <span v-else class="tree-toggle placeholder"></span>
                  <div>
                    <strong>{{ salesAgentDisplayName(item) }}</strong>
                    <small>{{ salesAgentBadge(item) }}</small>
                  </div>
                </div>
                <div class="sales-tree-side">
                  <span>{{ item.parent_sales_name ? `上级：${item.parent_sales_name}` : '顶级节点' }}</span>
                  <div class="inline-actions">
                    <button type="button" class="ghost tree-action" @click.stop="selectSalesAgentNode(item)">编辑</button>
                    <button type="button" class="ghost tree-action" @click.stop="prepareCreateChildSalesAgent(item)">新增下级</button>
                    <button v-if="item.parent_sales_user_id" type="button" class="ghost tree-action" @click.stop="setSalesAgentAsRoot(item)">设为顶级</button>
                    <button type="button" class="danger tree-action" @click.stop="deleteSalesAgent(item)">移除关系</button>
                  </div>
                </div>
              </div>
            </li>
          </ul>
        </div>
        <p v-else class="rank-empty">暂无销售层级数据</p>
      </section>

      <section v-else-if="activeSalesTab === 'bindings'" class="sales-block">
        <h3>学员归属销售</h3>
        <form class="form form-wide" @submit.prevent="saveStudentSalesBinding">
          <select v-model="studentSalesForm.studentUserId" required>
            <option value="">选择学员</option>
            <option v-for="item in studentUserCandidates" :key="item.id" :value="item.id">{{ item.full_name }} / {{ item.email || '无邮箱' }}</option>
          </select>
          <select v-model="studentSalesForm.salesUserId" required>
            <option value="">选择销售员</option>
            <option v-for="item in salesAgents" :key="item.sales_user_id" :value="item.sales_user_id">{{ item.sales_name || item.sales_user_id }}</option>
          </select>
          <button type="submit">保存归属</button>
        </form>
        <ul class="list compact">
          <li v-for="item in studentSalesBindings" :key="item.student_user_id">
            <span>{{ item.student_name || '-' }} -> {{ item.sales_name || '-' }}</span>
          </li>
        </ul>
      </section>

      <div v-else-if="activeSalesTab === 'reports'" class="sales-block">
        <h3>分成统计报表</h3>
        <form class="form form-wide" @submit.prevent="fetchCommissionReport">
          <input type="month" v-model="commissionReport.month" required />
          <input type="date" v-model="commissionReport.startDate" />
          <input type="date" v-model="commissionReport.endDate" />
          <select v-model="commissionReport.groupBy">
            <option value="beneficiary">按受益人汇总</option>
            <option value="course">按课程汇总</option>
            <option value="level">按层级汇总</option>
          </select>
          <select v-model="commissionReport.courseId">
            <option value="">全部课程</option>
            <option v-for="item in coursesForSales" :key="item.id" :value="item.id">{{ item.title }}</option>
          </select>
          <select v-model="commissionReport.salesUserId">
            <option value="">全部销售员</option>
            <option v-for="item in salesAgents" :key="item.sales_user_id" :value="item.sales_user_id">{{ item.sales_name || item.sales_user_id }}</option>
          </select>
          <select v-model="commissionReport.levelNo">
            <option value="">全部层级</option>
            <option value="1">1级</option>
            <option value="2">2级</option>
            <option value="3">3级</option>
          </select>
          <button type="submit">查询报表</button>
          <button type="button" class="ghost" @click="exportCommissionReportCsv">导出 CSV</button>
        </form>
        <div class="sales-summary-grid">
          <article class="sales-summary-card">
            <small>已支付订单数</small>
            <strong>{{ commissionReportSummary.paidOrderCount || 0 }}</strong>
          </article>
          <article class="sales-summary-card">
            <small>已支付总额（分）</small>
            <strong>{{ commissionReportSummary.paidAmountCents || 0 }}</strong>
          </article>
          <article class="sales-summary-card">
            <small>总分成金额（分）</small>
            <strong>{{ commissionReportSummary.commissionAmountCents || 0 }}</strong>
          </article>
        </div>
        <div class="rank-chart">
          <div class="rank-chart-head">
            <h4>Top 5 分成排行</h4>
            <small>按当前查询条件自动排序</small>
          </div>
          <div v-if="commissionReportTopItems.length" class="rank-bars">
            <div v-for="item in commissionReportTopItems" :key="item.group_key || `${item.beneficiary_user_id}-${item.level_no}`" class="rank-bar-row">
              <div class="rank-bar-label">
                <span>{{ item.group_label || item.beneficiary_name || item.course_title || '-' }}</span>
                <small>{{ item.commission_amount_cents || 0 }} 分</small>
              </div>
              <div class="rank-bar-track">
                <div class="rank-bar-fill" :style="{ width: `${commissionBarWidth(item.commission_amount_cents)}%` }"></div>
              </div>
            </div>
          </div>
          <p v-else class="rank-empty">暂无数据</p>
        </div>
        <ul class="list compact">
          <li v-for="item in commissionReportItems" :key="item.group_key || `${item.beneficiary_user_id}-${item.level_no}`">
            <span>{{ item.group_label || item.beneficiary_name || '-' }} / {{ item.level_no ? `${item.level_no}级` : '全部层级' }} / 订单数: {{ item.order_count || 0 }} / 销售额: {{ item.sales_amount_cents || 0 }} / 分成: {{ item.commission_amount_cents || 0 }}</span>
          </li>
        </ul>
      </div>

      <div v-else-if="activeSalesTab === 'manualOrder'" class="sales-block">
        <h3>后台录入订单</h3>
        <form class="form form-wide" @submit.prevent="createManualOrder">
          <select v-model="manualOrderForm.courseId" required>
            <option value="">选择课程</option>
            <option v-for="item in coursesForSales" :key="item.id" :value="item.id">{{ item.title }} / {{ item.id }}</option>
          </select>
          <select v-model="manualOrderForm.buyerUserId" required>
            <option value="">选择购买人（学员或家长）</option>
            <option v-for="item in buyerUserCandidates" :key="item.id" :value="item.id">{{ item.full_name }} / {{ item.role }}</option>
          </select>
          <select v-model="manualOrderForm.studentUserId" required>
            <option value="">选择学员</option>
            <option v-for="item in studentUserCandidates" :key="item.id" :value="item.id">{{ item.full_name }} / {{ item.email || '无邮箱' }}</option>
          </select>
          <input v-model="manualOrderForm.amountCents" type="number" min="0" placeholder="实付金额（分，可选）" />
          <button type="submit">录入订单</button>
        </form>
      </div>

      <div v-else class="sales-block">
        <h3>订单记录</h3>
        <form class="form form-wide" @submit.prevent="applySalesOrderFilters">
          <select v-model="salesOrderFilter.status">
            <option value="">全部状态</option>
            <option value="pending">pending</option>
            <option value="paid">paid</option>
            <option value="failed">failed</option>
            <option value="closed">closed</option>
          </select>
          <select v-model="salesOrderFilter.paymentChannel">
            <option value="">全部支付渠道</option>
            <option value="wechat">wechat</option>
            <option value="manual">manual</option>
            <option value="internal">internal</option>
          </select>
          <select v-model="salesOrderFilter.source">
            <option value="">全部来源</option>
            <option value="purchase">purchase</option>
            <option value="wechat">wechat</option>
            <option value="manual_admin">manual_admin</option>
          </select>
          <select v-model="salesOrderFilter.courseId">
            <option value="">全部课程</option>
            <option v-for="item in coursesForSales" :key="item.id" :value="item.id">{{ item.title }}</option>
          </select>
          <select v-model="salesOrderFilter.salesUserId">
            <option value="">全部销售员</option>
            <option v-for="item in salesAgents" :key="item.sales_user_id" :value="item.sales_user_id">{{ item.sales_name || item.sales_user_id }}</option>
          </select>
          <input type="date" v-model="salesOrderFilter.startDate" />
          <input type="date" v-model="salesOrderFilter.endDate" />
          <input v-model="salesOrderFilter.keyword" placeholder="订单号/姓名/课程关键字" />
          <button type="submit">筛选订单</button>
          <button type="button" class="ghost" @click="exportSalesOrdersCsv">导出 CSV</button>
        </form>
        <ul class="list compact">
          <li v-for="item in salesOrders" :key="item.id">
            <span>#{{ item.order_no }} / {{ item.course_title || item.course_id }} / {{ item.student_name || '-' }} / 购买人: {{ item.buyer_name || '-' }} / 销售: {{ item.sales_name || '-' }} / 金额: {{ item.amount_cents || 0 }} / {{ item.status }}</span>
            <button v-if="item.status !== 'paid'" class="ghost" @click="markSalesOrderPaid(item.id)">标记已支付</button>
          </li>
        </ul>
        <div class="pager">
          <button class="ghost" type="button" :disabled="salesOrderPagination.page <= 1" @click="changeSalesOrderPage(-1)">上一页</button>
          <span>第 {{ salesOrderPagination.page }} 页 / 共 {{ Math.max(1, Math.ceil((salesOrderPagination.total || 0) / (salesOrderPagination.pageSize || 20))) }} 页 / 共 {{ salesOrderPagination.total || 0 }} 条</span>
          <button class="ghost" type="button" :disabled="salesOrderPagination.page >= Math.max(1, Math.ceil((salesOrderPagination.total || 0) / (salesOrderPagination.pageSize || 20)))" @click="changeSalesOrderPage(1)">下一页</button>
        </div>
      </div>
    </section>

    <section v-else-if="activeTab === 'settings'" class="card">
      <h2>系统设置</h2>
      <form class="form form-wide" @submit.prevent="updateSetting">
        <input v-model="settingForm.key" placeholder="设置键" required />
        <input v-model="settingForm.value" placeholder="设置值" />
        <select v-model="settingForm.category">
          <option value="general">general</option>
          <option value="institution">institution</option>
          <option value="course">course</option>
          <option value="permission">permission</option>
        </select>
        <button type="submit">保存设置</button>
      </form>
      <ul class="list">
        <li v-for="item in settings" :key="item.setting_key">
          <span>{{ item.setting_key }} = {{ item.setting_value }} ({{ item.category }})</span>
        </li>
      </ul>
    </section>

    <section v-else-if="activeTab === 'permissions'" class="card">
      <h2>角色权限管理</h2>
      <form class="perm-toolbar" @submit.prevent="updatePermissions">
        <label class="perm-role">
          角色
          <select v-model="permissionForm.roleName">
            <option v-for="item in roleOptions" :key="item" :value="item">{{ item }}</option>
          </select>
        </label>
        <button type="submit">保存当前角色权限</button>
        <button type="button" class="ghost" @click="fetchPermissions">刷新</button>
      </form>
      <p class="perm-note">说明：配置修改后，目标账号重新登录即可按新权限看到菜单和可操作范围。</p>

      <div class="perm-groups">
        <section class="perm-group" v-for="group in permissionGroups" :key="group.key">
          <header class="perm-group-head">
            <label class="perm-main-check">
              <input
                type="checkbox"
                :checked="isGroupChecked(group)"
                :ref="(el) => syncGroupCheckboxState(el, group)"
                @change="toggleGroup(group, $event.target.checked)"
              />
              <strong>{{ group.title }}</strong>
            </label>
            <div class="perm-head-actions">
              <small>{{ checkedCountByGroup(group) }} / {{ group.items.length }}</small>
              <button
                type="button"
                class="ghost perm-collapse"
                @click="togglePermissionGroupCollapse(group.key)"
              >
                {{ collapsedPermissionGroups[group.key] ? '展开' : '收起' }}
              </button>
            </div>
          </header>
          <div class="perm-items" v-show="!collapsedPermissionGroups[group.key]">
            <label class="perm-item" v-for="item in group.items" :key="item.key">
              <input type="checkbox" v-model="selectedPermissions[item.key]" />
              <span>{{ item.label }}</span>
              <code>{{ item.key }}</code>
            </label>
          </div>
        </section>
      </div>
    </section>

    <section v-else class="card">
      <h2>系统日志</h2>
      <div class="inline-actions log-filter-actions">
        <button type="button" :class="['ghost', { active: logsFilter === 'all' }]" @click="setLogsFilter('all')">全部日志</button>
        <button type="button" :class="['ghost', { active: logsFilter === 'openmeetings-health' }]" @click="setLogsFilter('openmeetings-health')">仅看 OpenMeetings 健康日志</button>
      </div>
      <form class="form form-wide log-filter-form" @submit.prevent>
        <input v-model="logsQuery" placeholder="筛选关键字：动作/资源/账号/IP/详情" />
        <input type="date" v-model="logsDateRange.startDate" />
        <input type="date" v-model="logsDateRange.endDate" />
        <button type="button" class="ghost" @click="clearLogsFilters">清空筛选</button>
      </form>
      <p class="log-filter-summary">当前显示 {{ filteredLogs.length }} / {{ logs.length }} 条</p>
      <ul class="list compact">
        <li v-for="item in filteredLogs" :key="item.id" class="log-item">
          <div class="log-item-head">
            <span>{{ item.created_at }} / {{ item.actor_name || '系统' }} / {{ item.action }} / {{ item.resource_type }} / {{ item.resource_id || '-' }}</span>
            <div class="inline-actions">
              <button v-if="hasLogDetail(item)" type="button" class="ghost log-detail-toggle" @click="toggleLogDetail(item.id)">
                {{ isLogDetailExpanded(item.id) ? '收起详情' : '查看详情' }}
              </button>
              <button v-if="hasLogDetail(item)" type="button" class="ghost log-detail-toggle" @click="copyLogDetail(item)">
                {{ copiedLogDetailRecently(item.id) ? '已复制' : '复制详情' }}
              </button>
            </div>
          </div>
          <pre v-if="hasLogDetail(item) && isLogDetailExpanded(item.id)" class="log-detail-content">{{ logDetailText(item) }}</pre>
        </li>
      </ul>
      <p v-if="filteredLogs.length === 0" class="log-filter-summary">当前筛选条件下暂无日志</p>
    </section>

    <ConfirmDialog
      :visible="salesConfirmDialog.visible"
      :title="salesConfirmDialog.title"
      :message="salesConfirmDialog.message"
      :detail-items="salesConfirmDialog.detailItems"
      :confirm-text="salesConfirmDialog.confirmText"
      :pending="salesConfirmDialog.pending"
      @cancel="cancelSalesConfirmDialog"
      @confirm="confirmSalesConfirmDialog"
    />
  </main>
</template>

<style scoped>
.page {
  max-width: 1180px;
  margin: 0 auto;
  padding: 24px;
}

.topbar {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  margin-bottom: 16px;
}

.actions {
  display: flex;
  gap: 8px;
}

.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}

.sub-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}

.tab, button {
  border: none;
  border-radius: 8px;
  padding: 8px 14px;
  background: #0f766e;
  color: #fff;
  cursor: pointer;
  font: inherit;
}

.tab.active {
  background: #115e59;
}

.sub-tab {
  background: #e5e7eb;
  color: #1f2937;
}

.sub-tab.active {
  background: #0f766e;
  color: #ffffff;
}

.ghost {
  background: #374151;
}

.card {
  background: #fff;
  border-radius: 14px;
  padding: 18px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.grid .card {
  text-align: center;
}

.openmeetings-card {
  border: 1px solid #d1d5db;
}

.openmeetings-card.openmeetings-notice {
  border-color: #f59e0b;
  background: #fffbeb;
}

.openmeetings-card.openmeetings-warning {
  border-color: #f97316;
  background: #fff7ed;
}

.openmeetings-card.openmeetings-critical {
  border-color: #dc2626;
  background: #fef2f2;
}

.openmeetings-alert {
  margin: 8px 0;
  font-weight: 600;
  color: #b91c1c;
}

.grid strong {
  display: block;
  margin-top: 8px;
  font-size: 34px;
}

.form {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 10px;
  margin-bottom: 16px;
}

.form-wide {
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.perm-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: end;
  margin-bottom: 12px;
}

.perm-role {
  display: grid;
  gap: 6px;
  min-width: 220px;
  color: #111827;
}

.perm-note {
  margin: 0 0 12px;
  padding: 10px 12px;
  border-radius: 8px;
  background: #f3f4f6;
  color: #4b5563;
}

.perm-groups {
  display: grid;
  gap: 10px;
}

.perm-group {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  overflow: hidden;
}

.perm-group-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  background: #f9fafb;
}

.perm-head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.perm-main-check {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.perm-items {
  display: grid;
  gap: 8px;
  padding: 10px 12px;
}

.perm-item {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #111827;
}

.perm-item code {
  margin-left: auto;
  font-size: 12px;
  color: #6b7280;
  background: #f3f4f6;
  border-radius: 6px;
  padding: 2px 6px;
}

.perm-collapse {
  padding: 4px 10px;
  font-size: 12px;
}

input, select, textarea {
  font: inherit;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 10px;
}

.list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 8px;
}

.list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 10px 12px;
}

.inline-actions {
  display: flex;
  gap: 8px;
}

.log-filter-actions {
  margin-bottom: 10px;
}

.log-filter-form {
  margin-bottom: 10px;
}

.log-filter-actions .active {
  background: #0f766e;
  color: #ffffff;
}

.log-filter-summary {
  margin: 0 0 10px;
  color: #4b5563;
  font-size: 13px;
}

.log-item {
  display: block;
}

.log-item-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.log-detail-toggle {
  padding: 6px 10px;
  font-size: 12px;
  white-space: nowrap;
}

.log-detail-content {
  margin: 10px 0 0;
  padding: 10px;
  border-radius: 8px;
  background: #0b1020;
  color: #e5e7eb;
  overflow-x: auto;
  font-size: 12px;
  line-height: 1.5;
}

.compact li {
  justify-content: flex-start;
}

.danger {
  background: #b91c1c;
}

.sales-card {
  display: grid;
  gap: 14px;
}

.sales-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 12px;
}

.sales-block {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 12px;
}

.sales-tree-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  margin-bottom: 10px;
  color: #64748b;
}

.sales-tree {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 12px;
  background: #f8fafc;
}

.sales-root-drop {
  border: 1px dashed #94a3b8;
  border-radius: 10px;
  padding: 8px 10px;
  margin-bottom: 10px;
  color: #475569;
  background: #f8fafc;
  text-align: center;
  font-size: 12px;
}

.sales-tree-list {
  list-style: none;
  margin: 0;
  padding-left: 0;
  display: grid;
  gap: 10px;
}

.sales-tree-list.flat {
  gap: 8px;
}

.sales-tree-list.branch {
  margin-top: 10px;
  margin-left: 22px;
  padding-left: 18px;
  border-left: 2px solid #cbd5e1;
}

.sales-tree-node {
  position: relative;
}

.sales-tree-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid #dbeafe;
  background: #ffffff;
}

.sales-tree-card.selected {
  border-color: #0f766e;
  box-shadow: 0 0 0 2px rgba(15, 118, 110, 0.12);
  background: #f0fdfa;
}

.sales-tree-card.drag-source {
  opacity: 0.6;
}

.sales-tree-card.drop-target {
  border-color: #0ea5e9;
  box-shadow: 0 0 0 2px rgba(14, 165, 233, 0.18);
}

.sales-tree-main {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.sales-tree-side {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.tree-toggle {
  width: 24px;
  height: 24px;
  border-radius: 999px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #0f766e;
  color: #fff;
  flex: 0 0 24px;
}

.tree-toggle.placeholder {
  background: transparent;
  border: 1px dashed #cbd5e1;
  color: transparent;
}

.tree-action {
  padding: 6px 10px;
  font-size: 12px;
}

select:disabled {
  background: #f3f4f6;
  color: #6b7280;
}

.sales-tree-card strong {
  display: block;
  color: #0f172a;
}

.sales-tree-card small {
  color: #0f766e;
}

.sales-tree-card span {
  color: #64748b;
  white-space: nowrap;
}

.sales-summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
  margin-bottom: 10px;
}

.sales-summary-card {
  background: #f8fafc;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 10px;
}

.sales-summary-card small {
  color: #64748b;
}

.sales-summary-card strong {
  display: block;
  margin-top: 6px;
  font-size: 20px;
}

.rank-chart {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 12px;
  background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
  display: grid;
  gap: 10px;
}

.rank-chart-head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: baseline;
}

.rank-chart-head h4 {
  margin: 0;
}

.rank-chart-head small,
.rank-empty {
  color: #64748b;
}

.rank-bars {
  display: grid;
  gap: 10px;
}

.rank-bar-row {
  display: grid;
  gap: 6px;
}

.rank-bar-label {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
  color: #111827;
}

.rank-bar-label small {
  color: #64748b;
}

.rank-bar-track {
  height: 12px;
  border-radius: 999px;
  background: #e2e8f0;
  overflow: hidden;
}

.rank-bar-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #0f766e 0%, #14b8a6 100%);
  transition: width 180ms ease;
}

.pager {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
}

.rule-level {
  border: 1px dashed #d1d5db;
  border-radius: 10px;
  padding: 10px;
  margin-top: 10px;
}

.rule-level h4 {
  margin: 0 0 8px;
}

.rule-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1fr;
  gap: 8px;
  align-items: center;
  margin-bottom: 6px;
}

.rule-row.head {
  color: #4b5563;
  font-size: 12px;
}

.error { color: #b91c1c; margin-bottom: 8px; }
.success { color: #047857; margin-bottom: 8px; }
</style>