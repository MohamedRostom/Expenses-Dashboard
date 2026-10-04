import { defineStory } from '../stories.js';

export default defineStory({
  title: 'Select',
  variants: [
    {
      name: 'native',
      props: {
        label: 'Category',
        modelValue: 'groceries',
        options: [
          { value: 'groceries', label: 'Groceries' },
          { value: 'rent', label: 'Rent' },
        ],
      },
    },
  ],
  states: [
    { name: 'default' },
    { name: 'invalid', props: { error: 'Choose a category' } },
    { name: 'disabled', props: { disabled: true } },
  ],
});
