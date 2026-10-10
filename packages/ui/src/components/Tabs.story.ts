import { defineStory } from '../stories.js';

export default defineStory({
  title: 'Tabs',
  purpose: 'switch between views',
  variants: [
    {
      name: 'underline',
      props: {
        label: 'Views',
        modelValue: 'month',
        tabs: [
          { id: 'month', label: 'Month' },
          { id: 'year', label: 'Year' },
          { id: 'categories', label: 'Categories' },
        ],
      },
    },
  ],
  states: [
    { name: 'first selected' },
    { name: 'last selected', props: { modelValue: 'categories' } },
  ],
});
