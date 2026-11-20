import './style.css';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const openBtn = document.getElementById('open-post-btn');
const form = document.getElementById('post-form');
const input = document.getElementById('post-input');
const submitPostBtn = document.getElementById('submit-post-btn');
const feed = document.getElementById('feed');

// Modal elements
const modal = document.getElementById('post-modal');
const backdrop = document.getElementById('modal-backdrop');
const closeModalBtn = document.getElementById('close-modal-btn');
const modalPostBody = document.getElementById('modal-post-body');
const commentsHeading = document.getElementById('comments-heading');
const commentsList = document.getElementById('comments-list');
const commentForm = document.getElementById('comment-form');
const commentInput = document.getElementById('comment-input');
const submitCommentBtn = document.getElementById('submit-comment-btn');

let posts = [];
let activePostId = null;

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

openBtn.addEventListener('click', () => {
  form.classList.toggle('open');
  if (form.classList.contains('open')) {
    input.focus();
  }
});

async function loadPosts() {
  feed.innerHTML = '<p>Loading posts...</p>';

  const { data, error } = await supabase
    .from('posts')
    .select('id, content, created_at, comments(id, content, created_at)')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('Error loading posts:', error);
    feed.innerHTML = '<p>Could not load posts right now.</p>';
    return;
  }

  // Sort each post's comments oldest-to-newest for reading the thread
  posts = (data || []).map((post) => ({
    ...post,
    comments: (post.comments || []).sort(
      (a, b) => new Date(a.created_at) - new Date(b.created_at)
    )
  }));

  renderPosts();

  // Keep the open thread modal synced if a post is currently open
  if (activePostId) {
    const updatedPost = posts.find((p) => p.id === activePostId);
    if (updatedPost) renderModal(updatedPost);
  }
}

function renderPosts() {
  if (!posts.length) {
    feed.innerHTML = '<p>No posts yet. Be the first to post.</p>';
    return;
  }

  feed.innerHTML = posts
    .map((post) => {
      const time = new Date(post.created_at).toLocaleString();
      const count = post.comments.length;
      const commentLabel = count === 1 ? '1 comment' : `${count} comments`;

      return `
        <article class="post-card" data-post-id="${post.id}" role="button" tabindex="0">
          <div class="post-content">${escapeHTML(post.content)}</div>
          <div class="post-footer">
            <span class="post-time">${time}</span>
            <span class="comment-badge">💬 ${commentLabel}</span>
          </div>
        </article>
      `;
    })
    .join('');
}

function renderModal(post) {
  const time = new Date(post.created_at).toLocaleString();
  modalPostBody.innerHTML = `
    <div>${escapeHTML(post.content)}</div>
    <span class="modal-post-time">${time}</span>
  `;

  const count = post.comments.length;
  commentsHeading.textContent = `Comments (${count})`;

  if (count === 0) {
    commentsList.innerHTML = '<p class="empty-comments">No comments yet. Start the thread below.</p>';
    return;
  }

  commentsList.innerHTML = post.comments
    .map((comment) => {
      const commentTime = new Date(comment.created_at).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
      });
      return `
        <div class="comment-item">
          <div>${escapeHTML(comment.content)}</div>
          <span class="comment-time">${commentTime}</span>
        </div>
      `;
    })
    .join('');
}

function openPostModal(postId) {
  const post = posts.find((p) => p.id === postId);
  if (!post) return;

  activePostId = postId;
  renderModal(post);
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
}

function closePostModal() {
  activePostId = null;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
}

feed.addEventListener('click', (e) => {
  const card = e.target.closest('.post-card');
  if (!card) return;
  openPostModal(card.dataset.postId);
});

feed.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    const card = e.target.closest('.post-card');
    if (!card) return;
    e.preventDefault();
    openPostModal(card.dataset.postId);
  }
});

closeModalBtn.addEventListener('click', closePostModal);
backdrop.addEventListener('click', closePostModal);

// Create a new post in Supabase
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const content = input.value.trim();
  if (!content) return;

  submitPostBtn.disabled = true;
  const { error } = await supabase
    .from('posts')
    .insert([{ content }]);
  submitPostBtn.disabled = false;

  if (error) {
    console.error('Error creating post:', error);
    alert('Could not publish your post. Please try again.');
    return;
  }

  input.value = '';
  form.classList.remove('open');
  await loadPosts();
});

// Add a comment to the active post in Supabase
commentForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const content = commentInput.value.trim();
  if (!content || !activePostId) return;

  submitCommentBtn.disabled = true;
  const { error } = await supabase
    .from('comments')
    .insert([{ post_id: activePostId, content }]);
  submitCommentBtn.disabled = false;

  if (error) {
    console.error('Error posting comment:', error);
    alert('Could not post your comment. Please try again.');
    return;
  }

  commentInput.value = '';
  await loadPosts();
});

loadPosts();