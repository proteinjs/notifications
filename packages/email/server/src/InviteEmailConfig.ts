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
   * @param resetPathWithToken A partial URL path for resetting the password, including the reset token.
   * This is in the format: 'login/reset-password?token=abc123def456'.
   * Note: This is NOT a full URL. You need to prepend your application's base URL to create a complete, clickable link in the email content.
   *
   * @returns An object containing the email content:
   * text: The plain text version of the email (required)
   * html: The HTML version of the email (optional, used for styling)
   *
   * @example
   * getEmailContent: (resetPathWithToken) => {
   *   const fullResetUrl = `https://myapp.com/${resetPathWithToken}`;
   *   return {
   *     text: `Click here to reset your password: ${fullResetUrl}`,
   *     html: `<p>Click <a href="${fullResetUrl}">here</a> to reset your password.</p>`
   *   };
   * }
   */
  getEmailContent: (resetPathWithToken: string) => {
    text: string;
    html?: string;
  };
}

export interface DefaultInviteEmailConfigFactory extends Loadable {
  getConfig(): InviteEmailConfig;
}
