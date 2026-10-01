function handleSearchQuery() {
  const resultsContainer = document.querySelector('#searchResults');
  if (!resultsContainer) return;
  if (window.rnResourceError) {
    resultsContainer.textContent = window.rnResourceError;
    return;
  }

  const query = document.querySelector('#searchInput')?.value.trim().toLowerCase() || '';
  const branch = document.querySelector('#filterBranch')?.value || '';
  const semester = document.querySelector('#filterSemester')?.value || '';
  const type = document.querySelector('#filterType')?.value || '';
  const results = (window.rnResources || []).filter((item) => {
    const text = `${item.title} ${item.subject} ${item.description} ${item.type} ${item.branch} ${item.semester}`.toLowerCase();
    return (!query || text.includes(query))
      && (!branch || item.branch === branch)
      && (!semester || item.semester === semester)
      && (!type || item.type === type);
  });
  renderResourceCards('#searchResults', results);
}

function populateSearchFilters(items, taxonomy = {}) {
  const branches = taxonomy.branches?.length
    ? taxonomy.branches.map((branch) => branch.name)
    : [...new Set(items.map((item) => item.branch).filter(Boolean))].sort();
  const semesters = taxonomy.semesters?.length
    ? taxonomy.semesters.map((semester) => semester.name)
    : [...new Set(items.map((item) => item.semester).filter(Boolean))].sort();
  const filters = [
    { id: 'filterBranch', label: 'All branches', values: branches },
    { id: 'filterSemester', label: 'All semesters', values: semesters },
    { id: 'filterType', label: 'All types', values: ['Notes', 'PYQ', 'Question Bank', 'Syllabus', 'Lab Manual', 'Assignment', 'Lecture Slides', 'Reference Book', 'Video', 'Other'] }
  ];
  filters.forEach(({ id, label, values }) => {
    const select = document.getElementById(id);
    if (!select) return;
    select.replaceChildren(new Option(label, ''));
    values.forEach((value) => select.add(new Option(value, value)));
  });
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelector('#searchInput')?.addEventListener('input', handleSearchQuery);
  document.querySelectorAll('.filter-panel select').forEach((select) => select.addEventListener('change', handleSearchQuery));
  window.addEventListener('rn-resources-loaded', (event) => {
    const detail = event.detail || {};
    populateSearchFilters(detail.items || [], detail);
    window.rnResourceError = detail.error || '';
    handleSearchQuery();
  });
  handleSearchQuery();
});
