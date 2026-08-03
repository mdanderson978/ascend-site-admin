import { describe, expect, it } from 'vitest';
import { startNoteParts } from './content';

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
