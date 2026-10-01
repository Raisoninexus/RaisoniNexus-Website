function renderPublicNotice(row) {
  const item = document.createElement('article');
  item.className = 'list-item reveal';
  const content = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = row.title;
  const description = document.createElement('p');
  description.textContent = row.description || '';
  content.append(title, description);
  const tag = document.createElement('span');
  tag.className = 'tag';
  tag.textContent = row.category || row.priority || 'Notice';
  item.append(content, tag);
  return item;
}

async function loadPublicNotices() {
  const container = document.getElementById('publicNotices');
  if (!container) return;
  if (!window.rnSupabaseClient) {
    container.textContent = 'Notices are unavailable until Supabase is configured.';
    return;
  }

  const { data, error } = await window.rnSupabaseClient
    .from('notices')
    .select('title, description, category, priority, expiry_date, created_at')
    .eq('published', true)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('Notice fetch failed:', error.message);
    container.textContent = 'Unable to load notices. Check the database setup and try again.';
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const currentNotices = (data || []).filter((row) => !row.expiry_date || row.expiry_date >= today);
  container.replaceChildren();
  if (!currentNotices.length) {
    container.textContent = 'There are no current notices.';
    return;
  }
  currentNotices.forEach((row) => container.appendChild(renderPublicNotice(row)));
  window.dispatchEvent(new CustomEvent('rn-dynamic-content', { detail: container }));
}

function appendNoticeCell(row, value) {
  const cell = document.createElement('td');
  cell.textContent = value || '—';
  row.appendChild(cell);
}

async function loadAdminNotices() {
  const body = document.getElementById('adminNoticesBody');
  if (!body || !window.rnSupabaseClient) return;
  const { data, error } = await window.rnSupabaseClient
    .from('notices')
    .select('id, title, category, priority, published')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('Admin notice fetch failed:', error.message);
    body.textContent = 'Unable to load notices.';
    return;
  }

  body.replaceChildren();
  if (!data.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 5;
    cell.textContent = 'No notices created yet.';
    row.appendChild(cell);
    body.appendChild(row);
    return;
  }

  data.forEach((notice) => {
    const row = document.createElement('tr');
    appendNoticeCell(row, notice.title);
    appendNoticeCell(row, notice.category);
    appendNoticeCell(row, notice.priority);
    appendNoticeCell(row, notice.published ? 'Published' : 'Draft');
    const actions = document.createElement('td');
    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'ghost-btn';
    removeButton.textContent = 'Delete';
    removeButton.addEventListener('click', async () => {
      if (!window.confirm(`Delete notice "${notice.title}"?`)) return;
      const { error: deleteError } = await window.rnSupabaseClient.from('notices').delete().eq('id', notice.id);
      if (deleteError) {
        showToast(deleteError.message, 'error');
        return;
      }
      await loadAdminNotices();
      showToast('Notice deleted.', 'success');
    });
    actions.appendChild(removeButton);
    row.appendChild(actions);
    body.appendChild(row);
  });
}

function bindNoticeForm() {
  const form = document.getElementById('noticeForm');
  if (!form) return;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const values = {
      title: String(formData.get('title') || '').trim(),
      description: String(formData.get('description') || '').trim(),
      category: String(formData.get('category') || '').trim() || null,
      priority: formData.get('priority'),
      expiry_date: String(formData.get('expiry_date') || '') || null,
      published: formData.has('published')
    };
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    const { error } = await window.rnSupabaseClient.from('notices').insert(values);
    button.disabled = false;
    if (error) {
      showToast(error.message, 'error');
      return;
    }
    form.reset();
    await loadAdminNotices();
    showToast('Notice saved.', 'success');
  });
}

document.addEventListener('DOMContentLoaded', () => {
  loadPublicNotices();
  loadAdminNotices();
  bindNoticeForm();
});
