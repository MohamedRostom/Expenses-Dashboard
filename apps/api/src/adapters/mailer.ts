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
    });
    await transport.sendMail({
      from: this.transportOptions.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
    });
  }
}

/** Records sent messages in memory instead of sending them — for tests. */
export class CapturingMailer implements Mailer {
  readonly sent: MailMessage[] = [];

  async send(message: MailMessage): Promise<void> {
    this.sent.push(message);
  }
}
