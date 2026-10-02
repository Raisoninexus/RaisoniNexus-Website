document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('materialRequestForm');
  if (!form) return;

  const client = window.rnSupabaseClient;
  const status = document.getElementById('materialRequestStatus');
  const nameInput = form.elements.namedItem('requester_name');
  const emailInput = form.elements.namedItem('requester_email');
  if (!client) {
    status.textContent = 'Requests are temporarily unavailable. Please try again later.';
    return;
  }

  try {
    const session = await window.rnSupabaseUtils.getCurrentUserSession();
    if (session) {
      const profile = await window.rnSupabaseUtils.getUserProfile();
      nameInput.value = profile?.name || '';
      emailInput.value = profile?.email || session.user.email || '';
    }
  } catch (error) {
    console.error('Unable to prefill material request form:', error);
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = new FormData(form);
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    status.textContent = 'Sending your request...';

    try {
      const session = await window.rnSupabaseUtils.getCurrentUserSession();
      const { error } = await client.from('material_requests').insert({
        user_id: session?.user?.id || null,
        requester_name: String(values.get('requester_name') || '').trim(),
        requester_email: String(values.get('requester_email') || '').trim(),
        requested_material: String(values.get('requested_material') || '').trim(),
        details: String(values.get('details') || '').trim() || null
      });
      if (error) throw error;
      form.reset();
      status.textContent = 'Your request was sent to the Raisoni Nexus team.';
      showToast('Material request sent.', 'success');
    } catch (error) {
      console.error('Material request failed:', { code: error?.code, status: error?.status });
      status.textContent = 'We could not send your request. Please try again later.';
      showToast(status.textContent, 'error');
    } finally {
      button.disabled = false;
    }
  });
});