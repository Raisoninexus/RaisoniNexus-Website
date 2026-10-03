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
    preview.className = 'ghost-btn action-btn';
    preview.href = item.fileUrl;
    preview.target = '_blank';
    preview.rel = 'noopener noreferrer';
    preview.append(window.RNButtonIcons.create('preview'), document.createTextNode('Preview'));
    const download = document.createElement('a');
    download.className = 'primary-btn download-btn';
    const downloadUrl = new URL(item.fileUrl);
    const extension = item.fileType.toLowerCase() === 'file' ? 'pdf' : item.fileType.toLowerCase();
    const fileName = item.fileName || `${item.title}.${extension}`;
    downloadUrl.searchParams.set('download', fileName);
    download.href = downloadUrl.toString();
    download.download = fileName;
    download.dataset.resourceId = item.id;
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
  const filtered = (window.rnResources || []).filter((item) => {
    const text = `${item.title} ${item.description} ${item.subject} ${item.type} ${item.branch} ${item.semester}`.toLowerCase();
    return (!query || text.includes(query))
      && (!branchId || item.branchId === branchId)
      && (!semesterId || item.semesterId === semesterId)
      && (!resourceType || item.type.toLowerCase() === resourceType.toLowerCase());
  });
  renderResourceCards('.resource-list:not(#searchResults)', filtered);
}

function notifyResourcesLoaded(errorMessage = '', taxonomy = { branches: [], semesters: [] }) {
  window.rnResourceError = errorMessage;
  window.dispatchEvent(new CustomEvent('rn-resources-loaded', {
    detail: {
      items: window.rnResources || [],
      branches: taxonomy.branches,
      semesters: taxonomy.semesters,
      error: errorMessage
    }
  }));
}

async function loadResourceTaxonomy(client) {
  const [branchResult, semesterResult] = await Promise.all([
    client.from('branches').select('id, name').eq('is_active', true).order('name'),
    client.from('semesters').select('id, name, number').order('number')
  ]);
  if (branchResult.error) console.error('Branch filter fetch failed:', branchResult.error.message);
  if (semesterResult.error) console.error('Semester filter fetch failed:', semesterResult.error.message);
  return {
    branches: branchResult.data || [],
    semesters: semesterResult.data || []
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
    .select('id, title, description, branch_id, semester_id, resource_type, file_url, file_name, file_type, download_count, created_at, branches(name), semesters(name), subjects(name)')
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
  const pageResourceTypes = {
    '/notes.html': 'Notes',
    '/pyq.html': 'PYQ',
    '/question-bank.html': 'Question Bank',
    '/assignments.html': 'Assignment',
    '/lab-manuals.html': 'Lab Manual',
    '/syllabus.html': 'Syllabus'
  };
  const expectedType = pageResourceTypes[window.location.pathname];
  let pageItems = expectedType
    ? window.rnResources.filter((item) => item.type.toLowerCase() === expectedType.toLowerCase())
    : window.rnResources;
  if (window.location.pathname.endsWith('/subject.html')) {
    const subjectIdentifier = new URLSearchParams(window.location.search).get('id') || '';
    const subjectSlug = subjectIdentifier.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    pageItems = pageItems.filter((item) => item.subjectId === subjectIdentifier
      || item.subject.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') === subjectSlug);
  }

  populateResourceFilters(window.rnResources, taxonomy);
  const params = new URLSearchParams(window.location.search);
  const branchFilter = document.getElementById('resourceBranchFilter');
  const semesterFilter = document.getElementById('resourceSemesterFilter');
  if (branchFilter && params.has('branch')) branchFilter.value = params.get('branch');
  if (semesterFilter && params.has('semester')) semesterFilter.value = params.get('semester');
  renderResourceCards('.resource-list', pageItems);
  if (document.getElementById('resourceSearch') || document.getElementById('resourceBranchFilter')) {
    filterResourceList();
  }
  notifyResourcesLoaded('', taxonomy);
}

document.addEventListener('click', async (event) => {
  const link = event.target instanceof Element ? event.target.closest('.download-btn[data-resource-id]') : null;
  if (!link || !window.rnSupabaseClient) return;
  const session = await window.rnSupabaseUtils.getCurrentUserSession();
  if (!session) return;
  const { error } = await window.rnSupabaseClient.from('downloads').insert({
    user_id: session.user.id,
    resource_id: link.dataset.resourceId
  });
  if (error) console.error('Download tracking failed:', error.message);
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
