import { defineStory } from '../stories.js';

export default defineStory({
  title: 'Tile',
  purpose: 'one primary figure with label and trend',
  variants: [
    { name: 'default', props: { label: 'Forecast', value: '£1,240.00', note: 'Based on: spend.' } },
    { name: 'critical', props: { label: 'Remaining', value: '-£12.00', variant: 'critical' } },
    {
      name: 'primary',
      props: {
        label: 'Left this month',
        value: '£412.60',
        note: 'remaining of £1,200.00 GBP',
        primary: true,
      },
    },
    {
      name: 'status words',
      props: {
        label: 'Spent',
        value: '£787.40 GBP',
        note: '31 entries',
        status: [
          { text: '1 rate pending', tone: 'warn' },
          { text: '2 categories over', tone: 'critical' },
        ],
      },
    },
  ],
  states: [{ name: 'loading', props: { label: 'Forecast', loading: true } }],
  usage: '<Tile label="Forecast" value="£1,240.00" note="Based on: spend." />',
});
