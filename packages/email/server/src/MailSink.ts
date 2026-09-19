import crypto from 'crypto';
import Mail from 'nodemailer/lib/mailer';

/** One message the sink holds: the wire message as the sender would have transported it. */
export interface MailSinkRecord {
  id: string;
  /** ISO timestamp of the record. */
  at: string;
  from: string;
  /** The recipient addresses, bare (`name <addr>` objects reduced to `addr`). */
  to: string[];
  subject: string;
  text?: string;
  html?: string;
  /** The first http(s) link in the body — the text part first, then the html's first href. */
  link?: string;
  /** True when a real transport was refused and the message landed here instead of being sent. */
  refused: boolean;
}

/**
 * MailSink — the development store of messages that were NOT sent: a bounded ring of the last
 * `CAPACITY` messages this process's EmailSenders recorded instead of transporting (EmailSender:
 * `EMAIL_TRANSPORT=sink`, or the real transport refused under `DEVELOPMENT`). ONE ring per
 * process, adopted on `globalThis`, so a second module copy of this package (a linked or nested
 * install) reads the ring the sender wrote — the reflection singleton's idiom. A dev-only route
 * lists and renders it (the consumer's door); nothing here is reachable in production, where the
 * sender never records.
 */
export class MailSink {
  static readonly CAPACITY = 200;
  private static readonly GLOBAL_KEY = '__proteinjs_email_server_mail_sink__';
  private records: MailSinkRecord[] = [];

  /** The process's one sink. */
  static get(): MailSink {
    const holder = globalThis as unknown as Record<string, MailSink | undefined>;
    if (!holder[MailSink.GLOBAL_KEY]) {
      holder[MailSink.GLOBAL_KEY] = new MailSink();
    }
    return holder[MailSink.GLOBAL_KEY] as MailSink;
  }

  /** Record a wire message; the oldest record falls off past CAPACITY. */
  record(message: Mail.Options, refused: boolean): MailSinkRecord {
    const text = typeof message.text === 'string' ? message.text : undefined;
    const html = typeof message.html === 'string' ? message.html : undefined;
    const record: MailSinkRecord = {
      id: `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`,
      at: new Date().toISOString(),
      from: MailSink.addresses(message.from).join(', '),
      to: MailSink.addresses(message.to),
      subject: message.subject ?? '',
      text,
      html,
      link: MailSink.firstLink(text, html),
      refused,
    };
    this.records.push(record);
    if (this.records.length > MailSink.CAPACITY) {
      this.records.splice(0, this.records.length - MailSink.CAPACITY);
    }
    return record;
  }

  /** The newest records first, at most `limit` (clamped to CAPACITY). */
  list(limit: number = MailSink.CAPACITY): MailSinkRecord[] {
    const count = Math.max(0, Math.min(Math.floor(limit), MailSink.CAPACITY));
    return this.records.slice(-count).reverse();
  }

  get(id: string): MailSinkRecord | undefined {
    return this.records.find((record) => record.id === id);
  }

  /** Empties the ring (tests). */
  clear(): void {
    this.records = [];
  }

  /** The domains of a recipient list, unique, in order — what a log line may name (never the local parts). */
  static domains(addresses: string[]): string[] {
    return Array.from(new Set(addresses.map((address) => address.slice(address.lastIndexOf('@') + 1).toLowerCase())));
  }

  /** Bare addresses from nodemailer's recipient shapes (a string, an Address, or a list of either). */
  static addresses(field: Mail.Options['to']): string[] {
    if (field === undefined || field === null) {
      return [];
    }
    const entries = Array.isArray(field) ? field : [field];
    return entries.flatMap((entry) => {
      if (typeof entry === 'string') {
        return entry
          .split(',')
          .map((part) => MailSink.bareAddress(part))
          .filter((address) => address.length > 0);
      }
      return [entry.address];
    });
  }

  /** The first http(s) link: the text part's first URL, else the html's first `href`. */
  static firstLink(text?: string, html?: string): string | undefined {
    const inText = text ? /https?:\/\/[^\s"'<>)]+/.exec(text) : null;
    if (inText) {
      return inText[0];
    }
    const inHtml = html ? /href="(https?:\/\/[^"]+)"/.exec(html) : null;
    return inHtml ? inHtml[1] : undefined;
  }

  /** `"Name" <addr>` or `Name <addr>` → `addr`; a bare address stays. */
  private static bareAddress(part: string): string {
    const bracketed = /<([^>]+)>/.exec(part);
    return (bracketed ? bracketed[1] : part).trim();
  }
}
