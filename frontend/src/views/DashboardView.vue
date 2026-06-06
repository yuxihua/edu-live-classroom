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
    errorText.value = error.response?.data?.message || "Failed to load courses";
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
    errorText.value = error.response?.data?.message || "Failed to enroll";
  }
};

const deleteCourse = async (id) => {
  deletingId.value = id;
  errorText.value = "";
  try {
    await http.delete(`/courses/${id}`);
    await fetchCourses();
  } catch (error) {
    errorText.value = error.response?.data?.message || "Failed to delete course";
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
    createError.value = error.response?.data?.message || "Failed to create course";
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
        <h1>Course Dashboard</h1>
        <p>{{ user.fullName }} ({{ user.role }})</p>
      </div>
      <button @click="logout">Logout</button>
    </header>

    <section class="panel" v-if="canCreateCourse">
      <h2>Create Course</h2>
      <form class="create-form" @submit.prevent="createCourse">
        <input v-model="newCourse.title" placeholder="Course title" required />
        <input v-model="newCourse.subject" placeholder="Subject" />
        <input v-model="newCourse.teacherName" placeholder="Teacher name" required />
        <input v-model="newCourse.startTime" type="datetime-local" required />
        <input v-model="newCourse.endTime" type="datetime-local" required />
        <input v-model="newCourse.meetingUrl" placeholder="OpenMeetings URL" />
        <button type="submit" :disabled="creating">
          {{ creating ? "Creating..." : "Create course" }}
        </button>
      </form>
      <p v-if="createError" class="error">{{ createError }}</p>
    </section>

    <section class="panel">
      <h2>Course List</h2>
      <div class="toolbar">
        <input v-model="keyword" placeholder="Search title or subject" />
        <button @click="fetchCourses">Search</button>
      </div>
      <p v-if="loading">Loading courses...</p>
      <p v-else-if="errorText" class="error">{{ errorText }}</p>
      <ul v-else class="course-list">
        <li v-for="course in courses" :key="course.id">
          <div>
            <strong>{{ course.title }}</strong>
            <p>{{ course.teacher_name }} | {{ course.subject || "General" }}</p>
            <small>{{ course.start_time }} - {{ course.end_time }}</small>
            <small v-if="isStudent">{{ course.enrolled ? "Enrolled" : "Not enrolled" }}</small>
          </div>
          <div class="actions">
            <button @click="goClassroom(course.id)">Enter</button>
            <button v-if="isStudent && !course.enrolled" @click="enrollCourse(course.id)">Enroll</button>
            <button
              v-if="canCreateCourse"
              :disabled="deletingId === course.id"
              @click="deleteCourse(course.id)"
            >
              {{ deletingId === course.id ? "Deleting..." : "Delete" }}
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
