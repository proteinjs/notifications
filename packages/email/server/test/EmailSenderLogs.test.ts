import { RequestDigests } from '@proteinjs/util-node';
import { EmailSender, EmailConfig } from '../src/EmailSender';
import { MailSink } from '../src/MailSink';

/**
 * No e-mail address reaches the log from a send — on any path: a real send, a real send to several
 * recipients in every shape nodemailer takes, a real send the server rejects (whose error repeats
 * the address), a send recorded in the declared sink, and a send refused into the sink. The
 * capture is the process's console as the default log writer writes it (every level, every
 * logger), so the assertion reads what an operator reads.
 *
 * A line that names recipients names them by their ADDRESS DIGEST (`RequestDigests.address`) and
 * their DOMAIN — enough to tell one recipient from another and to find a person's mail when they
 * ask, never the address itself.
 */

const sendMailMock = jest.fn<Promise<unknown>, [Record<string, unknown>]>(async () => ({}));
jest.mock('nodemailer', () => ({
  createTransport: () => ({ sendMail: (message: Record<string, unknown>) => sendMailMock(message) }),
}));

/** An e-mail address, as the house's log check reads one. */
const ADDRESS_SHAPE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

const realConfig: EmailConfig = {
  host: 'smtp.test.local',
  port: 465,
  secure: true,
  auth: { user: 'mailbox', pass: 'unused' },
  from: '"Example" <hi@example.com>',
};

/** Everything the console received while `run` executed, one string per call. */
const captureLog = async (run: () => Promise<void>): Promise<string> => {
  const lines: string[] = [];
  const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
    jest.spyOn(console, level).mockImplementation((...parts: unknown[]) => {
      lines.push(parts.map((part) => (typeof part === 'string' ? part : JSON.stringify(part))).join(' '));
    })
  );
  try {
    await run();
  } finally {
    spies.forEach((spy) => spy.mockRestore());
  }
  return lines.join('\n');
};

/** An SMTP rejection as nodemailer raises it: the server's reply, which repeats the address. */
const rejection = (address: string) =>
  Object.assign(new Error(`Can't send mail - all recipients were rejected: 550 5.1.1 <${address}>: User unknown`), {
    code: 'EENVELOPE',
    response: `550 5.1.1 <${address}>: User unknown`,
    responseCode: 550,
    command: 'RCPT TO',
    rejected: [address],
  });

describe('EmailSender — no address reaches the log', () => {
  const ORIGINAL_ENV = process.env;
  const digests = new RequestDigests();

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.DEVELOPMENT;
    delete process.env.EMAIL_TRANSPORT;
    delete process.env.EMAIL_ALLOW_REAL_SEND;
    sendMailMock.mockReset();
    sendMailMock.mockImplementation(async () => ({}));
    MailSink.get().clear();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  test('a real send: the line names the recipient by its address digest and its domain, never the address', async () => {
    const log = await captureLog(async () => {
      await new EmailSender(realConfig).sendEmail({ to: 'Someone@Example.com', subject: 'Welcome', text: 'hi' });
    });

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(log.match(ADDRESS_SHAPE)).toBeNull();
    expect(log).toContain('1 recipient (example.com)');
    expect(log).toContain(digests.address('someone@example.com'));
  });

  test('a real send to several recipients in every shape (a list, a name-and-address, cc, bcc): each by digest, none by address', async () => {
    const log = await captureLog(async () => {
      await new EmailSender(realConfig).sendEmail({
        to: ['"Ada" <ada@example.com>', { name: 'Grace', address: 'grace@example.org' }],
        cc: 'carol@example.net',
        bcc: [{ name: 'Dan', address: 'dan@example.com' }],
        subject: 'Hello',
        text: 'hi',
      });
    });

    expect(log.match(ADDRESS_SHAPE)).toBeNull();
    expect(log).toContain('4 recipients (example.com, example.org, example.net)');
    for (const address of ['ada@example.com', 'grace@example.org', 'carol@example.net', 'dan@example.com']) {
      expect(log).toContain(digests.address(address));
    }
  });

  test("a real send the server rejects: the error line keeps the server's reply with each recipient's digest in the address's place", async () => {
    sendMailMock.mockRejectedValue(rejection('bounced@example.com'));

    const log = await captureLog(async () => {
      await expect(
        new EmailSender(realConfig).sendEmail({ to: 'Bounced@Example.com', subject: 'Welcome', text: 'hi' })
      ).rejects.toThrow('Failed to send email');
    });

    expect(log.match(ADDRESS_SHAPE)).toBeNull();
    expect(log).toContain('Error sending email');
    expect(log).toContain('1 recipient (example.com)');
    expect(log).toContain(`550 5.1.1 <${digests.address('bounced@example.com')}>: User unknown`);
    expect(log).toContain('EENVELOPE');
  });

  test('a send recorded in the declared sink, and one refused into it: domain only', async () => {
    const log = await captureLog(async () => {
      process.env.EMAIL_TRANSPORT = 'sink';
      await new EmailSender(realConfig).sendEmail({ to: 'sunk@example.invalid', subject: 'Reset', text: 'hi' });
      delete process.env.EMAIL_TRANSPORT;
      process.env.DEVELOPMENT = 'true';
      await new EmailSender(realConfig).sendEmail({ to: 'refused@example.invalid', subject: 'Invite', text: 'hi' });
    });

    expect(MailSink.get().list()).toHaveLength(2);
    expect(log.match(ADDRESS_SHAPE)).toBeNull();
    expect(log).toContain('1 recipient (example.invalid)');
  });
});
