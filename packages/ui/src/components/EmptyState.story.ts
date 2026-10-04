import { defineStory } from '../stories.js';

export default defineStory({
  title: 'EmptyState',
  variants: [
    { name: 'default', props: { title: 'No expenses yet', description: 'Add your first one.' } },
  ],
  states: [
    { name: 'without description', props: { title: 'Nothing here' } },
    {
      name: 'with description',
      props: { title: 'Nothing here', description: 'Add one to begin.' },
    },
  ],
  usage: '<EmptyState title="No expenses yet"><template #action>...</template></EmptyState>',
});
