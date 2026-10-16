import { defineStory } from '../stories.js';

export default defineStory({
  title: 'Skeleton',
  purpose: 'placeholder shapes',
  variants: [
    { name: 'text', props: { height: '1rem' } },
    { name: 'tile', props: { height: '4rem' } },
    { name: 'row', props: { height: '2.5rem' } },
    { name: 'chart', props: { height: '8rem' } },
  ],
  states: [{ name: 'animating', props: {} }],
  usage: '<Skeleton height="8rem" />',
});
