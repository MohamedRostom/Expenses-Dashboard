import { defineStory } from '../stories.js';

const categories = [
  { id: 'a', name: 'Rent', spent: 95000, budget: 100000 },
  { id: 'b', name: 'Groceries', spent: 31000, budget: 30000 },
  { id: 'c', name: 'Travel', spent: 4000, budget: null },
];

export default defineStory({
  title: 'DataTable',
  purpose: 'aligned rows of entries',
  variants: [
    { name: 'default', props: { categories, caption: 'Spend by category' } },
    { name: 'dense', props: { categories, caption: 'Spend by category', dense: true } },
  ],
  states: [
    { name: 'sortable', props: { categories, caption: 'Spend by category', sortable: true } },
    { name: 'loading', props: { categories: [], caption: 'Spend by category', loading: true } },
    { name: 'empty', props: { categories: [], caption: 'Spend by category' } },
  ],
  usage: '<DataTable :categories="rows" caption="Spend by category" sortable dense />',
});
