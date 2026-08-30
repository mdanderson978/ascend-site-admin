import { useState } from 'react';
import type { AdminConfig, EntryResponse } from '../../api/types';
import { RenameDialog } from './RenameDialog';
import { EditIcon } from '../../components/Icons';

interface IdentityCardProps {
  entry: EntryResponse;
  config: AdminConfig;
  canRename: boolean;
  liveUrl: string;
  onRenamed: (newSlug: string) => void;
}

// The one place every page's identity (where it lives, whether it can be
// renamed) is shown — rendered above every other section of the form,
// including Schema, so it reads before anything else. Previously the
// Rename control was a topbar icon button, which global.css hides on
// mobile entirely (.topbar__actions .button, .topbar__actions >
// .icon-button { display: none }) — moving it into the scrollable form
// body fixes that for free, it isn't just a placement preference.
// A collection's urlPatterns entry fully determines whether its entries
// are flat top-level pages ('{slug}') or nested under a hub prefix
// ('some-hub/{slug}') — this needs no new config, just somewhere to show
// what was already computable but invisible before this card existed.
function nestingLabel(pattern: string | null | undefined): { nested: string | null } {
  if (!pattern) return { nested: null };
  const prefix = pattern.split('/{slug}')[0];
  return { nested: prefix !== pattern ? prefix : null };
}

export function IdentityCard({ entry, config, canRename, liveUrl, onRenamed }: IdentityCardProps) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [collection, slug] = (entry.key || '').split('/');

  if (!entry.key || !liveUrl) return null;

  const { nested } = nestingLabel(config.urlPatterns[collection]);
  const crossList = config.crossListable[collection];
  const isCrossListed = Boolean(crossList && entry.data[crossList.field]);

  return (
    <section className="form-card identity-card">
      <div className="form-card__fields identity-card__row">
        <div>
          <p className="identity-card__url">
            <span>Live at</span> <code>{liveUrl}</code>
          </p>
          <p className="identity-card__note">
            {nested ? <>Nested under <strong>{nested}</strong></> : 'Top-level page'}
            {isCrossListed && crossList && <> · Also shown on: {crossList.label || `${crossList.targetCollection} hub grid`}</>}
          </p>
        </div>
        {canRename && (
          <button type="button" className="button button--quiet" onClick={() => setRenameOpen(true)}>
            <EditIcon /> Change URL…
          </button>
        )}
      </div>
      {canRename && (
        <RenameDialog
          open={renameOpen}
          entryKey={entry.key}
          currentSlug={slug}
          currentUrl={liveUrl}
          onClose={() => setRenameOpen(false)}
          onRenamed={newSlug => { setRenameOpen(false); onRenamed(newSlug); }}
        />
      )}
    </section>
  );
}
