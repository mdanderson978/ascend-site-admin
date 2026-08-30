# Release and compatibility policy

`site-admin` follows Semantic Versioning and never moves published tags.

- **Patch** releases contain backward-compatible fixes and should converge
  automatically across sites after their smoke checks pass.
- **Minor** releases add backward-compatible features and may converge
  automatically after site checks pass.
- **Major** releases may change `admin.config.mjs` or content contracts and
  always require a manual migration.

The supported public contract is `startAdmin(config)` plus `verifySite(config)`.
Site-specific fields, sections, page labels, navigation, tasks, branding and
developer contact details remain in each content repo's `admin.config.mjs`.

## Release procedure

1. Create a release branch and update `package.json` plus release notes.
2. Run `npm ci && npm run verify && npm run test:e2e`.
3. Open a pull request; required Verify and CodeQL checks must pass.
4. Merge the pull request.
5. Create and push an immutable annotated `vX.Y.Z` tag on the merge commit.
6. Confirm the content-repo updater workflows detect the release.

For a V2 rollback, pin the last stable 1.x tag. During staged acceptance, a
site can instead set `adminUi: 'legacy'` without changing its engine version;
the React interface remains directly available at `/v2` for comparison, and
the legacy interface itself is always reachable directly at `/legacy`
regardless of `adminUi`.

**`adminUi: 'legacy'` and `/legacy` are deprecated** as of v2.8.0: both keep
working exactly as before, but logging a console warning (at boot, and again
the first time `/legacy` is actually visited) so a lingering rollback isn't
silent. They will be removed in a future major version once no known site in
the fleet still sets `adminUi: 'legacy'` — check the private fleet inventory
before that removal, not just this repo.

Client-fleet inventory and rollout reporting are private business operations,
not engine responsibilities. Keep them in a separate private operations
repository; never add client names or private repository identifiers here.
