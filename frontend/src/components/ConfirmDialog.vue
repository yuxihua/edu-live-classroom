<script setup>
import { computed } from "vue";

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  title: {
    type: String,
    default: "请确认"
  },
  message: {
    type: String,
    default: ""
  },
  confirmText: {
    type: String,
    default: "确认"
  },
  detailItems: {
    type: Array,
    default: () => []
  },
  pending: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(["confirm", "cancel"]);

const normalizedDetailItems = computed(() => {
  return props.detailItems
    .map((item) => {
      if (typeof item === "string") {
        return { label: item, meta: "" };
      }
      return {
        label: String(item?.label || ""),
        meta: String(item?.meta || "")
      };
    })
    .filter((item) => item.label);
});

const onMaskClick = () => {
  if (props.pending) return;
  emit("cancel");
};
</script>

<template>
  <div v-if="visible" class="dialog-mask" @click="onMaskClick">
    <section class="dialog-card" @click.stop>
      <h3>{{ title }}</h3>
      <p v-if="message">{{ message }}</p>
      <ul v-if="normalizedDetailItems.length" class="dialog-detail-list">
        <li v-for="item in normalizedDetailItems" :key="`${item.label}-${item.meta}`" class="dialog-detail-item">
          <span>{{ item.label }}</span>
          <small v-if="item.meta">{{ item.meta }}</small>
        </li>
      </ul>
      <slot />
      <div class="dialog-actions">
        <button type="button" class="ghost" :disabled="pending" @click="emit('cancel')">取消</button>
        <button type="button" :disabled="pending" @click="emit('confirm')">
          {{ pending ? '处理中...' : confirmText }}
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.dialog-mask {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.42);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 60;
  padding: 16px;
}

.dialog-card {
  width: min(520px, 100%);
  background: #ffffff;
  border-radius: 14px;
  border: 1px solid #e5e7eb;
  padding: 16px;
  box-shadow: 0 18px 48px rgba(15, 23, 42, 0.18);
  display: grid;
  gap: 12px;
}

.dialog-card h3 {
  margin: 0;
  color: #0f172a;
}

.dialog-card p {
  margin: 0;
  color: #334155;
}

.dialog-detail-list {
  list-style: none;
  margin: 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  display: grid;
  gap: 8px;
}

.dialog-detail-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  color: #0f172a;
}

.dialog-detail-item small {
  color: #64748b;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
