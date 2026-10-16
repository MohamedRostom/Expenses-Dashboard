import { defineStory } from '../stories.js';

export default defineStory({
  title: 'ErrorState',
  purpose: 'names the cause and offers retry',
  variants: [
    { name: 'default', props: { code: 'not_found' } },
    { name: 'rate limited', props: { code: 'rate_limited' } },
  ],
  states: [{ name: 'fallback copy', props: {} }],
  usage: '<ErrorState code="not_found"><template #action>...</template></ErrorState>',
});
