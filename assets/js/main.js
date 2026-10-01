document.addEventListener('DOMContentLoaded', () => {
  const mobileToggle = document.querySelector('.mobile-toggle');
  const nav = document.querySelector('.nav-links');
  if (mobileToggle && nav) {
    mobileToggle.addEventListener('click', () => {
      nav.classList.toggle('open');
    });
  }

  document.querySelectorAll('.magnetic').forEach((card) => {
    card.addEventListener('pointermove', (event) => {
      const rect = card.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const px = (x / rect.width - 0.5) * 16;
      const py = (y / rect.height - 0.5) * -16;
      card.style.setProperty('--rx', `${py}deg`);
      card.style.setProperty('--ry', `${px}deg`);
      card.style.transform = `perspective(800px) rotateX(${py}deg) rotateY(${px}deg) translateY(-4px)`;
    });

    card.addEventListener('pointerleave', () => {
      card.style.transform = 'perspective(800px) rotateX(0deg) rotateY(0deg) translateY(0)';
      card.style.setProperty('--rx', '0deg');
      card.style.setProperty('--ry', '0deg');
    });
  });

  document.querySelectorAll('.download-btn, .action-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const label = button.dataset.label || 'Resource';
      showToast(`${label} downloaded successfully`, 'success');
    });
  });

  document.querySelectorAll('.bookmark-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const resource = button.dataset.resource || 'resource';
      const saved = button.classList.toggle('saved');
      button.textContent = saved ? '★ Saved' : '☆ Save';
      showToast(saved ? `${resource} saved` : `${resource} removed from saved resources`, saved ? 'success' : 'error');
    });
  });
});
