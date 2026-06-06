<script setup>
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import http from "../api/http.js";

const router = useRouter();
const activeTab = ref("dashboard");
const dashboard = ref({ districts: 0, organizations: 0, users: 0, courses: 0, logs: 0 });
const districts = ref([]);
const organizations = ref([]);
const users = ref([]);
const settings = ref([]);
const permissions = ref([]);
const logs = ref([]);
const formMessage = ref("");
const errorText = ref("");
const editingUserId = ref(0);

const districtForm = ref({ name: "", code: "" });
const organizationForm = ref({ name: "", code: "", category: "school", districtId: "" });
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
const permissionForm = ref({ roleName: "teacher", permissionText: "course.manage,course.view" });

const roleOptions = ["admin", "org_admin", "district_admin", "teacher", "assistant", "student", "parent"];
const categoryOptions = ["school", "center", "district", "company"];

const messageMap = {
  "Permission denied": "没有权限访问管理中心",
  "Failed to load dashboard": "加载管理概览失败",
  "Failed to fetch districts": "加载学区失败",
  "Failed to create district": "创建学区失败",
  "Failed to delete district": "删除学区失败",
  "Failed to fetch organizations": "加载机构失败",
  "Failed to create organization": "创建机构失败",
  "Failed to delete organization": "删除机构失败",
  "Failed to fetch users": "加载账号失败",
  "Failed to create user": "创建账号失败",
  "Failed to update user": "更新账号失败",
  "Failed to delete user": "删除账号失败",
  "Failed to load settings": "加载系统设置失败",
  "Failed to update setting": "更新系统设置失败",
  "Failed to fetch permissions": "加载权限失败",
  "Failed to update permissions": "更新权限失败",
    "Failed to fetch logs": "加载系统日志失败",
    "name and code are required": "名称和编码不能为空",
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

const fetchSettings = async () => {
  const { data } = await http.get("/admin/settings");
  settings.value = data;
};

const fetchPermissions = async () => {
  const { data } = await http.get("/admin/permissions");
  permissions.value = data;
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
    if (activeTab.value === "districts") await fetchDistricts();
    if (activeTab.value === "organizations") {
      await fetchDistricts();
      await fetchOrganizations();
    }
    if (activeTab.value === "users") {
      await Promise.all([fetchDistricts(), fetchOrganizations(), fetchUsers()]);
    }
    if (activeTab.value === "settings") await fetchSettings();
    if (activeTab.value === "permissions") await fetchPermissions();
    if (activeTab.value === "logs") await fetchLogs();
  } catch (error) {
    errorText.value = toChineseMessage(error.response?.data?.message, "加载失败");
  }
};

const createDistrict = async () => {
  await http.post("/admin/districts", districtForm.value);
  districtForm.value = { name: "", code: "" };
  formMessage.value = "学区已创建";
  await fetchDistricts();
};

const deleteDistrict = async (id) => {
  await http.delete(`/admin/districts/${id}`);
  await fetchDistricts();
};

const createOrganization = async () => {
  await http.post("/admin/organizations", {
    ...organizationForm.value,
    districtId: organizationForm.value.districtId || null
  });
  organizationForm.value = { name: "", code: "", category: "school", districtId: "" };
  formMessage.value = "机构已创建";
  await fetchOrganizations();
};

const deleteOrganization = async (id) => {
  await http.delete(`/admin/organizations/${id}`);
  await fetchOrganizations();
};

const createUser = async () => {
  if (editingUserId.value > 0) {
    await http.put(`/admin/users/${editingUserId.value}`, {
      ...userForm.value,
      organizationId: userForm.value.organizationId || null,
      districtId: userForm.value.districtId || null
    });
    formMessage.value = "账号已更新";
  } else {
    await http.post("/admin/users", {
      ...userForm.value,
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
};

const startEditUser = (item) => {
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
  await http.delete(`/admin/users/${id}`);
  await fetchUsers();
};

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
  const permissionList = permissionForm.value.permissionText
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((permissionKey) => ({ permissionKey, permissionValue: true }));

  await http.put("/admin/permissions", {
    roleName: permissionForm.value.roleName,
    permissions: permissionList
  });
  formMessage.value = "权限已更新";
  await fetchPermissions();
};

const logout = () => {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  router.push("/login");
};

onMounted(refreshActiveTab);
</script>

<template>
  <main class="page">
    <header class="topbar">
      <div>
        <h1>管理中心</h1>
        <p>系统帐号管理、权限管理、系统日志、机构设置、学区管理、老师管理、课程管理</p>
      </div>
      <div class="actions">
        <button class="ghost" @click="router.push('/dashboard')">返回课程管理</button>
        <button @click="logout">退出登录</button>
      </div>
    </header>

    <nav class="tabs">
      <button v-for="tab in ['dashboard','districts','organizations','users','settings','permissions','logs']" :key="tab" :class="['tab', { active: activeTab === tab }]" @click="activeTab = tab; refreshActiveTab()">
        {{ { dashboard: '概览', districts: '学区管理', organizations: '机构设置', users: '系统帐号', settings: '系统设置', permissions: '权限管理', logs: '系统日志' }[tab] }}
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
        <input v-model="districtForm.name" placeholder="学区名称" required />
        <input v-model="districtForm.code" placeholder="学区编码" required />
        <button type="submit">创建学区</button>
      </form>
      <ul class="list">
        <li v-for="item in districts" :key="item.id">
          <span>{{ item.name }} / {{ item.code }}</span>
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
        <select v-model="organizationForm.districtId">
          <option value="">选择所属学区</option>
          <option v-for="item in districts" :key="item.id" :value="item.id">{{ item.name }}</option>
        </select>
        <button type="submit">创建机构</button>
      </form>
      <ul class="list">
        <li v-for="item in organizations" :key="item.id">
          <span>{{ item.name }} / {{ item.code }} / {{ item.category }} / {{ item.district_name || '未分配学区' }}</span>
          <button class="danger" @click="deleteOrganization(item.id)">删除</button>
        </li>
      </ul>
    </section>

    <section v-else-if="activeTab === 'users'" class="card">
      <h2>系统帐号管理</h2>
      <form class="form form-wide" @submit.prevent="createUser">
        <input v-model="userForm.fullName" placeholder="姓名" required />
        <input v-model="userForm.email" placeholder="邮箱" required />
        <input v-model="userForm.password" :placeholder="editingUserId ? '新密码（不改可留空）' : '初始密码'" type="password" :required="!editingUserId" />
        <select v-model="userForm.role">
          <option v-for="item in roleOptions" :key="item" :value="item">{{ item }}</option>
        </select>
        <select v-model="userForm.organizationId">
          <option value="">选择机构</option>
          <option v-for="item in organizations" :key="item.id" :value="item.id">{{ item.name }}</option>
        </select>
        <select v-model="userForm.districtId">
          <option value="">选择学区</option>
          <option v-for="item in districts" :key="item.id" :value="item.id">{{ item.name }}</option>
        </select>
        <select v-model="userForm.status">
          <option value="active">启用</option>
          <option value="disabled">停用</option>
        </select>
        <button type="submit">{{ editingUserId ? '保存账号' : '创建账号' }}</button>
        <button v-if="editingUserId" type="button" class="ghost" @click="cancelEditUser">取消编辑</button>
      </form>
      <ul class="list">
        <li v-for="item in users" :key="item.id">
          <span>{{ item.full_name }} / {{ item.email }} / {{ item.role }} / {{ item.status }}</span>
          <div class="inline-actions">
            <button class="ghost" @click="startEditUser(item)">编辑</button>
            <button class="danger" @click="deleteUser(item.id)">删除</button>
          </div>
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
      <h2>权限管理</h2>
      <form class="form form-wide" @submit.prevent="updatePermissions">
        <select v-model="permissionForm.roleName">
          <option v-for="item in roleOptions" :key="item" :value="item">{{ item }}</option>
        </select>
        <textarea v-model="permissionForm.permissionText" rows="4" placeholder="权限键，英文逗号或换行分隔，例如：course.manage,log.view"></textarea>
        <button type="submit">保存权限</button>
      </form>
      <ul class="list">
        <li v-for="item in permissions" :key="item.id">
          <span>{{ item.role_name }} / {{ item.permission_key }} / {{ item.permission_value ? '允许' : '禁止' }}</span>
        </li>
      </ul>
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