import { site } from '../content/site';

/**
 * Copy-to-clipboard button for the contact email, with a select-text fallback.
 * The result also goes to a status region, because screen readers don't announce a button's text changing.
 */
export function initCopyEmail() {
  const button = document.querySelector<HTMLButtonElement>('[data-copy-email]');
  const email = document.querySelector<HTMLElement>('[data-text="contact.email"]');
  const status = document.querySelector<HTMLElement>('[data-copy-status]');
  if (!button || !email) return;

  const t = site.ui.copyEmail;
  let reset = 0;
  const say = (text: string) => {
    button.textContent = text;
    if (status) status.textContent = text;
  };
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(email.textContent?.trim() ?? '');
      say(t.copied);
      button.classList.add('is-done'); // a blaze paints in beside the button (sections.css)
    } catch {
      const range = document.createRange();
      range.selectNodeContents(email);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      say(t.selected);
    }
    window.clearTimeout(reset);
    reset = window.setTimeout(() => {
      button.textContent = t.label;
      button.classList.remove('is-done');
      if (status) status.textContent = '';
    }, 2000);
  });
}
