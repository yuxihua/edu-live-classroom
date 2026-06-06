<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import http from "../api/http.js";

const route = useRoute();
const course = ref(null);
const errorText = ref("");
const joinUrl = ref("");
const replays = ref([]);
const addingReplay = ref(false);
const replayForm = ref({
  title: "",
  replayUrl: "",
  durationSeconds: ""
});

const user = JSON.parse(localStorage.getItem("user") || "{}");
const canManageReplay = ["admin", "teacher"].includes(user.role);

const messageMap = {
  "Failed to load classroom": "加载课堂失败",
  "Failed to add replay": "添加回放失败",
  "No permission to view replays": "没有权限查看回放",
  "Student must enroll before viewing replays": "学员需先报名才能查看回放",
  "Meeting URL not configured": "未配置直播链接"
};

const toChineseMessage = (message, fallback) => {
  if (!message) {
    return fallback;
  }
  return messageMap[message] || message;
};

const courseId = computed(() => Number(route.params.id));

const fetchCourse = async () => {
  try {
    const { data } = await http.get("/courses");
    course.value = data.find((item) => item.id === courseId.value) || null;
    if (course.value?.meeting_url) {
      const linkData = await http.get(`/classroom/${courseId.value}/join-link`);
      joinUrl.value = linkData.data.joinUrl;
    }
  } catch (error) {
    errorText.value = toChineseMessage(error.response?.data?.message, "加载课堂失败");
  }
};

const fetchReplays = async () => {
  try {
    const { data } = await http.get(`/courses/${courseId.value}/replays`);
    replays.value = data;
  } catch (error) {
    replays.value = [];
  }
};

const checkIn = async () => {
  await http.post("/attendance/check-in", { courseId: courseId.value });
};

const checkOut = async () => {
  await http.post("/attendance/check-out", { courseId: courseId.value });
};

const addReplay = async () => {
  addingReplay.value = true;
  try {
    await http.post(`/courses/${courseId.value}/replays`, {
      title: replayForm.value.title,
      replayUrl: replayForm.value.replayUrl,
      durationSeconds: replayForm.value.durationSeconds
        ? Number(replayForm.value.durationSeconds)
        : null
    });
    replayForm.value = {
      title: "",
      replayUrl: "",
      durationSeconds: ""
    };
    await fetchReplays();
  } catch (error) {
    errorText.value = toChineseMessage(error.response?.data?.message, "添加回放失败");
  } finally {
    addingReplay.value = false;
  }
};

onMounted(async () => {
  await fetchCourse();
  await checkIn();
  await fetchReplays();
});
</script>

<template>
  <main class="room">
    <h1>课堂</h1>
    <p v-if="errorText" class="error">{{ errorText }}</p>

    <section v-if="course" class="card">
      <h2>{{ course.title }}</h2>
      <p>讲师：{{ course.teacher_name }}</p>
      <p>时间：{{ course.start_time }} - {{ course.end_time }}</p>
      <a v-if="joinUrl" :href="joinUrl" target="_blank">打开直播间</a>
      <button @click="checkOut">离开课堂</button>

      <div class="replay-box">
        <h3>课程回放</h3>
        <ul v-if="replays.length > 0" class="replay-list">
          <li v-for="item in replays" :key="item.id">
            <a :href="item.replay_url" target="_blank">{{ item.title }}</a>
            <small>{{ item.duration_seconds || 0 }} 秒</small>
          </li>
        </ul>
        <p v-else>暂无回放</p>

        <form v-if="canManageReplay" class="replay-form" @submit.prevent="addReplay">
          <input v-model="replayForm.title" placeholder="回放标题" required />
          <input v-model="replayForm.replayUrl" placeholder="回放链接" required />
          <input v-model="replayForm.durationSeconds" placeholder="时长（秒）" type="number" min="1" />
          <button type="submit" :disabled="addingReplay">
            {{ addingReplay ? "保存中..." : "添加回放" }}
          </button>
        </form>
      </div>
    </section>
  </main>
</template>

<style scoped>
.room {
  max-width: 840px;
  margin: 0 auto;
  padding: 24px;
}

.card {
  background: #fff;
  border-radius: 12px;
  padding: 18px;
}

.replay-box {
  margin-top: 16px;
  border-top: 1px solid #e5e7eb;
  padding-top: 12px;
}

.replay-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}

.replay-list li {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.replay-form {
  display: grid;
  gap: 8px;
  margin-top: 10px;
}

input {
  font: inherit;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 8px 10px;
}

button {
  margin-top: 12px;
  border: none;
  padding: 10px 16px;
  background: #1d4ed8;
  color: #fff;
  border-radius: 8px;
  cursor: pointer;
}

.error {
  color: #b91c1c;
}
</style>
