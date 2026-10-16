/** Catalogue story contract (specs/004-web-ui-refresh/contracts/blocks.md). */
export interface StoryCase {
  name: string;
  props?: Record<string, unknown>;
}

export interface Story {
  title: string;
  /** One line, equal to the Purpose column of contracts/blocks.md. */
  purpose: string;
  variants: StoryCase[];
  states: StoryCase[];
  usage?: string;
}

export function defineStory(story: Story): Story {
  return story;
}

/** Every `<Block>.story.ts` default export, for the catalogue. The glob stays inside the
 * function so importing the package never pulls the stories in. */
export function collectStories(): Story[] {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore import.meta.glob is typed by vite/client in the apps; this package doesn't depend on vite
  const modules: Record<string, Story> = import.meta.glob(
    ['./components/*.story.ts', './charts/*.story.ts'],
    {
      eager: true,
      import: 'default',
    },
  );
  return Object.values(modules);
}
