import { Loadable, SourceRepository } from '@proteinjs/reflection';
import Mail from 'nodemailer/lib/mailer';

export const getDefaultSignupConfirmationEmailConfigFactory = (): DefaultSignupConfirmationEmailConfigFactory => {
  const defaultFactory: DefaultSignupConfirmationEmailConfigFactory = {
    getConfig: (): SignupConfirmationEmailConfig => ({
      getNewUserEmailContent: () => ({
        text: `Welcome to our app! Thank you for signing up. Your account has been successfully created.`,
      }),
      getExistingUserEmailContent: () => ({
        text: `Hello, We received a sign up request for this email address, but you already have an account with us.
        If you didn't attempt to sign up again, you can safely ignore this email.`,
      }),
    }),
  };

  const factory = SourceRepository.get().object<DefaultSignupConfirmationEmailConfigFactory>(
    '@proteinjs/user-server/DefaultSignupConfirmationEmailConfigFactory'
  );
  return factory || defaultFactory;
};

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
