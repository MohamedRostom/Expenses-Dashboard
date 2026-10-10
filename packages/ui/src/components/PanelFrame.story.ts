import { defineStory } from '../stories.js';

export default defineStory({
  title: 'PanelFrame',
  purpose: 'titled panel with header actions',
  variants: [
    {
      name: 'default',
      props: { heading: 'Spending', kind: 'empty', title: 'Nothing here yet' },
    },
  ],
  states: [
    // loaded: the heading over its flap; the body is the default slot, which the catalogue leaves empty.
    { name: 'loaded', props: { heading: 'Spending' } },
    { name: 'loading', props: { kind: 'loading' } },
    { name: 'empty', props: { kind: 'empty', title: 'No expenses this month' } },
    { name: 'error', props: { kind: 'error', code: 'offline' } },
  ],
  usage: '<PanelFrame heading="Spending" kind="error" code="server_error" />',
});
