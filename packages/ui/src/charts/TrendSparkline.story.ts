import { defineStory } from '../stories.js';

export default defineStory({
  title: 'TrendSparkline',
  purpose: 'monthly spend trend at a glance',
  variants: [
    {
      name: 'six months',
      props: {
        points: [31000, 28500, 35200, 30100, 42000, 39000].map((spent, i) => ({
          month: `2026-0${i + 1}`,
          spent,
        })),
      },
    },
  ],
  states: [{ name: 'empty', props: { points: [] } }],
  usage: '<TrendSparkline :points="lastSixMonths" />',
});
