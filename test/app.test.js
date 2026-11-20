const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const app = require('../index');

test('discussion and comment API validates, persists, and associates anonymous activity', async (t) => {
  const postsFile = path.join(__dirname, '..', 'data', 'posts.json');
  const commentsFile = path.join(__dirname, '..', 'data', 'comments.json');
  const originalPosts = await fs.readFile(postsFile, 'utf8').catch(() => '[]\n');
  const originalComments = await fs.readFile(commentsFile, 'utf8').catch(() => '[]\n');
  let server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  let baseUrl = `http://127.0.0.1:${server.address().port}`;

  t.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await Promise.all([
      fs.writeFile(postsFile, originalPosts),
      fs.writeFile(commentsFile, originalComments)
    ]);
  });

  const shortAnimeQuery = await fetch(`${baseUrl}/api/anime/search?q=a`);
  assert.equal(shortAnimeQuery.status, 400);

  const originalFetch = global.fetch;
  let upstreamRequests = 0;
  try {
    global.fetch = async (url) => {
      upstreamRequests += 1;
      assert.equal(new URL(url).hostname, 'api.jikan.moe');
      return new Response(JSON.stringify({
        data: [{
          mal_id: 52991,
          title: 'Sousou no Frieren',
          title_english: 'Frieren: Beyond Journey’s End',
          year: 2023,
          images: { webp: { large_image_url: 'https://cdn.myanimelist.net/images/anime/1/1.webp' } }
        }]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    const animeSearchResponse = await originalFetch(`${baseUrl}/api/anime/search?q=Frieren`);
    assert.equal(animeSearchResponse.status, 200);
    const animeResults = await animeSearchResponse.json();
    assert.equal(animeResults[0].id, '52991');
    assert.equal(animeResults[0].title, 'Frieren: Beyond Journey’s End');
    assert.equal(animeResults[0].imageUrl, 'https://cdn.myanimelist.net/images/anime/1/1.webp');
    await originalFetch(`${baseUrl}/api/anime/search?q=frieren`);
    assert.equal(upstreamRequests, 1);
  } finally {
    global.fetch = originalFetch;
  }

  const invalidPost = await fetch(`${baseUrl}/api/posts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ animeTitle: 'Only half a post' })
  });
  assert.equal(invalidPost.status, 400);

  const invalidCategory = await fetch(`${baseUrl}/api/posts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ animeTitle: 'A show', title: 'A post', category: 'Unknown', content: 'Not a supported genre.' })
  });
  assert.equal(invalidCategory.status, 400);

  const createResponse = await fetch(`${baseUrl}/api/posts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      animeTitle: 'Mob Psycho 100',
      title: 'The quiet moments hit hardest',
      category: 'Action',
      content: 'A lovely show.',
      author: '',
      animeId: '32182',
      animeImage: 'https://cdn.myanimelist.net/images/anime/1/1.jpg'
    })
  });
  assert.equal(createResponse.status, 201);
  const createdPost = await createResponse.json();
  assert.equal(createdPost.author, 'Anonymous');
  assert.equal(createdPost.animeId, '32182');
  assert.equal(createdPost.animeImage, 'https://cdn.myanimelist.net/images/anime/1/1.jpg');

  const emptyComment = await fetch(`${baseUrl}/api/posts/${createdPost.id}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: '   ' })
  });
  assert.equal(emptyComment.status, 400);

  const commentResponse = await fetch(`${baseUrl}/api/posts/${createdPost.id}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: 'That finale stayed with me.', author: '' })
  });
  assert.equal(commentResponse.status, 201);
  const comment = await commentResponse.json();
  assert.equal(comment.author, 'Anonymous');
  assert.equal(comment.postId, createdPost.id);

  const allPosts = await (await fetch(`${baseUrl}/api/posts`)).json();
  assert.equal(allPosts.find((post) => post.id === createdPost.id).commentCount, 1);
  const comments = await (await fetch(`${baseUrl}/api/posts/${createdPost.id}/comments`)).json();
  assert.equal(comments.length, 1);
  assert.equal(comments[0].id, comment.id);

  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  const restartedPosts = await (await fetch(`${baseUrl}/api/posts`)).json();
  const restartedPost = restartedPosts.find((post) => post.id === createdPost.id);
  assert.equal(restartedPost.commentCount, 1);
  assert.equal(restartedPost.author, 'Anonymous');
});
