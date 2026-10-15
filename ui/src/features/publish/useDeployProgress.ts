import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api/client';

// What happens after Publish pushes the content repo: the site's GitHub
// Actions workflow compiles and deploys it, which this engine can't watch
// directly (no token on a client's machine). Instead /api/deploy-status
// checks the live site's /version.json for the pushed commit.
//
//   deploying   -> pushed; waiting for the live site to report the commit
//   live        -> the live site is running this publish (or a later one)
//   unconfirmed -> the site has no version.json (or the deploy is taking
//                  far longer than any normal build): fall back to the
//                  deploy-workflow link, as before 2.17.0
export type DeployPhase = 'idle' | 'deploying' | 'live' | 'unconfirmed';

const POLL_MS = 10_000;
// A site without version.json: show "deploying" for about a normal build,
// then hand over to the workflow link.
const UNSUPPORTED_GRACE_MS = 2 * 60_000;
// A cold build that re-encodes every image can take half an hour.
const GIVE_UP_MS = 45 * 60_000;

export function useDeployProgress() {
  const [phase, setPhase] = useState<DeployPhase>('idle');
  const [elapsed, setElapsed] = useState(0);
  const run = useRef(0);

  const start = useCallback((commit: string | null | undefined) => {
    const id = ++run.current;
    const startedAt = Date.now();
    let supported = false;
    setPhase('deploying'); setElapsed(0);
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
        if (status.live) { setPhase('live'); return; }
      } catch { /* the local admin server hiccuped: keep waiting */ }
      if ((!supported && waited >= UNSUPPORTED_GRACE_MS) || waited >= GIVE_UP_MS) { setPhase('unconfirmed'); return; }
      setTimeout(poll, POLL_MS);
    };
    setTimeout(poll, POLL_MS);
  }, []);

  const reset = useCallback(() => { run.current++; setPhase('idle'); setElapsed(0); }, []);

  useEffect(() => {
    if (phase !== 'deploying') return;
    const startedAt = Date.now() - elapsed * 1000;
    const tick = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(tick);
    // elapsed is read once when deploying starts; the interval owns it after that
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => () => { run.current++; }, []);

  return { phase, elapsed, start, reset };
}

/** 75 -> "1:15" */
export const formatElapsed = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
