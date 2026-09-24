import nodemailer from 'nodemailer';
import { Logger } from '@proteinjs/logger';
import { Loadable, SourceRepository } from '@proteinjs/reflection';
import { RequestDigests } from '@proteinjs/util-node';
import Mail from 'nodemailer/lib/mailer';
import { MailSink } from './MailSink';

export interface EmailConfig {
  host: string;
  port: number;
  /** Defines if the connection should use SSL (if true) or not (if false) */
  secure: boolean;
  /**
   * Authentication details for the email account used to send emails. The real SMTP transport
   * requires them; a config built from an environment that holds no SMTP password carries none,
   * which only the mail sink accepts.
   */
  auth?: {
    user: string;
    pass: string;
  };
  /** Use the format `Display Name <email@address.com>` */
  from: string;
}

export interface DefaultEmailConfigFactory extends Loadable {
  getEmailConfig(): EmailConfig;
}

/**
 * Which transport a sender runs on, resolved from the process environment once per sender:
 *   - `EMAIL_TRANSPORT=sink` declares the mail sink — every message is recorded, none sent;
 *   - `DEVELOPMENT` set without `EMAIL_ALLOW_REAL_SEND=1` REFUSES the real transport — recorded in
 *     the sink instead, loudly (a development process never mails a real address by accident);
 *   - otherwise (`EMAIL_TRANSPORT=smtp` or unset, no `DEVELOPMENT`, or the explicit opt-in) the real
 *     SMTP transport, which needs the config's `auth`.
 */
export type EmailTransport =
  | { kind: 'smtp' }
  | { kind: 'sink'; refused: false }
  | { kind: 'sink'; refused: true; why: string };

export class EmailSender {
  private static defaultEmailConfig: EmailConfig;
  private config: EmailConfig;
  private transport: EmailTransport;
  /** The real transporter — present only on the smtp transport; the sink records without one. */
  private transporter?: nodemailer.Transporter;
  private fromAddress: string;
  private logger: Logger;

  constructor(config?: EmailConfig) {
    this.logger = new Logger({ name: this.constructor.name });
    this.config = config ? config : this.getDefaultEmailConfig();
    this.fromAddress = this.config.from;
    this.transport = EmailSender.transportFor(process.env);
    if (this.transport.kind === 'smtp') {
      this.transporter = this.createSmtpTransporter();
    }
  }

  async sendEmail(mailOptions: Mail.Options): Promise<void> {
    // The sender identity has ONE owner: the transport config's `from` (founder ruling
    // 2026-08-19, round-2 smoke — the deletion email must never fork from the app's public
    // sender). Per-message options can carry content (subject/text/html/to), but a stray
    // `options.from` spread through a call site must not silently override the identity —
    // that seam is how a sender fork would recur. A caller that genuinely needs a different
    // identity constructs its own EmailSender via `createEmailSender(config)`.
    const finalMailOptions = {
      ...mailOptions,
      from: this.fromAddress,
    };

    if (this.transport.kind === 'sink') {
      this.record(finalMailOptions, this.transport);
      return;
    }

    // No address reaches the log: the lines name the recipients by their address digests and
    // their domains. Digested BEFORE the send, so a process that cannot digest (no key) fails
    // before anything leaves rather than after.
    const recipients = [
      ...MailSink.addresses(finalMailOptions.to),
      ...MailSink.addresses(finalMailOptions.cc),
      ...MailSink.addresses(finalMailOptions.bcc),
    ];
    const digests = new RequestDigests();
    const named = { recipients: recipients.map((address) => digests.address(address)) };
    try {
      await this.transporter!.sendMail(finalMailOptions);
      this.logger.info({ message: `Email sent — ${this.recipientSummary(recipients)}`, obj: named });
    } catch (error: any) {
      this.logger.error({
        message: `Error sending email — ${this.recipientSummary(recipients)}`,
        obj: named,
        // The transport's own words, every address in them (a recipient's, the sender's own) as its
        // address digest — the one door every server package logs a caught error through.
        error: digests.redactError(error),
      });
      throw new Error('Failed to send email');
    }
  }

  /** The transport the environment resolves to (see `EmailTransport`); an unknown `EMAIL_TRANSPORT` is refused. */
  static transportFor(env: NodeJS.ProcessEnv): EmailTransport {
    const declared = env.EMAIL_TRANSPORT;
    if (declared !== undefined && declared !== 'sink' && declared !== 'smtp') {
      throw new Error(`EMAIL_TRANSPORT must be "sink" or "smtp", got "${declared}"`);
    }
    if (declared === 'sink') {
      return { kind: 'sink', refused: false };
    }
    if (env.DEVELOPMENT && env.EMAIL_ALLOW_REAL_SEND !== '1') {
      return { kind: 'sink', refused: true, why: 'DEVELOPMENT is set and EMAIL_ALLOW_REAL_SEND=1 is not' };
    }
    return { kind: 'smtp' };
  }

  private getDefaultEmailConfig(): EmailConfig {
    if (!EmailSender.defaultEmailConfig) {
      const defaultEmailConfigFactory = SourceRepository.get().object<DefaultEmailConfigFactory>(
        '@proteinjs/email-server/DefaultEmailConfigFactory'
      );
      if (!defaultEmailConfigFactory) {
        throw new Error(
          `Unable to find a @proteinjs/email-server/DefaultEmailConfigFactory implementation. Either implement DefaultEmailConfigFactory or pass in an email config when instantiating EmailSender.`
        );
      }

      EmailSender.defaultEmailConfig = defaultEmailConfigFactory.getEmailConfig();
    }

    return EmailSender.defaultEmailConfig;
  }

  private createSmtpTransporter(): nodemailer.Transporter {
    if (!this.config.auth) {
      throw new Error(
        'The real SMTP transport needs credentials and the email config carries no auth (the environment holds no SMTP password). ' +
          'A development process records mail in the sink instead: set DEVELOPMENT (or EMAIL_TRANSPORT=sink).'
      );
    }
    return nodemailer.createTransport({
      host: this.config.host,
      port: this.config.port,
      secure: this.config.secure,
      auth: this.config.auth,
    });
  }

  /** The sink path: the message is recorded, never transported; ONE line says so — recipient count and domains, never local parts. */
  private record(message: Mail.Options, transport: Extract<EmailTransport, { kind: 'sink' }>): void {
    const record = MailSink.get().record(message, transport.refused);
    const recipients = this.recipientSummary(record.to);
    if (transport.refused) {
      this.logger.warn({
        message: `Refusing the real SMTP transport: ${transport.why} — ${recipients} recorded in the mail sink instead as ${record.id}`,
      });
      return;
    }
    this.logger.info({
      message: `Mail sink: recorded ${record.id} (not sent) — ${recipients}, subject "${record.subject}"`,
    });
  }

  /** What a log line may say about a recipient list: the count and the domains, never a local part. */
  private recipientSummary(addresses: string[]): string {
    return `${addresses.length} recipient${addresses.length === 1 ? '' : 's'} (${MailSink.domains(addresses).join(', ') || 'no domain'})`;
  }
}

export function createEmailSender(config: EmailConfig): EmailSender {
  return new EmailSender(config);
}
