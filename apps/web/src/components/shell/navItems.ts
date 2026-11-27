// Shell navigation (DESIGN.md Navigation, ADR-0008): four destinations; everything else is linked
// from Settings. Icons: one family, 24px grid, drawn with the shell's single 1.75 stroke.
export interface NavItem {
  id: 'month' | 'year' | 'today' | 'settings';
  label: string;
  to: string;
  icon: string;
  /** Shown only while this flag is on. */
  flag?: string;
}

export const NAV_ITEMS: NavItem[] = [
  {
    id: 'month',
    label: 'Month',
    to: '/',
    icon: 'M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2ZM3 10h18M8 3v4M16 3v4',
  },
  {
    id: 'year',
    label: 'Year',
    to: '/year',
    icon: 'M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2ZM3 10h18M8 3v4M16 3v4M8 14h.01M12 14h.01M16 14h.01M8 17.5h.01M12 17.5h.01',
  },
  {
    id: 'today',
    label: 'Today',
    to: '/today',
    flag: 'panels.today',
    icon: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  },
  {
    id: 'settings',
    label: 'Settings',
    to: '/settings',
    icon: 'M4 7h8M16 7h4M4 17h4M12 17h8M14 5a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM10 15a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z',
  },
];

/** Month owns the add screen, Settings owns every /settings/* screen. */
export function isCurrent(id: NavItem['id'], path: string): boolean {
  switch (id) {
    case 'month':
      return path === '/' || path === '/add';
    case 'year':
      return path === '/year';
    case 'today':
      return path === '/today';
    case 'settings':
      return path === '/settings' || path.startsWith('/settings/');
  }
}

const TITLES: [prefix: string, title: string][] = [
  ['/add', 'Add expense'],
  ['/year', 'Year'],
  ['/today', 'Today'],
  ['/import', 'Import'],
  ['/bin', 'Bin'],
  ['/settings/categories', 'Categories'],
  ['/settings/capture', 'Capture'],
  ['/settings/connectors', 'Notion sync'],
  ['/settings/connections', 'Mail and calendar accounts'],
  ['/settings', 'Settings'],
];

/** The top bar's screen title (the page's one h1), derived from the path. */
export function titleFor(path: string): string {
  if (path === '/') return 'Month';
  if (path.startsWith('/settings/categories/')) return 'Category history';
  return TITLES.find(([p]) => path === p || path.startsWith(`${p}/`))?.[1] ?? 'Desk';
}
