/** Fixtures for the Today mock-up (T027a). Content and copy follow the real CalendarPanel and
 * InboxPanel; nothing here touches the API or a store. Account colours are the account palette:
 * never amber (warn) or red (critical), which are status colours. */
export interface MockAccount {
  id: string;
  label: string;
  colour: string;
}
export const ACCOUNTS: MockAccount[] = [
  { id: 'a1', label: 'Personal Gmail', colour: '#3b6fb6' },
  { id: 'a2', label: 'Work Outlook', colour: '#6b4fa3' },
  { id: 'a3', label: 'Fastmail', colour: '#2a7f86' },
];
export const acct = (id: string) => ACCOUNTS.find((a) => a.id === id)!;

export interface MockEvent {
  id: string;
  time: string;
  title: string;
  where: string;
  accountId: string;
}
export interface MockDay {
  id: string;
  tab: string;
  long: string;
  events: MockEvent[];
}
export const DAYS: MockDay[] = [
  {
    id: 'd0',
    tab: 'Tue 6',
    long: 'Tuesday 6 October',
    events: [
      { id: 'e1', time: '09:30', title: 'Standup', where: 'Video call', accountId: 'a2' },
      {
        id: 'e2',
        time: '12:45',
        title: 'Lunch with Amira',
        where: 'Borough Market',
        accountId: 'a1',
      },
      { id: 'e3', time: '16:00', title: 'Release review', where: 'Room 3.12', accountId: 'a2' },
    ],
  },
  {
    id: 'd1',
    tab: 'Wed 7',
    long: 'Wednesday 7 October',
    events: [
      { id: 'e4', time: '08:15', title: 'Dentist', where: 'Clapham Junction', accountId: 'a1' },
      { id: 'e5', time: '14:00', title: 'Design sync', where: 'Video call', accountId: 'a2' },
    ],
  },
  {
    id: 'd2',
    tab: 'Thu 8',
    long: 'Thursday 8 October',
    events: [{ id: 'e6', time: '19:30', title: 'Climbing', where: 'The Castle', accountId: 'a3' }],
  },
  { id: 'd3', tab: 'Fri 9', long: 'Friday 9 October', events: [] },
  {
    id: 'd4',
    tab: 'Sat 10',
    long: 'Saturday 10 October',
    events: [
      { id: 'e7', time: '10:00', title: 'Parkrun', where: 'Brockwell Park', accountId: 'a3' },
      { id: 'e8', time: '18:45', title: 'Dinner at Kemal’s', where: 'Peckham', accountId: 'a1' },
    ],
  },
];

export interface MockMessage {
  id: string;
  from: string;
  subject: string;
  preview: string;
  time: string;
  accountId: string;
  unread: boolean;
}
export const MESSAGES: MockMessage[] = [
  {
    id: 'm1',
    from: 'Priya Raman',
    subject: 'Venue for the 14th',
    preview: 'Two options, both near the station. The second has step-free access.',
    time: '08:52',
    accountId: 'a2',
    unread: true,
  },
  {
    id: 'm2',
    from: 'Thames Water',
    subject: 'Your bill is ready',
    preview: 'Your October statement is £38.40 and is due on 21 October.',
    time: '07:31',
    accountId: 'a1',
    unread: true,
  },
  {
    id: 'm3',
    from: 'Kemal Aydin',
    subject: 'Saturday',
    preview: 'Still on for 18:45? I booked the corner table.',
    time: 'Yesterday',
    accountId: 'a1',
    unread: true,
  },
  {
    id: 'm4',
    from: 'Fastmail',
    subject: 'Security notice',
    preview: 'A new device signed in to your account from London.',
    time: 'Yesterday',
    accountId: 'a3',
    unread: false,
  },
];
/** Delivered once, a few seconds after load, when live is on. */
export const ARRIVAL: MockMessage = {
  id: 'm0',
  from: 'Ngozi Eze',
  subject: 'Invoice 0417',
  preview: 'Attached is the invoice for September; payment terms are 14 days.',
  time: '09:10',
  accountId: 'a2',
  unread: true,
};
export const ARRIVAL_MS = 4000;

export const COPY = {
  calendar: {
    title: 'Calendar',
    empty: { title: 'No calendar connected', hint: 'Connect a calendar to see your next 7 days.' },
    noEvents: 'No events this day',
    error: {
      reconnect: {
        text: 'Work Outlook needs reconnecting',
        hint: 'Reconnect it to see its events.',
      },
    },
  },
  inbox: {
    title: 'Inbox',
    empty: { title: 'No mail connected', hint: 'Connect a mail account to see recent messages.' },
    error: {
      rate: { text: 'Mail refresh paused', hint: 'Too many refreshes. Try again in 30 seconds.' },
    },
  },
} as const;
