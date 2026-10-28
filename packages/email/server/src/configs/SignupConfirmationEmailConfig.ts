import { Loadable, SourceRepository } from '@proteinjs/reflection';
import Mail from 'nodemailer/lib/mailer';

export interface DefaultSignupConfirmationEmailConfigFactory extends Loadable {
  getConfig(): SignupConfirmationEmailConfig;
}

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
    '@proteinjs/email-server/DefaultSignupConfirmationEmailConfigFactory'
  );
  return factory || defaultFactory;
};

/**
 * What the new-user email may carry beside its welcome. Every field is optional, and a config
 * written before this context existed keeps working unchanged: it is handed as the content
 * function's one argument, which an older implementation simply never reads.
 */
export interface SignupConfirmationEmailContext {
  /**
   * A partial URL path that confirms the account's email address, including the verification
   * token. This is in the format: 'account/verify-email?token=abc123def456'.
   * Note: This is NOT a full URL. You need to prepend your application's base URL to create a complete, clickable link in the email content.
   *
   * Absent when the address is already verified — an account created from an invite proved its
   * address by receiving the invite — so a config renders the confirm line only when it is here.
   */
  verifyEmailLink?: string;
}

export interface SignupConfirmationEmailConfig {
  /**
   * Options to pass into the `EmailSender` object when building the email to be sent.
   *
   * @see https://nodemailer.com/message/ for all available options
   */
  options?: Mail.Options;

  /**
   * Subject for new user signup confirmation emails.
   * If provided, this will override the subject in options for new user emails.
   */
  newUserSubject?: string;

  /**
   * Subject for existing user notification emails.
   * If provided, this will override the subject in options for existing user emails.
   */
  existingUserSubject?: string;

  /**
   * Generates the email content for a new user signup confirmation.
   *
   * @param context What this email may carry beside the welcome — the link that confirms the
   * address when the account's email is not yet verified. See `SignupConfirmationEmailContext`.
   *
   * @returns An object containing the email content:
   * - text: The plain text version of the email (required)
   * - html: The HTML version of the email (optional, used for styling)
   *
   * @example
   * getNewUserEmailContent: (context) => {
   *   const confirm = context?.verifyEmailLink ? ` Confirm your email: https://myapp.com/${context.verifyEmailLink}` : '';
   *   return { text: `Welcome!${confirm}` };
   * }
   */
  getNewUserEmailContent: (context?: SignupConfirmationEmailContext) => {
    text: string;
    html?: string;
  };

  /**
   * Generates the email content for an existing user if they attempt to sign up again.
   *
   * If not provided, an email will not be sent in this scenario.
   *
   * @returns An object containing the email content:
   * - text: The plain text version of the email (required)
   * - html: The HTML version of the email (optional, used for styling)
   */
  getExistingUserEmailContent?: () => {
    text: string;
    html?: string;
  };
}
