(() => {
  const menuButton = document.querySelector('.menu-toggle');
  const navLinks = document.querySelector('.nav-links');
  if (menuButton && navLinks) {
    menuButton.addEventListener('click', () => {
      const open = navLinks.classList.toggle('open');
      menuButton.setAttribute('aria-expanded', String(open));
      menuButton.textContent = open ? '×' : '☰';
    });
  }

  const recentPosts = document.querySelector('#recent-posts');
  if (recentPosts) {
    fetch('/api/posts')
      .then((response) => {
        if (!response.ok) throw new Error('Could not load discussions.');
        return response.json();
      })
      .then((posts) => {
        const latest = posts.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 4);
        recentPosts.replaceChildren();
        if (!latest.length) {
          recentPosts.innerHTML = '<div class="empty-feed">Be the first to share what you have been watching.</div>';
          return;
        }
        latest.forEach((post) => {
          const link = document.createElement('a');
          link.className = 'recent-post';
          link.href = `/discussions.html?post=${encodeURIComponent(post.id)}`;
          const mark = document.createElement('span');
          mark.className = 'recent-mark';
          mark.textContent = '✦';
          const copy = document.createElement('span');
          copy.className = 'recent-copy';
          const title = document.createElement('strong');
          title.textContent = post.title;
          const detail = document.createElement('span');
          detail.textContent = `${post.animeTitle} · ${post.author}`;
          copy.append(title, detail);
          const time = document.createElement('span');
          time.className = 'recent-time';
          time.textContent = formatRelativeTime(post.createdAt);
          link.append(mark, copy, time);
          recentPosts.append(link);
        });
      })
      .catch(() => {
        recentPosts.replaceChildren();
        const error = document.querySelector('#home-error');
        if (error) error.textContent = 'The latest discussions could not be loaded. Please refresh to try again.';
      });
  }

  window.formatRelativeTime = (dateValue) => {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return 'Recently';
    const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
  };
})();
