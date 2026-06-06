<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import http from "../api/http.js";

const router = useRouter();
const activeTab = ref("dashboard");
const dashboard = ref({ districts: 0, organizations: 0, users: 0, courses: 0, logs: 0 });
const districts = ref([]);
const organizations = ref([]);
const users = ref([]);
const classrooms = ref([]);
const guardianLinks = ref([]);
const settings = ref([]);
const permissions = ref([]);
const logs = ref([]);
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
const selectedPermissions = ref({});
const collapsedPermissionGroups = ref({});
const currentUser = JSON.parse(localStorage.getItem("user") || "{}");

const roleOptions = ["admin", "org_admin", "district_admin", "teacher", "assistant", "student", "parent"];
const categoryOptions = ["school", "center", "district", "company"];
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

const fetchLogs = async () => {
  const { data } = await http.get("/admin/logs");
  logs.value = data;
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
  await Promise.all([fetchOrganizations(), fetchDistricts()]);

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
});
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
      <button v-for="tab in ['dashboard','organizations','districts','classrooms','users','guardianLinks','settings','permissions','logs']" :key="tab" :class="['tab', { active: activeTab === tab }]" @click="activeTab = tab; refreshActiveTab()">
        {{ { dashboard: '概览', organizations: '机构设置', districts: '学区管理', classrooms: '固定教室', users: '系统帐号', guardianLinks: '家长学员关系', settings: '系统设置', permissions: '权限管理', logs: '系统日志' }[tab] }}
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

.error { color: #b91c1c; margin-bottom: 8px; }
.success { color: #047857; margin-bottom: 8px; }
</style>