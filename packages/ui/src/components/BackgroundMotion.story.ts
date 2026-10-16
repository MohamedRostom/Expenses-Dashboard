import { defineStory } from '../stories.js';

export default defineStory({
  title: 'BackgroundMotion',
  purpose: 'the one ambient background layer',
  variants: [
    { name: 'none', props: {} },
    { name: 'aurora', props: {} },
    { name: 'grid', props: {} },
    { name: 'particles', props: {} },
    { name: 'grain', props: {} },
  ],
  states: [
    { name: 'animating', props: {} },
    { name: 'paused', props: {} },
  ],
  usage: '<BackgroundMotion />',
});
