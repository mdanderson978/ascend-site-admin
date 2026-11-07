const triggerSelector = '[data-ab-gallery-open]';

function galleryDialog() {
  let dialog = document.querySelector('[data-ab-gallery-dialog]');
  if (dialog) return dialog;
  dialog = document.createElement('dialog');
  dialog.className = 'ab-gallery-dialog';
  dialog.dataset.abGalleryDialog = '';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'ab-gallery-dialog__close';
  close.setAttribute('aria-label', 'Close larger photo');
  close.textContent = '×';
  const figure = document.createElement('figure');
  const image = document.createElement('img');
  const caption = document.createElement('figcaption');
  figure.append(image, caption);
  dialog.append(close, figure);
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });
  document.body.append(dialog);
  return dialog;
}

document.addEventListener('click', event => {
  const trigger = event.target.closest?.(triggerSelector);
  if (!trigger) return;
  event.preventDefault();
  const dialog = galleryDialog();
  const source = trigger.querySelector('img');
  const image = dialog.querySelector('img');
  const caption = dialog.querySelector('figcaption');
  image.src = trigger.href;
  image.alt = source?.alt || '';
  const text = trigger.closest('figure')?.querySelector('.ab-gallery__caption')?.textContent?.trim() || '';
  caption.textContent = text;
  caption.hidden = !text;
  dialog.showModal();
});
