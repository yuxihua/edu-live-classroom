<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import http from "../api/http.js";

const router = useRouter();
const activeTab = ref("dashboard");
const activeSalesTab = ref("rules");
const dashboard = ref({ districts: 0, organizations: 0, users: 0, courses: 0, logs: 0 });
const districts = ref([]);
const organizations = ref([]);
const users = ref([]);
const classrooms = ref([]);
const guardianLinks = ref([]);
const settings = ref([]);
const permissions = ref([]);
const logs = ref([]);
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
const studentSalesForm = ref({ studentUserId: "", salesUserId: "" });
const manualOrderForm = ref({ courseId: "", buyerUserId: "", studentUserId: "", amountCents: "" });
const selectedPermissions = ref({});
const collapsedPermissionGroups = ref({});
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
  salesAgentForm.value = { salesUserId: "", parentSalesUserId: "", levelNo: 1 };
  formMessage.value = "销售员关系已保存";
  await fetchSalesAgents();
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
});

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
          <select v-model="salesAgentForm.salesUserId" required>
            <option value="">选择销售员</option>
            <option v-for="item in salesUserCandidates" :key="item.id" :value="item.id">{{ item.full_name }} / {{ item.role }}</option>
          </select>
          <select v-model="salesAgentForm.parentSalesUserId">
            <option value="">上级销售（无）</option>
            <option v-for="item in salesAgents" :key="item.sales_user_id" :value="item.sales_user_id">{{ item.sales_name || item.sales_user_id }}</option>
          </select>
          <select v-model="salesAgentForm.levelNo">
            <option :value="1">一级销售</option>
            <option :value="2">二级销售</option>
            <option :value="3">三级销售</option>
          </select>
          <button type="submit">保存关系</button>
        </form>
        <ul class="list compact">
          <li v-for="item in salesAgents" :key="item.sales_user_id">
            <span>{{ item.sales_name || '-' }} / {{ item.level_no }}级 / 上级：{{ item.parent_sales_name || '无' }}</span>
          </li>
        </ul>
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
      <ul class="list compact">
        <li v-for="item in logs" :key="item.id">
          <span>{{ item.created_at }} / {{ item.actor_name || '系统' }} / {{ item.action }} / {{ item.resource_type }} / {{ item.resource_id || '-' }}</span>
        </li>
      </ul>
    </section>
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