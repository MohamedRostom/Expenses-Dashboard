import { defineStory } from '../stories.js';

export default defineStory({
  title: 'Select',
  purpose: 'single choice',
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
  usage:
    '<Select v-model="category" label="Category" :options="categories" :error="categoryError" />',
});
