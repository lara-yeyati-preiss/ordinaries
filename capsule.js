// capsule.js
document.addEventListener('DOMContentLoaded', () => {
  const startBtn   = document.getElementById('start-capsule-btn');
  const grid       = document.getElementById('capsule-grid');
  const output     = document.getElementById('capsule-output');
  const thumbsWrap = output?.querySelector('.capsule-selected');
  const closeBtn   = document.getElementById('start-over-btn');

  const scrollTarget =
    document.getElementById('capsule-after-divider') ||
    document.getElementById('capsule-section');

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  // Track if we *just* hit 5 (to avoid re-scrolling on every change)
  let wasExactlyFive = false;

  function getSelectedCards() {
    return Array.from(grid.querySelectorAll('.card.selected'));
  }

  function renderThumbs() {
    if (!thumbsWrap) return;
    thumbsWrap.innerHTML = '';
    const imgs = getSelectedCards().slice(0, 5).map(c => c.querySelector('img'));
    imgs.forEach(img => {
      const d = document.createElement('div');
      d.className = 'capsule-thumb';
      const i = document.createElement('img');
      i.src = img.src;
      i.alt = img.alt || 'Selected object';
      d.appendChild(i);
      thumbsWrap.appendChild(d);
    });
  }

  function setupCheckboxes() {
    const cards = grid.querySelectorAll('.card');

    cards.forEach(card => {
      const chk = card.querySelector('.card-check');

      // Better cursor affordance on the chip
      if (chk) chk.style.cursor = 'pointer';

      chk.addEventListener('change', () => {
        // enforce hard cap of 5
        const already = getSelectedCards().length;
        if (chk.checked && already >= 5) {
          chk.checked = false;
          return;
        }

        // toggle selected style
        card.classList.toggle('selected', chk.checked);

        // current count
        const n = getSelectedCards().length;

        // keep thumbnails synced (even if still hidden)
        renderThumbs();

        // show the summary ONLY when count === 5, otherwise keep it hidden
        const isFive = n === 5;
        output.hidden = !isFive;

        // smooth-scroll once when we transition from <5 to 5
        if (isFive && !wasExactlyFive) {
          scrollTarget?.scrollIntoView({
            behavior: prefersReduced.matches ? 'auto' : 'smooth',
            block: 'start'
          });
        }

        // track our "exactly 5" state
        wasExactlyFive = isFive;
      });
    });
  }

  // Start button: only enable the mode & wire checkboxes. Do NOT show/scroll summary here.
  if (startBtn) {
    startBtn.addEventListener('click', () => {
      document.body.classList.add('capsule-mode');
      setupCheckboxes();
      // no scrolling and no showing the summary here
    });
  }

  // Close: hide summary and clear all selections
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      output.hidden = true;
      wasExactlyFive = false;

      document.querySelectorAll('.card-check').forEach(c => (c.checked = false));
      document.querySelectorAll('.card.selected').forEach(c => c.classList.remove('selected'));
      if (thumbsWrap) thumbsWrap.innerHTML = '';

      document.body.classList.remove('capsule-mode');
    });
  }
});
