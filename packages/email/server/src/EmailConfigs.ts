import { Loadable, SourceRepository } from '@proteinjs/reflection';
import Mail from 'nodemailer/lib/mailer';

export const getDefaultPasswordResetEmailConfigFactory = () =>
  SourceRepository.get().object<DefaultPasswordResetEmailConfigFactory>(
    '@proteinjs/user-server/DefaultPasswordResetEmailConfigFactory'
  );

export interface PasswordResetEmailConfig {
  options?: Mail.Options;
  getEmailContent: (token: string) => {
    text: string;
    html?: string;
  };
}

export interface DefaultPasswordResetEmailConfigFactory extends Loadable {
  getConfig(): PasswordResetEmailConfig;
}
