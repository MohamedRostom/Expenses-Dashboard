import { defineStory } from '../stories.js';

export default defineStory({
  title: 'Button',
  variants: [
    { name: 'primary', props: { variant: 'primary' } },
    { name: 'secondary', props: { variant: 'secondary' } },
    { name: 'ghost', props: { variant: 'ghost' } },
    { name: 'danger', props: { variant: 'danger' } },
    { name: 'primary sm', props: { variant: 'primary', size: 'sm' } },
  ],
  states: [
    { name: 'default' },
    { name: 'disabled', props: { disabled: true } },
    { name: 'loading', props: { loading: true } },
  ],
});
