const express = require('express');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const POSTS_FILE = path.join(DATA_DIR, 'posts.json');
const COMMENTS_FILE = path.join(DATA_DIR, 'comments.json');
const MAX_FIELD_LENGTH = 5000;
const CATEGORIES = ['Action', 'Romance', 'Fantasy', 'Comedy', 'Adventure', 'Horror', 'Slice of Life'];
const animeSearchCache = new Map();
let writeQueue = Promise.resolve();

app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(__dirname, 'public')));

function cleanText(value, maxLength = MAX_FIELD_LENGTH) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, maxLength);
}

function safeAnimeImage(value) {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'cdn.myanimelist.net' ? url.href : '';
  } catch {
    return '';
  }
}

async function readCollection(file) {
  try {
    const contents = await fs.readFile(file, 'utf8');
    const data = JSON.parse(contents);
    if (!Array.isArray(data)) throw new Error(`Expected an array in ${path.basename(file)}`);
    return data;
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function writeCollection(file, data) {
  const temporaryFile = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await fs.writeFile(temporaryFile, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(temporaryFile, file);
}

function serializeWrite(operation) {
  const result = writeQueue.then(operation);
  writeQueue = result.catch(() => {});
  return result;
}

function validPost(body) {
  const content = cleanText(body.content, 5000);
  const isSimplePost = body.simple === true
    && content
    && !cleanText(body.animeTitle, 120)
    && !cleanText(body.title, 160)
    && !cleanText(body.category, 40);
  if (isSimplePost) {
    return {
      animeTitle: '',
      title: '',
      category: '',
      content,
      author: cleanText(body.author, 60) || 'Anonymous',
      animeId: '',
      animeImage: '',
      simple: true
    };
  }

  const post = {
    animeTitle: cleanText(body.animeTitle, 120),
    title: cleanText(body.title, 160),
    category: cleanText(body.category, 40),
    content: cleanText(body.content, 5000),
    author: cleanText(body.author, 60) || 'Anonymous',
    animeId: /^\d+$/.test(body.animeId) ? cleanText(body.animeId, 20) : '',
    animeImage: safeAnimeImage(body.animeImage)
  };
  if (!post.animeTitle || !post.title || !CATEGORIES.includes(post.category) || !post.content) return null;
  return post;
}

function validComment(body) {
  const comment = {
    content: cleanText(body.content, 2000),
    author: cleanText(body.author, 60) || 'Anonymous'
  };
  return comment.content ? comment : null;
}

app.get('/api/anime/search', async (req, res) => {
  const query = cleanText(req.query.q, 80);
  if (query.length < 2) {
    return res.status(400).json({ error: 'Enter at least two characters to search for an anime.' });
  }

  const cacheKey = query.toLocaleLowerCase();
  const cached = animeSearchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return res.json(cached.results);

  try {
    const url = new URL('https://api.jikan.moe/v4/anime');
    url.searchParams.set('q', query);
    url.searchParams.set('limit', '6');
    url.searchParams.set('sfw', 'true');
    url.searchParams.set('order_by', 'members');
    url.searchParams.set('sort', 'desc');
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) {
      const status = response.status === 429 ? 503 : 502;
      return res.status(status).json({
        error: response.status === 429
          ? 'Anime search is busy right now. Please try again in a moment.'
          : 'Anime search is temporarily unavailable. You can still enter the title manually.'
      });
    }

    const payload = await response.json();
    const results = (Array.isArray(payload.data) ? payload.data : []).map((anime) => ({
      id: String(anime.mal_id),
      title: cleanText(anime.title_english || anime.title, 160),
      year: anime.year || null,
      imageUrl: safeAnimeImage(
        anime.images?.webp?.large_image_url ||
        anime.images?.jpg?.large_image_url ||
        anime.images?.jpg?.image_url
      )
    })).filter((anime) => anime.id && anime.title);

    if (animeSearchCache.size >= 100) {
      const firstKey = animeSearchCache.keys().next().value;
      animeSearchCache.delete(firstKey);
    }
    animeSearchCache.set(cacheKey, { results, expiresAt: Date.now() + 5 * 60 * 1000 });
    res.json(results);
  } catch (error) {
    const timedOut = error.name === 'TimeoutError' || error.name === 'AbortError';
    res.status(timedOut ? 504 : 502).json({
      error: timedOut
        ? 'Anime search took too long. Please try again or enter the title manually.'
        : 'Anime search is temporarily unavailable. You can still enter the title manually.'
    });
  }
});

app.get('/api/posts', async (req, res, next) => {
  try {
    const [posts, comments] = await Promise.all([
      readCollection(POSTS_FILE),
      readCollection(COMMENTS_FILE)
    ]);
    const withCounts = posts.map((post) => ({
      ...post,
      commentCount: comments.filter((comment) => comment.postId === post.id).length
    }));
    res.json(withCounts);
  } catch (error) {
    next(error);
  }
});

app.get('/api/posts/:id', async (req, res, next) => {
  try {
    const posts = await readCollection(POSTS_FILE);
    const post = posts.find((item) => item.id === req.params.id);
    if (!post) return res.status(404).json({ error: 'Discussion not found.' });
    const comments = await readCollection(COMMENTS_FILE);
    res.json({
      ...post,
      comments: comments.filter((comment) => comment.postId === post.id)
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/posts', async (req, res, next) => {
  const postData = validPost(req.body || {});
  if (!postData) return res.status(400).json({ error: 'Please fill in the anime title, post title, category, and your thoughts.' });
  try {
    const post = await serializeWrite(async () => {
      const posts = await readCollection(POSTS_FILE);
      const created = { id: randomUUID(), ...postData, createdAt: new Date().toISOString() };
      posts.push(created);
      await writeCollection(POSTS_FILE, posts);
      return created;
    });
    res.status(201).json({ ...post, commentCount: 0 });
  } catch (error) {
    next(error);
  }
});

app.get('/api/posts/:id/comments', async (req, res, next) => {
  try {
    const [posts, comments] = await Promise.all([
      readCollection(POSTS_FILE),
      readCollection(COMMENTS_FILE)
    ]);
    if (!posts.some((post) => post.id === req.params.id)) {
      return res.status(404).json({ error: 'Discussion not found.' });
    }
    res.json(comments.filter((comment) => comment.postId === req.params.id));
  } catch (error) {
    next(error);
  }
});

app.post('/api/posts/:id/comments', async (req, res, next) => {
  const commentData = validComment(req.body || {});
  if (!commentData) return res.status(400).json({ error: 'Please write a comment before posting.' });
  try {
    const comment = await serializeWrite(async () => {
      const posts = await readCollection(POSTS_FILE);
      if (!posts.some((post) => post.id === req.params.id)) return null;
      const comments = await readCollection(COMMENTS_FILE);
      const created = {
        id: randomUUID(),
        postId: req.params.id,
        ...commentData,
        createdAt: new Date().toISOString()
      };
      comments.push(created);
      await writeCollection(COMMENTS_FILE, comments);
      return created;
    });
    if (!comment) return res.status(404).json({ error: 'Discussion not found.' });
    res.status(201).json(comment);
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return res.status(400).json({ error: 'Please send valid JSON.' });
  }
  console.error(error);
  res.status(500).json({ error: 'Something went wrong while saving your request. Please try again.' });
});

if (require.main === module) {
  fs.mkdir(DATA_DIR, { recursive: true })
    .then(() => Promise.all([
      fs.access(POSTS_FILE).catch(() => fs.writeFile(POSTS_FILE, '[]\n')),
      fs.access(COMMENTS_FILE).catch(() => fs.writeFile(COMMENTS_FILE, '[]\n'))
    ]))
    .then(() => app.listen(PORT, () => console.log(`Anime Community is running at http://localhost:${PORT}`)))
    .catch((error) => {
      console.error('Unable to initialize JSON storage:', error);
      process.exitCode = 1;
    });
}

module.exports = app;
