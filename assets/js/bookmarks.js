const BOOKMARKS_KEY = 'raisoni-nexus-bookmarks';

function getBookmarks() {
  return JSON.parse(localStorage.getItem(BOOKMARKS_KEY) || '[]');
}

function saveBookmarks(bookmarks) {
  localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks));
}

function toggleBookmark(resourceId) {
  const bookmarks = getBookmarks();
  const index = bookmarks.indexOf(resourceId);
  if (index >= 0) {
    bookmarks.splice(index, 1);
    showToast('Bookmark removed', 'error');
  } else {
    bookmarks.push(resourceId);
    showToast('Resource saved', 'success');
  }
  saveBookmarks(bookmarks);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.bookmark-btn').forEach((button) => {
      button.addEventListener('click', () => {
        toggleBookmark(button.dataset.resource || 'sample');
      });
    });
  });
}
