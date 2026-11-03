/**
 * pat-modal.js — prompts the user for a GitHub PAT via a styled modal
 * instead of the browser's native prompt() which has no password masking.
 *
 * Returns a Promise<string|null> — resolves with the token or null on cancel.
 */

export function requestPat() {
  return new Promise((resolve) => {
    const modal = document.getElementById('app-pat-modal');
    const input = document.getElementById('app-pat-input');
    const submit = document.getElementById('app-pat-submit');
    const cancel = document.getElementById('app-pat-cancel');
    if (!modal || !input || !submit || !cancel) {
      // Fallback if HTML element is missing (should not happen)
      resolve(window.prompt('Enter GitHub PAT:') || null);
      return;
    }

    input.value = '';
    modal.classList.add('is-visible');
    // Focus the input after the transition
    setTimeout(() => input.focus(), 80);

    const close = (value) => {
      modal.classList.remove('is-visible');
      submit.removeEventListener('click', onSubmit);
      cancel.removeEventListener('click', onCancel);
      input.removeEventListener('keydown', onKey);
      resolve(value);
    };

    const onSubmit = () => close(input.value.trim() || null);
    const onCancel = () => close(null);
    const onKey = (e) => {
      if (e.key === 'Enter') onSubmit();
      if (e.key === 'Escape') onCancel();
    };

    submit.addEventListener('click', onSubmit);
    cancel.addEventListener('click', onCancel);
    input.addEventListener('keydown', onKey);
  });
}
