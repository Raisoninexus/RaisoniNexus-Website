async function loadAdminMetrics() {
  const adminCards = document.querySelectorAll('[data-admin-count]');
  if (!adminCards.length) return;

  const queries = [
    window.rnSupabaseClient.from('resources').select('*', { count: 'exact', head: true }),
    window.rnSupabaseClient.from('downloads').select('*', { count: 'exact', head: true }),
    window.rnSupabaseClient.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'student'),
    window.rnSupabaseClient.from('branches').select('*', { count: 'exact', head: true }),
    window.rnSupabaseClient.from('subjects').select('*', { count: 'exact', head: true })
  ];
  const results = await Promise.all(queries);

  results.forEach((result, index) => {
    const item = adminCards[index];
    if (!item) return;
    if (result.error) {
      console.error('Admin metric fetch failed:', result.error.message);
      item.textContent = '--';
      return;
    }
    item.textContent = result.count ?? 0;
  });
}

async function requireAdminAccess() {
  const client = window.rnSupabaseClient;
  if (!client) {
    window.location.replace('login.html');
    return false;
  }

  const session = await window.rnSupabaseUtils.getCurrentUserSession();
  const profile = session ? await window.rnSupabaseUtils.getUserProfile() : null;
  if (!profile || profile.role !== 'admin') {
    if (session) await client.auth.signOut();
    window.location.replace('login.html');
    return false;
  }

  document.body.classList.add('admin-authorized');
  document.querySelectorAll('.admin-nav a[href="login.html"]').forEach((link) => {
    link.addEventListener('click', async (event) => {
      event.preventDefault();
      await client.auth.signOut();
      window.location.replace('login.html');
    });
  });
  return true;
}

function renderResourceBranchCheckboxes(select) {
  let container = document.getElementById('resourceBranchOptions');
  if (!container) {
    container = document.createElement('div');
    container.id = 'resourceBranchOptions';
    container.className = 'resource-branch-picker';
    container.setAttribute('role', 'group');
    container.setAttribute('aria-labelledby', 'resourceBranchLabel');
    select.after(container);
  }

  container.replaceChildren();
  const options = document.createElement('div');
  options.className = 'resource-branch-options';
  const count = document.createElement('p');
  count.className = 'resource-branch-count';
  count.setAttribute('aria-live', 'polite');

  const updateCount = () => {
    const selectedCount = [...select.selectedOptions].filter((option) => option.value).length;
    count.textContent = `${selectedCount} ${selectedCount === 1 ? 'branch' : 'branches'} selected`;
  };

  [...select.options].filter((option) => option.value).forEach((option) => {
    const label = document.createElement('label');
    label.className = 'resource-branch-option';
    label.classList.toggle('is-selected', option.selected);
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = option.value;
    checkbox.checked = option.selected;
    checkbox.setAttribute('aria-label', option.textContent);
    const name = document.createElement('span');
    name.textContent = option.textContent;
    checkbox.addEventListener('change', () => {
      option.selected = checkbox.checked;
      label.classList.toggle('is-selected', checkbox.checked);
      const placeholder = [...select.options].find((item) => !item.value);
      if (placeholder) placeholder.selected = false;
      updateCount();
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    label.append(checkbox, name);
    options.appendChild(label);
  });

  container.append(options, count);
  updateCount();
}

async function loadUploadOptions() {
  const client = window.rnSupabaseClient;
  const selects = [
    { id: 'resourceBranch', table: 'branches', columns: 'id, name', order: 'name' },
    { id: 'resourceSemester', table: 'semesters', columns: 'id, name, number', order: 'number' },
    { id: 'subjectBranch', table: 'branches', columns: 'id, name', order: 'name' },
    { id: 'subjectSemester', table: 'semesters', columns: 'id, name, number', order: 'number' }
  ];

  for (const selectConfig of selects) {
    const select = document.getElementById(selectConfig.id);
    if (!select) continue;
    if (selectConfig.id === 'resourceBranch') {
      select.multiple = true;
      select.name = 'branch_ids';
      select.required = false;
      select.classList.add('resource-branch-source');
      select.setAttribute('aria-label', 'Select one or more branches');
      const label = document.querySelector('label[for="resourceBranch"]');
      if (label) {
        label.id = 'resourceBranchLabel';
        label.removeAttribute('for');
        label.textContent = 'Branches';
      }
      select.parentElement?.classList.add('full');
    }
    select.replaceChildren(new Option(select.options[0]?.textContent || 'Choose option', ''));
    let query = client.from(selectConfig.table).select(selectConfig.columns);
    if (selectConfig.table === 'branches' || selectConfig.table === 'subjects') query = query.eq('is_active', true);
    const { data, error } = await query.order(selectConfig.order);
    if (error) {
      console.error(`Failed to load ${selectConfig.table}:`, error.message);
      showToast('Unable to load upload categories. Check database setup.', 'error');
      continue;
    }

    data.forEach((row) => {
      const option = document.createElement('option');
      option.value = row.id;
      option.textContent = row.name;
      select.appendChild(option);
    });
    if (selectConfig.id === 'resourceBranch') {
      const branchId = new URLSearchParams(window.location.search).get('branch') || '';
      select.value = branchId;
      renderResourceBranchCheckboxes(select);
    }
    if (selectConfig.id === 'resourceSemester') {
      select.value = new URLSearchParams(window.location.search).get('semester') || '';
    }
  }

  await loadResourceSubjects();
}

let resourceSubjectRequestId = 0;
let resourceSubjectMappings = new Map();

async function loadResourceSubjects() {
  const select = document.getElementById('resourceSubject');
  if (!select) return;

  const requestId = ++resourceSubjectRequestId;
  const branchIds = [...(document.getElementById('resourceBranch')?.selectedOptions || [])]
    .map((option) => option.value)
    .filter(Boolean);
  const semesterId = document.getElementById('resourceSemester')?.value || '';
  resourceSubjectMappings = new Map();
  select.replaceChildren(new Option(branchIds.length && semesterId ? 'Loading matching subjects...' : 'Choose branches and semester first', ''));
  select.disabled = true;
  if (!branchIds.length || !semesterId) return;

  const { data, error } = await window.rnSupabaseClient.from('subjects')
    .select('id, name, subject_code, branch_id')
    .in('branch_id', branchIds)
    .eq('semester_id', semesterId)
    .eq('is_active', true)
    .order('name');

  if (requestId !== resourceSubjectRequestId) return;
  if (error) {
    console.error('Failed to load subjects for resource upload:', error.message);
    select.replaceChildren(new Option('Unable to load subjects', ''));
    showToast('Unable to load subjects for those branches and semester.', 'error');
    return;
  }

  const subjectsByKey = new Map();
  data.forEach((subject) => {
    const key = (subject.subject_code || subject.name).trim().toLowerCase();
    if (!subjectsByKey.has(key)) subjectsByKey.set(key, { subject, byBranch: new Map() });
    subjectsByKey.get(key).byBranch.set(subject.branch_id, subject);
  });
  const matchingSubjects = [...subjectsByKey.entries()]
    .filter(([, entry]) => branchIds.every((branchId) => entry.byBranch.has(branchId)));
  matchingSubjects.forEach(([key, entry]) => {
    resourceSubjectMappings.set(key, Object.fromEntries(entry.byBranch));
  });
  resourceSubjectMappings.set('__general__', Object.fromEntries(branchIds.map((branchId) => [branchId, { id: null }])));

  select.replaceChildren(new Option('Choose a matching subject or general', ''));
  matchingSubjects.forEach(([key, entry]) => {
    const label = entry.subject.subject_code
      ? `${entry.subject.name} (${entry.subject.subject_code})`
      : entry.subject.name;
    select.add(new Option(label, key));
  });
  select.add(new Option('General / no specific subject', '__general__'));
  select.disabled = false;
}

async function loadTaxonomyTables() {
  const configs = [
    { id: 'adminBranchesBody', table: 'branches', columns: 'id, name, short_name, is_active', fields: ['name', 'short_name', 'is_active'] },
    { id: 'adminSemestersBody', table: 'semesters', columns: 'id, name, number', fields: ['name', 'number'] },
    { id: 'adminSubjectsBody', table: 'subjects', columns: 'id, name, subject_code, branches(name), semesters(name)', fields: ['name', 'subject_code', 'branches', 'semesters'] }
  ];

  await Promise.all(configs.map(async (config) => {
    const body = document.getElementById(config.id);
    if (!body) return;
    let query = window.rnSupabaseClient.from(config.table).select(config.columns);
    if (config.table === 'branches') query = query.order('name');
    else if (config.table === 'semesters') query = query.order('number');
    else query = query.order('name');
    const { data, error } = await query;
    if (error) {
      setAdminTableMessage(body, `Unable to load ${config.table}.`, config.fields.length + 1);
      console.error(`Admin ${config.table} fetch failed:`, error.message);
      return;
    }
    if (!data.length) {
      setAdminTableMessage(body, `No ${config.table} added yet.`, config.fields.length + 1);
      return;
    }

    body.replaceChildren();
    data.forEach((record) => {
      const row = document.createElement('tr');
      config.fields.forEach((field) => {
        let value = record[field];
        if (field === 'branches' || field === 'semesters') value = value?.name;
        else if (field === 'is_active') value = value ? 'Active' : 'Inactive';
        appendAdminCell(row, String(value ?? ''));
      });
      const actions = document.createElement('td');
      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'ghost-btn';
      removeButton.textContent = 'Delete';
      removeButton.addEventListener('click', async () => {
        if (!window.confirm(`Delete "${record.name}"?`)) return;
        const { error: deleteError } = await window.rnSupabaseClient.from(config.table).delete().eq('id', record.id);
        if (deleteError) {
          showToast(deleteError.message, 'error');
          return;
        }
        await Promise.all([loadTaxonomyTables(), loadUploadOptions()]);
        showToast('Record deleted.', 'success');
      });
      actions.appendChild(removeButton);
      row.appendChild(actions);
      body.appendChild(row);
    });
  }));
}

function bindTaxonomyForms() {
  const forms = [
    {
      id: 'branchForm',
      table: 'branches',
      values: (formData) => ({
        name: String(formData.get('name') || '').trim(),
        short_name: String(formData.get('short_name') || '').trim() || null,
        description: String(formData.get('description') || '').trim() || null
      })
    },
    {
      id: 'semesterForm',
      table: 'semesters',
      values: (formData) => ({
        name: String(formData.get('name') || '').trim(),
        number: Number(formData.get('number'))
      })
    },
    {
      id: 'subjectForm',
      table: 'subjects',
      values: (formData) => ({
        name: String(formData.get('name') || '').trim(),
        subject_code: String(formData.get('subject_code') || '').trim() || null,
        branch_id: formData.get('branch_id'),
        semester_id: formData.get('semester_id'),
        description: String(formData.get('description') || '').trim() || null
      })
    }
  ];

  forms.forEach(({ id, table, values }) => {
    const form = document.getElementById(id);
    if (!form) return;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = form.querySelector('[type="submit"]');
      button.disabled = true;
      const { error } = await window.rnSupabaseClient.from(table).insert(values(new FormData(form)));
      button.disabled = false;
      if (error) {
        showToast(error.message, 'error');
        return;
      }
      form.reset();
      await Promise.all([loadTaxonomyTables(), loadUploadOptions()]);
      showToast(`${table.slice(0, -1)} saved.`, 'success');
    });
  });
}

function loadCsvParser() {
  if (window.Papa) return Promise.resolve(window.Papa);
  if (window.rnCsvParserPromise) return window.rnCsvParserPromise;
  window.rnCsvParserPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js';
    script.onload = () => resolve(window.Papa);
    script.onerror = () => reject(new Error('Could not load the CSV parser.'));
    document.head.appendChild(script);
  });
  return window.rnCsvParserPromise;
}

function createSubjectImportPanel() {
  const tableBody = document.getElementById('adminSubjectsBody');
  const tablePanel = tableBody?.closest('.admin-panel');
  if (!tablePanel) return null;

  const panel = document.createElement('section');
  panel.className = 'admin-panel';
  const heading = document.createElement('h3');
  heading.textContent = 'Bulk import subjects';
  const description = document.createElement('p');
  description.textContent = 'Download the CSV template, fill in official subject names and codes, then import it.';
  const form = document.createElement('form');
  form.id = 'subjectImportForm';
  const input = document.createElement('input');
  input.className = 'input';
  input.type = 'file';
  input.name = 'csv';
  input.accept = '.csv,text/csv';
  input.setAttribute('aria-label', 'Subjects CSV file');
  const actions = document.createElement('div');
  actions.className = 'admin-actions';
  const templateButton = document.createElement('button');
  templateButton.className = 'secondary-btn';
  templateButton.type = 'button';
  templateButton.id = 'downloadSubjectsTemplate';
  templateButton.textContent = 'Download CSV template';
  const importButton = document.createElement('button');
  importButton.className = 'primary-btn';
  importButton.type = 'submit';
  importButton.textContent = 'Import subjects';
  const status = document.createElement('p');
  status.id = 'subjectImportStatus';
  status.setAttribute('aria-live', 'polite');
  actions.append(templateButton, importButton);
  form.append(input, actions, status);
  panel.append(heading, description, form);
  tablePanel.parentElement.insertBefore(panel, tablePanel);
  return { form, input, templateButton, importButton, status };
}

async function downloadSubjectTemplate(status) {
  status.textContent = 'Preparing template...';
  try {
    const [{ data: branches, error: branchError }, { data: semesters, error: semesterError }, parser] = await Promise.all([
      window.rnSupabaseClient.from('branches').select('name, short_name').eq('is_active', true).order('name'),
      window.rnSupabaseClient.from('semesters').select('number').order('number'),
      loadCsvParser()
    ]);
    if (branchError || semesterError) throw branchError || semesterError;
    const fields = ['branch_short_name', 'semester_number', 'subject_name', 'subject_code', 'description'];
    const rows = [];
    branches.forEach((branch) => {
      semesters.forEach((semester) => {
        rows.push({
          branch_short_name: branch.short_name || branch.name,
          semester_number: semester.number,
          subject_name: '',
          subject_code: '',
          description: ''
        });
      });
    });
    const csv = parser.unparse({ fields, data: rows });
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'raisoni-nexus-subjects-template.csv';
    link.click();
    URL.revokeObjectURL(url);
    status.textContent = `Template ready with ${rows.length} branch-semester rows.`;
  } catch (error) {
    status.textContent = error.message || 'Unable to create the template.';
    showToast(status.textContent, 'error');
  }
}

async function importSubjectsCsv(file, status, button) {
  if (!file || file.size > 2 * 1024 * 1024) {
    throw new Error('Choose a CSV file smaller than 2 MB.');
  }
  const parser = await loadCsvParser();
  const parsed = parser.parse(await file.text(), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (header) => header.replace(/^\uFEFF/, '').trim().toLowerCase()
  });
  if (parsed.errors.length) {
    throw new Error(`CSV parsing failed on row ${parsed.errors[0].row + 2}: ${parsed.errors[0].message}`);
  }

  const requiredColumns = ['branch_short_name', 'semester_number', 'subject_name'];
  const headers = parsed.meta.fields || [];
  const missingColumns = requiredColumns.filter((column) => !headers.includes(column));
  if (missingColumns.length) {
    throw new Error(`Missing CSV columns: ${missingColumns.join(', ')}.`);
  }

  const [{ data: branches, error: branchError }, { data: semesters, error: semesterError }] = await Promise.all([
    window.rnSupabaseClient.from('branches').select('id, name, short_name').eq('is_active', true),
    window.rnSupabaseClient.from('semesters').select('id, number')
  ]);
  if (branchError || semesterError) throw branchError || semesterError;

  const branchMap = new Map();
  branches.forEach((branch) => {
    branchMap.set(String(branch.short_name || '').trim().toLowerCase(), branch);
    branchMap.set(String(branch.name || '').trim().toLowerCase(), branch);
  });
  const semesterMap = new Map(semesters.map((semester) => [String(semester.number), semester]));
  const rows = [];
  const errors = [];
  const seen = new Set();

  parsed.data.forEach((row, index) => {
    const subjectName = String(row.subject_name || '').trim();
    if (!subjectName) return;
    const branchKey = String(row.branch_short_name || '').trim().toLowerCase();
    const branch = branchMap.get(branchKey);
    const semesterNumber = Number(row.semester_number);
    const semester = semesterMap.get(String(semesterNumber));
    const rowNumber = index + 2;
    if (!branch) {
      errors.push(`Row ${rowNumber}: unknown branch "${row.branch_short_name}".`);
      return;
    }
    if (!semester) {
      errors.push(`Row ${rowNumber}: unknown semester "${row.semester_number}".`);
      return;
    }
    const key = `${branch.id}:${semester.id}:${subjectName.toLowerCase()}`;
    if (seen.has(key)) {
      errors.push(`Row ${rowNumber}: duplicate subject "${subjectName}".`);
      return;
    }
    seen.add(key);
    rows.push({
      name: subjectName,
      subject_code: String(row.subject_code || '').trim() || null,
      description: String(row.description || '').trim() || null,
      branch_id: branch.id,
      semester_id: semester.id
    });
  });

  if (errors.length) {
    status.textContent = errors.slice(0, 5).join(' ');
    if (errors.length > 5) status.textContent += ` Plus ${errors.length - 5} more row errors.`;
    throw new Error('Fix the CSV row errors before importing.');
  }
  if (!rows.length) throw new Error('The CSV has no subject rows with names.');

  const byBranch = new Map();
  rows.forEach((row) => {
    const branchRows = byBranch.get(row.branch_id) || [];
    branchRows.push(row);
    byBranch.set(row.branch_id, branchRows);
  });
  const existingKeys = new Set();
  await Promise.all([...byBranch.entries()].map(async ([branchId, branchRows]) => {
    const { data, error } = await window.rnSupabaseClient.from('subjects')
      .select('name, semester_id')
      .eq('branch_id', branchId);
    if (error) throw error;
    data.forEach((subject) => existingKeys.add(`${branchId}:${subject.semester_id}:${subject.name.toLowerCase()}`));
  }));

  const newRows = rows.filter((row) => !existingKeys.has(`${row.branch_id}:${row.semester_id}:${row.name.toLowerCase()}`));
  const duplicateCount = rows.length - newRows.length;
  if (!newRows.length) {
    status.textContent = `No new subjects to import; ${duplicateCount} already exist.`;
    return;
  }
  if (!window.confirm(`Import ${newRows.length} subjects? ${duplicateCount} existing duplicates will be skipped.`)) return;

  button.disabled = true;
  let inserted = 0;
  try {
    for (let index = 0; index < newRows.length; index += 100) {
      const batch = newRows.slice(index, index + 100);
      const { error } = await window.rnSupabaseClient.from('subjects').insert(batch);
      if (error) throw error;
      inserted += batch.length;
    }
    await Promise.all([loadTaxonomyTables(), loadUploadOptions()]);
    status.textContent = `Imported ${inserted} subjects; skipped ${duplicateCount} duplicates.`;
    showToast(status.textContent, 'success');
  } catch (error) {
    status.textContent = `Imported ${inserted} rows before failure: ${error.message}`;
    throw error;
  } finally {
    button.disabled = false;
  }
}

function bindSubjectCsvImport() {
  const controls = createSubjectImportPanel();
  if (!controls) return;
  controls.templateButton.addEventListener('click', () => downloadSubjectTemplate(controls.status));
  controls.form.addEventListener('submit', async (event) => {
    event.preventDefault();
    controls.status.textContent = '';
    try {
      await importSubjectsCsv(controls.input.files[0], controls.status, controls.importButton);
    } catch (error) {
      if (!controls.status.textContent) controls.status.textContent = error.message;
      showToast(error.message, 'error');
    }
  });
}

function bindResourceUpload() {
  const form = document.getElementById('resourceUploadForm');
  if (!form) return;

  const typeSelect = document.getElementById('resourceType');
  const resourceTypes = ['Notes', 'PYQ', 'Question Bank', 'Syllabus', 'Lab Manual', 'Assignment', 'Lecture Slides', 'Reference Book', 'Video', 'Other'];
  typeSelect.replaceChildren(...resourceTypes.map((type) => new Option(type, type)));
  document.getElementById('resourceBranch')?.addEventListener('change', loadResourceSubjects);
  document.getElementById('resourceSemester')?.addEventListener('change', loadResourceSubjects);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const client = window.rnSupabaseClient;
    const formData = new FormData(form);
    const file = formData.get('file');
    const branchIds = [...document.getElementById('resourceBranch').selectedOptions]
      .map((option) => option.value)
      .filter(Boolean);
    const subjectKey = String(formData.get('subject_id') || '');
    const subjectByBranch = resourceSubjectMappings.get(subjectKey);
    if (!branchIds.length || !formData.get('semester_id') || !subjectByBranch
      || branchIds.some((branchId) => !subjectByBranch[branchId])) {
      showToast('Choose branches, semester, and a subject available in every selected branch.', 'error');
      return;
    }
    if (!(file instanceof File) || !file.size) {
      showToast('Choose a resource file to upload.', 'error');
      return;
    }
    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    if (!['pdf', 'doc', 'docx', 'ppt', 'pptx', 'zip'].includes(extension)) {
      showToast('Choose a PDF, Word, PowerPoint, or ZIP file.', 'error');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      showToast('Files must be 20 MB or smaller.', 'error');
      return;
    }

    const submitButton = form.querySelector('[type="submit"]');
    submitButton.disabled = true;
    let objectPath;
    try {
      const session = await window.rnSupabaseUtils.getCurrentUserSession();
      const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
      objectPath = `${crypto.randomUUID()}/${safeFileName}`;
      const { error: uploadError } = await client.storage.from('resources').upload(objectPath, file, {
        cacheControl: '3600',
        contentType: file.type || 'application/octet-stream',
        upsert: false
      });
      if (uploadError) throw uploadError;

      const { data: fileData } = client.storage.from('resources').getPublicUrl(objectPath);
      const tags = String(formData.get('tags') || '').split(',').map((tag) => tag.trim()).filter(Boolean);
      const resources = branchIds.map((branchId) => ({
        title: String(formData.get('title')).trim(),
        description: String(formData.get('description') || '').trim(),
        branch_id: branchId,
        semester_id: formData.get('semester_id'),
        subject_id: subjectByBranch[branchId].id,
        resource_type: formData.get('resource_type'),
        academic_year: String(formData.get('academic_year') || '').trim() || null,
        file_url: fileData.publicUrl,
        file_name: file.name,
        file_type: file.name.split('.').pop()?.toUpperCase() || 'FILE',
        file_size: file.size,
        tags,
        uploaded_by: session.user.id,
        status: formData.get('status')
      }));
      const { error: insertError } = await client.from('resources').insert(resources);
      if (insertError) throw insertError;

      showToast('Resource uploaded successfully.', 'success');
      form.reset();
      renderResourceBranchCheckboxes(document.getElementById('resourceBranch'));
      loadResourceSubjects();
    } catch (error) {
      if (objectPath) await client.storage.from('resources').remove([objectPath]);
      console.error('Resource upload failed:', error.message);
      showToast(error.message || 'Resource upload failed.', 'error');
    } finally {
      submitButton.disabled = false;
    }
  });
}

function appendAdminCell(row, value) {
  const cell = document.createElement('td');
  cell.textContent = value || '—';
  row.appendChild(cell);
}

function setAdminTableMessage(body, message, columnCount) {
  const row = document.createElement('tr');
  const cell = document.createElement('td');
  cell.colSpan = columnCount;
  cell.textContent = message;
  row.appendChild(cell);
  body.replaceChildren(row);
}

async function loadAdminResources() {
  const body = document.getElementById('adminResourcesBody');
  if (!body) return;
  const { data, error } = await window.rnSupabaseClient
    .from('resources')
    .select('id, title, resource_type, status, download_count, file_url, branches(name)')
    .order('created_at', { ascending: false });
  if (error) {
    setAdminTableMessage(body, 'Unable to load resources.', 6);
    console.error('Admin resource fetch failed:', error.message);
    return;
  }
  if (!data.length) {
    setAdminTableMessage(body, 'No resources uploaded yet.', 6);
    return;
  }

  body.replaceChildren();
  data.forEach((resource) => {
    const row = document.createElement('tr');
    appendAdminCell(row, resource.title);
    appendAdminCell(row, resource.branches?.name);
    appendAdminCell(row, resource.resource_type);
    appendAdminCell(row, resource.status);
    appendAdminCell(row, String(resource.download_count || 0));
    const actions = document.createElement('td');
    actions.className = 'admin-actions';
    if (resource.file_url) {
      const view = document.createElement('a');
      view.className = 'ghost-btn';
      view.href = resource.file_url;
      view.target = '_blank';
      view.rel = 'noopener noreferrer';
      view.textContent = 'View';
      actions.appendChild(view);
    }
    const statusButton = document.createElement('button');
    statusButton.type = 'button';
    statusButton.className = 'secondary-btn';
    statusButton.textContent = resource.status === 'published' ? 'Unpublish' : 'Publish';
    statusButton.addEventListener('click', async () => {
      const status = resource.status === 'published' ? 'draft' : 'published';
      const { error: updateError } = await window.rnSupabaseClient.from('resources').update({ status }).eq('id', resource.id);
      if (updateError) {
        showToast(updateError.message, 'error');
        return;
      }
      await loadAdminResources();
      showToast(`Resource ${status === 'published' ? 'published' : 'unpublished'}.`, 'success');
    });
    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'ghost-btn';
    deleteButton.textContent = 'Delete';
    deleteButton.addEventListener('click', async () => {
      if (!window.confirm(`Delete resource "${resource.title}"?`)) return;
      const { error: deleteError } = await window.rnSupabaseClient.from('resources').delete().eq('id', resource.id);
      if (deleteError) {
        showToast(deleteError.message, 'error');
        return;
      }
      await loadAdminResources();
      showToast('Resource deleted.', 'success');
    });
    actions.append(statusButton, deleteButton);
    row.appendChild(actions);
    body.appendChild(row);
  });
}

let adminUserProfiles = [];
let adminUserBranches = [];
let adminUserSemesters = [];
let adminUsersPage = 1;
const ADMIN_USERS_PAGE_SIZE = 25;

function createAdminUserToolbar(body) {
  const panel = body.closest('.admin-panel');
  if (!panel || document.getElementById('adminUserSearch')) return;
  const toolbar = document.createElement('div');
  toolbar.className = 'admin-user-toolbar';
  const search = document.createElement('input');
  search.className = 'input';
  search.id = 'adminUserSearch';
  search.type = 'search';
  search.placeholder = 'Search students by name or email';
  search.setAttribute('aria-label', 'Search students by name or email');
  const branch = document.createElement('select');
  branch.className = 'select';
  branch.id = 'adminUserBranchFilter';
  branch.setAttribute('aria-label', 'Filter students by branch');
  const semester = document.createElement('select');
  semester.className = 'select';
  semester.id = 'adminUserSemesterFilter';
  semester.setAttribute('aria-label', 'Filter students by semester');
  toolbar.append(search, branch, semester);
  panel.insertBefore(toolbar, panel.querySelector('.table-wrap'));
  const pagination = document.createElement('div');
  pagination.className = 'admin-user-pagination';
  pagination.id = 'adminUserPagination';
  panel.insertBefore(pagination, panel.querySelector('.table-wrap').nextSibling);
  search.addEventListener('input', () => { adminUsersPage = 1; renderAdminUserRows(); });
  branch.addEventListener('change', () => { adminUsersPage = 1; renderAdminUserRows(); });
  semester.addEventListener('change', () => { adminUsersPage = 1; renderAdminUserRows(); });
}

function populateAdminUserFilters() {
  const branchSelect = document.getElementById('adminUserBranchFilter');
  const semesterSelect = document.getElementById('adminUserSemesterFilter');
  if (branchSelect) {
    branchSelect.replaceChildren(new Option('All branches', ''));
    adminUserBranches.forEach((branch) => branchSelect.add(new Option(branch.name, branch.id)));
  }
  if (semesterSelect) {
    semesterSelect.replaceChildren(new Option('All semesters', ''));
    adminUserSemesters.forEach((semester) => semesterSelect.add(new Option(semester.name, semester.id)));
  }
}

function filteredAdminUsers() {
  const query = document.getElementById('adminUserSearch')?.value.trim().toLowerCase() || '';
  const branchId = document.getElementById('adminUserBranchFilter')?.value || '';
  const semesterId = document.getElementById('adminUserSemesterFilter')?.value || '';
  return adminUserProfiles.filter((profile) => {
    const matchesText = !query || `${profile.name || ''} ${profile.email || ''}`.toLowerCase().includes(query);
    return matchesText
      && (!branchId || profile.branch_id === branchId)
      && (!semesterId || profile.semester_id === semesterId);
  });
}

function createAdminUserEditor() {
  let dialog = document.getElementById('adminUserEditor');
  if (dialog) return dialog;

  dialog = document.createElement('dialog');
  dialog.id = 'adminUserEditor';
  dialog.className = 'admin-user-dialog';
  const form = document.createElement('form');
  form.id = 'adminUserEditorForm';
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const profileId = form.dataset.profileId;
    const name = document.getElementById('adminEditUserName').value.trim();
    const branchId = document.getElementById('adminEditUserBranch').value || null;
    const semesterId = document.getElementById('adminEditUserSemester').value || null;
    if (!name) {
      showToast('Student name is required.', 'error');
      return;
    }

    const saveButton = form.querySelector('[type="submit"]');
    saveButton.disabled = true;
    const { error } = await window.rnSupabaseClient.from('profiles')
      .update({ name, branch_id: branchId, semester_id: semesterId })
      .eq('id', profileId);
    saveButton.disabled = false;
    if (error) {
      showToast(error.message, 'error');
      return;
    }
    dialog.close();
    showToast('Student profile updated.', 'success');
    await loadAdminUsers();
  });

  const heading = document.createElement('h2');
  heading.textContent = 'Edit student profile';
  const nameLabel = document.createElement('label');
  nameLabel.htmlFor = 'adminEditUserName';
  nameLabel.textContent = 'Full name';
  const nameInput = document.createElement('input');
  nameInput.className = 'input';
  nameInput.id = 'adminEditUserName';
  nameInput.required = true;
  const emailLabel = document.createElement('label');
  emailLabel.htmlFor = 'adminEditUserEmail';
  emailLabel.textContent = 'Email';
  const emailInput = document.createElement('input');
  emailInput.className = 'input';
  emailInput.id = 'adminEditUserEmail';
  emailInput.type = 'email';
  emailInput.readOnly = true;
  const branchLabel = document.createElement('label');
  branchLabel.htmlFor = 'adminEditUserBranch';
  branchLabel.textContent = 'Branch';
  const branchSelect = document.createElement('select');
  branchSelect.className = 'select';
  branchSelect.id = 'adminEditUserBranch';
  const semesterLabel = document.createElement('label');
  semesterLabel.htmlFor = 'adminEditUserSemester';
  semesterLabel.textContent = 'Semester';
  const semesterSelect = document.createElement('select');
  semesterSelect.className = 'select';
  semesterSelect.id = 'adminEditUserSemester';
  const actions = document.createElement('div');
  actions.className = 'admin-actions';
  const cancel = document.createElement('button');
  cancel.className = 'secondary-btn';
  cancel.type = 'button';
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', () => dialog.close());
  const save = document.createElement('button');
  save.className = 'primary-btn';
  save.type = 'submit';
  save.textContent = 'Save profile';
  actions.append(cancel, save);
  form.append(heading, nameLabel, nameInput, emailLabel, emailInput, branchLabel, branchSelect, semesterLabel, semesterSelect, actions);
  dialog.appendChild(form);
  document.body.appendChild(dialog);
  return dialog;
}

function openAdminUserEditor(profile) {
  const dialog = createAdminUserEditor();
  const form = document.getElementById('adminUserEditorForm');
  const nameInput = document.getElementById('adminEditUserName');
  const emailInput = document.getElementById('adminEditUserEmail');
  const branchSelect = document.getElementById('adminEditUserBranch');
  const semesterSelect = document.getElementById('adminEditUserSemester');
  form.dataset.profileId = profile.id;
  nameInput.value = profile.name || '';
  emailInput.value = profile.email || '';
  branchSelect.replaceChildren(new Option('Unassigned', ''), ...adminUserBranches.map((branch) => new Option(branch.name, branch.id)));
  semesterSelect.replaceChildren(new Option('Unassigned', ''), ...adminUserSemesters.map((semester) => new Option(semester.name, semester.id)));
  branchSelect.value = profile.branch_id || '';
  semesterSelect.value = profile.semester_id || '';
  dialog.showModal();
}

function renderAdminUserRows() {
  const body = document.getElementById('adminUsersBody');
  if (!body) return;
  const profiles = filteredAdminUsers();
  if (!profiles.length) {
    setAdminTableMessage(body, adminUserProfiles.length ? 'No students match these filters.' : 'No user profiles found.', 6);
    renderAdminUserPagination(0, 1);
    return;
  }
  const pageCount = Math.ceil(profiles.length / ADMIN_USERS_PAGE_SIZE);
  adminUsersPage = Math.min(adminUsersPage, pageCount);
  const startIndex = (adminUsersPage - 1) * ADMIN_USERS_PAGE_SIZE;
  const pageProfiles = profiles.slice(startIndex, startIndex + ADMIN_USERS_PAGE_SIZE);
  body.replaceChildren();
  pageProfiles.forEach((profile) => {
    const row = document.createElement('tr');
    appendAdminCell(row, profile.name);
    appendAdminCell(row, profile.email);
    appendAdminCell(row, profile.branches?.name);
    appendAdminCell(row, profile.semesters?.name);
    appendAdminCell(row, profile.role);
    const actions = document.createElement('td');
    const editButton = document.createElement('button');
    editButton.className = 'secondary-btn';
    editButton.type = 'button';
    editButton.textContent = 'Edit profile';
    editButton.addEventListener('click', () => openAdminUserEditor(profile));
    actions.appendChild(editButton);
    row.appendChild(actions);
    body.appendChild(row);
  });
  renderAdminUserPagination(profiles.length, pageCount);
}

function renderAdminUserPagination(total, pageCount) {
  const container = document.getElementById('adminUserPagination');
  if (!container) return;
  container.replaceChildren();
  const range = document.createElement('span');
  const first = total ? (adminUsersPage - 1) * ADMIN_USERS_PAGE_SIZE + 1 : 0;
  const last = Math.min(adminUsersPage * ADMIN_USERS_PAGE_SIZE, total);
  range.textContent = `${first}-${last} of ${total} students`;
  const actions = document.createElement('div');
  actions.className = 'admin-actions';
  const previous = document.createElement('button');
  previous.className = 'secondary-btn';
  previous.type = 'button';
  previous.textContent = 'Previous';
  previous.disabled = adminUsersPage <= 1;
  previous.addEventListener('click', () => { adminUsersPage -= 1; renderAdminUserRows(); });
  const next = document.createElement('button');
  next.className = 'secondary-btn';
  next.type = 'button';
  next.textContent = 'Next';
  next.disabled = adminUsersPage >= pageCount;
  next.addEventListener('click', () => { adminUsersPage += 1; renderAdminUserRows(); });
  actions.append(previous, next);
  container.append(range, actions);
}

async function loadAdminUsers() {
  const body = document.getElementById('adminUsersBody');
  if (!body) return;
  createAdminUserToolbar(body);
  const [{ data, error }, branchResult, semesterResult] = await Promise.all([
    window.rnSupabaseClient.from('profiles')
      .select('id, name, email, role, branch_id, semester_id, branches(id, name), semesters(id, name)')
      .order('created_at', { ascending: false }),
    window.rnSupabaseClient.from('branches').select('id, name').eq('is_active', true).order('name'),
    window.rnSupabaseClient.from('semesters').select('id, name, number').order('number')
  ]);
  if (error || branchResult.error || semesterResult.error) {
    setAdminTableMessage(body, 'Unable to load student data. Check your database policies.', 6);
    console.error('Admin user data fetch failed:', error?.message || branchResult.error?.message || semesterResult.error?.message);
    return;
  }
  adminUserProfiles = data || [];
  adminUserBranches = branchResult.data || [];
  adminUserSemesters = semesterResult.data || [];
  populateAdminUserFilters();
  renderAdminUserRows();

  const exportButton = document.getElementById('usersExportButton');
  if (exportButton && !exportButton.dataset.bound) {
    exportButton.dataset.bound = 'true';
    exportButton.addEventListener('click', () => {
      const values = [['Name', 'Email', 'Branch', 'Semester', 'Role'], ...filteredAdminUsers().map((profile) => [
        profile.name,
        profile.email,
        profile.branches?.name,
        profile.semesters?.name,
        profile.role
      ])];
      downloadCsv('raisoni-nexus-users.csv', values);
    });
  }
}

async function loadRecentUploads() {
  const container = document.getElementById('recentUploads');
  if (!container) return;
  const { data, error } = await window.rnSupabaseClient
    .from('resources')
    .select('title, status, created_at, semesters(name)')
    .order('created_at', { ascending: false })
    .limit(5);
  if (error) {
    container.textContent = 'Unable to load recent uploads.';
    console.error('Recent upload fetch failed:', error.message);
    return;
  }
  container.replaceChildren();
  if (!data.length) {
    container.textContent = 'No resources uploaded yet.';
    return;
  }
  data.forEach((resource) => {
    const item = document.createElement('div');
    item.className = 'list-item';
    const details = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = resource.title;
    const semester = document.createElement('p');
    semester.textContent = resource.semesters?.name || 'Semester not set';
    details.append(title, semester);
    const status = document.createElement('span');
    status.className = `status-badge ${resource.status === 'published' ? 'status-published' : 'status-draft'}`;
    status.textContent = resource.status;
    item.append(details, status);
    container.appendChild(item);
  });
}

async function loadMaterialRequests() {
  const container = document.getElementById('materialRequests');
  if (!container) return;
  const count = document.getElementById('materialRequestCount');
  const { data, error } = await window.rnSupabaseClient
    .from('material_requests')
    .select('id, requester_name, requester_email, requested_material, details, status, created_at')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('Material request inbox failed:', { code: error.code, status: error.status });
    container.textContent = error.code === '42P01'
      ? 'Apply the updated database schema and security policies to enable the request inbox.'
      : 'Unable to load material requests.';
    if (count) count.textContent = '--';
    return;
  }

  const requests = data || [];
  const newCount = requests.filter((request) => request.status === 'new').length;
  if (count) count.textContent = `${newCount} new`;
  container.replaceChildren();
  if (!requests.length) {
    container.textContent = 'No material requests yet.';
    return;
  }

  requests.forEach((request) => {
    const item = document.createElement('div');
    item.className = 'list-item';
    const details = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = request.requested_material;
    const requester = document.createElement('p');
    requester.textContent = `${request.requester_name} - ${request.requester_email}`;
    details.append(title, requester);
    if (request.details) {
      const description = document.createElement('p');
      description.textContent = request.details;
      details.appendChild(description);
    }
    const actions = document.createElement('div');
    actions.className = 'admin-actions';
    const status = document.createElement('span');
    status.className = `status-badge ${request.status === 'fulfilled' ? 'status-published' : 'status-draft'}`;
    status.textContent = request.status.replace('_', ' ');
    actions.appendChild(status);
    if (request.status !== 'fulfilled') {
      const complete = document.createElement('button');
      complete.className = 'secondary-btn';
      complete.type = 'button';
      complete.textContent = 'Mark fulfilled';
      complete.addEventListener('click', async () => {
        complete.disabled = true;
        const { error: updateError } = await window.rnSupabaseClient
          .from('material_requests')
          .update({ status: 'fulfilled' })
          .eq('id', request.id);
        if (updateError) {
          complete.disabled = false;
          showToast('Unable to update this request.', 'error');
          console.error('Material request update failed:', { code: updateError.code, status: updateError.status });
          return;
        }
        showToast('Request marked fulfilled.', 'success');
        await loadMaterialRequests();
      });
      actions.appendChild(complete);
    }
    item.append(details, actions);
    container.appendChild(item);
  });
}

function downloadCsv(fileName, rows) {
  const csv = rows.map((line) => line.map((value) => `"${String(value || '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

async function loadAdminAnalytics() {
  const trend = document.getElementById('downloadTrend');
  if (!trend) return;
  const client = window.rnSupabaseClient;
  const now = new Date();
  const trendStart = new Date(now);
  trendStart.setUTCDate(trendStart.getUTCDate() - 6);
  trendStart.setUTCHours(0, 0, 0, 0);
  const dayStarts = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(trendStart);
    date.setUTCDate(date.getUTCDate() + index);
    return date;
  });
  const [{ data: resources, error: resourceError }, { count: newStudents, error: studentError }, ...dailyResults] = await Promise.all([
    client.from('resources').select('title, download_count, branches(name), subjects(name)').order('download_count', { ascending: false }).limit(100),
    client.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'student').gte('created_at', new Date(now.getTime() - 30 * 86400000).toISOString()),
    ...dayStarts.map((start, index) => {
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 1);
      return client.from('downloads').select('*', { count: 'exact', head: true })
        .gte('downloaded_at', start.toISOString())
        .lt('downloaded_at', end.toISOString());
    })
  ]);

  if (resourceError || studentError || dailyResults.some((result) => result.error)) {
    console.error('Analytics fetch failed:', resourceError?.message || studentError?.message || dailyResults.find((result) => result.error)?.error.message);
    trend.textContent = 'Unable to load analytics. Check the database setup.';
    return;
  }

  const subjectTotals = new Map();
  const branchTotals = new Map();
  resources.forEach((resource) => {
    const downloads = resource.download_count || 0;
    if (resource.subjects?.name) subjectTotals.set(resource.subjects.name, (subjectTotals.get(resource.subjects.name) || 0) + downloads);
    if (resource.branches?.name) branchTotals.set(resource.branches.name, (branchTotals.get(resource.branches.name) || 0) + downloads);
  });
  const mostPopular = (totals) => [...totals.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] || '--';
  document.getElementById('topResourceCount').textContent = String(resources[0]?.download_count || 0);
  document.getElementById('topResourceTitle').textContent = resources[0]?.title || 'Most downloaded resource';
  document.getElementById('popularSubject').textContent = mostPopular(subjectTotals);
  document.getElementById('popularBranch').textContent = mostPopular(branchTotals);
  document.getElementById('newStudentCount').textContent = String(newStudents || 0);

  const maxDownloads = Math.max(1, ...dailyResults.map((result) => result.count || 0));
  trend.replaceChildren();
  const trendRows = [['Date', 'Downloads']];
  dayStarts.forEach((start, index) => {
    const count = dailyResults[index].count || 0;
    const day = start.toISOString().slice(0, 10);
    trendRows.push([day, count]);
    const row = document.createElement('div');
    row.className = 'list-item';
    const label = document.createElement('span');
    label.textContent = day;
    const value = document.createElement('strong');
    value.textContent = String(count);
    const bar = document.createElement('progress');
    bar.max = maxDownloads;
    bar.value = count;
    bar.setAttribute('aria-label', `${count} downloads on ${day}`);
    row.append(label, bar, value);
    trend.appendChild(row);
  });

  document.getElementById('analyticsExportButton')?.addEventListener('click', () => {
    downloadCsv('raisoni-nexus-download-analytics.csv', trendRows);
  }, { once: true });
}

function bindAdminPasswordForm() {
  const form = document.getElementById('adminPasswordForm');
  if (!form) return;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const password = String(formData.get('password') || '');
    const confirmation = String(formData.get('confirmPassword') || '');
    if (password.length < 8 || password !== confirmation) {
      showToast(password !== confirmation ? 'Passwords do not match.' : 'Use at least 8 characters.', 'error');
      return;
    }
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    const { error } = await window.rnSupabaseClient.auth.updateUser({ password });
    button.disabled = false;
    if (error) {
      showToast(error.message, 'error');
      return;
    }
    form.reset();
    showToast('Admin password updated.', 'success');
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const sidebar = document.querySelector('.admin-sidebar');
  const toggle = document.querySelector('.admin-sidebar-toggle');
  if (sidebar && toggle) {
    if (!sidebar.id) sidebar.id = 'admin-sidebar-navigation';
    toggle.setAttribute('aria-controls', sidebar.id);

    const mobileViewport = window.matchMedia('(max-width: 980px)');
    const main = sidebar.parentElement.querySelector('.admin-main');
    const backdrop = document.createElement('button');
    backdrop.className = 'admin-sidebar-backdrop';
    backdrop.type = 'button';
    backdrop.setAttribute('aria-label', 'Close navigation menu');
    sidebar.insertAdjacentElement('afterend', backdrop);

    const setSidebarOpen = (open) => {
      const wasOpen = sidebar.classList.contains('open');
      const isOpen = mobileViewport.matches && open;
      sidebar.classList.toggle('open', isOpen);
      sidebar.setAttribute('aria-hidden', String(mobileViewport.matches && !isOpen));
      sidebar.inert = mobileViewport.matches && !isOpen;
      if (main) main.inert = isOpen;
      toggle.setAttribute('aria-expanded', String(isOpen));
      if (isOpen && !wasOpen) sidebar.querySelector('.admin-nav a')?.focus();
    };

    const closeSidebar = () => {
      if (mobileViewport.matches && sidebar.classList.contains('open')) {
        setSidebarOpen(false);
        toggle.focus();
      }
    };

    setSidebarOpen(false);
    toggle.addEventListener('click', () => {
      setSidebarOpen(!sidebar.classList.contains('open'));
    });
    backdrop.addEventListener('click', closeSidebar);
    sidebar.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeSidebar));
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeSidebar();
    });
    mobileViewport.addEventListener('change', () => setSidebarOpen(false));
  }

  document.querySelectorAll('.table-action').forEach((action) => {
    action.addEventListener('click', () => {
      showToast('Action executed', 'success');
    });
  });

  if (await requireAdminAccess()) {
    await Promise.all([
      loadAdminMetrics(),
      loadUploadOptions(),
      loadAdminResources(),
      loadAdminUsers(),
      loadRecentUploads(),
      loadMaterialRequests(),
      loadTaxonomyTables(),
      loadAdminAnalytics()
    ]);
    document.getElementById('refreshMaterialRequests')?.addEventListener('click', loadMaterialRequests);
    window.setInterval(loadMaterialRequests, 60_000);
    bindTaxonomyForms();
    bindSubjectCsvImport();
    bindAdminPasswordForm();
    bindResourceUpload();
  }
});
