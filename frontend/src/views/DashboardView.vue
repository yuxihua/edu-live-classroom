<script setup>
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import http from "../api/http.js";

const router = useRouter();
const courses = ref([]);
const loading = ref(false);
const errorText = ref("");
const keyword = ref("");
const creating = ref(false);
const createError = ref("");
const newCourse = ref({
  title: "",
  subject: "",
  teacherName: "",
  startTime: "",
  endTime: "",
  meetingUrl: ""
});

const user = JSON.parse(localStorage.getItem("user") || "{}");
const canCreateCourse = ["admin", "teacher"].includes(user.role);
const isStudent = user.role === "student";
const deletingId = ref(0);

const roleLabelMap = {
  admin: "管理员",
  teacher: "讲师",
  student: "学员"
};

const messageMap = {
  "Failed to load courses": "加载课程失败",
  "Failed to enroll": "报名失败",
  "Failed to delete course": "删除课程失败",
  "Failed to create course": "创建课程失败",
  "Only admin or teacher can create course": "仅管理员或讲师可以创建课程",
  "Only students can enroll": "仅学员可以报名",
  "Invalid courseId": "课程编号无效"
};

const toChineseMessage = (message, fallback) => {
  if (!message) {
    return fallback;
  }
  return messageMap[message] || message;
};

const roleText = roleLabelMap[user.role] || user.role || "未知角色";

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

const enrollCourse = async (id) => {
  try {
    await http.post(`/courses/${id}/enroll`);
    await fetchCourses();
  } catch (error) {
    errorText.value = toChineseMessage(error.response?.data?.message, "报名失败");
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
    await http.post("/courses", {
      ...newCourse.value,
      startTime: newCourse.value.startTime.replace("T", " ") + ":00",
      endTime: newCourse.value.endTime.replace("T", " ") + ":00"
    });
    newCourse.value = {
      title: "",
      subject: "",
      teacherName: "",
      startTime: "",
      endTime: "",
      meetingUrl: ""
    };
    await fetchCourses();
  } catch (error) {
    createError.value = toChineseMessage(error.response?.data?.message, "创建课程失败");
  } finally {
    creating.value = false;
  }
};

const logout = () => {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  router.push("/login");
};

onMounted(fetchCourses);
</script>

<template>
  <main class="layout">
    <header class="header">
      <div>
        <h1>课程管理</h1>
        <p>{{ user.fullName }}（{{ roleText }}）</p>
      </div>
      <button @click="logout">退出登录</button>
    </header>

    <section class="panel" v-if="canCreateCourse">
      <h2>创建课程</h2>
      <form class="create-form" @submit.prevent="createCourse">
        <input v-model="newCourse.title" placeholder="课程标题" required />
        <input v-model="newCourse.subject" placeholder="学科" />
        <input v-model="newCourse.teacherName" placeholder="讲师姓名" required />
        <input v-model="newCourse.startTime" type="datetime-local" required />
        <input v-model="newCourse.endTime" type="datetime-local" required />
        <input v-model="newCourse.meetingUrl" placeholder="OpenMeetings 链接" />
        <button type="submit" :disabled="creating">
          {{ creating ? "创建中..." : "创建课程" }}
        </button>
      </form>
      <p v-if="createError" class="error">{{ createError }}</p>
    </section>

    <section class="panel">
      <h2>课程列表</h2>
      <div class="toolbar">
        <input v-model="keyword" placeholder="搜索课程标题或学科" />
        <button @click="fetchCourses">搜索</button>
      </div>
      <p v-if="loading">课程加载中...</p>
      <p v-else-if="errorText" class="error">{{ errorText }}</p>
      <ul v-else class="course-list">
        <li v-for="course in courses" :key="course.id">
          <div>
            <strong>{{ course.title }}</strong>
            <p>{{ course.teacher_name }} | {{ course.subject || "通用" }}</p>
            <small>{{ course.start_time }} - {{ course.end_time }}</small>
            <small v-if="isStudent">{{ course.enrolled ? "已报名" : "未报名" }}</small>
          </div>
          <div class="actions">
            <button @click="goClassroom(course.id)">进入课堂</button>
            <button v-if="isStudent && !course.enrolled" @click="enrollCourse(course.id)">报名</button>
            <button
              v-if="canCreateCourse"
              :disabled="deletingId === course.id"
              @click="deleteCourse(course.id)"
            >
              {{ deletingId === course.id ? "删除中..." : "删除" }}
            </button>
          </div>
        </li>
      </ul>
    </section>
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

.panel {
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 14px;
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

.error {
  color: #b91c1c;
}
</style>
