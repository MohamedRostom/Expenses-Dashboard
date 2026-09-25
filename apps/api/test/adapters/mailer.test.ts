import { CapturingMailer, ResendMailer } from '../../src/adapters/mailer.js';

describe('CapturingMailer', () => {
  it('captures sent messages with to, subject and links in the html', async () => {
    const mailer = new CapturingMailer();
    await mailer.send({
      to: 'user@example.com',
      subject: 'Verify your email',
      html: '<a href="https://desk.example.com/verify?token=abc">Verify</a>',
    });

    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]!.to).toBe('user@example.com');
    expect(mailer.sent[0]!.subject).toBe('Verify your email');
    expect(mailer.sent[0]!.html).toContain('https://desk.example.com/verify?token=abc');
  });
});

describe('ResendMailer', () => {
  it('posts to the Resend API with the message fields', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchMock: typeof fetch = async (url, init) => {
      calls.push({ url: url.toString(), init: init! });
      return new Response(null, { status: 200 });
    };
    const original = globalThis.fetch;
    globalThis.fetch = fetchMock;
    try {
      const mailer = new ResendMailer('test-api-key', 'noreply@desk.example.com');
      await mailer.send({ to: 'user@example.com', subject: 'Hi', html: '<p>hello</p>' });

      expect(calls).toHaveLength(1);
      expect(calls[0]!.url).toBe('https://api.resend.com/emails');
      expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe(
        'Bearer test-api-key',
      );
      const body = JSON.parse(calls[0]!.init.body as string);
      expect(body).toEqual({
        from: 'noreply@desk.example.com',
        to: 'user@example.com',
        subject: 'Hi',
        html: '<p>hello</p>',
      });
    } finally {
      globalThis.fetch = original;
    }
  });

  it('throws when the API responds with a non-ok status', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () => new Response(null, { status: 500 });
    try {
      const mailer = new ResendMailer('key', 'noreply@desk.example.com');
      await expect(mailer.send({ to: 'a@b.com', subject: 's', html: 'h' })).rejects.toThrow();
    } finally {
      globalThis.fetch = original;
    }
  });
});
