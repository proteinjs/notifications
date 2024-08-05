import { Loadable, SourceRepository } from '@proteinjs/reflection';
import Mail from 'nodemailer/lib/mailer';

export const getDefaultInviteEmailConfigFactory = () =>
  SourceRepository.get().object<DefaultInviteEmailConfigFactory>(
    '@proteinjs/email-server/DefaultInviteEmailConfigFactory'
  );

export interface InviteEmailConfig {
  /**
   * Options to pass into the `EmailSender` object when building the email to be sent.
   *
   * @see https://nodemailer.com/message/ for all available options
   */
  options?: Mail.Options;

  /**
   * A function that generates the email content (both text and HTML versions) for the password reset email.
   *
   * @param signupPathWithToken A partial URL path for the sign up page, including the invite token.
   * This is in the format: 'signup?token=abc123def456'.
   * Note: This is NOT a full URL. You need to prepend your application's base URL to create a complete, clickable link in the email content.
   *
   * @returns An object containing the email content:
   * text: The plain text version of the email (required)
   * html: The HTML version of the email (optional, used for styling)
   *
   * @example
   * getEmailContent: (signupPathWithToken) => {
   *   const fullUrl = `https://myapp.com/${signupPathWithToken}`;
   *   return {
   *     text: `Click here to sign up: ${fullUrl}`,
   *     html: `<p>Click <a href="${fullUrl}">here</a> to sign up.</p>`
   *   };
   * }
   */
  getEmailContent: (signupPathWithToken: string) => {
    text: string;
    html?: string;
  };
}

export interface DefaultInviteEmailConfigFactory extends Loadable {
  getConfig(): InviteEmailConfig;
}
