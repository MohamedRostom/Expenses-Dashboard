// T015: Mailer interface. ResendMailer (fetch, Workers+Node) and SmtpMailer (Node-only, nodemailer)
// are alternative production implementations behind the same interface (CLAUDE.md Principle II).
export interface MailMessage {
  to: string;
  subject: string;
  html: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/** Uses global fetch against the Resend API — works in both Cloudflare Workers and Node. */
export class ResendMailer implements Mailer {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(message: MailMessage): Promise<void> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
      }),
    });
    if (!res.ok) {
      throw new Error(`ResendMailer: send failed with status ${res.status}`);
    }
  }
}

/** Node-only: SMTP via nodemailer (Mailpit locally). Never import this from worker.ts. */
export class SmtpMailer implements Mailer {
  constructor(private readonly transportOptions: { host: string; port: number; from: string }) {}

  async send(message: MailMessage): Promise<void> {
    const nodemailer = await import('nodemailer');
    const transport = nodemailer.createTransport({
      host: this.transportOptions.host,
      port: this.transportOptions.port,
      secure: false,
    });
    try {
      const info = await transport.sendMail({
        from: this.transportOptions.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
      });
      // Diagnostic for the e2e-ci Mailpit path (2026-09-20): sendMail's own promise resolving
      // does not prove Mailpit accepted the message — log the SMTP result explicitly so a silent
      // delivery failure shows up in `docker compose logs` instead of only as a 15s Playwright
      // timeout three layers away.
      console.log('SmtpMailer: sent', {
        to: message.to,
        accepted: info.accepted,
        rejected: info.rejected,
        response: info.response,
      });
    } catch (err) {
      console.error('SmtpMailer: send failed', { to: message.to, err });
      throw err;
    }
  }
}

/** Records sent messages in memory instead of sending them — for tests. */
export class CapturingMailer implements Mailer {
  readonly sent: MailMessage[] = [];
  /** Set true to make the next send() throw, like a provider outage; resets after one use. */
  failNextSend = false;

  async send(message: MailMessage): Promise<void> {
    if (this.failNextSend) {
      this.failNextSend = false;
      throw new Error('CapturingMailer: simulated send failure');
    }
    this.sent.push(message);
  }
}
