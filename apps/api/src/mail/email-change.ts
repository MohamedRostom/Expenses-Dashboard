// T040: email-change template. Plain function returning {subject, text, html} (research.md R4).
// Route wiring (POST /me/email, POST /me/email/confirm) lands in T042 — this file only provides
// the template shape T040's task list names.
export function emailChangeMail(link: string): { subject: string; text: string; html: string } {
  return {
    subject: 'Confirm your new email for Desk',
    text: `Confirm your new email address: ${link}`,
    html: `<p>Confirm your new email address for Desk.</p><p><a href="${link}">Confirm email</a></p>`,
  };
}
