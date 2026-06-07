<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import http from "../api/http.js";

const route = useRoute();
const course = ref(null);
const liveRooms = ref([]);
const selectedRoomId = ref(0);
const profile = ref({});
const errorText = ref("");
const joinUrl = ref("");
const copiedState = ref({ key: "", at: 0 });
const replays = ref([]);
const addingReplay = ref(false);
const creatingRoom = ref(false);
const purchasing = ref(false);
const replayForm = ref({
  title: "",
  replayUrl: "",
  durationSeconds: ""
});
const roomForm = ref({
  provider: "openmeetings",
  name: "",
  roomType: "conference",
  capacity: 25,
  comment: "",
  meetingUrl: ""
});
const purchaseStudentId = ref("");

const user = JSON.parse(localStorage.getItem("user") || "{}");
const canManageReplay = ["admin", "org_admin", "district_admin", "teacher"].includes(user.role);
const canManageRoom = ["admin", "org_admin", "district_admin", "teacher"].includes(user.role);
const canPurchase = ["student", "parent"].includes(user.role);

const messageMap = {
  "Failed to load classroom": "加载课堂失败",
  "Failed to add replay": "添加回放失败",
  "Failed to fetch live rooms": "加载直播间失败",
  "Failed to create live room": "创建直播间失败",
  "OPENMEETINGS_API_BASE_URL is not configured": "未配置 OpenMeetings 接口地址",
  "OPENMEETINGS_API_USER is not configured": "未配置 OpenMeetings 接口账号",
  "OPENMEETINGS_API_PASS is not configured": "未配置 OpenMeetings 接口密码",
  "meetingUrl is required when provider is custom": "选择自定义链接时必须填写直播间链接",
  "name is required": "请填写直播间名称",
  "Failed to purchase course": "购买课程失败",
  "No permission to view replays": "没有权限查看回放",
  "Student must enroll before viewing replays": "学员需先报名才能查看回放",
  "Only students or parents can purchase": "仅学员或家长可以购买课程",
  "studentUserId is required": "家长购买时必须选择学员",
  "Parent not linked to this student": "家长未绑定该学员",
  "No permission to join this classroom": "当前账号还不能进入课堂，请先购买课程或联系管理员授权",
  "Live room not found": "直播间不存在",
  "Meeting URL not configured": "未配置直播链接"
};

const toChineseMessage = (message, fallback) => {
  if (!message) {
    return fallback;
  }
  return messageMap[message] || message;
};

const courseId = computed(() => Number(route.params.id));

const liveRoomMetaText = (room) => {
  const provider = String(room?.provider || (room?.openmeetings_room_id ? "openmeetings" : "custom"));
  const providerText = provider === "openmeetings" ? "OpenMeetings" : "自定义链接";
  const parts = [providerText];
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

const fetchCourse = async () => {
  try {
    const { data } = await http.get("/courses");
    course.value = data.find((item) => item.id === courseId.value) || null;
    await fetchLiveRooms();
    await updateJoinUrl();
  } catch (error) {
    errorText.value = toChineseMessage(error.response?.data?.message, "加载课堂失败");
  }
};

const fetchProfile = async () => {
  const { data } = await http.get("/auth/me");
  profile.value = data;
  if (data.role === "parent" && data.linkedStudents?.length) {
    purchaseStudentId.value = String(data.linkedStudents[0].student_user_id);
  }
};

const fetchLiveRooms = async () => {
  try {
    const { data } = await http.get(`/courses/${courseId.value}/live-rooms`);
    liveRooms.value = data;
    if (data.length > 0 && !selectedRoomId.value) {
      selectedRoomId.value = data[0].id;
    }
  } catch (error) {
    liveRooms.value = [];
  }
};

const updateJoinUrl = async () => {
  try {
    const params = selectedRoomId.value ? { roomId: selectedRoomId.value } : {};
    const linkData = await http.get(`/classroom/${courseId.value}/join-link`, { params });
    joinUrl.value = linkData.data.joinUrl;
  } catch (error) {
    joinUrl.value = "";
    errorText.value = toChineseMessage(error.response?.data?.message, "进入课堂失败");
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
  try {
    await http.post("/attendance/check-in", { courseId: courseId.value });
  } catch (error) {
    // Ignore check-in failures before purchase/authorization.
  }
};

const checkOut = async () => {
  try {
    await http.post("/attendance/check-out", { courseId: courseId.value });
  } catch (error) {
    // Ignore checkout failures for users that never checked in.
  }
};

const purchaseCourse = async () => {
  purchasing.value = true;
  try {
    const payload = user.role === "parent" ? { studentUserId: Number(purchaseStudentId.value || 0) } : {};
    await http.post(`/courses/${courseId.value}/purchase`, payload);
    await fetchCourse();
    if (joinUrl.value) {
      await checkIn();
    }
  } catch (error) {
    errorText.value = toChineseMessage(error.response?.data?.message, "购买课程失败");
  } finally {
    purchasing.value = false;
  }
};

const createLiveRoom = async () => {
  creatingRoom.value = true;
  try {
    await http.post(`/courses/${courseId.value}/live-rooms`, {
      provider: roomForm.value.provider,
      name: roomForm.value.name,
      roomType: roomForm.value.roomType,
      capacity: Number(roomForm.value.capacity || 25),
      comment: roomForm.value.comment,
      meetingUrl: roomForm.value.provider === "custom" ? roomForm.value.meetingUrl : ""
    });
    roomForm.value = {
      provider: "openmeetings",
      name: "",
      roomType: "conference",
      capacity: 25,
      comment: "",
      meetingUrl: ""
    };
    await fetchLiveRooms();
    await updateJoinUrl();
  } catch (error) {
    errorText.value = toChineseMessage(error.response?.data?.message, "创建直播间失败");
  } finally {
    creatingRoom.value = false;
  }
};

const switchRoom = async () => {
  await updateJoinUrl();
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
  await fetchProfile();
  await fetchCourse();
  if (joinUrl.value) {
    await checkIn();
  }
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
      <p v-if="course.price_cents">价格：{{ (course.price_cents || 0) / 100 }} 元</p>
      <div v-if="canPurchase && !course.enrolled" class="purchase-box">
        <select v-if="user.role === 'parent'" v-model="purchaseStudentId">
          <option value="">选择要购买的学员</option>
          <option v-for="item in profile.linkedStudents || []" :key="item.student_user_id" :value="item.student_user_id">
            {{ item.student_name }} / {{ item.student_email }}
          </option>
        </select>
        <button @click="purchaseCourse" :disabled="purchasing">{{ purchasing ? '购买中...' : '购买课程' }}</button>
      </div>
      <div class="room-switcher" v-if="liveRooms.length > 0">
        <h3>直播间</h3>
        <div v-for="room in liveRooms" :key="room.id" class="room-choice-wrap">
          <label class="room-choice">
            <input type="radio" :value="room.id" v-model="selectedRoomId" @change="switchRoom" />
            <span class="room-choice-main">{{ room.name }}</span>
            <small class="room-choice-meta">{{ liveRoomMetaText(room) }}</small>
          </label>
          <div class="room-choice-actions">
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
      <a v-if="joinUrl" :href="joinUrl" target="_blank">打开直播间</a>
      <button v-if="joinUrl" type="button" class="secondary mini" @click="copyText(joinUrl, 'join-url')">
        {{ copiedRecently('join-url') ? '已复制' : '复制进入链接' }}
      </button>
      <button @click="checkOut">离开课堂</button>

      <div v-if="canManageRoom" class="room-form-box">
        <h3>新增直播间</h3>
        <form class="replay-form" @submit.prevent="createLiveRoom">
          <select v-model="roomForm.provider">
            <option value="openmeetings">OpenMeetings 9.0</option>
            <option value="custom">自定义链接</option>
          </select>
          <input v-model="roomForm.name" placeholder="直播间名称" required />
          <template v-if="roomForm.provider === 'openmeetings'">
            <select v-model="roomForm.roomType">
              <option value="conference">会议室</option>
              <option value="presentation">演示室</option>
              <option value="interview">面试室</option>
            </select>
            <input v-model="roomForm.capacity" type="number" min="1" max="200" placeholder="房间容量（默认25）" />
            <input v-model="roomForm.comment" placeholder="房间备注（可选）" />
          </template>
          <input v-else v-model="roomForm.meetingUrl" placeholder="直播间链接" required />
          <button type="submit" :disabled="creatingRoom">{{ creatingRoom ? '创建中...' : '创建直播间' }}</button>
        </form>
      </div>

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

.purchase-box,
.room-switcher,
.room-form-box {
  margin-top: 12px;
  display: grid;
  gap: 8px;
}

.room-choice {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.room-choice-wrap {
  display: grid;
  gap: 6px;
}

.room-choice-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
}

.room-choice-main {
  color: #0f172a;
}

.room-choice-meta {
  color: #64748b;
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

select {
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

.secondary {
  background: #475569;
}

.mini {
  margin-top: 0;
  padding: 6px 10px;
  font-size: 12px;
}

.error {
  color: #b91c1c;
}
</style>
