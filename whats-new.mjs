// "What's new" for editors (2.22.0): shown once per computer, on the
// admin's start screen and in the terminal, the first time someone opens a
// version with something new for them.
//
// Writing a note:
// - Only for things an editor will notice. Fixes and internals get none.
// - One or two plain sentences, for a church secretary or a tradie, not a
//   developer: what they'll see and what (if anything) to do differently.
//   No engine names, versions, file names or jargon. No client names: this
//   repo is public.
// - `requires` names a feature (see siteFeatures) when the change only
//   works on sites that have it; the note is then hidden elsewhere. Any
//   other name is read as an admin.config.mjs flag (e.g. 'richHtmlImport').
// - Newest first. Only the 3 newest unseen notes are shown, so an editor
//   who skips several versions isn't buried.
export const WHATS_NEW = [
  {
    version: '2.21.0',
    requires: 'deployStatus',
    text: "If a publish is going to take longer than usual, or something goes wrong, the Publish button now tells you. While it's working there's no need to publish again.",
  },
];

// '2.10.0' vs '2.9.1' compared as numbers, part by part.
export function compareVersions(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

// Features a note can depend on that aren't simple config flags.
//   deployStatus: the site's deploy workflow reports its progress on the
//   deploy-status branch (2.21.0), so the Publish button can show it.
export function siteFeatures(config, workflowText) {
  const features = new Set();
  if (/deploy-status/.test(workflowText || '')) features.add('deployStatus');
  return features;
}

// The notes this site's editors should see that are newer than `seen`
// (the last version they dismissed; '' = never), at or below the running
// engine, newest first, at most 3.
export function unseenNotes({ notes = WHATS_NEW, config = {}, workflowText = '', seen = '', engineVersion }) {
  const features = siteFeatures(config, workflowText);
  return notes
    .filter(n => !n.requires || features.has(n.requires) || Boolean(config[n.requires]))
    .filter(n => !engineVersion || compareVersions(n.version, engineVersion) <= 0)
    .filter(n => !seen || compareVersions(n.version, seen) > 0)
    .sort((a, b) => compareVersions(b.version, a.version))
    .slice(0, 3)
    .map(({ version, text }) => ({ version, text }));
}
