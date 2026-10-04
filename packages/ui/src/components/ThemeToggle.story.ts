import { defineStory } from '../stories.js';

export default defineStory({
  title: 'ThemeToggle',
  variants: [{ name: 'segmented' }],
  states: [
    { name: 'system', props: { modelValue: 'system' } },
    { name: 'light', props: { modelValue: 'light' } },
    { name: 'dark', props: { modelValue: 'dark' } },
  ],
});
