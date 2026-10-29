/**
 * The version check's verdict is a log line of its own, carrying the versions it was made from.
 *
 * The service layer logs every call at info as a SUMMARY — the argument as `string(6B)`, the
 * answer as `boolean` — so a deploy's logs could count the checks but never say which clients
 * were told to reload, nor against which required version. The checker names its verdict: the
 * client's version, the version the server required of it, the version the server itself runs,
 * the authored floor, and whether the client is stale.
 */
import { VersionChecker } from '../src/services/VersionChecker';

let latestVersionRequiringUpdate = '1.0.0';
let runningVersion: string | undefined;

jest.mock('@proteinjs/app-version-common', () => ({
  getLatestVersionRequiringUpdate: () => ({ version: latestVersionRequiringUpdate }),
  getRunningAppVersion: () => (runningVersion ? { getVersion: () => runningVersion } : undefined),
}));

type InfoLine = { message: string; obj?: Record<string, unknown> };
const infoLines: InfoLine[] = [];

jest.mock('@proteinjs/logger', () => ({
  Logger: class {
    info(line: InfoLine) {
      infoLines.push(line);
    }
    warn() {}
    error() {}
    debug() {}
  },
}));

describe('the version check names its verdict', () => {
  beforeEach(() => {
    infoLines.length = 0;
    runningVersion = undefined;
  });

  it('a stale client: the answer is true and one line carries both versions and the verdict', async () => {
    latestVersionRequiringUpdate = '1.32.0';
    runningVersion = '1.32.0';

    const stale = await new VersionChecker().needToUpdate('1.31.1');

    expect(stale).toBe(true);
    expect(infoLines).toHaveLength(1);
    expect(infoLines[0].obj).toEqual({
      clientVersion: '1.31.1',
      requiredVersion: '1.32.0',
      runningVersion: '1.32.0',
      latestVersionRequiringUpdate: '1.32.0',
      stale: true,
    });
  });

  it('a current client: the answer is false and the line says so', async () => {
    latestVersionRequiringUpdate = '1.32.0';
    runningVersion = '1.32.0';

    const stale = await new VersionChecker().needToUpdate('1.32.0');

    expect(stale).toBe(false);
    expect(infoLines).toHaveLength(1);
    expect(infoLines[0].obj).toMatchObject({ clientVersion: '1.32.0', requiredVersion: '1.32.0', stale: false });
  });

  it('a server running an older build than the floor: the line names the clamped requirement', async () => {
    latestVersionRequiringUpdate = '1.32.0';
    runningVersion = '1.31.1';

    const stale = await new VersionChecker().needToUpdate('1.31.1');

    expect(stale).toBe(false);
    expect(infoLines[0].obj).toMatchObject({
      requiredVersion: '1.31.1',
      runningVersion: '1.31.1',
      latestVersionRequiringUpdate: '1.32.0',
      stale: false,
    });
  });

  it('no running version registered: the floor is the requirement and the line says the running version is unknown', async () => {
    latestVersionRequiringUpdate = '1.32.0';

    const stale = await new VersionChecker().needToUpdate('1.31.1');

    expect(stale).toBe(true);
    expect(infoLines[0].obj).toMatchObject({ requiredVersion: '1.32.0', runningVersion: undefined, stale: true });
  });
});
