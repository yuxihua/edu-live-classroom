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
    errorText.value = "Failed to load classroom";
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
    errorText.value = error.response?.data?.message || "Failed to add replay";
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
    <h1>Classroom</h1>
    <p v-if="errorText" class="error">{{ errorText }}</p>

    <section v-if="course" class="card">
      <h2>{{ course.title }}</h2>
      <p>Teacher: {{ course.teacher_name }}</p>
      <p>Schedule: {{ course.start_time }} - {{ course.end_time }}</p>
      <a v-if="joinUrl" :href="joinUrl" target="_blank">Open Meeting</a>
      <button @click="checkOut">Leave classroom</button>

      <div class="replay-box">
        <h3>Replays</h3>
        <ul v-if="replays.length > 0" class="replay-list">
          <li v-for="item in replays" :key="item.id">
            <a :href="item.replay_url" target="_blank">{{ item.title }}</a>
            <small>{{ item.duration_seconds || 0 }}s</small>
          </li>
        </ul>
        <p v-else>No replay yet</p>

        <form v-if="canManageReplay" class="replay-form" @submit.prevent="addReplay">
          <input v-model="replayForm.title" placeholder="Replay title" required />
          <input v-model="replayForm.replayUrl" placeholder="Replay URL" required />
          <input v-model="replayForm.durationSeconds" placeholder="Duration seconds" type="number" min="1" />
          <button type="submit" :disabled="addingReplay">
            {{ addingReplay ? "Saving..." : "Add Replay" }}
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
