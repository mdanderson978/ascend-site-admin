import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PublishBanner } from './PublishBanner';

afterEach(cleanup);

describe('PublishBanner', () => {
  it('shows the summary and full output, and does not auto-dismiss', async () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<PublishBanner failure={{ summary: 'Something went wrong publishing your changes.', output: 'CONFLICT (content): Merge conflict in src/content/pages/home.md' }} onDismiss={onDismiss} />);

    expect(screen.getByText(/Something went wrong publishing/)).toBeInTheDocument();
    expect(screen.getByText(/CONFLICT \(content\)/)).toBeInTheDocument();

    // A failed publish can mean the live site didn't update — unlike a
    // toast, this must not vanish on its own while the editor is away.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(onDismiss).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('closes only when the editor clicks Dismiss', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<PublishBanner failure={{ summary: 'Something went wrong publishing your changes.' }} onDismiss={onDismiss} />);

    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('omits the output block when there is none to show', () => {
    render(<PublishBanner failure={{ summary: 'Save your draft before publishing.' }} onDismiss={vi.fn()} />);
    expect(screen.queryByText('CONFLICT')).not.toBeInTheDocument();
  });
});
