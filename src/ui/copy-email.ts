/** Copy-to-clipboard button for the contact email, with a select-text fallback. */
export function initCopyEmail() {
  const button = document.querySelector<HTMLButtonElement>('[data-copy-email]');
  const email = document.querySelector<HTMLElement>('[data-text="contact.email"]');
  if (!button || !email) return;

  const original = button.textContent;
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(email.textContent?.trim() ?? '');
      button.textContent = 'Copied';
    } catch {
      const range = document.createRange();
      range.selectNodeContents(email);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      button.textContent = 'Selected — press Ctrl/⌘ C';
    }
    window.setTimeout(() => (button.textContent = original), 2000);
  });
}
