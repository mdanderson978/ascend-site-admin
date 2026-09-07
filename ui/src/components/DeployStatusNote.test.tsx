import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { DeployStatusNote } from './DeployStatusNote';

afterEach(cleanup);

describe('DeployStatusNote', () => {
  it('links straight to this repo/workflow\'s run history, with "Pushed to GitHub" copy since deploy success is not actually confirmed yet', () => {
    render(<DeployStatusNote githubRepo="mdanderson978/example-content" deployWorkflowFile="publish-deploy.yml" />);

    expect(screen.getByText(/Pushed to GitHub/)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /check deploy status/i }) as HTMLAnchorElement;
    expect(link.href).toBe('https://github.com/mdanderson978/example-content/actions/workflows/publish-deploy.yml');
    expect(link.target).toBe('_blank');
  });
});
