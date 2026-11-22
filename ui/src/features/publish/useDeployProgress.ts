import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api/client';
import type { DeployStatus } from '../../api/types';

// What happens after Publish pushes the content repo: the site's GitHub
// Actions workflow compiles and deploys it. /api/deploy-status checks the
// live site's /version.json for the pushed commit and, since 2.21.0, what
// the workflow itself reports on the repo's `deploy-status` branch.
//
//   deploying   -> pushed; waiting for the live site to report the commit
//                  (detail says what the workflow is doing, when it reports)
//   live        -> the live site is running this publish (or a later one)
//   failed      -> the workflow reported that this publish's build failed:
//                  the live site is unchanged
//   unconfirmed -> nothing can confirm the deploy (no version.json and no
//                  workflow report, or far longer than any build): fall
//                  back to the deploy-workflow link, as before 2.17.0
export type DeployPhase = 'idle' | 'deploying' | 'live' | 'failed' | 'unconfirmed';

//   building  -> the build for this publish is running
//   cold      -> ...with no image cache: every image is re-encoded, so it
//                takes many times longer than usual
//   waiting   -> queued behind an earlier publish that is still building
//   starting  -> the workflow hasn't picked this publish up yet
//   finishing -> deployed; waiting for the live site to show it
//   null      -> the workflow doesn't report (older sites): no detail
export type DeployDetail = 'building' | 'cold' | 'waiting' | 'starting' | 'finishing' | null;

const POLL_MS = 10_000;
// A site without version.json or a workflow report: show "deploying" for
// about a normal build, then hand over to the workflow link.
const UNSUPPORTED_GRACE_MS = 2 * 60_000;
// Without a workflow report, give up after this. A cold build that
// re-encodes every image can take half an hour.
const GIVE_UP_MS = 45 * 60_000;
// With one, the workflow itself says when it fails (its job times out at
// 60 minutes), so this only covers a report that stops arriving.
const GIVE_UP_REPORTED_MS = 90 * 60_000;

export function detailFor(status: DeployStatus): DeployDetail {
  const b = status.build;
  if (!b) return null;
  if (b.state === 'waiting') return b.behind ? 'waiting' : 'starting';
  if (b.state === 'deployed') return 'finishing';
  if (b.state === 'building') return b.cold ? 'cold' : 'building';
  return null;
}

export function useDeployProgress() {
  const [phase, setPhase] = useState<DeployPhase>('idle');
  const [detail, setDetail] = useState<DeployDetail>(null);
  const [elapsed, setElapsed] = useState(0);
  const run = useRef(0);

  const start = useCallback((commit: string | null | undefined) => {
    const id = ++run.current;
    const startedAt = Date.now();
    let supported = false;
    let reported = false;
    setPhase('deploying'); setDetail(null); setElapsed(0);
    if (!commit) {
      setTimeout(() => { if (run.current === id) setPhase('unconfirmed'); }, UNSUPPORTED_GRACE_MS);
      return;
    }
    const poll = async () => {
      if (run.current !== id) return;
      const waited = Date.now() - startedAt;
      try {
        const status = await api.deployStatus(commit);
        if (run.current !== id) return;
        if (status.supported) supported = true;
        if (status.build) reported = true;
        if (status.live) { setPhase('live'); setDetail(null); return; }
        if (status.build?.state === 'failed') { setPhase('failed'); setDetail(null); return; }
        if (status.build) setDetail(detailFor(status));
      } catch { /* the local admin server hiccuped: keep waiting */ }
      const giveUp = reported ? GIVE_UP_REPORTED_MS : GIVE_UP_MS;
      if ((!supported && !reported && waited >= UNSUPPORTED_GRACE_MS) || waited >= giveUp) { setPhase('unconfirmed'); setDetail(null); return; }
      setTimeout(poll, POLL_MS);
    };
    setTimeout(poll, POLL_MS);
  }, []);

  const reset = useCallback(() => { run.current++; setPhase('idle'); setDetail(null); setElapsed(0); }, []);

  useEffect(() => {
    if (phase !== 'deploying') return;
    const startedAt = Date.now() - elapsed * 1000;
    const tick = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(tick);
    // elapsed is read once when deploying starts; the interval owns it after that
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => () => { run.current++; }, []);

  return { phase, detail, elapsed, start, reset };
}

/** 75 -> "1:15" */
export const formatElapsed = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

/** What to tell the editor while a publish deploys, when the workflow has
 *  said something that explains a longer wait. Normal builds say nothing
 *  beyond the button's own timer. */
export function deployDetailNote(detail: DeployDetail): { title: string; text: string } | null {
  switch (detail) {
    case 'cold': return { title: 'This publish will take about 30 minutes', text: 'The website is rebuilding every image this time, which happens now and then. It will finish on its own, so there is no need to publish again.' };
    case 'waiting': return { title: 'Waiting for the previous publish', text: 'An earlier publish is still being built. Yours starts as soon as it finishes.' };
    default: return null;
  }
}

/** The failure message: the live site is unchanged and the edits are kept. */
export const deployFailedSummary = (developerName: string) =>
  `The website couldn't be updated, so the live site hasn't changed. Your changes are saved. ${developerName || 'Your web developer'} has been notified.`;
