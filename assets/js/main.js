const BUTTON_ICON_PATHS = {
  preview: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12',
  download: 'M12 3v12m0 0 5-5m-5 5-5-5M5 21h14',
  explore: 'M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16m6 14 4 4',
  branches: 'M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6M9 9h.01M15 9h.01M9 12h.01M15 12h.01',
  request: 'M4 5h16v14H4zM8 9h8m-8 4h8m-8 4h5',
  send: 'M22 2 11 13m11-11-7 20-4-9-9-4 20-7Z',
  profile: 'M20 21a8 8 0 0 0-16 0m8-8a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  account: 'M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m6-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8m11 0v6m-3-3h6',
  login: 'M10 17l5-5-5-5m5 5H3m12-9h5v18h-5',
  logout: 'M14 17l5-5-5-5m5 5H7m8-9h4v18h-4',
  password: 'M5 11h14v10H5zM8 11V7a4 4 0 1 1 8 0v4',
  back: 'M19 12H5m0 0 7-7m-7 7 7 7',
  clear: 'M18 6 6 18M6 6l12 12'
};

function createButtonIcon(iconName) {
  if (!BUTTON_ICON_PATHS[iconName]) return null;

  const namespace = 'http://www.w3.org/2000/svg';
  const icon = document.createElementNS(namespace, 'svg');
  icon.setAttribute('class', 'button-icon');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('aria-hidden', 'true');
  icon.setAttribute('focusable', 'false');
  icon.dataset.icon = iconName;

  const path = document.createElementNS(namespace, 'path');
  path.setAttribute('d', BUTTON_ICON_PATHS[iconName]);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '2');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  icon.appendChild(path);

  if (iconName === 'preview') {
    const pupil = document.createElementNS(namespace, 'circle');
    pupil.setAttribute('cx', '12');
    pupil.setAttribute('cy', '12');
    pupil.setAttribute('r', '3');
    pupil.setAttribute('fill', 'none');
    pupil.setAttribute('stroke', 'currentColor');
    pupil.setAttribute('stroke-width', '2');
    icon.appendChild(pupil);
  }

  return icon;
}

function decorateButtonIcons(root = document) {
  const controls = [];
  if (root.matches?.('[data-button-icon]')) controls.push(root);
  controls.push(...root.querySelectorAll('[data-button-icon]'));

  controls.forEach((control) => {
    const currentIcon = control.querySelector('svg.button-icon');
    if (currentIcon?.dataset.icon === control.dataset.buttonIcon) return;
    currentIcon?.remove();
    const icon = createButtonIcon(control.dataset.buttonIcon);
    if (!icon) return;
    control.classList.add('button-with-icon');
    control.prepend(icon);
  });
}

window.RNButtonIcons = {
  create: createButtonIcon,
  decorate: decorateButtonIcons
};

async function showStudentWelcome() {
  const welcomeType = new URLSearchParams(window.location.search).get('welcome');
  if (welcomeType !== 'created' && welcomeType !== 'login') return;

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
  welcomeMessage.textContent = welcomeType === 'created'
    ? `Welcome, ${displayName}! Your account is ready.`
    : `Welcome back, ${displayName}!`;
  heroActions.before(welcomeMessage);
  showToast(welcomeType === 'created' ? 'Your account was created successfully.' : `Welcome back, ${displayName}!`, 'success');

  const url = new URL(window.location.href);
  url.searchParams.delete('welcome');
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

document.addEventListener('DOMContentLoaded', () => {
  decorateButtonIcons(document);
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
