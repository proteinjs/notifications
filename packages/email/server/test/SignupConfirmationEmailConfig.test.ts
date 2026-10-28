import { SourceRepository } from '@proteinjs/reflection';
import {
  getDefaultSignupConfirmationEmailConfigFactory,
  SignupConfirmationEmailConfig,
  SignupConfirmationEmailContext,
} from '../index';

/**
 * The new-user content function takes an optional context — the link that confirms the address
 * when the account's email is not yet verified — and the contract stays backwards-compatible on
 * purpose: consumers implement this interface, and one written before the context existed is
 * still a `SignupConfirmationEmailConfig` (its function reads no argument). The default factory
 * answers the same welcome with and without the context; a config that reads the link renders
 * it. Both are typed through the package index, so the context type is part of the public surface.
 */

type SourceRepositoryInternals = { objectCache: Record<string, unknown[]> };

describe('SignupConfirmationEmailConfig — the optional verify-email context', () => {
  beforeAll(() => {
    // No consumer factory registered (the suite loads no generated source graph): the default answers.
    (SourceRepository.get() as unknown as SourceRepositoryInternals).objectCache[
      '@proteinjs/email-server/DefaultSignupConfirmationEmailConfigFactory'
    ] = [];
  });

  it('the default factory answers the welcome with and without the context', () => {
    const config = getDefaultSignupConfirmationEmailConfigFactory().getConfig();
    const context: SignupConfirmationEmailContext = { verifyEmailLink: 'account/verify-email?token=abc123def456' };

    const plain = config.getNewUserEmailContent();
    const withLink = config.getNewUserEmailContent(context);
    const withEmptyContext = config.getNewUserEmailContent({});

    expect(plain.text).toMatch(/welcome/i);
    expect(withLink).toEqual(plain);
    expect(withEmptyContext).toEqual(plain);
  });

  it('a config written without the context is still a SignupConfirmationEmailConfig (the compatibility clause)', () => {
    const legacy: SignupConfirmationEmailConfig = {
      getNewUserEmailContent: () => ({ text: 'Welcome.' }),
    };

    expect(legacy.getNewUserEmailContent({ verifyEmailLink: 'account/verify-email?token=abc123def456' }).text).toBe(
      'Welcome.'
    );
  });

  it('a config that reads the context renders the link only when it is present', () => {
    const reading: SignupConfirmationEmailConfig = {
      getNewUserEmailContent: (context) => ({
        text: context?.verifyEmailLink ? `Welcome. Confirm: https://app.test/${context.verifyEmailLink}` : 'Welcome.',
      }),
    };

    expect(reading.getNewUserEmailContent().text).toBe('Welcome.');
    expect(reading.getNewUserEmailContent({}).text).toBe('Welcome.');
    expect(reading.getNewUserEmailContent({ verifyEmailLink: 'account/verify-email?token=abc123def456' }).text).toBe(
      'Welcome. Confirm: https://app.test/account/verify-email?token=abc123def456'
    );
  });
});
