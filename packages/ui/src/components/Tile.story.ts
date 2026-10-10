import { defineStory } from '../stories.js';

export default defineStory({
  title: 'Tile',
  purpose: 'one primary figure with label and trend',
  variants: [
    { name: 'default', props: { label: 'Forecast', value: '£1,240.00', note: 'Based on: spend.' } },
    { name: 'critical', props: { label: 'Remaining', value: '-£12.00', variant: 'critical' } },
  ],
  states: [{ name: 'loading', props: { label: 'Forecast', loading: true } }],
  usage: '<Tile label="Forecast" value="£1,240.00" note="Based on: spend." />',
});
