import { describe, expect, it } from 'vitest';
import { defineStory } from './stories.js';

describe('defineStory', () => {
  it('returns the story unchanged', () => {
    const story = {
      title: 'Button',
      purpose: 'actions',
      variants: [{ name: 'primary' }],
      states: [{ name: 'busy', props: { loading: true } }],
    };
    expect(defineStory(story)).toBe(story);
  });
});
