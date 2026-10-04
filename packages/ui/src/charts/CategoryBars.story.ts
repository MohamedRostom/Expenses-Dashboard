import { defineStory } from '../stories.js';

const categories = (spent: number) => [
  { id: 'groceries', name: 'Groceries', spent, budget: 40000 },
  { id: 'transport', name: 'Transport', spent: 8000, budget: null },
];

export default defineStory({
  title: 'CategoryBars',
  variants: [
    { name: 'under budget', props: { categories: categories(25000), currency: 'GBP' } },
    { name: 'over budget', props: { categories: categories(52000), currency: 'GBP' } },
  ],
  states: [{ name: 'empty', props: { categories: [], currency: 'GBP' } }],
});
