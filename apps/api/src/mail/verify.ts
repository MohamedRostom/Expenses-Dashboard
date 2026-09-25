// T040: verify-email template. Plain function returning {subject, text, html} (research.md R4).
export function verifyMail(link: string): { subject: string; text: string; html: string } {
  return {
    subject: 'Verify your email for Desk',
    text: `Verify your email: ${link}`,
    html: `<p>Confirm your email address for Desk.</p><p><a href="${link}">Verify email</a></p>`,
  };
}
