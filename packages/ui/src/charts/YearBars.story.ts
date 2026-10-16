import { defineStory } from '../stories.js';

const months = (over: boolean) =>
  Array.from({ length: 12 }, (_, i) => ({
    month: `2026-${String(i + 1).padStart(2, '0')}`,
    spent: over && i === 5 ? 90000 : 40000 + i * 1500,
    budgeted: 60000,
  }));

export default defineStory({
  title: 'YearBars',
  purpose: 'twelve months of spend against budget',
  variants: [
    { name: 'under budget', props: { months: months(false), currency: 'GBP' } },
    { name: 'over budget', props: { months: months(true), currency: 'GBP' } },
  ],
  states: [{ name: 'empty', props: { months: [], currency: 'GBP' } }],
  usage: '<YearBars :months="year" currency="GBP" />',
});
