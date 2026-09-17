import { SourceRepository } from '@proteinjs/reflection';
import { ServerBuildVersion } from '@proteinjs/service';

export const getRunningAppVersion = (): RunningAppVersion | undefined =>
  SourceRepository.get().objects<RunningAppVersion>('@proteinjs/app-version-common/RunningAppVersion')[0];

/**
 * Optionally implement this (server-side) to tell the version checker what app version the
 * RUNNING server build is. When present, `VersionChecker.needToUpdate` never demands a version
 * newer than the server itself serves: clients are compared against
 * `min(latestVersionRequiringUpdate, runningAppVersion)`.
 *
 * Why: `latestVersionRequiringUpdate` is authored for the NEXT production deploy, but
 * pre-production environments (e.g. a PR/test stage) build from branches that don't version —
 * they serve OLDER app versions than the constant. Without this clamp, every client in such an
 * environment considers itself perpetually stale and reloads on each tab refocus. With it, an
 * environment can never be told to update past the build it is actually being served.
 *
 * The same fact serves the service layer: this IS the server's `ServerBuildVersion`, so one
 * implementation also lets ServiceRouter compare a caller's declared build with the server's when
 * a request names a service path the server does not register (a rollout in progress, a stale
 * client, or a client build shipped ahead of its server half — recorded as what it is).
 */
export interface RunningAppVersion extends ServerBuildVersion {
  /** The app version of the running server build (e.g. the fixed app-workspace version). */
  getVersion(): string;
}
