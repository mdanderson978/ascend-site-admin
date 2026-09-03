import { describe, expect, it } from 'vitest';
import { liveUrlFor, parseFuzzyDate, splitKey, startNoteParts } from './content';

describe('splitKey', () => {
  it('preserves a nested static page slug whole, not truncated to its first segment', () => {
    expect(splitKey('pages/about/index')).toEqual({ collection: 'pages', slug: 'about/index' });
    expect(splitKey('pages/awards/hall-of-fame/criteria')).toEqual({ collection: 'pages', slug: 'awards/hall-of-fame/criteria' });
  });

  it('splits a flat dynamic-collection key normally', () => {
    expect(splitKey('boardMembers/john-clark')).toEqual({ collection: 'boardMembers', slug: 'john-clark' });
  });

  it('handles a key with no slash at all', () => {
    expect(splitKey('home')).toEqual({ collection: 'home', slug: '' });
  });
});

describe('liveUrlFor', () => {
  it('strips a trailing "/index" segment so a nested page links to its real URL, not one level too deep', () => {
    expect(liveUrlFor('about/index', 'https://example.com', '{slug}')).toBe('https://example.com/about');
  });

  it('strips a bare "index" slug down to nothing (a top-level index page)', () => {
    expect(liveUrlFor('index', 'https://example.com', '{slug}')).toBe('https://example.com/');
  });

  it('leaves a non-index nested slug untouched', () => {
    expect(liveUrlFor('about/governance', 'https://example.com', '{slug}')).toBe('https://example.com/about/governance');
  });

  it('encodes special characters within a segment without mangling the "/" between segments into %2F', () => {
    expect(liveUrlFor('news/a q&a', 'https://example.com', '{slug}')).toBe('https://example.com/news/a%20q%26a');
  });

  it('maps "home" straight to the site root regardless of pattern', () => {
    expect(liveUrlFor('home', 'https://example.com', 'pages/{slug}')).toBe('https://example.com/');
  });

  it('applies a collection-specific path prefix', () => {
    expect(liveUrlFor('john-clark', 'https://example.com', 'about/board/{slug}')).toBe('https://example.com/about/board/john-clark');
  });

  it('returns empty when siteUrl or the pattern is missing, so the button can hide instead of showing a broken link', () => {
    expect(liveUrlFor('about/index', '', '{slug}')).toBe('');
    expect(liveUrlFor('about/index', 'https://example.com', null)).toBe('');
    expect(liveUrlFor('about/index', 'https://example.com', undefined)).toBe('');
  });
});

describe('parseFuzzyDate', () => {
  it('accepts ISO order with any of the supported delimiters', () => {
    expect(parseFuzzyDate('2026-08-30')).toBe('2026-08-30');
    expect(parseFuzzyDate('2026/08/30')).toBe('2026-08-30');
    expect(parseFuzzyDate('2026.08.30')).toBe('2026-08-30');
    expect(parseFuzzyDate('2026 08 30')).toBe('2026-08-30');
  });

  it('accepts Australian DD-MM-YYYY order, identified by the 4-digit year coming last', () => {
    expect(parseFuzzyDate('30/08/2026')).toBe('2026-08-30');
    expect(parseFuzzyDate('30-08-2026')).toBe('2026-08-30');
    expect(parseFuzzyDate('30 08 2026')).toBe('2026-08-30');
  });

  it('pads single-digit day/month', () => {
    expect(parseFuzzyDate('9/1/2026')).toBe('2026-01-09');
  });

  it('rejects a 2-digit year as ambiguous rather than guessing the century', () => {
    expect(parseFuzzyDate('30-08-26')).toBeNull();
  });

  it('rejects US-style MM-DD-YYYY when the month value is out of range, instead of silently reading it as DD-MM', () => {
    expect(parseFuzzyDate('08-30-2026')).toBeNull(); // "30" is not a valid month
  });

  it('rejects an impossible calendar date without ever constructing a Date object', () => {
    expect(parseFuzzyDate('2026-02-30')).toBeNull();
    expect(parseFuzzyDate('2026-13-01')).toBeNull();
  });

  it('accepts a real leap day and rejects Feb 29 on a non-leap year', () => {
    expect(parseFuzzyDate('2024-02-29')).toBe('2024-02-29');
    expect(parseFuzzyDate('2026-02-29')).toBeNull();
  });

  it('rejects unparseable garbage', () => {
    expect(parseFuzzyDate('not a date')).toBeNull();
    expect(parseFuzzyDate('')).toBeNull();
  });
});

describe('startNoteParts', () => {
  it('keeps the supported strong and break formatting as structured parts', () => {
    expect(startNoteParts('Before<br><strong>Important</strong> after')).toEqual([
      { text: 'Before', strong: false },
      { break: true },
      { text: 'Important', strong: true },
      { text: ' after', strong: false },
    ]);
  });

  it('leaves attribute-bearing or executable markup as inert text for React to escape', () => {
    expect(startNoteParts('<strong onclick="alert(1)">No<script>alert(2)</script>')).toEqual([
      { text: '<strong onclick="alert(1)">No<script>alert(2)</script>', strong: false },
    ]);
  });
});
