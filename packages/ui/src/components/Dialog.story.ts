import { defineStory } from '../stories.js';

export default defineStory({
  title: 'Dialog',
  variants: [
    { name: 'center', props: { open: true, title: 'Add widget', placement: 'center' } },
    { name: 'bottom', props: { open: true, title: 'Add widget', placement: 'bottom' } },
    { name: 'side', props: { open: true, title: 'Add widget', placement: 'side' } },
  ],
  states: [{ name: 'open', props: { open: true } }],
  usage:
    '<Dialog :open="open" title="Add widget" placement="bottom" @close="open = false">...</Dialog>',
});
