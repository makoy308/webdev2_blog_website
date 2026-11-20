(() => {
  const postsKey = 'aftercredits.webdev2_blog_website.posts.v1';
  const commentsKey = 'aftercredits.webdev2_blog_website.comments.v1';

  function getStorage() {
    try {
      return window.localStorage;
    } catch {
      throw new Error('Browser storage is unavailable. Check your browser privacy settings and try again.');
    }
  }

  function readCollection(key, label, isValid) {
    let value;
    try {
      const saved = getStorage().getItem(key);
      if (saved === null) return [];
      value = JSON.parse(saved);
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Your saved ${label} could not be read. Clear this site’s saved browser data to continue.`);
      }
      throw error;
    }
    if (!Array.isArray(value) || value.some((item) => !isValid(item))) {
      throw new Error(`Your saved ${label} are invalid. Clear this site’s saved browser data to continue.`);
    }
    return value;
  }

  function writeCollection(key, label, value, isValid) {
    if (!Array.isArray(value) || value.some((item) => !isValid(item))) {
      throw new Error(`Could not save invalid ${label}. Please try again.`);
    }
    try {
      getStorage().setItem(key, JSON.stringify(value));
    } catch (error) {
      if (error.name === 'QuotaExceededError') {
        throw new Error('This browser is out of storage space. Clear some site data and try again.');
      }
      throw new Error(`Could not save ${label} in this browser. Check your browser storage settings and try again.`);
    }
  }

  const isPost = (item) => item
    && typeof item.id === 'string'
    && typeof item.content === 'string'
    && typeof item.author === 'string'
    && typeof item.createdAt === 'string';
  const isComment = (item) => item
    && typeof item.id === 'string'
    && typeof item.postId === 'string'
    && typeof item.content === 'string'
    && typeof item.author === 'string'
    && typeof item.createdAt === 'string';

  window.discussionStorage = Object.freeze({
    readPosts: () => readCollection(postsKey, 'discussions', isPost),
    writePosts: (posts) => writeCollection(postsKey, 'discussions', posts, isPost),
    readComments: () => readCollection(commentsKey, 'comments', isComment),
    writeComments: (comments) => writeCollection(commentsKey, 'comments', comments, isComment),
    createId: () => window.crypto?.randomUUID
      ? window.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  });
})();
