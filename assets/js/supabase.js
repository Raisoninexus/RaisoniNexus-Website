const DEFAULT_SUPABASE_CONFIG = {
  url: 'https://YOUR_PROJECT_REF.supabase.co',
  anonKey: 'YOUR_SUPABASE_ANON_KEY'
};

const runtimeConfig = window.RN_SUPABASE_CONFIG || {};
const supabaseConfig = {
  ...DEFAULT_SUPABASE_CONFIG,
  ...runtimeConfig
};

window.RN_SUPABASE = {
  url: supabaseConfig.url,
  anonKey: supabaseConfig.anonKey,
  configured: !!(supabaseConfig.url && supabaseConfig.anonKey && !supabaseConfig.url.includes('YOUR_PROJECT_REF'))
};

if (window.RN_SUPABASE.configured && window.supabase) {
  window.rnSupabaseClient = window.supabase.createClient(supabaseConfig.url, supabaseConfig.anonKey);
} else {
  window.rnSupabaseClient = null;
}

window.showToast = function (message, type = 'success') {
  const container = document.querySelector('.toast-container') || document.body.appendChild(Object.assign(document.createElement('div'), { className: 'toast-container' }));
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 2600);
};

async function getCurrentUserSession() {
  if (!window.rnSupabaseClient) return null;
  const { data: { session }, error } = await window.rnSupabaseClient.auth.getSession();
  if (error) {
    console.error('Session error:', error.message);
    return null;
  }
  return session;
}

async function ensureUserProfile(user) {
  if (!window.rnSupabaseClient || !user) return null;

  const { data: existingProfile, error: selectError } = await window.rnSupabaseClient
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (selectError) {
    console.error('Profile selection error:', selectError.message);
    return null;
  }

  return existingProfile;
}

async function getUserProfile() {
  if (!window.rnSupabaseClient) return null;
  const session = await getCurrentUserSession();
  if (!session) return null;

  const { data, error } = await window.rnSupabaseClient
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .maybeSingle();

  if (error) {
    console.error('Profile fetch error:', error.message);
    return null;
  }

  return data;
}

async function isAdminUser() {
  if (!window.rnSupabaseClient) return false;
  const profile = await getUserProfile();
  return !!profile && profile.role === 'admin';
}

window.rnSupabaseUtils = {
  getCurrentUserSession,
  getUserProfile,
  ensureUserProfile,
  isAdminUser
};

function updateStudentNav(session) {
  document.querySelectorAll('.topbar a[href="login.html"], .topbar a[data-student-auth-link]').forEach((link) => {
    link.dataset.studentAuthLink = 'true';
    link.href = session ? 'profile.html' : 'login.html';
    link.textContent = session ? 'Profile' : 'Login';
  });
}

function initializeStudentNav() {
  updateStudentNav(null);
  if (!window.rnSupabaseClient) return;
  window.rnSupabaseClient.auth.onAuthStateChange((_event, session) => {
    updateStudentNav(session);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeStudentNav, { once: true });
} else {
  initializeStudentNav();
}
