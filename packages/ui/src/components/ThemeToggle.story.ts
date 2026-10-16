import { defineStory } from '../stories.js';

export default defineStory({
  title: 'ThemeToggle',
  purpose: 'system / light / dark',
  variants: [{ name: 'segmented' }],
  states: [
    { name: 'system', props: { modelValue: 'system' } },
    { name: 'light', props: { modelValue: 'light' } },
    { name: 'dark', props: { modelValue: 'dark' } },
  ],
  usage: '<ThemeToggle v-model="theme" />',
});
