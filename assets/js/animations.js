let revealObserver;

function setupRevealAnimations(root = document) {
  if (document.visibilityState === 'visible') {
    document.documentElement.classList.add('motion-ready');
  }
  if (!revealObserver) {
    revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  }

  root.querySelectorAll('.reveal, .quick-card, .branch-card, .resource-card, .step, .stat-card, .list-item').forEach((element, index) => {
    element.style.transitionDelay = `${Math.min(index * 80, 320)}ms`;
    revealObserver.observe(element);
  });
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    document.documentElement.classList.add('motion-ready');
  }
});

window.addEventListener('rn-dynamic-content', (event) => {
  const root = event.detail || document;
  setupRevealAnimations(root);
  const elements = [...root.querySelectorAll('.reveal, .quick-card, .branch-card, .resource-card, .step, .stat-card, .list-item')];
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      elements.forEach((element) => element.classList.add('visible'));
    });
  });
});

function animateCounters() {
  const counters = document.querySelectorAll('[data-count]');
  counters.forEach((counter) => {
    const target = Number(counter.dataset.count || 0);
    const duration = 1200;
    const start = performance.now();

    function tick(now) {
      const progress = Math.min((now - start) / duration, 1);
      const value = Math.round(progress * target);
      counter.textContent = `${value}+`;
      if (progress < 1) requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setupRevealAnimations();
    animateCounters();
  });
} else {
  setupRevealAnimations();
  animateCounters();
}
