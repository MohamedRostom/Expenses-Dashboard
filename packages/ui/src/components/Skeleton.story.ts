import { defineStory } from '../stories.js';

export default defineStory({
  title: 'Skeleton',
  variants: [
    { name: 'text', props: { height: '1rem' } },
    { name: 'tile', props: { height: '4rem' } },
    { name: 'chart', props: { height: '8rem' } },
  ],
  states: [{ name: 'animating', props: {} }],
  usage: '<Skeleton height="8rem" />',
});
