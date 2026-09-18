// T040: password-reset template. Plain function returning {subject, text, html} (research.md R4).
export function resetMail(link: string): { subject: string; text: string; html: string } {
  return {
    subject: 'Reset your Desk password',
    text: `Reset your password: ${link}`,
    html: `<p>Reset your Desk password. This link expires in 20 minutes.</p><p><a href="${link}">Reset password</a></p>`,
  };
}
