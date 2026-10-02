async function showStudentWelcome() {
  if (new URLSearchParams(window.location.search).get('welcome') !== '1') return;

  const session = await window.rnSupabaseUtils?.getCurrentUserSession();
  if (!session) return;

  const profile = await window.rnSupabaseUtils.getUserProfile();
  const displayName = profile?.name
    || session.user?.user_metadata?.full_name
    || session.user?.email?.split('@')[0]
    || 'Student';
  const heroActions = document.querySelector('.hero-actions');
  if (!heroActions) return;

  const welcomeMessage = document.createElement('p');
  welcomeMessage.className = 'student-welcome';
  welcomeMessage.setAttribute('role', 'status');
  welcomeMessage.textContent = `Welcome, ${displayName}! You are signed in.`;
  heroActions.before(welcomeMessage);

  const url = new URL(window.location.href);
  url.searchParams.delete('welcome');
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

document.addEventListener('DOMContentLoaded', () => {
  showStudentWelcome();
  document.querySelector('.nav-actions a[href="admin/login.html"]')?.remove();

  document.querySelectorAll('.footer li').forEach((item) => {
    if (!item.textContent.trim().startsWith('Email:')) return;
    const email = 'RaisoniNexus@gmail.com';
    const link = document.createElement('a');
    link.href = `mailto:${email}`;
    link.textContent = email;
    item.replaceChildren(document.createTextNode('Email: '), link);
  });

  document.querySelectorAll('[data-social-link]').forEach((link) => {
    const url = window.RN_SOCIAL_LINKS?.[link.dataset.socialLink];
    if (!url) {
      link.removeAttribute('href');
      link.setAttribute('aria-disabled', 'true');
      return;
    }
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.removeAttribute('aria-disabled');
  });

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
