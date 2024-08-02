import { Loadable, SourceRepository } from '@proteinjs/reflection';

export const getLatestVersionRequiringUpdate = () =>
  SourceRepository.get().object<LatestVersionRequiringUpdate>(
    '@proteinjs/app-version-common/LatestVersionRequiringUpdate'
  );

/**
 * Implement this interface to provide the latest version of your app that
 * contains changes the user should get a fresh bundle for.
 *
 * Instead of prompting the user to reload their page with every new app version
 * deployed, use this to specify versions that you feel are worthy of pestering
 * the user about (ie. breaking changes, significant feature drops, etc.).
 */
export interface LatestVersionRequiringUpdate extends Loadable {
  /**
   * If the user's bundle version is lower than this version, the `AppVersionUpdateBanner`
   * will be displayed until they reload the page.
   */
  version: string;
}
