import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeployStatusBanner } from './DeployStatusBanner';

afterEach(cleanup);

describe('DeployStatusBanner', () => {
  it('shows the real GitHub Actions badge for this repo and workflow, and a link straight to the Actions page', () => {
    render(<DeployStatusBanner githubRepo="mdanderson978/example-content" deployWorkflowFile="publish-deploy.yml" onDismiss={vi.fn()} />);

    const badge = screen.getByAltText('Deploy status') as HTMLImageElement;
    expect(badge.src).toBe('https://github.com/mdanderson978/example-content/actions/workflows/publish-deploy.yml/badge.svg');

    const link = screen.getByRole('link', { name: /view deploy details/i }) as HTMLAnchorElement;
    expect(link.href).toBe('https://github.com/mdanderson978/example-content/actions');
    expect(link.target).toBe('_blank');
  });

  it('always shows the details link, not only when a failure is detected - reading the badge itself would need a credentialed cross-origin fetch', () => {
    render(<DeployStatusBanner githubRepo="mdanderson978/example-content" deployWorkflowFile="publish-deploy.yml" onDismiss={vi.fn()} />);
    expect(screen.getByRole('link', { name: /view deploy details/i })).toBeInTheDocument();
  });

  it('calls onDismiss when closed', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<DeployStatusBanner githubRepo="mdanderson978/example-content" deployWorkflowFile="publish-deploy.yml" onDismiss={onDismiss} />);
    await user.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(onDismiss).toHaveBeenCalled();
  });
});
