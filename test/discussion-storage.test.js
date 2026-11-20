const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'discussion-storage.js'), 'utf8');

function createDiscussionStorage() {
  const values = new Map();
  const localStorage = {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, value)
  };
  const window = {
    localStorage,
    crypto: { randomUUID: () => 'generated-id' }
  };
  vm.runInNewContext(source, { window, Date, Math, JSON, Error, SyntaxError });
  return { storage: window.discussionStorage, values };
}

test('browser discussion storage saves and reads posts and comments', () => {
  const { storage } = createDiscussionStorage();
  const post = { id: 'post-1', content: 'A favorite scene', author: 'Ari', createdAt: '2026-11-21T00:00:00.000Z' };
  const comment = { id: 'comment-1', postId: 'post-1', content: 'Same here', author: 'Bea', createdAt: '2026-11-21T00:01:00.000Z' };

  storage.writePosts([post]);
  storage.writeComments([comment]);

  assert.equal(JSON.stringify(storage.readPosts()), JSON.stringify([post]));
  assert.equal(JSON.stringify(storage.readComments()), JSON.stringify([comment]));
  assert.equal(storage.createId(), 'generated-id');
});

test('browser discussion storage reports corrupted saved data', () => {
  const { storage, values } = createDiscussionStorage();
  values.set('aftercredits.webdev2_blog_website.posts.v1', '{');

  assert.throws(() => storage.readPosts(), /could not be read/);
});

test('browser discussion storage rejects invalid collections', () => {
  const { storage, values } = createDiscussionStorage();
  values.set('aftercredits.webdev2_blog_website.comments.v1', JSON.stringify([{ id: 'missing-fields' }]));

  assert.throws(() => storage.readComments(), /are invalid/);
});
