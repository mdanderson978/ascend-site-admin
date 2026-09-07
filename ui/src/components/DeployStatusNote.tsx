// Shown inline next to the Publish button after a successful Publish (the
// git push itself succeeded) - deliberately just a small note beside the
// button that triggered it, not a separate floating banner/modal-styled
// element competing for the editor's attention.
//
// "Pushed to GitHub" rather than "Published": at this point that's the
// only thing actually confirmed. Whether the site is genuinely live
// depends on the downstream GitHub Actions build/deploy, which this
// engine has no way to check itself (that would need a GitHub API token
// with Actions-read access, and there's no secrets story for where a
// client's own machine would keep one safely - see CHANGELOG 2.15.0/1).
// The link goes straight to GitHub's own run history for the deploy
// workflow, which handles "not signed in yet" correctly on its own
// (login, then redirect straight back) - nothing here assumes the
// editor's browser has an active github.com session.
export function DeployStatusNote({ githubRepo, deployWorkflowFile }: { githubRepo: string; deployWorkflowFile: string }) {
  const workflowUrl = `https://github.com/${githubRepo}/actions/workflows/${encodeURIComponent(deployWorkflowFile)}`;
  return <span className="deploy-status-note">Pushed to GitHub — <a href={workflowUrl} target="_blank" rel="noreferrer">Check deploy status →</a></span>;
}
