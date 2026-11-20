(() => {
  const list = document.querySelector('#discussion-list');
  if (!list) return;

  const search = document.querySelector('#post-search');
  const category = document.querySelector('#category-filter');
  const sort = document.querySelector('#sort-filter');
  const form = document.querySelector('#post-form');
  const formMessage = document.querySelector('#form-message');
  const postsTotal = document.querySelector('#post-total');
  const visibleCount = document.querySelector('#visible-count');
  const staticMode = window.APP_CONFIG?.staticMode === true;
  let posts = [];
  const categories = ['Action', 'Romance', 'Fantasy', 'Comedy', 'Adventure', 'Horror', 'Slice of Life'];

  if (staticMode) {
    document.body.classList.add('static-read-only');
    const note = document.querySelector('#static-readonly-note');
    if (note) note.hidden = false;
    form.hidden = true;
  }

  const createElement = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };

  async function request(url, options) {
    const response = await fetch(url, options);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Something went wrong. Please try again.');
    return body;
  }

  function getFilteredPosts() {
    const query = search.value.trim().toLocaleLowerCase();
    return posts.filter((post) => {
      const text = `${post.animeTitle} ${post.title} ${post.content} ${post.author}`.toLocaleLowerCase();
      return (!query || text.includes(query)) && (!category.value || post.category === category.value);
    }).sort((a, b) => {
      const difference = new Date(a.createdAt) - new Date(b.createdAt);
      return sort.value === 'oldest' ? difference : -difference;
    });
  }

  function renderPosts() {
    const visible = getFilteredPosts();
    visibleCount.textContent = String(visible.length);
    list.replaceChildren();
    if (!visible.length) {
      list.append(createElement('div', 'empty-results', posts.length ? 'No discussions match those filters. Try another search or genre.' : 'No discussions yet — start the first conversation!'));
      return;
    }

    visible.forEach((post) => {
      const card = createElement('article', 'discussion-card');
      if (!post.simple) {
        const top = createElement('div', 'discussion-topline');
        const genre = createElement('span', 'category-dot', post.category);
        genre.dataset.category = post.category;
        top.append(genre, createElement('time', '', window.formatRelativeTime(post.createdAt)));
        card.append(top);
      }
      const title = post.title ? createElement('h3', '', post.title) : null;
      let animeTitle;
      if (post.animeImage) {
        animeTitle = createElement('div', 'discussion-anime-info');
        const cover = createElement('img', 'discussion-cover-thumb');
        cover.src = post.animeImage;
        cover.alt = `Cover art for ${post.animeTitle}`;
        cover.loading = 'lazy';
        cover.addEventListener('error', () => cover.remove());
        animeTitle.append(cover, createElement('div', 'discussion-anime', post.animeTitle));
      } else if (post.animeTitle) {
        animeTitle = createElement('div', 'discussion-anime', post.animeTitle);
      }
      const excerpt = createElement('p', 'discussion-excerpt', post.content);
      const bottom = createElement('div', 'discussion-bottomline');
      const byline = createElement('span', 'post-byline');
      byline.append(createElement('span', 'tiny-avatar', (post.author || 'A').charAt(0).toUpperCase()), createElement('span', '', post.author), createElement('span', '', '·'), createElement('span', '', window.formatRelativeTime(post.createdAt)));
      const conversationLabel = staticMode ? 'View comments →' : 'View & reply →';
      const toggle = createElement('button', 'comment-toggle', `${post.commentCount || 0} comments  ·  ${conversationLabel}`);
      toggle.type = 'button';
      bottom.append(byline, toggle);
      if (title) card.append(title);
      if (animeTitle) card.append(animeTitle);
      card.append(excerpt, bottom);

      const panel = createElement('section', 'comment-panel');
      panel.hidden = true;
      const panelTitle = createElement('h4', '', 'The conversation');
      const entries = createElement('div', 'comment-entries');
      entries.append(createElement('p', 'no-comments', 'Loading comments…'));
      panel.append(panelTitle, entries);
      const commentForm = document.createElement('form');
      commentForm.className = 'comment-form';
      commentForm.hidden = staticMode;
      const commentInput = document.createElement('textarea');
      commentInput.name = 'content';
      commentInput.rows = 2;
      commentInput.maxLength = 2000;
      commentInput.placeholder = 'Add a thoughtful comment…';
      commentInput.required = true;
      commentInput.setAttribute('aria-label', 'Your comment');
      const formRow = createElement('div', 'comment-form-row');
      const nameInput = document.createElement('input');
      nameInput.name = 'author';
      nameInput.maxLength = 60;
      nameInput.placeholder = 'Your name (optional)';
      nameInput.setAttribute('aria-label', 'Your name (optional)');
      const submit = createElement('button', 'button', 'Post comment');
      submit.type = 'submit';
      formRow.append(nameInput, submit);
      const feedback = createElement('div', 'comment-feedback');
      feedback.setAttribute('role', 'status');
      commentForm.append(commentInput, formRow, feedback);
      panel.append(commentForm);
      if (staticMode) {
        panel.append(createElement('p', 'form-note', 'Comments are read-only on this GitHub Pages version.'));
      }
      card.append(panel);

      let commentsLoaded = false;
      toggle.addEventListener('click', async () => {
        panel.hidden = !panel.hidden;
        toggle.textContent = panel.hidden
          ? `${post.commentCount || 0} comments  ·  ${conversationLabel}`
          : 'Hide conversation ↑';
        if (panel.hidden || commentsLoaded) return;
        try {
          const comments = staticMode
            ? (await request('data/comments.json')).filter((comment) => comment.postId === post.id)
            : await request(`/api/posts/${encodeURIComponent(post.id)}/comments`);
          renderComments(entries, comments);
          commentsLoaded = true;
        } catch (error) {
          entries.replaceChildren(createElement('p', 'no-comments', error.message));
        }
      });

      commentForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        feedback.textContent = '';
        feedback.className = 'comment-feedback';
        submit.disabled = true;
        try {
          const comment = await request(`/api/posts/${encodeURIComponent(post.id)}/comments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: commentInput.value, author: nameInput.value })
          });
          if (!commentsLoaded) {
            entries.replaceChildren();
            commentsLoaded = true;
          }
          entries.querySelector('.no-comments')?.remove();
          appendComment(entries, comment);
          commentInput.value = '';
          nameInput.value = '';
          post.commentCount = (post.commentCount || 0) + 1;
          toggle.textContent = 'Hide conversation ↑';
          panel.hidden = false;
          feedback.textContent = 'Your comment is live.';
          feedback.classList.add('success');
        } catch (error) {
          feedback.textContent = error.message;
        } finally {
          submit.disabled = false;
        }
      });
      list.append(card);
    });
  }

  function appendComment(container, comment) {
    const entry = createElement('div', 'comment-entry');
    const author = createElement('strong', '', comment.author);
    const date = createElement('time', '', window.formatRelativeTime(comment.createdAt));
    const text = createElement('p', '', comment.content);
    entry.append(author, date, text);
    container.append(entry);
  }

  function renderComments(container, comments) {
    container.replaceChildren();
    if (!comments.length) {
      container.append(createElement('p', 'no-comments', 'No comments yet. Be the first to join in.'));
      return;
    }
    comments.forEach((comment) => appendComment(container, comment));
  }

  async function loadPosts() {
    const errorBox = document.querySelector('#list-error');
    try {
      if (staticMode) {
        const [staticPosts, comments] = await Promise.all([
          request('data/posts.json'),
          request('data/comments.json')
        ]);
        posts = staticPosts.map((post) => ({
          ...post,
          commentCount: comments.filter((comment) => comment.postId === post.id).length
        }));
      } else {
        posts = await request('/api/posts');
      }
      postsTotal.textContent = String(posts.length);
      renderPosts();
      errorBox.textContent = '';
    } catch (error) {
      list.replaceChildren(createElement('div', 'empty-results', 'We could not load discussions right now.'));
      errorBox.textContent = error.message;
    }
  }

  [search, category, sort].forEach((control) => control.addEventListener('input', renderPosts));
  category.addEventListener('change', renderPosts);
  sort.addEventListener('change', renderPosts);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    formMessage.textContent = '';
    formMessage.className = 'form-message';
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    const values = new FormData(form);
    const post = {
      author: values.get('author'),
      content: values.get('content'),
      simple: true
    };
    try {
      await request('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(post)
      });
      form.reset();
      formMessage.textContent = 'Your discussion is live — thanks for sharing!';
      formMessage.classList.add('success');
      await loadPosts();
      document.querySelector('.discussion-list-wrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      formMessage.textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  });

  const initialCategory = new URLSearchParams(window.location.search).get('category');
  if (initialCategory && categories.includes(initialCategory)) category.value = initialCategory;
  const initialPost = new URLSearchParams(window.location.search).get('post');
  loadPosts().then(() => {
    if (!initialPost) return;
    const post = posts.find((item) => item.id === initialPost);
    const card = [...list.querySelectorAll('.discussion-card')].find((item) => item.querySelector('h3')?.textContent === post?.title);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.querySelector('.comment-toggle').click();
    }
  });
})();
