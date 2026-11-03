export function renderTableToggles(container) {
  // Find all section headings that precede a table or list
  container.querySelectorAll('h3.section-heading').forEach((h3, idx) => {
    // Generate a unique ID based on text content
    const uid = h3.textContent.trim().replace(/[^a-zA-Z0-9]/g, '_') + '_' + idx;

    // Check if toggle already exists
    if (h3.querySelector('.table-toggle')) return;

    import('../core/state.js').then(({ state }) => {
      // Default to true if not set
      if (state.tableToggles[uid] === undefined) {
        state.tableToggles[uid] = true;
      }
      const isChecked = state.tableToggles[uid];

      const toggleHtml = `
        <label class="toggle-inline" style="float:right; margin-top:2px;">
          <input type="checkbox" class="table-toggle" data-uid="${uid}" ${isChecked ? 'checked' : ''}>
        </label>`;

      h3.insertAdjacentHTML('beforeend', toggleHtml);

      // Apply initial state
      _applyToggleState(h3, isChecked);

      // Event listener
      h3.querySelector('.table-toggle').addEventListener('change', (e) => {
         const checked = e.target.checked;
         state.tableToggles[uid] = checked;
         _applyToggleState(h3, checked);
      });
    });
  });
}

function _applyToggleState(h3, isChecked) {
  let next = h3.nextElementSibling;

  if (isChecked) {
    h3.classList.remove('disabled-section');
    h3.classList.remove('print-hidden');
  } else {
    h3.classList.add('disabled-section');
    h3.classList.add('print-hidden');
  }

  // Ensure h3's checkbox remains clickable even if section is disabled
  const toggleLbl = h3.querySelector('.toggle-inline');
  if (toggleLbl) toggleLbl.style.pointerEvents = 'auto';

  while (next && !next.matches('h3.section-heading')) {
    if (isChecked) {
      next.classList.remove('disabled-section');
      next.classList.remove('print-hidden');
    } else {
      next.classList.add('disabled-section');
      next.classList.add('print-hidden');
    }
    next = next.nextElementSibling;
  }
}
