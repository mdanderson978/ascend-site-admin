import { CloseIcon } from './Icons';

// Shown after a successful Publish (the git push itself succeeded). The
// engine never checks whether the downstream GitHub Actions build/deploy
// subsequently succeeds - that would need a GitHub API token with
// Actions-read access, and there's no secrets story for where a client's
// own machine would keep one safely. Instead this embeds GitHub's own
// workflow status badge, rendered in the EDITOR'S OWN BROWSER - which
// already has an authenticated github.com session from accepting their
// collaborator invite - so the badge's pass/fail color is real, live
// status with zero new infrastructure on the engine side.
//
// The "View deploy details" link is always shown, not conditionally
// revealed only on failure - reading the badge's own pass/fail out of its
// SVG content would need a credentialed cross-origin fetch from the
// browser, a real CORS complication for no real benefit here. A glance at
// the badge tells the editor pass or fail; the link is always one click
// away regardless, so a red badge is never a dead end.
//
// Persistent (not a Toast) for the same reason PublishBanner is: a client
// can't tell from a message that vanishes in a few seconds whether their
// site actually went live.
export function DeployStatusBanner({ githubRepo, deployWorkflowFile, onDismiss }: { githubRepo: string; deployWorkflowFile: string; onDismiss: () => void }) {
  const actionsUrl = `https://github.com/${githubRepo}/actions`;
  const badgeUrl = `https://github.com/${githubRepo}/actions/workflows/${encodeURIComponent(deployWorkflowFile)}/badge.svg`;
  return <div className="publish-banner publish-banner--success" role="status">
    <div className="publish-banner__header">
      <strong>✅ Published — your site is rebuilding now.</strong>
      <button className="icon-button" onClick={onDismiss} aria-label="Dismiss"><CloseIcon /></button>
    </div>
    <p className="deploy-status">
      <img src={badgeUrl} alt="Deploy status" />
      <a href={actionsUrl} target="_blank" rel="noreferrer">View deploy details →</a>
    </p>
  </div>;
}
