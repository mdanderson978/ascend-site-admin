import { useState } from 'react';
import type { WhatsNewNote } from '../api/types';

// "What's new" on the start screen (2.22.0): plain-English notes about
// changes an editor will notice, shown on each computer until "Got it".
// Which notes, and whether they've been seen, is decided server-side
// (whats-new.mjs): this only shows them and reports the dismissal. If that
// report fails the card still goes away for this session rather than
// nagging; it simply shows again next launch.
export function WhatsNewCard({ notes, onDismiss }: { notes: WhatsNewNote[]; onDismiss: () => Promise<unknown> }) {
  const [hidden, setHidden] = useState(false);
  if (hidden || notes.length === 0) return null;
  const dismiss = () => { setHidden(true); onDismiss().catch(() => {}); };
  return <section className="whats-new" aria-labelledby="whats-new-title">
    <h2 id="whats-new-title">What's new</h2>
    <ul>{notes.map(note => <li key={note.version}>{note.text}</li>)}</ul>
    <button className="button button--secondary" onClick={dismiss}>Got it</button>
  </section>;
}
