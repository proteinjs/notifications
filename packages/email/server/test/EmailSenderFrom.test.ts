import { EmailSender, EmailConfig } from '../src/EmailSender';

/**
 * The outbound sender identity has ONE owner: the transport config's `from` (founder ruling
 * 2026-08-19 — "my account deletion email in test still sent as hello@n3xa.io instead of
 * hi@n3xa.io"). Every mail path in the stack funnels through EmailSender.sendEmail spreading
 * a per-email `config.options` into the wire message; before this pin, a stray `options.from`
 * silently overrode the transport identity. These tests pin the wire `from` — the message
 * nodemailer actually transports — to the transport config for the account-deletion shapes.
 */

const sendMailMock = jest.fn<Promise<unknown>, [Record<string, unknown>]>(async () => ({}));
jest.mock('nodemailer', () => ({
  createTransport: () => ({ sendMail: (message: Record<string, unknown>) => sendMailMock(message) }),
}));

const PUBLIC_SENDER = '"N3XA" <hi@n3xa.io>';

const transportConfig: EmailConfig = {
  host: 'smtp.test.local',
  port: 465,
  secure: true,
  // The real-world shape: SMTP auth is the hello@ MAILBOX; the visible sender is the alias.
  auth: { user: 'hello@n3xa.io', pass: 'unused' },
  from: PUBLIC_SENDER,
};

beforeEach(() => {
  sendMailMock.mockClear();
});

describe('EmailSender — the transport config owns the wire from-address', () => {
  test('deletion-requested email shape sends as the transport identity', async () => {
    const sender = new EmailSender(transportConfig);
    // AccountDeletionEmails.sendDeletionRequested's exact call shape: content + the app
    // config factory's options (subject only) spread over the message.
    const configOptions: Partial<Record<string, unknown>> = {
      subject: 'Your N3XA account is scheduled for deletion',
    };
    await sender.sendEmail({
      to: 'founder@n3xa.io',
      subject: 'Your account is scheduled for deletion',
      text: 'Your account is scheduled for deletion.',
      ...configOptions,
    });

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const wireMessage = sendMailMock.mock.calls[0][0] as { from: string; subject: string };
    expect(wireMessage.from).toBe(PUBLIC_SENDER);
    expect(wireMessage.subject).toBe('Your N3XA account is scheduled for deletion');
  });

  test('a stray options.from cannot fork the sender identity (the hello@ recurrence class)', async () => {
    const sender = new EmailSender(transportConfig);
    // The recurrence class this pin kills: any per-email config/call site smuggling its own
    // from (e.g. the pre-fix EMAIL_USER-derived identity) through the options spread.
    await sender.sendEmail({
      to: 'founder@n3xa.io',
      subject: 'Your account has been deleted',
      text: 'Your account and everything in it have been permanently removed.',
      from: '"n3xa" <hello@n3xa.io>',
    });

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const wireMessage = sendMailMock.mock.calls[0][0] as { from: string };
    expect(wireMessage.from).toBe(PUBLIC_SENDER);
  });
});
