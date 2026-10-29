import semver from 'semver';
import { Logger } from '@proteinjs/logger';
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

  private logger = new Logger({ name: this.constructor.name });

  async needToUpdate(currentVersion: string) {
    const latestVersionRequiringUpdate = getLatestVersionRequiringUpdate().version;
    // Never demand a version newer than the build this server actually serves: an environment
    // running an older build than the constant (a PR/test stage built from an unversioned branch)
    // must not tell its clients to update forever — there is nothing newer to update to there.
    const runningVersion = getRunningAppVersion()?.getVersion();
    const requiredVersion =
      runningVersion && semver.lt(runningVersion, latestVersionRequiringUpdate)
        ? runningVersion
        : latestVersionRequiringUpdate;
    const stale = semver.lt(currentVersion, requiredVersion);
    // The verdict with the versions it was made from. The service layer's own lines summarize the
    // argument and the answer to their types (`string(6B)`, `boolean`), so without this line a
    // deploy's logs can count the checks but never say which clients were told to reload, nor
    // against what; a client that keeps calling routes the served build no longer has is then
    // indistinguishable from one the server kept telling it was current.
    this.logger.info({
      message: stale ? 'Stale client' : 'Current client',
      obj: { clientVersion: currentVersion, requiredVersion, runningVersion, latestVersionRequiringUpdate, stale },
    });
    return stale;
  }
}
