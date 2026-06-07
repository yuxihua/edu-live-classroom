<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import http from "../api/http.js";
import ConfirmDialog from "../components/ConfirmDialog.vue";

const router = useRouter();
const courses = ref([]);
const organizations = ref([]);
const districts = ref([]);
const classrooms = ref([]);
const teachers = ref([]);
const loading = ref(false);
const errorText = ref("");
const keyword = ref("");
const creating = ref(false);
const createError = ref("");
const newCourse = ref({
  organizationId: "",
  districtId: "",
  classroomId: "",
  title: "",
  subject: "",
  teacherUserId: "",
  teacherName: "",
  assistantName: "",
  priceCents: 0,
  startTime: "",
  endTime: ""
});
const selectedRoomIdByCourse = ref({});
const liveRoomsByCourse = ref({});
const purchaseStudentId = ref("");
const me = ref({});
const creatingRoom = ref(false);
const checkingOpenMeetings = ref(false);
const copiedState = ref({ key: "", at: 0 });
const openMeetingsHealth = ref({
  checked: false,
  ok: false,
  message: "未检测",
  checkedAt: "",
  durationMs: 0,
  failureCount: 0,
  lastSuccessAt: "",
  apiBaseUrl: "",
  roomBaseUrl: ""
});
const liveRoomDialog = ref({
  visible: false,
  courseId: 0,
  courseTitle: ""
});
const liveRoomForm = ref({
  provider: "openmeetings",
  name: "",
  roomType: "conference",
  capacity: 25,
  comment: "",
  meetingUrl: ""
});

const user = JSON.parse(localStorage.getItem("user") || "{}");
const canCreateCourse = ["admin", "org_admin", "district_admin", "teacher"].includes(user.role);
const canSelectScope = ["admin", "org_admin", "district_admin"].includes(user.role);
const isStudent = user.role === "student";
const isParent = user.role === "parent";
const deletingId = ref(0);
const editingCourseId = ref(0);
const updating = ref(false);
const editError = ref("");
const editCourse = ref({
  organizationId: "",
  districtId: "",
  classroomId: "",
  title: "",
  subject: "",
  teacherUserId: "",
  teacherName: "",
  assistantName: "",
  priceCents: 0,
  startTime: "",
  endTime: "",
  meetingUrl: ""
});

const roleLabelMap = {
  admin: "管理员",
  org_admin: "机构管理员",
  district_admin: "学区管理员",
  assistant: "助教",
  teacher: "讲师",
  student: "学员",
  parent: "家长"
};

const messageMap = {
  "Failed to load courses": "加载课程失败",
  "Failed to enroll": "报名失败",
  "Failed to purchase course": "购买课程失败",
  "Failed to delete course": "删除课程失败",
  "Failed to create course": "创建课程失败",
  "Failed to update course": "更新课程失败",
  "Failed to fetch live rooms": "加载直播间失败",
  "Failed to fetch teachers": "加载讲师列表失败",
  "Failed to create live room": "创建直播间失败",
  "OPENMEETINGS_API_BASE_URL is not configured": "未配置 OpenMeetings 接口地址",
  "OPENMEETINGS_API_USER is not configured": "未配置 OpenMeetings 接口账号",
  "OPENMEETINGS_API_PASS is not configured": "未配置 OpenMeetings 接口密码",
  "OPENMEETINGS_ROOM_BASE_URL is not configured": "未配置 OpenMeetings 课堂链接基础地址",
  "meetingUrl is required when provider is custom": "选择自定义链接时必须填写直播间链接",
  "name is required": "请填写直播间名称",
  "Only admin, organization admin, district admin or teacher can check OpenMeetings health": "仅系统管理员、机构管理员、学区管理员或讲师可检测 OpenMeetings 接口",
  "Failed to check OpenMeetings health": "检测 OpenMeetings 接口失败",
  "Only admin, organization admin, district admin or teacher can create course": "仅系统管理员、机构管理员、学区管理员或讲师可以创建课程",
  "Only admin, organization admin, district admin or teacher can update course": "仅系统管理员、机构管理员、学区管理员或讲师可以更新课程",
  "Only admin, organization admin, district admin or teacher can delete course": "仅系统管理员、机构管理员、学区管理员或讲师可以删除课程",
  "Only admin, organization admin, district admin or teacher can view summary": "仅系统管理员、机构管理员、学区管理员或讲师可以查看汇总",
  "Only admin, organization admin, district admin or teacher can add replay": "仅系统管理员、机构管理员、学区管理员或讲师可以添加回放",
  "Only students or parents can purchase": "仅学员或家长可以购买课程",
  "studentUserId is required": "家长购买时必须选择学员",
  "Parent not linked to this student": "家长未绑定该学员",
  "Only students can enroll": "仅学员可以报名",
  "Please select linked student": "请先选择购买学员",
  "Please select organization": "请选择所属机构",
  "Please select district": "请选择所属学区",
  "Please select teacher": "请选择讲师",
  "Teacher not found in scope": "讲师不在可用范围内",
  "Invalid courseId": "课程编号无效"
};

const toChineseMessage = (message, fallback) => {
  if (!message) {
    return fallback;
  }
  return messageMap[message] || message;
};

const roleText = roleLabelMap[user.role] || user.role || "未知角色";
const canOpenAdminCenter = ["admin", "org_admin", "district_admin"].includes(user.role);
let healthPollTimer = null;

const toDateTimeLocal = (value) => {
  if (!value) return "";
  const text = String(value).trim();
  return text.replace(" ", "T").slice(0, 16);
};

const autoSelectSingleOrganization = () => {
  if (!canSelectScope) return;
  if (organizations.value.length !== 1) return;
  const onlyOrganizationId = String(organizations.value[0].id);
  if (!newCourse.value.organizationId) {
    newCourse.value.organizationId = onlyOrganizationId;
  }
  if (editingCourseId.value && !editCourse.value.organizationId) {
    editCourse.value.organizationId = onlyOrganizationId;
  }
};

const fetchProfile = async () => {
  const { data } = await http.get("/auth/me");
  me.value = data;
  if (data.role === "parent" && data.linkedStudents?.length) {
    purchaseStudentId.value = String(data.linkedStudents[0].student_user_id);
  }
};

const fetchOrganizations = async () => {
  const { data } = await http.get("/admin/organizations");
  organizations.value = data;
  autoSelectSingleOrganization();
};

const fetchDistricts = async () => {
  const { data } = await http.get("/admin/districts");
  districts.value = data;
};

const fetchClassrooms = async () => {
  const { data } = await http.get("/admin/classrooms");
  classrooms.value = data;
};

const fetchTeachers = async () => {
  if (canSelectScope) {
    const { data } = await http.get("/courses/teachers");
    teachers.value = data;
    return;
  }

  if (user.role === "teacher") {
    teachers.value = [{ id: user.id, full_name: user.fullName }];
    newCourse.value.teacherUserId = String(user.id || "");
    newCourse.value.teacherName = String(user.fullName || "");
  }
};

const teacherOptions = computed(() => {
  if (canSelectScope) {
    const orgId = Number(newCourse.value.organizationId || 0);
    return teachers.value.filter((item) => {
      const orgOk = !orgId || Number(item.organization_id || 0) === orgId;
      return orgOk;
    });
  }
  return teachers.value;
});

const districtOptionsByOrganization = (organizationId) => {
  if (!organizationId) return [];
  return districts.value.filter((item) => Number(item.organization_id) === Number(organizationId));
};

const districtOptions = computed(() => districtOptionsByOrganization(newCourse.value.organizationId));

const classroomOptionsByScope = () => {
  const orgId = newCourse.value.organizationId;
  const districtId = newCourse.value.districtId;
  return classrooms.value.filter((item) => {
    const orgOk = !orgId || Number(item.organization_id) === Number(orgId);
    const districtOk = !districtId || Number(item.district_id) === Number(districtId);
    return orgOk && districtOk;
  });
};

const classroomOptions = computed(() => classroomOptionsByScope());

const editDistrictOptions = computed(() => districtOptionsByOrganization(editCourse.value.organizationId));

const editClassroomOptions = computed(() => {
  const orgId = editCourse.value.organizationId;
  const districtId = editCourse.value.districtId;
  return classrooms.value.filter((item) => {
    const orgOk = !orgId || Number(item.organization_id) === Number(orgId);
    const districtOk = !districtId || Number(item.district_id) === Number(districtId);
    return orgOk && districtOk;
  });
});

const editTeacherOptions = computed(() => {
  if (canSelectScope) {
    const orgId = Number(editCourse.value.organizationId || 0);
    return teachers.value.filter((item) => {
      const orgOk = !orgId || Number(item.organization_id || 0) === orgId;
      return orgOk;
    });
  }
  return teachers.value;
});

watch(
  () => newCourse.value.organizationId,
  (value, oldValue) => {
    if (value !== oldValue) {
      newCourse.value.districtId = "";
      newCourse.value.classroomId = "";
      newCourse.value.teacherUserId = "";
      newCourse.value.teacherName = "";
    }
  }
);

watch(
  () => newCourse.value.districtId,
  (value, oldValue) => {
    if (value !== oldValue) {
      newCourse.value.classroomId = "";
    }
  }
);

watch(
  () => newCourse.value.teacherUserId,
  (value) => {
    const selected = teacherOptions.value.find((item) => Number(item.id) === Number(value || 0));
    newCourse.value.teacherName = selected?.full_name || "";
  }
);

watch(
  () => editCourse.value.organizationId,
  (value, oldValue) => {
    if (value !== oldValue) {
      editCourse.value.districtId = "";
      editCourse.value.classroomId = "";
      editCourse.value.teacherUserId = "";
      editCourse.value.teacherName = "";
    }
  }
);

watch(
  () => editCourse.value.districtId,
  (value, oldValue) => {
    if (value !== oldValue) {
      editCourse.value.classroomId = "";
    }
  }
);

watch(
  () => editCourse.value.teacherUserId,
  (value) => {
    const selected = editTeacherOptions.value.find((item) => Number(item.id) === Number(value || 0));
    editCourse.value.teacherName = selected?.full_name || "";
  }
);

const fetchCourses = async () => {
  loading.value = true;
  errorText.value = "";
  try {
    const { data } = await http.get("/courses", {
      params: {
        keyword: keyword.value
      }
    });
    courses.value = data;
  } catch (error) {
    errorText.value = toChineseMessage(error.response?.data?.message, "加载课程失败");
  } finally {
    loading.value = false;
  }
};

const goClassroom = (id) => router.push(`/classroom/${id}`);

const liveRoomProviderText = (room) => {
  const provider = String(room?.provider || (room?.openmeetings_room_id ? "openmeetings" : "custom"));
  return provider === "openmeetings" ? "OpenMeetings" : "自定义链接";
};

const liveRoomMetaText = (room) => {
  const parts = [liveRoomProviderText(room)];
  if (room?.room_type) {
    parts.push(`类型：${room.room_type}`);
  }
  if (room?.openmeetings_room_id) {
    parts.push(`房间ID：${room.openmeetings_room_id}`);
  }
  return parts.join(" / ");
};

const copyText = async (value, key) => {
  const text = String(value || "").trim();
  if (!text) return;

  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "readonly");
      textarea.style.position = "absolute";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    copiedState.value = { key: String(key || ""), at: Date.now() };
  } catch (error) {
    errorText.value = "复制失败，请手动复制";
  }
};

const copiedRecently = (key) => {
  return copiedState.value.key === String(key || "") && Date.now() - Number(copiedState.value.at || 0) < 2000;
};

const openMeetingsDiagnosticsText = computed(() => {
  const lines = [
    `OpenMeetings状态：${openMeetingsHealth.value.ok ? "正常" : "异常"}`,
    `最近检测：${healthCheckedAtText.value || "-"}`,
    `检测耗时：${openMeetingsHealth.value.durationMs || 0}ms`,
    `连续失败：${openMeetingsHealth.value.failureCount || 0}次`,
    `最近成功：${healthLastSuccessAtText.value || "-"}`,
    `接口地址：${openMeetingsHealth.value.apiBaseUrl || "-"}`,
    `房间地址：${openMeetingsHealth.value.roomBaseUrl || "-"}`
  ];
  return lines.join("\n");
});

const healthCheckedAtText = computed(() => {
  if (!openMeetingsHealth.value.checkedAt) return "";
  const date = new Date(openMeetingsHealth.value.checkedAt);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", { hour12: false });
});

const healthLastSuccessAtText = computed(() => {
  if (!openMeetingsHealth.value.lastSuccessAt) return "";
  const date = new Date(openMeetingsHealth.value.lastSuccessAt);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", { hour12: false });
});

const showHealthAlert = computed(() => {
  return canCreateCourse && openMeetingsHealth.value.checked && !openMeetingsHealth.value.ok;
});

const showCriticalHealthAlert = computed(() => {
  return showHealthAlert.value && Number(openMeetingsHealth.value.failureCount || 0) >= 3;
});

const copyOpenMeetingsDiagnostics = async () => {
  await copyText(openMeetingsDiagnosticsText.value, "openmeetings-diagnostics");
};

const checkOpenMeetingsHealth = async () => {
  if (checkingOpenMeetings.value) return;
  checkingOpenMeetings.value = true;
  const startedAt = Date.now();
  try {
    const { data } = await http.get("/courses/openmeetings/health");
    const finishedAt = Date.now();
    openMeetingsHealth.value = {
      ...openMeetingsHealth.value,
      checked: true,
      ok: Boolean(data?.ok),
      message: data?.ok ? "连接成功，可直接创建 OpenMeetings 直播间" : "连接失败",
      checkedAt: new Date(finishedAt).toISOString(),
      durationMs: finishedAt - startedAt,
      failureCount: data?.ok ? 0 : Number(openMeetingsHealth.value.failureCount || 0),
      lastSuccessAt: data?.ok ? new Date(finishedAt).toISOString() : String(openMeetingsHealth.value.lastSuccessAt || ""),
      apiBaseUrl: String(data?.apiBaseUrl || ""),
      roomBaseUrl: String(data?.roomBaseUrl || "")
    };
  } catch (error) {
    const finishedAt = Date.now();
    const nextFailureCount = Number(openMeetingsHealth.value.failureCount || 0) + 1;
    openMeetingsHealth.value = {
      ...openMeetingsHealth.value,
      checked: true,
      ok: false,
      message: toChineseMessage(error.response?.data?.message, "检测 OpenMeetings 接口失败"),
      checkedAt: new Date(finishedAt).toISOString(),
      durationMs: finishedAt - startedAt,
      failureCount: nextFailureCount,
      apiBaseUrl: "",
      roomBaseUrl: ""
    };
  } finally {
    checkingOpenMeetings.value = false;
  }
};

const stopHealthPolling = () => {
  if (healthPollTimer) {
    clearInterval(healthPollTimer);
    healthPollTimer = null;
  }
};

const startHealthPolling = () => {
  if (healthPollTimer) return;
  healthPollTimer = setInterval(() => {
    if (!checkingOpenMeetings.value) {
      checkOpenMeetingsHealth();
    }
  }, 60 * 1000);
};

const fetchLiveRooms = async (courseId) => {
  try {
    const { data } = await http.get(`/courses/${courseId}/live-rooms`);
    liveRoomsByCourse.value = {
      ...liveRoomsByCourse.value,
      [courseId]: data
    };
    if (!selectedRoomIdByCourse.value[courseId] && data.length > 0) {
      selectedRoomIdByCourse.value[courseId] = data[0].id;
    }
  } catch (error) {
    errorText.value = toChineseMessage(error.response?.data?.message, "加载直播间失败");
  }
};

const resetLiveRoomForm = () => {
  liveRoomForm.value = {
    provider: "openmeetings",
    name: "",
    roomType: "conference",
    capacity: 25,
    comment: "",
    meetingUrl: ""
  };
};

const openLiveRoomDialog = (course) => {
  liveRoomDialog.value = {
    visible: true,
    courseId: Number(course.id || 0),
    courseTitle: String(course.title || "")
  };
  liveRoomForm.value = {
    provider: "openmeetings",
    name: `${course.title || "课程"}直播间`,
    roomType: "conference",
    capacity: 25,
    comment: course.subject ? `${course.subject} / ${course.teacher_name || ""}` : `${course.teacher_name || ""}`.trim(),
    meetingUrl: ""
  };
};

const closeLiveRoomDialog = () => {
  if (creatingRoom.value) return;
  liveRoomDialog.value = {
    visible: false,
    courseId: 0,
    courseTitle: ""
  };
  resetLiveRoomForm();
};

const createLiveRoom = async () => {
  const courseId = Number(liveRoomDialog.value.courseId || 0);
  if (!courseId) return;
  creatingRoom.value = true;
  try {
    await http.post(`/courses/${courseId}/live-rooms`, {
      provider: liveRoomForm.value.provider,
      name: liveRoomForm.value.name,
      roomType: liveRoomForm.value.roomType,
      capacity: Number(liveRoomForm.value.capacity || 25),
      comment: liveRoomForm.value.comment,
      meetingUrl: liveRoomForm.value.provider === "custom" ? liveRoomForm.value.meetingUrl : ""
    });
    await fetchLiveRooms(courseId);
    closeLiveRoomDialog();
  } catch (error) {
    errorText.value = toChineseMessage(error.response?.data?.message, "创建直播间失败");
  } finally {
    creatingRoom.value = false;
  }
};

const joinRoom = async (courseId) => {
  try {
    const roomId = selectedRoomIdByCourse.value[courseId] || "";
    const link = await http.get(`/classroom/${courseId}/join-link`, {
      params: roomId ? { roomId } : {}
    });
    window.open(link.data.joinUrl, "_blank");
  } catch (error) {
    errorText.value = toChineseMessage(error.response?.data?.message, "进入课堂失败");
  }
};

const enrollCourse = async (id) => {
  try {
    await http.post(`/courses/${id}/enroll`);
    await fetchCourses();
  } catch (error) {
    errorText.value = toChineseMessage(error.response?.data?.message, "报名失败");
  }
};

const purchaseCourse = async (id) => {
  try {
    if (user.role === "parent" && !purchaseStudentId.value) {
      errorText.value = toChineseMessage("Please select linked student", "请先选择购买学员");
      return;
    }

    const payload = user.role === "parent"
      ? { studentUserId: Number(purchaseStudentId.value || 0) }
      : {};
    await http.post(`/courses/${id}/purchase`, payload);
    await fetchCourses();
  } catch (error) {
    errorText.value = toChineseMessage(error.response?.data?.message, "购买课程失败");
  }
};

const deleteCourse = async (id) => {
  deletingId.value = id;
  errorText.value = "";
  try {
    await http.delete(`/courses/${id}`);
    await fetchCourses();
  } catch (error) {
    errorText.value = toChineseMessage(error.response?.data?.message, "删除课程失败");
  } finally {
    deletingId.value = 0;
  }
};

const createCourse = async () => {
  creating.value = true;
  createError.value = "";
  try {
    if (canSelectScope && !newCourse.value.organizationId) {
      createError.value = toChineseMessage("Please select organization", "请选择所属机构");
      return;
    }

    if (canSelectScope && !newCourse.value.districtId) {
      createError.value = toChineseMessage("Please select district", "请选择所属学区");
      return;
    }

    if (!newCourse.value.teacherUserId) {
      createError.value = toChineseMessage("Please select teacher", "请选择讲师");
      return;
    }

    await http.post("/courses", {
      ...newCourse.value,
      organizationId: canSelectScope ? (newCourse.value.organizationId || null) : null,
      districtId: canSelectScope ? (newCourse.value.districtId || null) : null,
      classroomId: canSelectScope ? (newCourse.value.classroomId || null) : null,
      teacherUserId: newCourse.value.teacherUserId || null,
      teacherName: newCourse.value.teacherName || "",
      priceCents: Number(newCourse.value.priceCents || 0),
      startTime: newCourse.value.startTime.replace("T", " ") + ":00",
      endTime: newCourse.value.endTime.replace("T", " ") + ":00"
    });
    newCourse.value = {
      organizationId: "",
      districtId: "",
      classroomId: "",
      title: "",
      subject: "",
      teacherUserId: "",
      teacherName: "",
      assistantName: "",
      priceCents: 0,
      startTime: "",
      endTime: ""
    };
    autoSelectSingleOrganization();
    await fetchCourses();
  } catch (error) {
    createError.value = toChineseMessage(error.response?.data?.message, "创建课程失败");
  } finally {
    creating.value = false;
  }
};

const openEditCourse = (course) => {
  editError.value = "";
  editingCourseId.value = Number(course.id || 0);

  let teacherUserId = course.teacher_user_id ? String(course.teacher_user_id) : "";
  if (!teacherUserId && course.teacher_name) {
    const matched = teachers.value.find((item) => item.full_name === course.teacher_name);
    if (matched) {
      teacherUserId = String(matched.id);
    }
  }

  editCourse.value = {
    organizationId: course.organization_id ? String(course.organization_id) : "",
    districtId: course.district_id ? String(course.district_id) : "",
    classroomId: course.classroom_id ? String(course.classroom_id) : "",
    title: course.title || "",
    subject: course.subject || "",
    teacherUserId,
    teacherName: course.teacher_name || "",
    assistantName: course.assistant_name || "",
    priceCents: Number(course.price_cents || 0),
    startTime: toDateTimeLocal(course.start_time),
    endTime: toDateTimeLocal(course.end_time),
    meetingUrl: course.meeting_url || ""
  };
};

const cancelEditCourse = () => {
  editingCourseId.value = 0;
  editError.value = "";
};

const updateCourse = async () => {
  if (!editingCourseId.value) return;
  updating.value = true;
  editError.value = "";
  try {
    if (canSelectScope && !editCourse.value.organizationId) {
      editError.value = toChineseMessage("Please select organization", "请选择所属机构");
      return;
    }

    if (canSelectScope && !editCourse.value.districtId) {
      editError.value = toChineseMessage("Please select district", "请选择所属学区");
      return;
    }

    if (!editCourse.value.teacherUserId) {
      editError.value = toChineseMessage("Please select teacher", "请选择讲师");
      return;
    }

    await http.put(`/courses/${editingCourseId.value}`, {
      ...editCourse.value,
      organizationId: canSelectScope ? (editCourse.value.organizationId || null) : null,
      districtId: canSelectScope ? (editCourse.value.districtId || null) : null,
      classroomId: canSelectScope ? (editCourse.value.classroomId || null) : null,
      teacherUserId: editCourse.value.teacherUserId || null,
      teacherName: editCourse.value.teacherName || "",
      meetingUrl: editCourse.value.meetingUrl || null,
      priceCents: Number(editCourse.value.priceCents || 0),
      startTime: editCourse.value.startTime.replace("T", " ") + ":00",
      endTime: editCourse.value.endTime.replace("T", " ") + ":00"
    });

    await fetchCourses();
    cancelEditCourse();
  } catch (error) {
    editError.value = toChineseMessage(error.response?.data?.message, "更新课程失败");
  } finally {
    updating.value = false;
  }
};

const logout = () => {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  router.push("/login");
};

onMounted(fetchCourses);
onMounted(async () => {
  await fetchProfile();
  await fetchTeachers();
  if (canCreateCourse) {
    await checkOpenMeetingsHealth();
    startHealthPolling();
  }
  if (canSelectScope) {
    await fetchOrganizations();
    await fetchDistricts();
    await fetchClassrooms();
  }
});

onBeforeUnmount(() => {
  stopHealthPolling();
});
</script>

<template>
  <main class="layout">
    <header class="header">
      <div>
        <h1>课程管理</h1>
        <p>{{ user.fullName }}（{{ roleText }}）</p>
      </div>
      <div class="header-actions">
        <button v-if="canOpenAdminCenter" class="secondary" @click="router.push('/admin')">管理中心</button>
        <button @click="logout">退出登录</button>
      </div>
    </header>

    <section v-if="showHealthAlert" :class="['status-alert', showCriticalHealthAlert ? 'critical' : 'warning']">
      <div class="status-alert-copy">
        <strong>{{ showCriticalHealthAlert ? 'OpenMeetings 连续故障' : 'OpenMeetings 接口异常' }}：</strong>
        <span>{{ openMeetingsHealth.message }}</span>
        <small v-if="showCriticalHealthAlert">建议立即检查 API 地址、账号密码和 OpenMeetings 服务状态。</small>
      </div>
      <button class="secondary mini" :disabled="checkingOpenMeetings" @click="checkOpenMeetingsHealth">
        {{ checkingOpenMeetings ? '检测中...' : '立即重试' }}
      </button>
    </section>

    <section class="panel" v-if="canCreateCourse">
      <h2>创建课程</h2>
      <form class="create-form" @submit.prevent="createCourse">
        <select v-if="canSelectScope" v-model="newCourse.organizationId" required>
          <option value="">选择所属机构</option>
          <option v-for="item in organizations" :key="item.id" :value="item.id">{{ item.name }}</option>
        </select>
        <select v-if="canSelectScope" v-model="newCourse.districtId" required>
          <option value="">选择所属学区</option>
          <option v-for="item in districtOptions" :key="item.id" :value="item.id">{{ item.name }}</option>
        </select>
        <select v-if="canSelectScope" v-model="newCourse.classroomId">
          <option value="">选择固定教室（可选）</option>
          <option v-for="item in classroomOptions" :key="item.id" :value="item.id">{{ item.name }} / {{ item.code }}</option>
        </select>
        <input v-model="newCourse.title" placeholder="课程标题" required />
        <input v-model="newCourse.subject" placeholder="学科" />
        <select v-model="newCourse.teacherUserId" required>
          <option value="">选择讲师</option>
          <option v-for="item in teacherOptions" :key="item.id" :value="item.id">{{ item.full_name }} / {{ item.email || '无邮箱' }}</option>
        </select>
        <input v-model="newCourse.assistantName" placeholder="固定教室助教（可选）" />
        <input v-model="newCourse.priceCents" type="number" min="0" placeholder="课程价格（分）" />
        <input v-model="newCourse.startTime" type="datetime-local" required />
        <input v-model="newCourse.endTime" type="datetime-local" required />
        <button type="submit" :disabled="creating">
          {{ creating ? "创建中..." : "创建课程" }}
        </button>
      </form>
      <p class="hint">课程创建后可直接通过 OpenMeetings 9.0 接口新增直播间；若暂未接通，也可切换为自定义链接。</p>
      <p v-if="createError" class="error">{{ createError }}</p>
    </section>

    <section class="panel" v-if="canCreateCourse">
      <h2>OpenMeetings 接口状态</h2>
      <p :class="openMeetingsHealth.ok ? 'success' : 'error'">{{ openMeetingsHealth.message }}</p>
      <p v-if="openMeetingsHealth.checked" class="health-meta">
        最近检测：{{ healthCheckedAtText || '-' }} / 耗时：{{ openMeetingsHealth.durationMs || 0 }}ms
      </p>
      <p v-if="openMeetingsHealth.failureCount > 0" class="health-meta warning-text">
        连续失败：{{ openMeetingsHealth.failureCount }} 次
      </p>
      <p v-if="healthLastSuccessAtText" class="health-meta">
        最近成功：{{ healthLastSuccessAtText }}
      </p>
      <p v-if="openMeetingsHealth.apiBaseUrl" class="health-meta">接口地址：{{ openMeetingsHealth.apiBaseUrl }}</p>
      <p v-if="openMeetingsHealth.roomBaseUrl" class="health-meta">房间地址：{{ openMeetingsHealth.roomBaseUrl }}</p>
      <div class="health-actions">
        <button class="secondary" :disabled="checkingOpenMeetings" @click="checkOpenMeetingsHealth">
          {{ checkingOpenMeetings ? '检测中...' : '重新检测' }}
        </button>
        <button class="secondary" @click="copyOpenMeetingsDiagnostics">复制诊断信息</button>
      </div>
    </section>

    <section class="panel" v-if="canCreateCourse && editingCourseId">
      <h2>编辑课程 #{{ editingCourseId }}</h2>
      <form class="create-form" @submit.prevent="updateCourse">
        <select v-if="canSelectScope" v-model="editCourse.organizationId" required>
          <option value="">选择所属机构</option>
          <option v-for="item in organizations" :key="item.id" :value="item.id">{{ item.name }}</option>
        </select>
        <select v-if="canSelectScope" v-model="editCourse.districtId" required>
          <option value="">选择所属学区</option>
          <option v-for="item in editDistrictOptions" :key="item.id" :value="item.id">{{ item.name }}</option>
        </select>
        <select v-if="canSelectScope" v-model="editCourse.classroomId">
          <option value="">选择固定教室（可选）</option>
          <option v-for="item in editClassroomOptions" :key="item.id" :value="item.id">{{ item.name }} / {{ item.code }}</option>
        </select>
        <input v-model="editCourse.title" placeholder="课程标题" required />
        <input v-model="editCourse.subject" placeholder="学科" />
        <select v-model="editCourse.teacherUserId" required>
          <option value="">选择讲师</option>
          <option v-for="item in editTeacherOptions" :key="item.id" :value="item.id">{{ item.full_name }} / {{ item.email || '无邮箱' }}</option>
        </select>
        <input v-model="editCourse.assistantName" placeholder="固定教室助教（可选）" />
        <input v-model="editCourse.priceCents" type="number" min="0" placeholder="课程价格（分）" />
        <input v-model="editCourse.meetingUrl" placeholder="课堂链接（可选）" />
        <input v-model="editCourse.startTime" type="datetime-local" required />
        <input v-model="editCourse.endTime" type="datetime-local" required />
        <button type="submit" :disabled="updating">
          {{ updating ? "保存中..." : "保存修改" }}
        </button>
        <button type="button" class="secondary" @click="cancelEditCourse">取消编辑</button>
      </form>
      <p v-if="editError" class="error">{{ editError }}</p>
    </section>

    <section class="panel">
      <h2>课程列表</h2>
      <div class="toolbar">
        <input v-model="keyword" placeholder="搜索课程标题或学科" />
        <button @click="fetchCourses">搜索</button>
      </div>
      <div v-if="isParent" class="toolbar">
        <select v-model="purchaseStudentId">
          <option value="">请选择购买学员</option>
          <option v-for="item in me.linkedStudents || []" :key="item.student_user_id" :value="item.student_user_id">
            {{ item.student_name }} / {{ item.student_email }}
          </option>
        </select>
      </div>
      <p v-if="loading">课程加载中...</p>
      <p v-else-if="errorText" class="error">{{ errorText }}</p>
      <ul v-else class="course-list">
        <li v-for="course in courses" :key="course.id">
          <div>
            <strong>{{ course.title }}</strong>
            <p>{{ course.teacher_name }} | {{ course.subject || "通用" }}</p>
            <p v-if="course.classroom_id">固定教室：{{ course.classroom_name || '已绑定教室' }}（{{ course.classroom_code || '-' }}）</p>
            <p v-if="course.assistant_name">助教：{{ course.assistant_name }}</p>
            <p>价格：{{ (course.price_cents || 0) / 100 }} 元</p>
            <small>{{ course.start_time }} - {{ course.end_time }}</small>
            <small v-if="isStudent">{{ course.enrolled ? "已报名" : "未报名" }}</small>
          </div>
          <div class="actions">
            <button @click="goClassroom(course.id)">进入课堂</button>
            <button v-if="(user.role === 'student' || user.role === 'parent') && !course.enrolled" @click="purchaseCourse(course.id)">购买课程</button>
            <button v-if="isStudent && !course.enrolled" @click="enrollCourse(course.id)">报名</button>
            <button v-if="canCreateCourse" @click="openEditCourse(course)">编辑</button>
            <button @click="fetchLiveRooms(course.id)">查看直播间</button>
            <button v-if="canCreateCourse" @click="openLiveRoomDialog(course)">新增直播间</button>
            <button @click="joinRoom(course.id)">进入直播间</button>
            <button
              v-if="canCreateCourse"
              :disabled="deletingId === course.id"
              @click="deleteCourse(course.id)"
            >
              {{ deletingId === course.id ? "删除中..." : "删除" }}
            </button>
          </div>
          <div v-if="liveRoomsByCourse[course.id]?.length" class="room-list">
            <strong>直播间列表</strong>
            <div v-for="room in liveRoomsByCourse[course.id]" :key="room.id" class="room-item">
              <label class="room-info">
                <input type="radio" :name="`room-${course.id}`" :value="room.id" v-model="selectedRoomIdByCourse[course.id]" />
                <span>{{ room.name }}</span>
                <small>{{ liveRoomMetaText(room) }}</small>
              </label>
              <div class="room-actions">
                <a :href="room.meeting_url" target="_blank">打开链接</a>
                <button type="button" class="secondary mini" @click="copyText(room.meeting_url, `room-link-${room.id}`)">
                  {{ copiedRecently(`room-link-${room.id}`) ? '已复制' : '复制链接' }}
                </button>
                <button
                  v-if="room.openmeetings_room_id"
                  type="button"
                  class="secondary mini"
                  @click="copyText(room.openmeetings_room_id, `room-id-${room.id}`)"
                >
                  {{ copiedRecently(`room-id-${room.id}`) ? '已复制' : '复制房间ID' }}
                </button>
              </div>
            </div>
          </div>
        </li>
      </ul>
    </section>

    <ConfirmDialog
      :visible="liveRoomDialog.visible"
      :title="`新增直播间 · ${liveRoomDialog.courseTitle || '课程'}`"
      :message="liveRoomForm.provider === 'openmeetings' ? '将直接调用 OpenMeetings 9.0 接口创建房间，并自动生成可进入链接。' : '使用已有直播间链接作为课程直播入口。'"
      :confirm-text="creatingRoom ? '创建中...' : '创建直播间'"
      :pending="creatingRoom"
      @cancel="closeLiveRoomDialog"
      @confirm="createLiveRoom"
    >
      <template #default>
        <form class="live-room-form" @submit.prevent="createLiveRoom">
          <label>
            接入方式
            <select v-model="liveRoomForm.provider">
              <option value="openmeetings">OpenMeetings 9.0</option>
              <option value="custom">自定义链接</option>
            </select>
          </label>
          <label>
            直播间名称
            <input v-model="liveRoomForm.name" placeholder="例如：PLC1 正课直播间" required />
          </label>
          <label v-if="liveRoomForm.provider === 'openmeetings'">
            房间类型
            <select v-model="liveRoomForm.roomType">
              <option value="conference">会议室</option>
              <option value="presentation">演示室</option>
              <option value="interview">面试室</option>
            </select>
          </label>
          <label v-if="liveRoomForm.provider === 'openmeetings'">
            容量上限
            <input v-model="liveRoomForm.capacity" type="number" min="1" max="200" />
          </label>
          <label v-if="liveRoomForm.provider === 'openmeetings'">
            房间备注
            <input v-model="liveRoomForm.comment" placeholder="用于在 OpenMeetings 后台区分课程" />
          </label>
          <label v-else>
            直播间链接
            <input v-model="liveRoomForm.meetingUrl" placeholder="https://..." required />
          </label>
        </form>
      </template>
    </ConfirmDialog>
  </main>
</template>

<style scoped>
.layout {
  max-width: 960px;
  margin: 0 auto;
  padding: 24px;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 18px;
}

.header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.panel {
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 14px;
}

.status-alert {
  border-radius: 10px;
  padding: 10px 12px;
  margin-bottom: 14px;
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
}

.status-alert.warning {
  background: #fff7ed;
  color: #9a3412;
  border: 1px solid #fed7aa;
}

.status-alert.critical {
  background: #fef2f2;
  color: #991b1b;
  border: 1px solid #fca5a5;
}

.status-alert-copy {
  display: grid;
  gap: 4px;
}

.status-alert-copy small {
  color: inherit;
  opacity: 0.86;
}

.create-form {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 10px;
  margin-bottom: 8px;
}

input {
  font: inherit;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 8px 10px;
}

select {
  font: inherit;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 8px 10px;
}

.course-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 10px;
}

.course-list li {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}

.actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.room-list {
  margin-top: 10px;
  border-top: 1px dashed #e5e7eb;
  padding-top: 10px;
}

.room-item {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-top: 8px;
  align-items: flex-start;
}

.room-info {
  display: grid;
  gap: 4px;
}

.room-info small {
  color: #64748b;
}

.room-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
}

button {
  font: inherit;
  border: none;
  background: #0f766e;
  color: #fff;
  border-radius: 8px;
  padding: 8px 14px;
  cursor: pointer;
}

.secondary {
  background: #374151;
}

.mini {
  padding: 6px 10px;
  font-size: 12px;
}

.error {
  color: #b91c1c;
}

.success {
  color: #166534;
}

.hint {
  color: #475569;
}

.health-meta {
  color: #64748b;
  margin: 4px 0;
}

.health-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.warning-text {
  color: #9a3412;
}

.live-room-form {
  display: grid;
  gap: 10px;
}

.live-room-form label {
  display: grid;
  gap: 6px;
  color: #334155;
}
</style>
