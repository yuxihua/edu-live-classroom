<script setup>
import { ref } from "vue";
import { useRouter } from "vue-router";
import http from "../api/http.js";

const router = useRouter();
const email = ref("admin@example.com");
const password = ref("Passw0rd!");
const loading = ref(false);
const errorText = ref("");

const messageMap = {
  "Invalid credentials": "账号或密码错误",
  "Email and password required": "请输入邮箱和密码",
  "Login failed": "登录失败"
};

const toChineseMessage = (message, fallback) => {
  if (!message) {
    return fallback;
  }
  return messageMap[message] || message;
};

const login = async () => {
  loading.value = true;
  errorText.value = "";
  try {
    const { data } = await http.post("/auth/login", {
      email: email.value,
      password: password.value
    });
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));
    router.push("/dashboard");
  } catch (error) {
    errorText.value = toChineseMessage(error.response?.data?.message, "登录失败");
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <main class="page">
    <section class="card">
      <h1>教培直播课堂登录</h1>
      <p>请使用教师或学员账号登录。</p>
      <form @submit.prevent="login" class="form">
        <input v-model="email" type="email" placeholder="邮箱" required />
        <input v-model="password" type="password" placeholder="密码" required />
        <button type="submit" :disabled="loading">{{ loading ? "登录中..." : "登录" }}</button>
        <p class="error" v-if="errorText">{{ errorText }}</p>
      </form>
    </section>
  </main>
</template>

<style scoped>
.page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: linear-gradient(160deg, #dbeafe, #f0fdf4);
}

.card {
  width: min(92vw, 380px);
  background: #fff;
  border-radius: 14px;
  padding: 24px;
  box-shadow: 0 14px 30px rgba(0, 0, 0, 0.08);
}

.form {
  display: grid;
  gap: 10px;
}

input,
button {
  font: inherit;
  padding: 10px;
  border-radius: 8px;
  border: 1px solid #d1d5db;
}

button {
  background: #111827;
  color: #fff;
  cursor: pointer;
}

.error {
  color: #b91c1c;
  margin: 0;
}
</style>
