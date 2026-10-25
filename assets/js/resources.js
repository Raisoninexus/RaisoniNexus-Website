function mapSupabaseResource(row) {
  return {
    id: row.id,
    title: row.title || 'Untitled resource',
    description: row.description || 'No description available.',
    branch: row.branches?.name || 'Branch not set',
    branchId: row.branch_id || '',
    semester: row.semesters?.name || 'Semester not set',
    semesterId: row.semester_id || '',
    subject: row.subjects?.name || 'General',
    subjectId: row.subject_id || '',
    type: row.resource_type || 'Resource',
    fileName: row.file_name || '',
    fileType: ((row.file_type?.includes('/') ? row.file_name?.split('.').pop() : row.file_type) || row.file_name?.split('.').pop() || 'FILE').toUpperCase(),
    fileUrl: row.file_url || '',
    downloads: row.download_count || 0,
    date: row.created_at ? row.created_at.slice(0, 10) : ''
  };
}

function getBadgeColor(type) {
  const palette = {
    Notes: 'linear-gradient(135deg, #6c63ff, #00c2ff)',
    PYQ: 'linear-gradient(135deg, #00c2ff, #22c55e)',
    'Question Bank': 'linear-gradient(135deg, #f59e0b, #ff4d8d)',
    Assignment: 'linear-gradient(135deg, #ff4d8d, #ef4444)',
    'Lab Manual': 'linear-gradient(135deg, #22c55e, #00c2ff)',
    Syllabus: 'linear-gradient(135deg, #14b8a6, #22c55e)'
  };
  return palette[type] || 'linear-gradient(135deg, #475569, #64748b)';
}

function createResourceCard(item) {
  const card = document.createElement('article');
  card.className = 'resource-card magnetic reveal';
  const header = document.createElement('div');
  header.className = 'resource-header';
  const fileIcon = document.createElement('div');
  fileIcon.className = 'file-icon';
  fileIcon.textContent = item.fileType.slice(0, 3);
  const badge = document.createElement('span');
  badge.className = 'badge';
  badge.style.background = getBadgeColor(item.type);
  badge.style.color = '#fff';
  badge.textContent = item.type;
  header.append(fileIcon, badge);

  const title = document.createElement('h3');
  title.textContent = item.title;
  const description = document.createElement('p');
  description.textContent = item.description;
  const chips = document.createElement('div');
  chips.className = 'chip-row';
  [item.branch, item.semester].forEach((label) => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = label;
    chips.appendChild(chip);
  });

  const actions = document.createElement('div');
  actions.className = 'resource-actions';
  if (item.fileUrl) {
    const preview = document.createElement('a');
    preview.className = 'ghost-btn action-btn resource-preview-btn';
    preview.href = '#';
    preview.dataset.resourceId = item.id;
    preview.dataset.resourceTitle = item.title;
    preview.dataset.resourceFileName = item.fileName || '';
    preview.append(window.RNButtonIcons.create('preview'), document.createTextNode('Preview'));
    const download = document.createElement('a');
    download.className = 'primary-btn download-btn';
    const extension = item.fileType.toLowerCase() === 'file' ? 'pdf' : item.fileType.toLowerCase();
    const fileName = item.fileName || `${item.title}.${extension}`;
    download.href = '#';
    download.download = fileName;
    download.dataset.resourceId = item.id;
    download.dataset.resourceTitle = item.title;
    download.dataset.resourceFileName = fileName;
    download.append(window.RNButtonIcons.create('download'), document.createTextNode('Download'));
    actions.append(preview, download);
  } else {
    const unavailable = document.createElement('span');
    unavailable.className = 'meta';
    unavailable.textContent = 'File not available';
    actions.appendChild(unavailable);
  }

  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.style.marginTop = '1rem';
  const subject = document.createElement('span');
  subject.textContent = item.subject;
  const downloads = document.createElement('span');
  downloads.textContent = `${item.downloads} downloads`;
  meta.append(subject, downloads);
  card.append(header, title, description, chips, actions, meta);
  return card;
}

function getSignedDownloadUrl(resource) {
  const client = window.rnSupabaseClient;
  if (!client || !resource?.id) {
    return Promise.reject(new Error('Sign in to access this study material.'));
  }
  return client.functions.invoke('download-resource', {
    body: {
      resource_id: resource.id,
      resourceId: resource.id
    }
  }).then(({ data, error }) => {
    if (error) throw error;
    if (!data?.url) throw new Error('This resource is not available for download.');
    return data.url;
  });
}

async function triggerResourcePreview(resource) {
  if (!resource) {
    showToast('The requested resource is unavailable.', 'error');
    return;
  }

  try {
    const previewUrl = await getSignedDownloadUrl(resource);
    window.location.assign(previewUrl);
  } catch (error) {
    console.error('Protected resource preview failed:', error);
    showToast(error?.message || 'The resource preview could not be opened.', 'error');
  }
}

async function triggerResourceDownload(resource) {
  if (!resource) {
    showToast('The requested resource is unavailable.', 'error');
    return;
  }

  try {
    const finalUrl = await getSignedDownloadUrl(resource);
    if (!finalUrl || finalUrl === '#') {
      throw new Error('This resource is not available for download.');
    }

    const anchor = document.createElement('a');
    anchor.href = finalUrl;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.download = resource.fileName || `${resource.title}.pdf`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    showToast('Download started.', 'success');
  } catch (error) {
    console.error('Protected download failed:', error);
    showToast(error?.message || 'The resource could not be downloaded.', 'error');
  }
}

function renderResourceCards(containerSelector, items = []) {
  document.querySelectorAll(containerSelector).forEach((container) => {
    container.replaceChildren();
    if (!items.length) {
      const emptyState = document.createElement('div');
      emptyState.className = 'empty-state';
      emptyState.textContent = 'No published resources found yet.';
      container.appendChild(emptyState);
      return;
    }
    items.forEach((item) => container.appendChild(createResourceCard(item)));
    window.dispatchEvent(new CustomEvent('rn-dynamic-content', { detail: container }));
  });
}

function populateResourceFilters(items, taxonomy) {
  const branchSelect = document.getElementById('resourceBranchFilter');
  if (branchSelect) {
    const branches = taxonomy.branches.length
      ? taxonomy.branches.map((branch) => [branch.id, branch.name])
      : [...new Map(items.filter((item) => item.branchId).map((item) => [item.branchId, item.branch])).entries()];
    branchSelect.replaceChildren(new Option('All branches', ''));
    branches.forEach(([id, name]) => branchSelect.add(new Option(name, id)));
  }

  const semesterSelect = document.getElementById('resourceSemesterFilter');
  if (semesterSelect) {
    const semesters = taxonomy.semesters.length
      ? taxonomy.semesters.map((semester) => [semester.id, semester.name])
      : [...new Map(items.filter((item) => item.semesterId).map((item) => [item.semesterId, item.semester])).entries()];
    semesterSelect.replaceChildren(new Option('All semesters', ''));
    semesters.forEach(([id, name]) => semesterSelect.add(new Option(name, id)));
  }
}

function filterResourceList() {
  const query = document.getElementById('resourceSearch')?.value.trim().toLowerCase() || '';
  const params = new URLSearchParams(window.location.search);
  const branchId = document.getElementById('resourceBranchFilter')?.value || params.get('branch') || '';
  const semesterId = document.getElementById('resourceSemesterFilter')?.value || params.get('semester') || '';
  const resourceType = params.get('type') || '';
  const pageName = window.location.pathname.split('/').pop().replace(/\.html$/i, '');
  const pageResourceTypes = {
    notes: 'Notes',
    pyq: 'PYQ',
    'question-bank': 'Question Bank',
    assignments: 'Assignment',
    'lab-manuals': 'Lab Manual',
    syllabus: 'Syllabus'
  };
  const expectedType = pageResourceTypes[pageName];
  const subjectIdentifier = pageName === 'subject' ? params.get('id') || '' : '';
  const subjectSlug = subjectIdentifier.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const filtered = (window.rnResources || []).filter((item) => {
    const text = `${item.title} ${item.description} ${item.subject} ${item.type} ${item.branch} ${item.semester}`.toLowerCase();
    return (!query || text.includes(query))
      && (!branchId || item.branchId === branchId)
      && (!semesterId || item.semesterId === semesterId)
      && (!resourceType || item.type.toLowerCase() === resourceType.toLowerCase())
      && (!expectedType || item.type.toLowerCase() === expectedType.toLowerCase())
      && (!subjectIdentifier || item.subjectId === subjectIdentifier
        || (item.subjectId && item.subject.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') === subjectSlug));
  });
  renderResourceCards('.resource-list:not(#searchResults)', filtered);
}

function notifyResourcesLoaded(errorMessage = '', taxonomy = { branches: [], semesters: [], subjects: [] }) {
  window.rnResourceError = errorMessage;
  window.dispatchEvent(new CustomEvent('rn-resources-loaded', {
    detail: {
      items: window.rnResources || [],
      branches: taxonomy.branches,
      semesters: taxonomy.semesters,
      subjects: taxonomy.subjects,
      error: errorMessage
    }
  }));
}

async function loadResourceTaxonomy(client) {
  const [branchResult, semesterResult, subjectResult] = await Promise.all([
    client.from('branches').select('id, name').eq('is_active', true).order('name'),
    client.from('semesters').select('id, name, number').order('number'),
    client.from('subjects').select('id, name, branch_id, semester_id').eq('is_active', true).order('name')
  ]);
  if (branchResult.error) console.error('Branch filter fetch failed:', branchResult.error.message);
  if (semesterResult.error) console.error('Semester filter fetch failed:', semesterResult.error.message);
  if (subjectResult.error) console.error('Subject filter fetch failed:', subjectResult.error.message);
  return {
    branches: branchResult.data || [],
    semesters: semesterResult.data || [],
    subjects: subjectResult.data || []
  };
}

async function loadResources() {
  const client = window.rnSupabaseClient;
  if (!client) {
    window.rnResources = [];
    notifyResourcesLoaded('Resources are unavailable until Supabase is configured.');
    document.querySelectorAll('.resource-list').forEach((container) => {
      container.textContent = window.rnResourceError;
    });
    return;
  }

  const taxonomy = await loadResourceTaxonomy(client);

  const { data, error } = await client
    .from('resources')
    .select('id, title, description, branch_id, semester_id, subject_id, resource_type, file_url, file_name, file_type, download_count, created_at, branches(name), semesters(name), subjects(name)')
    .eq('status', 'published')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Supabase resource error:', error.message);
    window.rnResources = [];
    notifyResourcesLoaded('Unable to load resources. Check the database setup and try again.', taxonomy);
    document.querySelectorAll('.resource-list').forEach((container) => {
      container.textContent = 'Unable to load resources. Check the database setup and try again.';
    });
    return;
  }

  window.rnResources = (data || []).map(mapSupabaseResource);

  populateResourceFilters(window.rnResources, taxonomy);
  const params = new URLSearchParams(window.location.search);
  const branchFilter = document.getElementById('resourceBranchFilter');
  const semesterFilter = document.getElementById('resourceSemesterFilter');
  if (branchFilter && params.has('branch')) branchFilter.value = params.get('branch');
  if (semesterFilter && params.has('semester')) semesterFilter.value = params.get('semester');
  filterResourceList();
  notifyResourcesLoaded('', taxonomy);

  const pendingAction = params.get('resource_action');
  const pendingResourceId = params.get('resource_id');
  if (pendingAction && pendingResourceId) {
    params.delete('resource_action');
    params.delete('resource_id');
    const cleanedUrl = new URL(window.location.href);
    cleanedUrl.search = params.toString();
    window.history.replaceState({}, '', cleanedUrl);

    const pendingResource = window.rnResources.find((item) => item.id === pendingResourceId);
    if (!pendingResource) {
      showToast('The requested resource is unavailable.', 'error');
    } else if (pendingAction === 'preview') {
      await triggerResourcePreview(pendingResource);
    } else if (pendingAction === 'download') {
      await triggerResourceDownload(pendingResource);
    }
  }
}

document.addEventListener('click', async (event) => {
  const link = event.target instanceof Element
    ? event.target.closest('.download-btn[data-resource-id], .resource-preview-btn[data-resource-id]')
    : null;
  if (!link) return;

  event.preventDefault();
  const requestedAction = link.classList.contains('resource-preview-btn') ? 'preview' : 'download';
  const resourceId = link.dataset.resourceId;
  const resource = (window.rnResources || []).find((item) => item.id === resourceId) || {
    id: resourceId,
    title: link.dataset.resourceTitle || 'Resource',
    fileName: link.dataset.resourceFileName || '',
    fileType: 'PDF'
  };

  if (!window.rnSupabaseClient) {
    showToast('Resource access is unavailable until Supabase is configured.', 'error');
    return;
  }

  const { data: { session } = {} } = await window.rnSupabaseClient.auth.getSession();
  if (!session) {
    const returnUrl = new URL(window.location.href);
    returnUrl.searchParams.set('resource_action', requestedAction);
    returnUrl.searchParams.set('resource_id', resource.id);
    const loginUrl = new URL('/login.html', window.location.origin);
    loginUrl.searchParams.set('next', `${returnUrl.pathname}${returnUrl.search}${returnUrl.hash}`);
    window.location.assign(loginUrl.href);
    return;
  }

  if (requestedAction === 'preview') {
    await triggerResourcePreview(resource);
  } else {
    await triggerResourceDownload(resource);
  }
});

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('resourceSearch')?.addEventListener('input', filterResourceList);
  document.getElementById('resourceBranchFilter')?.addEventListener('change', filterResourceList);
  document.getElementById('resourceSemesterFilter')?.addEventListener('change', filterResourceList);
  document.getElementById('clearResourceFilters')?.addEventListener('click', () => {
    document.getElementById('resourceSearch').value = '';
    document.getElementById('resourceBranchFilter').value = '';
    document.getElementById('resourceSemesterFilter').value = '';
    window.history.replaceState({}, '', window.location.pathname);
    filterResourceList();
  });
  loadResources();
});
