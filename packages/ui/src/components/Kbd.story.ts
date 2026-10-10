import { defineStory } from '../stories.js';

export default defineStory({
  title: 'Kbd',
  purpose: 'keyboard hint',
  variants: [{ name: 'inline' }],
  states: [{ name: 'default' }],
  usage: '<p>Press <Kbd>Esc</Kbd> to close.</p>',
});
