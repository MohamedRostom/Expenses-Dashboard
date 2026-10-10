import { defineStory } from '../stories.js';

const items = [
  { id: 'edit', label: 'Edit' },
  { id: 'hide', label: 'Hide' },
  { id: 'remove', label: 'Remove' },
];

export default defineStory({
  title: 'MenuButton',
  purpose: 'icon button opening a small menu',
  variants: [
    { name: 'icon', props: { variant: 'icon', label: 'Panel actions', items } },
    { name: 'label', props: { variant: 'label', label: 'Actions', items } },
  ],
  states: [{ name: 'closed' }],
});
