const openBtn = document.getElementById('open-post-btn');
const form = document.getElementById('post-form');
const input = document.getElementById('post-input');
const feed = document.getElementById('feed');

let mockPosts = [
  {
    content: 'Good luck to everyone surviving finals week at PUPSRC!',
    created_at: new Date().toISOString()
  },
  {
    content: 'Drafting this front end first before wiring up Supabase.',
    created_at: new Date(Date.now() - 1000 * 60 * 25).toISOString()
  }
];

openBtn.addEventListener('click', () => {
  form.classList.toggle('open');
  if (form.classList.contains('open')) {
    input.focus();
  }
});

function renderPosts(posts) {
  if (!posts.length) {
    feed.innerHTML = '<p>No posts yet. Be the first to post.</p>';
    return;
  }

  feed.innerHTML = posts
    .map((post) => {
      const safeDiv = document.createElement('div');
      safeDiv.textContent = post.content;
      const time = new Date(post.created_at).toLocaleString();
      return `
        <article class="post-card">
          ${safeDiv.innerHTML}
          <span class="post-time">${time}</span>
        </article>
      `;
    })
    .join('');
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const content = input.value.trim();
  if (!content) return;

  mockPosts.unshift({
    content,
    created_at: new Date().toISOString()
  });

  input.value = '';
  form.classList.remove('open');
  renderPosts(mockPosts);
});

renderPosts(mockPosts);