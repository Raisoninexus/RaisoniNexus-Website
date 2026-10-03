const GOOGLE_LOGIN_ENABLED = true;
let studentAuthMode = 'login';

function getAuthHomeRedirect(welcomeType) {
  const localHosts = ['localhost', '127.0.0.1', '::1'];
  const isLocalOrigin = window.location.protocol === 'file:' || localHosts.includes(window.location.hostname);
  const origin = isLocalOrigin ? 'https://raisoninexus-website.vercel.app' : window.location.origin;
  const redirect = new URL('/', origin);
  redirect.searchParams.set('welcome', welcomeType);
  return redirect.href;
}

function getEmailConfirmationRedirect() {
  return getAuthHomeRedirect('created');
}

async function renderAuthContent() {
  const authPanel = document.querySelector('[data-auth-panel]');
  if (!authPanel) return;

  const client = window.rnSupabaseClient;
  const isRecovery = new URLSearchParams(window.location.search).has('recovery');
  let session = null;

  if (client) {
    const { data, error } = await client.auth.getSession();
    session = data.session;

    if (error) {
      console.error(error);
      showToast('Unable to load session', 'error');
    }

    if (session && !isRecovery) {
      const profile = await window.rnSupabaseUtils.getUserProfile();
      if (profile?.role === 'admin') {
        window.location.href = 'admin/dashboard.html';
        return;
      }

      authPanel.innerHTML = `
        <div class="form-panel">
          <h2 id="studentWelcomeHeading">Welcome</h2>
          <p>Student session is active.</p>
          <button class="secondary-btn" type="button" data-auth-action="logout" data-button-icon="logout">Logout</button>
        </div>
      `;
      window.RNButtonIcons?.decorate(authPanel);
      const displayName = profile?.name || session.user?.email?.split('@')[0] || 'Student';
      document.getElementById('studentWelcomeHeading').textContent = `Welcome, ${displayName}`;
      return;
    }
  }

  if (isRecovery) {
    authPanel.innerHTML = `
      <div class="form-panel">
        <h2>Choose a new password</h2>
        <form id="studentPasswordUpdateForm">
          <div class="form-grid">
            <div class="full"><label for="newPassword">New password</label><input class="input" id="newPassword" type="password" name="password" minlength="8" autocomplete="new-password" required /></div>
            <div class="full"><label for="confirmPassword">Confirm password</label><input class="input" id="confirmPassword" type="password" name="confirmPassword" minlength="8" autocomplete="new-password" required /></div>
            <div class="full"><button class="primary-btn" type="submit" data-button-icon="password">Update password</button></div>
          </div>
        </form>
      </div>
    `;
      window.RNButtonIcons?.decorate(authPanel);
    return;
  }

  const googleButtonState = GOOGLE_LOGIN_ENABLED
    ? 'data-auth-action="google"'
    : 'disabled aria-disabled="true" title="Google sign-in is pending setup"';
  const googleButtonLabel = GOOGLE_LOGIN_ENABLED ? 'Continue with Google' : 'Google sign-in (coming soon)';

  authPanel.innerHTML = `
    <div class="form-panel">
      <h2>${studentAuthMode === 'signup' ? 'Create student account' : 'Student Login'}</h2>
      <form id="studentLoginForm">
        <div class="form-grid">
          ${studentAuthMode === 'signup' ? '<div class="full"><label for="studentFullName">Full name</label><input class="input" id="studentFullName" type="text" name="fullName" autocomplete="name" required /></div>' : ''}
          <div class="full"><label for="studentEmail">Email ID</label><input class="input" id="studentEmail" type="email" name="email" autocomplete="email" required /></div>
          <div class="full"><label for="studentPassword">Password</label><input class="input" id="studentPassword" type="password" name="password" minlength="8" autocomplete="${studentAuthMode === 'signup' ? 'new-password' : 'current-password'}" required /></div>
          <div class="full"><button class="primary-btn" type="submit" data-button-icon="${studentAuthMode === 'signup' ? 'account' : 'login'}">${studentAuthMode === 'signup' ? 'Create account' : 'Login'}</button></div>
        </div>
      </form>
      <div class="auth-divider"><span>or</span></div>
      <button class="google-btn" type="button" ${googleButtonState}>
        <span class="google-mark" aria-hidden="true">G</span>
        <span>${googleButtonLabel}</span>
      </button>
      <div class="auth-actions">
        <button class="ghost-btn" type="button" data-auth-action="mode" data-button-icon="${studentAuthMode === 'signup' ? 'back' : 'account'}">${studentAuthMode === 'signup' ? 'Back to login' : 'Create student account'}</button>
        ${studentAuthMode === 'login' ? '<button class="ghost-btn" type="button" data-auth-action="reset" data-button-icon="password">Forgot password?</button>' : ''}
      </div>
    </div>
  `;
  window.RNButtonIcons?.decorate(authPanel);
}

function getSignupErrorMessage(error) {
  switch (error?.code) {
    case 'email_exists':
    case 'user_already_exists':
      return 'An account already exists for this email. Log in or reset your password.';
    case 'over_email_send_rate_limit':
      return 'The email sending limit has been reached. Wait before trying again, or contact the administrator about custom email delivery.';
    case 'over_request_rate_limit':
      return 'Too many signup attempts came from this network. Wait a few minutes, then try again.';
    case 'signup_disabled':
    case 'email_provider_disabled':
      return 'Student account creation is currently disabled. Contact the administrator.';
    case 'weak_password':
      return 'Choose a stronger password that meets the password requirements.';
    case 'email_address_invalid':
      return 'Enter a valid email address and try again.';
  }

  if (error?.status === 429) {
    return 'Too many signup attempts. Wait a few minutes, then try again.';
  }
  if (error?.status >= 500) {
    return 'The account service could not save your account right now. Try again later or contact the administrator.';
  }
  if (error?.name === 'AuthRetryableFetchError' || error instanceof TypeError) {
    return 'Could not reach the account service. Check your connection and try again.';
  }
  return 'We could not create the account with those details. Check them and try again.';
}

async function handleStudentAuth(event) {
  event.preventDefault();
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  const data = Object.fromEntries(new FormData(form).entries());

  if (!data.email || !data.password) {
    showToast('Please enter both email and password', 'error');
    return;
  }

  const client = window.rnSupabaseClient;
  if (!client) {
    showToast('Student login is unavailable until Supabase is configured.', 'error');
    return;
  }

  const submitButton = form.querySelector('[type="submit"]');
  const originalLabel = submitButton.textContent;
  submitButton.disabled = true;
  submitButton.textContent = studentAuthMode === 'signup' ? 'Creating account...' : 'Signing in...';

  try {
    if (studentAuthMode === 'signup') {
      const fullName = String(data.fullName || '').trim();
      if (!fullName) {
        showToast('Enter your full name.', 'error');
        return;
      }
      const { data: authData, error } = await client.auth.signUp({
        email: String(data.email).trim(),
        password: data.password,
        options: {
          emailRedirectTo: getEmailConfirmationRedirect(),
          data: { full_name: fullName }
        }
      });
      if (error) throw error;
      if (authData.user?.identities?.length === 0) {
        studentAuthMode = 'login';
        form.reset();
        showToast('An account already exists for this email. Log in or reset your password.', 'error');
        await renderAuthContent();
        return;
      }
      studentAuthMode = 'login';
      form.reset();
      if (!authData.session) {
        showToast('Account created. Check your email to confirm it, then log in.', 'success');
        await renderAuthContent();
        return;
      }
      showToast('Account created successfully.', 'success');
      window.location.assign('index.html?welcome=created');
      return;
    }

    const { data: authData, error } = await client.auth.signInWithPassword({
      email: String(data.email).trim(),
      password: data.password
    });
    if (error) throw error;

    const profile = await window.rnSupabaseUtils.ensureUserProfile(authData.user);
    if (!profile) {
      await client.auth.signOut();
      throw new Error('Your profile is unavailable. Contact the administrator.');
    }
    if (profile.role === 'admin') {
      window.location.href = 'admin/dashboard.html';
      return;
    }
    window.location.assign('index.html?welcome=login');
    return;
  } catch (error) {
    if (studentAuthMode === 'signup') {
      console.error('Student signup failed:', { code: error?.code, status: error?.status });
    }
    showToast(studentAuthMode === 'signup' ? getSignupErrorMessage(error) : error.message || 'Authentication failed.', 'error');
  } finally {
    if (form.isConnected) {
      submitButton.disabled = false;
      submitButton.textContent = originalLabel;
    }
  }
}

async function sendPasswordReset() {
  const client = window.rnSupabaseClient;
  const email = document.querySelector('#studentEmail')?.value.trim();
  if (!client) {
    showToast('Password recovery is unavailable until Supabase is configured.', 'error');
    return;
  }
  if (!email) {
    showToast('Enter your email address first.', 'error');
    document.querySelector('#studentEmail')?.focus();
    return;
  }

  const redirectTo = `${window.location.origin}${window.location.pathname}?recovery=1`;
  const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) {
    showToast(error.message, 'error');
    return;
  }
  showToast('If that account exists, a password reset email is on its way.', 'success');
}

async function signInWithGoogle(button) {
  const client = window.rnSupabaseClient;
  if (!client) {
    showToast('Google sign-in is unavailable until Supabase is configured.', 'error');
    return;
  }

  const originalLabel = button.innerText;
  button.disabled = true;
  button.innerText = 'Connecting to Google...';
  try {
    const redirectTo = getAuthHomeRedirect('login');
    const { data, error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        skipBrowserRedirect: true,
        queryParams: { prompt: 'select_account' }
      }
    });
    if (error) throw error;
    if (!data.url) throw new Error('Google sign-in did not return an authorization URL.');
    window.location.assign(data.url);
  } catch (error) {
    button.disabled = false;
    button.innerText = originalLabel;
    showToast(error.message || 'Google sign-in failed.', 'error');
  }
}

async function updateStudentPassword(event) {
  event.preventDefault();
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  if (!window.rnSupabaseClient) {
    showToast('Password recovery is unavailable until Supabase is configured.', 'error');
    return;
  }
  const formData = new FormData(form);
  const password = String(formData.get('password') || '');
  const confirmation = String(formData.get('confirmPassword') || '');
  if (password.length < 8 || password !== confirmation) {
    showToast(password !== confirmation ? 'Passwords do not match.' : 'Use at least 8 characters.', 'error');
    return;
  }
  const { error } = await window.rnSupabaseClient.auth.updateUser({ password });
  if (error) {
    showToast(error.message, 'error');
    return;
  }
  window.history.replaceState({}, '', window.location.pathname);
  await window.rnSupabaseClient.auth.signOut();
  studentAuthMode = 'login';
  showToast('Password updated. Please log in.', 'success');
  await renderAuthContent();
}

function initializeStudentAuth() {
  document.addEventListener('submit', (event) => {
    if (event.target instanceof HTMLFormElement && event.target.id === 'studentLoginForm') {
      handleStudentAuth(event);
    } else if (event.target instanceof HTMLFormElement && event.target.id === 'studentPasswordUpdateForm') {
      updateStudentPassword(event);
    }
  });
  document.addEventListener('click', (event) => {
    const action = event.target instanceof Element ? event.target.closest('[data-auth-action]') : null;
    if (!action) return;
    if (action.dataset.authAction === 'mode') {
      studentAuthMode = studentAuthMode === 'login' ? 'signup' : 'login';
      renderAuthContent();
    } else if (action.dataset.authAction === 'reset') {
      sendPasswordReset();
    } else if (action.dataset.authAction === 'google' && GOOGLE_LOGIN_ENABLED) {
      signInWithGoogle(action);
    } else if (action.dataset.authAction === 'logout') {
      window.rnSupabaseClient?.auth.signOut().then(() => window.location.reload());
    }
  });
  renderAuthContent();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeStudentAuth, { once: true });
} else {
  initializeStudentAuth();
}
