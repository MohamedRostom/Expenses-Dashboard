import { defineStory } from '../stories.js';

export default defineStory({
  title: 'ErrorState',
  variants: [
    { name: 'known code', props: { code: 'not_found' } },
    { name: 'rate limited', props: { code: 'rate_limited' } },
  ],
  states: [{ name: 'fallback copy', props: {} }],
  usage: '<ErrorState code="not_found"><template #action>...</template></ErrorState>',
});
