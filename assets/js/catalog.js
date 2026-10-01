function catalogSlug(value) {
  return String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function showCatalogMessage(container, message) {
  if (container) container.textContent = message;
}

function createCatalogCard(titleText, descriptionText, href, metaText = '', linkText = 'Explore') {
  const card = document.createElement('article');
  card.className = 'card reveal';
  const title = document.createElement('h3');
  title.textContent = titleText;
  const description = document.createElement('p');
  description.textContent = descriptionText || '';
  card.append(title, description);
  if (metaText) {
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = metaText;
    card.appendChild(meta);
  }
  const link = document.createElement('a');
  link.className = 'secondary-btn';
  link.href = href;
  link.textContent = linkText;
  card.appendChild(link);
  return card;
}

async function fetchCatalogRows(table, columns, orderColumn) {
  if (!window.rnSupabaseClient) throw new Error('Catalog is unavailable until Supabase is configured.');
  let query = window.rnSupabaseClient.from(table).select(columns);
  if (orderColumn) query = query.order(orderColumn);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

function findByIdentifier(rows, identifier, options = {}) {
  if (!identifier) return options.fallbackFirst ? rows[0] : null;
  return rows.find((row) => String(row.id) === identifier)
    || rows.find((row) => String(row.number) === identifier)
    || rows.find((row) => catalogSlug(row.name) === catalogSlug(identifier))
    || rows.find((row) => catalogSlug(row.short_name) === catalogSlug(identifier));
}

async function loadPublicBranches() {
  const containers = [document.getElementById('branchesGrid'), document.getElementById('homeBranchesGrid')].filter(Boolean);
  if (!containers.length) return;
  try {
    const branches = await fetchCatalogRows('branches', 'id, name, short_name, description, is_active', 'name');
    const activeBranches = branches.filter((branch) => branch.is_active !== false);
    containers.forEach((container) => {
      container.replaceChildren();
      if (!activeBranches.length) {
        showCatalogMessage(container, 'No branches have been added yet.');
        return;
      }
      activeBranches.forEach((branch) => {
        const card = createCatalogCard(
          branch.name,
          branch.description || 'Browse semester and subject resources for this branch.',
          `branch.html?id=${encodeURIComponent(branch.id)}`,
          branch.short_name || '',
          'Explore Branch'
        );
        card.classList.add('branch-card');
        container.appendChild(card);
      });
      window.dispatchEvent(new CustomEvent('rn-dynamic-content', { detail: container }));
    });
  } catch (error) {
    console.error('Branch catalog failed:', error.message);
    containers.forEach((container) => showCatalogMessage(container, 'Unable to load branches. Check the database setup and try again.'));
  }
}

async function loadHomeStats() {
  const stats = document.querySelectorAll('[data-home-stat]');
  if (!stats.length) return;
  if (!window.rnSupabaseClient) {
    stats.forEach((stat) => { stat.textContent = '--'; });
    return;
  }
  const counts = await Promise.all([
    window.rnSupabaseClient.from('resources').select('*', { count: 'exact', head: true }).eq('status', 'published'),
    window.rnSupabaseClient.from('subjects').select('*', { count: 'exact', head: true }).eq('is_active', true),
    window.rnSupabaseClient.from('resources').select('*', { count: 'exact', head: true }).eq('status', 'published').eq('resource_type', 'PYQ'),
    window.rnSupabaseClient.from('resources').select('*', { count: 'exact', head: true }).eq('status', 'published').eq('resource_type', 'Notes'),
    window.rnSupabaseClient.from('branches').select('*', { count: 'exact', head: true }).eq('is_active', true)
  ]);
  const values = { resources: counts[0], subjects: counts[1], pyq: counts[2], notes: counts[3], branches: counts[4] };
  stats.forEach((stat) => {
    const result = values[stat.dataset.homeStat];
    if (result?.error) {
      console.error('Homepage statistic failed:', result.error.message);
      stat.textContent = '--';
      return;
    }
    stat.textContent = String(result?.count ?? 0);
  });
}

async function loadBranchDetail() {
  const container = document.getElementById('branchSemesters');
  if (!container) return;
  const resourceTypes = document.getElementById('branchResourceTypes');
  try {
    const branches = await fetchCatalogRows('branches', 'id, name, short_name, description, is_active', 'name');
    const branch = findByIdentifier(branches, new URLSearchParams(location.search).get('id'));
    if (!branch) throw new Error('Branch not found.');
    document.getElementById('branchTitle').textContent = branch.name;
    document.getElementById('branchBreadcrumb').textContent = branch.name;
    document.getElementById('branchDescription').textContent = branch.description || 'Semester-wise subjects and resources for this branch.';

    const categories = [
      ['Notes', 'Chapter notes, revision sheets and class material.'],
      ['PYQ', 'Previous year question papers and solutions.'],
      ['Question Bank', 'Practice questions organized for exam preparation.'],
      ['Syllabus', 'Official subject outlines and course units.'],
      ['Lab Manual', 'Experiment instructions, practicals and viva prep.'],
      ['Assignment', 'Course assignments and reference material.'],
      ['Lecture Slides', 'Presentation slides and lecture references.'],
      ['Other', 'Additional study material shared for this branch.']
    ];
    resourceTypes.replaceChildren();
    categories.forEach(([type, description]) => {
      const label = type === 'PYQ' ? 'Previous Year Questions'
        : type === 'Lab Manual' ? 'Lab Manuals'
          : type === 'Assignment' ? 'Assignments'
            : type === 'Other' ? 'Other Resources' : type;
      resourceTypes.appendChild(createCatalogCard(
        label,
        description,
        `resources.html?branch=${encodeURIComponent(branch.id)}&type=${encodeURIComponent(type)}`,
        '',
        'Browse materials'
      ));
    });
    window.dispatchEvent(new CustomEvent('rn-dynamic-content', { detail: resourceTypes }));

    const [semesters, subjects] = await Promise.all([
      fetchCatalogRows('semesters', 'id, name, number', 'number'),
      fetchCatalogRows('subjects', 'id, branch_id, semester_id', 'name').then((rows) => rows.filter((subject) => subject.branch_id === branch.id))
    ]);
    container.replaceChildren();
    if (!semesters.length) {
      showCatalogMessage(container, 'No semesters have been added yet.');
      return;
    }
    semesters.forEach((semester) => {
      const subjectCount = subjects.filter((subject) => subject.semester_id === semester.id).length;
      const card = createCatalogCard(
        semester.name,
        `${subjectCount} subject${subjectCount === 1 ? '' : 's'} available.`,
        `semester.html?id=${encodeURIComponent(semester.id)}&branch=${encodeURIComponent(branch.id)}`
      );
      container.appendChild(card);
    });
    window.dispatchEvent(new CustomEvent('rn-dynamic-content', { detail: container }));
  } catch (error) {
    console.error('Branch detail failed:', error.message);
    showCatalogMessage(container, error.message || 'Unable to load this branch.');
  }
}

async function loadSemesterDetail() {
  const container = document.getElementById('semesterSubjects');
  if (!container) return;
  try {
    const params = new URLSearchParams(location.search);
    const [semesters, branches] = await Promise.all([
      fetchCatalogRows('semesters', 'id, name, number', 'number'),
      fetchCatalogRows('branches', 'id, name, short_name, description, is_active', 'name')
    ]);
    const semester = findByIdentifier(semesters, params.get('id'));
    const branch = findByIdentifier(branches, params.get('branch'), { fallbackFirst: true });
    if (!semester) throw new Error('Semester not found.');
    document.getElementById('semesterTitle').textContent = branch ? `${branch.name} / ${semester.name}` : semester.name;
    document.getElementById('semesterBreadcrumb').textContent = semester.name;
    document.getElementById('semesterDescription').textContent = 'Subjects and study resources for this semester.';
    if (branch) {
      const branchLink = document.getElementById('semesterBranchLink');
      branchLink.href = `branch.html?id=${encodeURIComponent(branch.id)}`;
      branchLink.textContent = branch.name;
    }

    let query = window.rnSupabaseClient.from('subjects')
      .select('id, name, subject_code, description, branch_id, semester_id')
      .eq('semester_id', semester.id)
      .eq('is_active', true)
      .order('name');
    if (branch) query = query.eq('branch_id', branch.id);
    const { data, error } = await query;
    if (error) throw error;
    container.replaceChildren();
    if (!data.length) {
      showCatalogMessage(container, 'No subjects have been added for this semester yet.');
      return;
    }
    data.forEach((subject) => container.appendChild(createCatalogCard(
      subject.name,
      subject.description || subject.subject_code || 'View resources for this subject.',
      `subject.html?id=${encodeURIComponent(subject.id)}`,
      subject.subject_code || ''
    )));
    window.dispatchEvent(new CustomEvent('rn-dynamic-content', { detail: container }));
  } catch (error) {
    console.error('Semester detail failed:', error.message);
    showCatalogMessage(container, error.message || 'Unable to load this semester.');
  }
}

async function loadSubjectDetail() {
  const title = document.getElementById('subjectTitle');
  if (!title) return;
  const container = document.querySelector('.resource-list');
  try {
    const subjects = await fetchCatalogRows('subjects', 'id, name, description, branch_id, semester_id', 'name');
    const subject = findByIdentifier(subjects, new URLSearchParams(location.search).get('id'));
    if (!subject) throw new Error('Subject not found.');
    title.textContent = subject.name;
    document.getElementById('subjectBreadcrumb').textContent = subject.name;
    document.getElementById('subjectDescription').textContent = subject.description || 'Study notes, assignments, PYQs and revision material for this subject.';
    const branch = await fetchCatalogRows('branches', 'id, name', 'name').then((rows) => rows.find((row) => row.id === subject.branch_id));
    if (branch) {
      const branchLink = document.getElementById('subjectBranchLink');
      branchLink.href = `branch.html?id=${encodeURIComponent(branch.id)}`;
      branchLink.textContent = branch.name;
    }
  } catch (error) {
    console.error('Subject detail failed:', error.message);
    title.textContent = error.message || 'Unable to load this subject.';
    document.getElementById('subjectDescription').textContent = '';
    showCatalogMessage(container, error.message || 'Unable to load this subject.');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadPublicBranches();
  loadBranchDetail();
  loadSemesterDetail();
  loadSubjectDetail();
  loadHomeStats();
});
