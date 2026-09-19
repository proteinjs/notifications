import { EmailSender, EmailConfig } from '../src/EmailSender';
import { MailSink } from '../src/MailSink';

/**
 * The transport a sender runs on is the environment's ruling, not the config's: a development
 * process never mails a real address by accident (2026-09-19: a development server's invite to a
 * reserved-domain address left the machine through the real SMTP transport and bounced into a
 * real inbox). Pins, as OUTCOMES on the sink and the transporter seam:
 *   - `DEVELOPMENT` set, a real SMTP config, no opt-in → the send is REFUSED and recorded in the
 *     sink (nothing hits nodemailer); one loud line names the recipient count and domain only;
 *   - `DEVELOPMENT` + `EMAIL_TRANSPORT=sink` → recorded, declared (no refusal);
 *   - no `DEVELOPMENT` → the real transport is built from the config and the message hits it
 *     (test and prod are untouched); `EMAIL_ALLOW_REAL_SEND=1` is the explicit opt-in under
 *     `DEVELOPMENT`;
 *   - a config without `auth` cannot build the real transport; the sink needs none;
 *   - the record carries what a lane reads: to, subject, the body's first link, the timestamp.
 */

const sendMailMock = jest.fn<Promise<unknown>, [Record<string, unknown>]>(async () => ({}));
const createTransportMock = jest.fn((options: Record<string, unknown>) => ({
  options,
  sendMail: (message: Record<string, unknown>) => sendMailMock(message),
}));
jest.mock('nodemailer', () => ({
  createTransport: (options: Record<string, unknown>) => createTransportMock(options),
}));

const PUBLIC_SENDER = '"Example" <hi@example.com>';

const realConfig: EmailConfig = {
  host: 'smtp.test.local',
  port: 465,
  secure: true,
  auth: { user: 'mailbox@test.local', pass: 'unused' },
  from: PUBLIC_SENDER,
};

const authlessConfig: EmailConfig = { host: 'smtp.test.local', port: 465, secure: true, from: PUBLIC_SENDER };

type LoggerSeam = { logger: { warn: jest.Mock; info: jest.Mock } };

const INVITE_HTML =
  '<html><body><p>You are invited.</p><a href="http://localhost:7985/auth/signup?token=abc123">Accept</a></body></html>';
const INVITE_TEXT = 'Example\nYou are invited\nAccept your invite: http://localhost:7985/auth/signup?token=abc123\n';

/** A sender whose logger is a spy (the loud line is an outcome too). */
const senderWithLogSpy = (config: EmailConfig) => {
  const sender = new EmailSender(config);
  const seam = sender as unknown as LoggerSeam;
  seam.logger = { warn: jest.fn(), info: jest.fn() } as never;
  return { sender, log: seam.logger };
};

describe("EmailSender — the transport is the environment's ruling", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.DEVELOPMENT;
    delete process.env.EMAIL_TRANSPORT;
    delete process.env.EMAIL_ALLOW_REAL_SEND;
    sendMailMock.mockClear();
    createTransportMock.mockClear();
    MailSink.get().clear();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  test('DEVELOPMENT + a real SMTP config + no opt-in: the send is refused and recorded in the sink — nothing reaches nodemailer, one line names the count and the domain only', async () => {
    process.env.DEVELOPMENT = 'true';
    const { sender, log } = senderWithLogSpy(realConfig);

    await sender.sendEmail({
      to: 'lane-after@example.invalid',
      subject: "You're invited",
      text: INVITE_TEXT,
      html: INVITE_HTML,
    });

    expect(createTransportMock).not.toHaveBeenCalled();
    expect(sendMailMock).not.toHaveBeenCalled();
    const records = MailSink.get().list();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      to: ['lane-after@example.invalid'],
      subject: "You're invited",
      from: 'hi@example.com',
      refused: true,
      link: 'http://localhost:7985/auth/signup?token=abc123',
    });
    expect(records[0].html).toBe(INVITE_HTML);
    expect(log.warn).toHaveBeenCalledTimes(1);
    const line = String(log.warn.mock.calls[0][0].message);
    expect(line).toMatch(/Refusing the real SMTP transport: DEVELOPMENT is set and EMAIL_ALLOW_REAL_SEND=1 is not/);
    expect(line).toMatch(/1 recipient \(example\.invalid\)/);
    expect(line).toContain(records[0].id);
    expect(line).not.toContain('lane-after');
  });

  test('DEVELOPMENT + EMAIL_TRANSPORT=sink (an auth-less config): recorded, declared — no refusal, no transporter', async () => {
    process.env.DEVELOPMENT = 'true';
    process.env.EMAIL_TRANSPORT = 'sink';
    const { sender, log } = senderWithLogSpy(authlessConfig);

    await sender.sendEmail({ to: ['one@example.invalid', 'two@example.invalid'], subject: 'Reset', text: INVITE_TEXT });

    expect(createTransportMock).not.toHaveBeenCalled();
    expect(sendMailMock).not.toHaveBeenCalled();
    const [record] = MailSink.get().list();
    expect(record).toMatchObject({
      to: ['one@example.invalid', 'two@example.invalid'],
      subject: 'Reset',
      refused: false,
    });
    expect(record.link).toBe('http://localhost:7985/auth/signup?token=abc123');
    expect(log.warn).not.toHaveBeenCalled();
    expect(log.info).toHaveBeenCalledTimes(1);
    expect(String(log.info.mock.calls[0][0].message)).toMatch(
      /Mail sink: recorded .* \(not sent\) — 2 recipients \(example\.invalid\)/
    );
  });

  test('no DEVELOPMENT: the real transport is built from the config and the message hits it; the sink stays empty (test and prod as today)', async () => {
    const sender = new EmailSender(realConfig);

    await sender.sendEmail({ to: 'someone@example.com', subject: 'subject', text: 'body' });

    expect(createTransportMock).toHaveBeenCalledTimes(1);
    expect(createTransportMock.mock.calls[0][0]).toEqual({
      host: 'smtp.test.local',
      port: 465,
      secure: true,
      auth: realConfig.auth,
    });
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock.mock.calls[0][0]).toMatchObject({ to: 'someone@example.com', from: PUBLIC_SENDER });
    expect(MailSink.get().list()).toHaveLength(0);
  });

  test('DEVELOPMENT + EMAIL_ALLOW_REAL_SEND=1 is the explicit opt-in: the real transport, nothing recorded', async () => {
    process.env.DEVELOPMENT = 'true';
    process.env.EMAIL_ALLOW_REAL_SEND = '1';
    const sender = new EmailSender(realConfig);

    await sender.sendEmail({ to: 'someone@example.com', subject: 'subject', text: 'body' });

    expect(createTransportMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(MailSink.get().list()).toHaveLength(0);
  });

  test('EMAIL_TRANSPORT=sink wins over the opt-in; an unknown EMAIL_TRANSPORT is refused at construction', async () => {
    process.env.EMAIL_ALLOW_REAL_SEND = '1';
    process.env.EMAIL_TRANSPORT = 'sink';
    await new EmailSender(realConfig).sendEmail({ to: 'a@example.invalid', subject: 's', text: 't' });
    expect(createTransportMock).not.toHaveBeenCalled();
    expect(MailSink.get().list()).toHaveLength(1);

    process.env.EMAIL_TRANSPORT = 'pigeon';
    expect(() => new EmailSender(realConfig)).toThrow(/EMAIL_TRANSPORT must be "sink" or "smtp", got "pigeon"/);
  });

  test('a config without auth cannot build the real transport — refused at construction, naming the sink as the development path', () => {
    expect(() => new EmailSender(authlessConfig)).toThrow(/needs credentials and the email config carries no auth/);
    expect(createTransportMock).not.toHaveBeenCalled();
  });
});

describe('MailSink — the ring a lane reads', () => {
  beforeEach(() => MailSink.get().clear());

  test('one ring per process, newest first, bounded at CAPACITY, addressable by id', () => {
    const sink = MailSink.get();
    expect(MailSink.get()).toBe(sink);
    const ids: string[] = [];
    for (let i = 0; i < MailSink.CAPACITY + 5; i += 1) {
      ids.push(sink.record({ to: `u${i}@example.invalid`, subject: `m${i}`, text: 'x' }, false).id);
    }
    const listed = sink.list();
    expect(listed).toHaveLength(MailSink.CAPACITY);
    expect(listed[0].subject).toBe(`m${MailSink.CAPACITY + 4}`);
    expect(listed[listed.length - 1].subject).toBe('m5');
    expect(sink.list(2).map((r) => r.subject)).toEqual([`m${MailSink.CAPACITY + 4}`, `m${MailSink.CAPACITY + 3}`]);
    expect(sink.get(ids[0])).toBeUndefined();
    expect(sink.get(ids[ids.length - 1])?.subject).toBe(`m${MailSink.CAPACITY + 4}`);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('recipient shapes reduce to bare addresses; the first link prefers the text part, then the html href; domains never carry local parts', () => {
    expect(MailSink.addresses('"Lane" <lane@example.invalid>, other@example.invalid')).toEqual([
      'lane@example.invalid',
      'other@example.invalid',
    ]);
    expect(MailSink.addresses([{ name: 'A', address: 'a@x.test' }, 'b@y.test'])).toEqual(['a@x.test', 'b@y.test']);
    expect(MailSink.addresses(undefined)).toEqual([]);
    expect(MailSink.firstLink('see https://a.test/one and https://a.test/two', INVITE_HTML)).toBe('https://a.test/one');
    expect(MailSink.firstLink('no link here', INVITE_HTML)).toBe('http://localhost:7985/auth/signup?token=abc123');
    expect(MailSink.firstLink('nothing', '<p>nothing</p>')).toBeUndefined();
    expect(MailSink.domains(['a@Example.invalid', 'b@example.invalid', 'c@other.test'])).toEqual([
      'example.invalid',
      'other.test',
    ]);
  });
});
