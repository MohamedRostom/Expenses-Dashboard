import { defineStory } from '../stories.js';

// `inline` renders in place from `messages` (the app's toasts come from useToast()).
const toast = (variant: 'info' | 'success' | 'warn' | 'critical', undo = false) => ({
  inline: true,
  messages: [{ id: 1, text: 'Expense saved', variant, ...(undo ? { undo: () => undefined } : {}) }],
});

export default defineStory({
  title: 'Toast',
  purpose: 'transient confirmation with undo',
  variants: [
    { name: 'info', props: toast('info') },
    { name: 'success', props: toast('success') },
    { name: 'warn', props: toast('warn') },
    { name: 'critical', props: toast('critical') },
  ],
  states: [
    { name: 'visible', props: {} },
    { name: 'with undo', props: toast('info', true) },
  ],
  usage:
    "<Toast /> <!-- once, in App.vue -->\nuseToast().push('Expense deleted', 'success', undefined, () => restore())",
});
