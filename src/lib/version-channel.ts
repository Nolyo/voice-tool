export type ReleaseChannel = "stable" | "beta";

/**
 * Derives the release channel from the installed version string.
 *
 * A non-empty SemVer pre-release suffix — anything after the first `-`, once
 * `+build` metadata is stripped — means we are running a pre-release build.
 * This single rule covers the four suffixes release.yml already publishes as
 * GitHub prereleases (-beta, -alpha, -rc, -test), and any fifth one added
 * later, without touching this file.
 *
 * Note this is the channel of the *installed binary*, not the `update_channel`
 * setting. The two can diverge (a beta installed by hand while the preference
 * stays on stable); this answers "what am I running?".
 */
export function resolveChannel(version: string): ReleaseChannel {
  const withoutBuild = version.split("+")[0];
  const dash = withoutBuild.indexOf("-");
  if (dash === -1) return "stable";
  return withoutBuild.slice(dash + 1).length > 0 ? "beta" : "stable";
}
