import { CloseIcon } from './Icons';

// Shown after a successful Publish (the git push itself succeeded). The
// engine never checks whether the downstream GitHub Actions build/deploy
// subsequently succeeds - that would need a GitHub API token with
// Actions-read access, and there's no secrets story for where a client's
// own machine would keep one safely.
//
// An earlier version of this banner embedded GitHub's workflow status
// badge image directly, reasoning that it would render using the editor's
// own already-authenticated github.com browser session. That assumption
// doesn't hold: nothing about a successful Publish (which only proves
// git's OWN cached credential works, a completely separate thing from a
// browser's github.com login cookie) guarantees the editor's browser has
// an active session at all - and a logged-out viewer gets an ugly
// broken-image icon or an opaque 404, not a helpful sign-in prompt.
//
// Instead this is just a plain link. GitHub's own site already handles
// "not signed in yet" correctly - a logged-out click lands on GitHub's own
// login page, then redirects straight back to the workflow's run history
// on success. A logged-in editor goes straight there. Either way the
// editor sees real, authoritative status - just never embedded directly
// in this banner.
export function DeployStatusBanner({ githubRepo, deployWorkflowFile, onDismiss }: { githubRepo: string; deployWorkflowFile: string; onDismiss: () => void }) {
  const workflowUrl = `https://github.com/${githubRepo}/actions/workflows/${encodeURIComponent(deployWorkflowFile)}`;
  return <div className="publish-banner publish-banner--success" role="status">
    <div className="publish-banner__header">
      <strong>✅ Published — your site is rebuilding now.</strong>
      <button className="icon-button" onClick={onDismiss} aria-label="Dismiss"><CloseIcon /></button>
    </div>
    <a className="button button--secondary" href={workflowUrl} target="_blank" rel="noreferrer">Check deploy status →</a>
  </div>;
}
