import { Loadable, SourceRepository } from '@proteinjs/reflection';
import Mail from 'nodemailer/lib/mailer';

export const getDefaultSignupConfirmationEmailConfigFactory = () =>
  SourceRepository.get().object<DefaultSignupConfirmationEmailConfigFactory>(
    '@proteinjs/email-server/DefaultSignupConfirmationEmailConfigFactory'
  );

export interface SignupConfirmationEmailConfig {
  /**
   * Options to pass into the `EmailSender` object when building the email to be sent.
   *
   * @see https://nodemailer.com/message/ for all available options
   */
  options?: Mail.Options;

  /**
   * Generates the email content for a new user signup confirmation.
   *
   * @returns An object containing the email content:
   * - text: The plain text version of the email (required)
   * - html: The HTML version of the email (optional, used for styling)
   */
  getNewUserEmailContent: () => {
    text: string;
    html?: string;
  };

  /**
   * Generates the email content for an existing user if they attempt to sign up again.
   *
   * @returns An object containing the email content:
   * - text: The plain text version of the email (required)
   * - html: The HTML version of the email (optional, used for styling)
   */
  getExistingUserEmailContent: () => {
    text: string;
    html?: string;
  };
}

export interface DefaultSignupConfirmationEmailConfigFactory extends Loadable {
  getConfig(): SignupConfirmationEmailConfig;
}
