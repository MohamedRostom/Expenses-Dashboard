import { defineStory } from '../stories.js';

export default defineStory({
  title: 'Input',
  purpose: 'text, number, amount',
  variants: [
    { name: 'text', props: { label: 'Description', placeholder: 'Coffee' } },
    { name: 'amount', props: { label: 'Amount', variant: 'amount', modelValue: '1234.50' } },
    { name: 'search', props: { label: 'Search', variant: 'search' } },
  ],
  states: [
    { name: 'default' },
    { name: 'invalid', props: { error: 'Enter a valid value' } },
    { name: 'disabled', props: { disabled: true } },
  ],
  usage: '<Input v-model="amount" label="Amount" variant="amount" :error="amountError" />',
});
