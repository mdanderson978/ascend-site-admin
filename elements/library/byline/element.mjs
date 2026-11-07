import { defineElement, general } from '../../core/registry.mjs';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function dateParts(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return { year, month, day };
}

function readableDate(parts) {
  return `${parts.day} ${MONTHS[parts.month - 1]} ${parts.year}`;
}

export default defineElement({
  name: 'byline',
  title: 'Byline',
  group: 'Article',
  icon: 'person',
  allowedParents: ['article'],
  ai: 'The named author or reviewer of an article. Attributes: name (required), role (optional), photo (optional), reviewed (optional ISO date in YYYY-MM-DD form). Use once near the start of an article when authorship or expert review helps readers assess it.',
  placeholder: { props: { name: 'Author name', role: 'Role or area of expertise' } },
  fields: {
    name: { type: 'string', label: 'Name', required: true, inline: true },
    role: { type: 'string', label: 'Role', hint: 'Optional job title or area of expertise.' },
    photo: { type: 'image', label: 'Photo', hint: 'Optional portrait of the author or reviewer.' },
    reviewed: { type: 'date', label: 'Reviewed date', hint: 'Optional. When this article was last checked for accuracy.', pattern: '^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$' },
    ...general,
  },
  tabs: {
    Content: ['name', 'role', 'photo', 'reviewed'],
    Advanced: ['anchor', 'hidden', 'label'],
  },
  async render({ props, h, root, picture, problem }) {
    const name = String(props.name || '').trim();
    if (!name) return null;
    const photo = props.photo ? await picture('photo', { alt: '', decorative: true, className: 'ab-byline__photo' }) : '';
    const role = props.role ? h`<span class="ab-byline__role">${props.role}</span>` : '';
    const reviewedParts = dateParts(props.reviewed);
    if (props.reviewed && !reviewedParts) problem('The reviewed date is not a real calendar date. Choose it again in the editor.', 'reviewed');
    const reviewed = reviewedParts ? h`<span class="ab-byline__reviewed">Reviewed <time datetime="${props.reviewed}">${readableDate(reviewedParts)}</time></span>` : '';
    return h`<div${root({ class: 'ab-byline' })}>${photo}<p class="ab-byline__details"><strong class="ab-byline__name">${name}</strong>${role}${reviewed}</p></div>`;
  },
});
