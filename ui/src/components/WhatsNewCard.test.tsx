import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { WhatsNewCard } from './WhatsNewCard';

afterEach(cleanup);

describe('WhatsNewCard', () => {
  it('lists the notes and hides on "Got it", reporting the dismissal', () => {
    const onDismiss = vi.fn().mockResolvedValue({ ok: true });
    render(<WhatsNewCard notes={[{ version: '2.21.0', text: 'The Publish button now tells you when something goes wrong.' }]} onDismiss={onDismiss} />);
    expect(screen.getByRole('heading', { name: "What's new" })).toBeInTheDocument();
    expect(screen.getByText(/Publish button now tells you/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(screen.queryByText(/Publish button now tells you/)).not.toBeInTheDocument();
  });

  it('still hides when saving the dismissal fails', () => {
    render(<WhatsNewCard notes={[{ version: '2.21.0', text: 'Note' }]} onDismiss={() => Promise.reject(new Error('offline'))} />);
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(screen.queryByText('Note')).not.toBeInTheDocument();
  });

  it('renders nothing when there is nothing new', () => {
    const { container } = render(<WhatsNewCard notes={[]} onDismiss={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
