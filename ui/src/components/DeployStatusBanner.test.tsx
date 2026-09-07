import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeployStatusBanner } from './DeployStatusBanner';

afterEach(cleanup);

describe('DeployStatusBanner', () => {
  // No embedded badge image - a Publish succeeding only proves git's own
  // cached credential works, which says nothing about whether the editor's
  // BROWSER has an active github.com login session. A logged-out viewer
  // would just see a broken image, not a helpful sign-in prompt. A plain
  // link lets GitHub's own site handle "not signed in yet" correctly
  // instead (login, then redirect straight back to the intended page).
  it('links straight to this repo/workflow\'s run history, with no embedded status image', () => {
    render(<DeployStatusBanner githubRepo="mdanderson978/example-content" deployWorkflowFile="publish-deploy.yml" onDismiss={vi.fn()} />);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    const link = screen.getByRole('link', { name: /check deploy status/i }) as HTMLAnchorElement;
    expect(link.href).toBe('https://github.com/mdanderson978/example-content/actions/workflows/publish-deploy.yml');
    expect(link.target).toBe('_blank');
  });

  it('calls onDismiss when closed', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<DeployStatusBanner githubRepo="mdanderson978/example-content" deployWorkflowFile="publish-deploy.yml" onDismiss={onDismiss} />);
    await user.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(onDismiss).toHaveBeenCalled();
  });
});
