import { defineStory } from '../stories.js';

export default defineStory({
  title: 'Toast',
  purpose: 'transient confirmation with undo',
  variants: [
    { name: 'info', props: { tone: 'info' } },
    { name: 'success', props: { tone: 'success' } },
    { name: 'warn', props: { tone: 'warn' } },
    { name: 'critical', props: { tone: 'critical' } },
  ],
  states: [
    { name: 'visible', props: {} },
    { name: 'with undo', props: { undo: true } },
  ],
  usage: "useToast().push('Expense deleted', 'success', undefined, () => restore())",
});
