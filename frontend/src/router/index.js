import { createRouter, createWebHistory } from "vue-router";
import LoginView from "../views/LoginView.vue";
import DashboardView from "../views/DashboardView.vue";
import ClassroomView from "../views/ClassroomView.vue";
import AdminCenterView from "../views/AdminCenterView.vue";

const routes = [
  { path: "/", redirect: "/login" },
  { path: "/login", component: LoginView },
  { path: "/dashboard", component: DashboardView },
  { path: "/admin", component: AdminCenterView, meta: { roles: ["admin", "org_admin", "district_admin"] } },
  { path: "/classroom/:id", component: ClassroomView, props: true }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

router.beforeEach((to, from, next) => {
  const token = localStorage.getItem("token");
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  if (to.path !== "/login" && !token) {
    next("/login");
    return;
  }

  if (to.meta?.roles && !to.meta.roles.includes(user.role)) {
    next("/dashboard");
    return;
  }

  next();
});

export default router;
