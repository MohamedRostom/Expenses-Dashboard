import { defineStory } from '../stories.js';

export default defineStory({
  title: 'Dialog',
  purpose: 'modal, bottom sheet on phone, side panel on desktop',
  variants: [
    {
      name: 'center',
      props: { open: true, inline: true, title: 'Add widget', placement: 'center' },
    },
    {
      name: 'bottom',
      props: { open: true, inline: true, title: 'Add widget', placement: 'bottom' },
    },
    { name: 'side', props: { open: true, inline: true, title: 'Add widget', placement: 'side' } },
  ],
  states: [{ name: 'open', props: { open: true, inline: true } }],
  usage:
    '<Dialog :open="open" title="Add widget" placement="bottom" @close="open = false">...</Dialog>',
});
