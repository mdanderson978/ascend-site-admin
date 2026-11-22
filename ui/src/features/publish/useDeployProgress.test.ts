import { describe, expect, it } from 'vitest';
import { deployDetailNote, deployFailedSummary, detailFor, formatElapsed } from './useDeployProgress';

describe('formatElapsed', () => {
  it('shows minutes and zero-padded seconds', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(75)).toBe('1:15');
    expect(formatElapsed(1805)).toBe('30:05');
  });
});

describe('detailFor', () => {
  const build = (cold: boolean) => ({ state: 'building' as const, cold, step: '', startedAt: '' });
  it('has nothing to say for a site whose workflow does not report', () => {
    expect(detailFor({ supported: true, live: false })).toBeNull();
  });
  it('tells a normal build from a cold one (no image cache)', () => {
    expect(detailFor({ supported: true, live: false, build: build(false) })).toBe('building');
    expect(detailFor({ supported: true, live: false, build: build(true) })).toBe('cold');
  });
  it('is queued behind a running build, or simply not started yet', () => {
    expect(detailFor({ supported: true, live: false, build: { state: 'waiting', behind: true } })).toBe('waiting');
    expect(detailFor({ supported: true, live: false, build: { state: 'waiting', behind: false } })).toBe('starting');
  });
  it('is deployed and waiting for the live site to show it', () => {
    expect(detailFor({ supported: true, live: false, build: { state: 'deployed', cold: false, step: '', startedAt: '' } })).toBe('finishing');
  });
});

describe('deployDetailNote', () => {
  it('explains a cold build and says not to publish again', () => {
    const note = deployDetailNote('cold');
    expect(note?.title).toMatch(/30 minutes/);
    expect(note?.text).toMatch(/no need to publish again/);
  });
  it('explains a queued publish', () => {
    expect(deployDetailNote('waiting')?.title).toMatch(/previous publish/);
  });
  it('stays quiet for a normal build', () => {
    for (const d of ['building', 'starting', 'finishing', null] as const) expect(deployDetailNote(d)).toBeNull();
  });
});

describe('deployFailedSummary', () => {
  it('says the live site is unchanged, the edits are kept, and who was told', () => {
    const s = deployFailedSummary('Sam');
    expect(s).toMatch(/live site hasn't changed/);
    expect(s).toMatch(/changes are saved/);
    expect(s).toMatch(/Sam has been notified/);
    expect(deployFailedSummary('')).toMatch(/Your web developer has been notified/);
  });
});
