import semver from 'semver';
import { VersionCheckerService, getLatestVersionRequiringUpdate } from '@proteinjs/app-version-common';

export class VersionChecker implements VersionCheckerService {
  public serviceMetadata = {
    auth: {
      allUsers: true,
    },
  };

  async needToUpdate(currentVersion: string) {
    const latestVersionRequiringUpdate = getLatestVersionRequiringUpdate();
    return semver.lt(currentVersion, latestVersionRequiringUpdate.version);
  }
}
