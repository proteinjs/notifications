import { Service, serviceFactory } from '@proteinjs/service';

export const getVersionCheckerService = serviceFactory<VersionCheckerService>(
  '@proteinjs/app-version-common/VersionCheckerService'
);

export interface VersionCheckerService extends Service {
  /**
   * Check to see if the current page needs to be updated to the latest
   * bundle version.
   * @param currentVersion the current version of the bundle
   * @return true if the page needs a newer bundle version
   */
  needToUpdate(currentVersion: string): Promise<boolean>;
}
