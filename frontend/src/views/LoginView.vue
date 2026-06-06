<script setup>
import { ref } from "vue";
import { useRouter } from "vue-router";
import http from "../api/http.js";

const router = useRouter();
const email = ref("admin@example.com");
const password = ref("Passw0rd!");
const loading = ref(false);
const errorText = ref("");

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
    errorText.value = error.response?.data?.message || "Login failed";
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <main class="page">
    <section class="card">
      <h1>Edu Live Login</h1>
      <p>Use your teacher or student account to continue.</p>
      <form @submit.prevent="login" class="form">
        <input v-model="email" type="email" placeholder="Email" required />
        <input v-model="password" type="password" placeholder="Password" required />
        <button type="submit" :disabled="loading">{{ loading ? "Signing in..." : "Sign in" }}</button>
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
