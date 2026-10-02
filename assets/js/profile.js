async function loadStudentProfile() {
  const status = document.querySelector('[data-profile-status]');
  const details = document.querySelector('[data-profile-details]');
  const client = window.rnSupabaseClient;
  if (!client) {
    status.textContent = 'Student profiles are unavailable until the account service is configured.';
    return;
  }

  try {
    const session = await window.rnSupabaseUtils.getCurrentUserSession();
    if (!session) {
      window.location.replace('login.html');
      return;
    }

    const profile = await window.rnSupabaseUtils.getUserProfile();
    if (!profile) {
      status.textContent = 'Unable to load your profile. Please try again or contact the administrator.';
      return;
    }
    if (profile.role === 'admin') {
      window.location.replace('admin/dashboard.html');
      return;
    }

    const [branchResult, semesterResult] = await Promise.all([
      profile.branch_id
        ? client.from('branches').select('name').eq('id', profile.branch_id).maybeSingle()
        : Promise.resolve({ data: null }),
      profile.semester_id
        ? client.from('semesters').select('name').eq('id', profile.semester_id).maybeSingle()
        : Promise.resolve({ data: null })
    ]);

    document.querySelector('[data-profile-name]').textContent = profile.name || 'Not set';
    document.querySelector('[data-profile-email]').textContent = profile.email || session.user.email || 'Not set';
    document.querySelector('[data-profile-branch]').textContent = branchResult.data?.name || 'Not set';
    document.querySelector('[data-profile-semester]').textContent = semesterResult.data?.name || 'Not set';
    status.hidden = true;
    details.hidden = false;
  } catch (error) {
    console.error('Student profile failed to load:', error);
    status.textContent = 'Unable to load your profile right now. Please try again later.';
  }
}

document.querySelector('[data-profile-logout]')?.addEventListener('click', async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  const { error } = await window.rnSupabaseClient.auth.signOut();
  if (error) {
    button.disabled = false;
    showToast('Unable to log out right now. Please try again.', 'error');
    return;
  }
  window.location.replace('index.html');
});

loadStudentProfile();