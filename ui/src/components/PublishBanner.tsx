import { CloseIcon } from './Icons';

export interface PublishFailure { summary: string; output?: string }

// Deliberately not a Toast: a failed publish can mean the live site did not
// update, so it stays on screen until the editor dismisses it, and has room
// for the actual git/deploy output instead of one line of message text.
export function PublishBanner({ failure, onDismiss }: { failure: PublishFailure; onDismiss: () => void }) {
  return <div className="publish-banner" role="alert">
    <div className="publish-banner__header">
      <strong>❌ {failure.summary}</strong>
      <button className="icon-button" onClick={onDismiss} aria-label="Dismiss publish failure"><CloseIcon /></button>
    </div>
    {failure.output && <pre className="publish-banner__output">{failure.output}</pre>}
    <button className="button button--secondary" onClick={onDismiss}>Dismiss</button>
  </div>;
}
