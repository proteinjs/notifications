import semver from 'semver';
import {
  VersionCheckerService,
  getLatestVersionRequiringUpdate,
  getRunningAppVersion,
} from '@proteinjs/app-version-common';

export class VersionChecker implements VersionCheckerService {
  public serviceMetadata = {
    auth: {
      allUsers: true,
    },
  };

  async needToUpdate(currentVersion: string) {
    const latestVersionRequiringUpdate = getLatestVersionRequiringUpdate();
    // Never demand a version newer than the build this server actually serves: an environment
    // running an older build than the constant (a PR/test stage built from an unversioned branch)
    // must not tell its clients to update forever — there is nothing newer to update to there.
    const runningVersion = getRunningAppVersion()?.getVersion();
    const requiredVersion =
      runningVersion && semver.lt(runningVersion, latestVersionRequiringUpdate.version)
        ? runningVersion
        : latestVersionRequiringUpdate.version;
    return semver.lt(currentVersion, requiredVersion);
  }
}
