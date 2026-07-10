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
2. Run `npm ci && npm run verify`.
3. Open a pull request; required Verify and CodeQL checks must pass.
4. Merge the pull request.
5. Create and push an immutable annotated `vX.Y.Z` tag on the merge commit.
6. Confirm the content-repo updater workflows detect the release.
7. Confirm the fleet inventory reports every site current or explains why an
   update is blocked.
