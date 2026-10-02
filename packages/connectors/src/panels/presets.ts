/**
 * T069: documented IMAP/CalDAV endpoints for the standards form's presets (FR-018). Values are
 * each provider's own published settings, not yet confirmed against a real account — T079's
 * Yahoo spike (research.md §R3) is still pending; if it finds Yahoo's CalDAV endpoint doesn't
 * work with this client's read-only command subset, drop `caldavUrl` from the `yahoo` entry here
 * (spec Assumptions) rather than removing the preset.
 */
export interface StandardsPreset {
  name: 'yahoo' | 'icloud' | 'fastmail';
  imapHost: string;
  imapPort: number;
  caldavUrl: string;
}

export const STANDARDS_PRESETS: StandardsPreset[] = [
  {
    name: 'yahoo',
    imapHost: 'imap.mail.yahoo.com',
    imapPort: 993,
    caldavUrl: 'https://caldav.calendar.yahoo.com',
  },
  {
    name: 'icloud',
    imapHost: 'imap.mail.me.com',
    imapPort: 993,
    caldavUrl: 'https://caldav.icloud.com',
  },
  {
    name: 'fastmail',
    imapHost: 'imap.fastmail.com',
    imapPort: 993,
    caldavUrl: 'https://caldav.fastmail.com/dav/',
  },
];
