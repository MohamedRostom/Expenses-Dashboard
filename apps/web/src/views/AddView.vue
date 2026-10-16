<script setup lang="ts">
import { useRouter } from 'vue-router';
import ExpenseForm from '../components/ExpenseForm.vue';

const router = useRouter();
function back() {
  void router.push({ name: 'home' });
}
</script>

<template>
  <main class="desk-add-view">
    <h1>Add expense</h1>
    <ExpenseForm autofocus @saved="back" @cancel="back" />
  </main>
</template>

<style scoped>
.desk-add-view {
  max-width: 28rem;
  margin: 0 auto;
  padding: var(--space-6) var(--gutter-fluid);
  font-family: var(--font-sans);
  color: var(--color-fg);
}
.desk-add-view h1 {
  margin: 0 0 var(--space-4);
  font-size: var(--text-xl);
  line-height: var(--leading-xl);
}
</style>
