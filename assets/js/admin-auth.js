document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('form');
  const emailInput = document.querySelector('input[type="email"]');
  const passwordInput = document.querySelector('input[type="password"]');
  const resetLink = document.querySelector('[data-admin-reset]');

  if (!form || !emailInput || !passwordInput) return;

  resetLink?.addEventListener('click', async (event) => {
    event.preventDefault();
    const email = emailInput.value.trim();
    if (!email) {
      showToast('Enter your admin email first.', 'error');
      emailInput.focus();
      return;
    }
    if (!window.rnSupabaseClient) {
      showToast('Supabase is not configured.', 'error');
      return;
    }

    const redirectTo = `${window.location.origin}/login.html?recovery=1`;
    const { error } = await window.rnSupabaseClient.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) {
      showToast(error.message, 'error');
      return;
    }
    showToast('If that account exists, a password reset email is on its way.', 'success');
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    if (!email || !password) {
      showToast('Please enter both email and password', 'error');
      return;
    }

    if (!window.rnSupabaseClient) {
      showToast('Supabase client is not configured. Add your URL and anon key first.', 'error');
      return;
    }

    try {
      const { data, error } = await window.rnSupabaseClient.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      const profile = await window.rnSupabaseUtils.ensureUserProfile(data.user);
      if (!profile || profile.role !== 'admin') {
        await window.rnSupabaseClient.auth.signOut();
        showToast('Access denied. Admin role required.', 'error');
        return;
      }

      showToast('Admin login successful', 'success');
      window.location.href = 'dashboard.html';
    } catch (error) {
      showToast(error.message || 'Admin login failed', 'error');
    }
  });
});
