import { Loadable, SourceRepository } from '@proteinjs/reflection';
import Mail from 'nodemailer/lib/mailer';

export const getDefaultPasswordUpdatedEmailConfigFactory = () => {
  const defaultFactory: DefaultPasswordUpdatedEmailConfigFactory = {
    getConfig: (): PasswordUpdatedEmailConfig => ({
      text: `Hello, your password has been successfully updated. If this wasn't you, please reset your password immediately.`,
    }),
  };

  const retrievedFactory = SourceRepository.get().object<DefaultPasswordUpdatedEmailConfigFactory>(
    '@proteinjs/email-server/DefaultPasswordUpdatedEmailConfigFactory'
  );

  return retrievedFactory || defaultFactory;
};

export interface PasswordUpdatedEmailConfig {
  /**
   * Options to pass into the `EmailSender` object when building the email to be sent.
   *
   * @see https://nodemailer.com/message/ for all available options
   */
  options?: Mail.Options;
  /** The plain text version of the email (required) */
  text: string;
  /** The HTML version of the email (optional, used for styling) */
  html?: string;
}

export interface DefaultPasswordUpdatedEmailConfigFactory extends Loadable {
  getConfig(): PasswordUpdatedEmailConfig;
}
