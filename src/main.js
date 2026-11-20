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
const searchInput = document.getElementById('search-input');
const clearSearchBtn = document.getElementById('clear-search-btn');
const feed = document.getElementById('feed');

// Modal elements
const modal = document.getElementById('post-modal');
const modalSheet = modal.querySelector('.modal-sheet');
const modalDragBar = document.getElementById('modal-drag-bar');
const modalScrollArea = document.getElementById('modal-scroll-area');
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
let searchQuery = '';

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

searchInput.addEventListener('input', (e) => {
  searchQuery = e.target.value;
  clearSearchBtn.hidden = searchQuery.length === 0;
  renderPosts();
});

clearSearchBtn.addEventListener('click', () => {
  searchQuery = '';
  searchInput.value = '';
  clearSearchBtn.hidden = true;
  searchInput.focus();
  renderPosts();
});

// Auto-resize comment textarea up to max-height
commentInput.addEventListener('input', () => {
  commentInput.style.height = 'auto';
  commentInput.style.height = `${Math.min(commentInput.scrollHeight, 120)}px`;
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
    feed.innerHTML = '<p class="empty-state">No posts yet. Be the first to post.</p>';
    return;
  }

  const query = searchQuery.trim().toLowerCase();

  const matches = query
    ? posts
        .map((post) => {
          const postMatches = post.content.toLowerCase().includes(query);
          const matchingComments = (post.comments || []).filter((comment) =>
            comment.content.toLowerCase().includes(query)
          );

          if (!postMatches && matchingComments.length === 0) {
            return null;
          }

          return {
            post,
            matchedOnlyInComments: !postMatches && matchingComments.length > 0,
            matchingCommentCount: matchingComments.length
          };
        })
        .filter(Boolean)
    : posts.map((post) => ({
        post,
        matchedOnlyInComments: false,
        matchingCommentCount: 0
      }));

  if (!matches.length) {
    feed.innerHTML = `<p class="empty-state">No posts or comments matching "${escapeHTML(searchQuery.trim())}".</p>`;
    return;
  }

  feed.innerHTML = matches
    .map(({ post, matchedOnlyInComments, matchingCommentCount }) => {
      const time = new Date(post.created_at).toLocaleString();
      const count = post.comments.length;
      const commentLabel = count === 1 ? '1 comment' : `${count} comments`;
      const commentMatchNote = matchedOnlyInComments
        ? `<p class="comment-match-note">Matched in ${matchingCommentCount} ${matchingCommentCount === 1 ? 'comment' : 'comments'} — tap to view</p>`
        : '';

      return `
        <article class="post-card" data-post-id="${post.id}" role="button" tabindex="0">
          <div class="post-content">${escapeHTML(post.content)}</div>
          ${commentMatchNote}
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
  modalScrollArea.scrollTop = 0;
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

// Swipe down on drag bar to dismiss sheet
let startY = 0;
let currentDeltaY = 0;

modalDragBar.addEventListener('touchstart', (e) => {
  startY = e.touches[0].clientY;
  modalSheet.style.transition = 'none';
}, { passive: true });

modalDragBar.addEventListener('touchmove', (e) => {
  currentDeltaY = Math.max(0, e.touches[0].clientY - startY);
  modalSheet.style.transform = `translateY(${currentDeltaY}px)`;
}, { passive: true });

modalDragBar.addEventListener('touchend', () => {
  modalSheet.style.transition = '';
  modalSheet.style.transform = '';
  if (currentDeltaY > 90) {
    closePostModal();
  }
  currentDeltaY = 0;
});

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
  commentInput.style.height = 'auto';
  await loadPosts();

  modalScrollArea.scrollTo({
    top: modalScrollArea.scrollHeight,
    behavior: 'smooth'
  });
});

loadPosts();