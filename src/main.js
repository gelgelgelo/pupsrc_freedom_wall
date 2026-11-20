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
const sortTabs = document.querySelectorAll('.sort-tab');
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
let currentSort = 'latest';
let hasHandledInitialDeepLink = false;

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatDateTime(isoString) {
  return new Date(isoString).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getPostShareUrl(postId) {
  const url = new URL(window.location.href);
  url.searchParams.set('post', postId);
  return url.toString();
}

function setPostQueryParam(postId) {
  const url = new URL(window.location.href);
  if (postId) {
    url.searchParams.set('post', postId);
  } else {
    url.searchParams.delete('post');
  }
  window.history.replaceState({}, '', url.toString());
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  // Fallback for older browsers or non-secure contexts
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(textarea);
  if (!ok) {
    throw new Error('Clipboard copy failed');
  }
}

async function handleSharePost(postId, buttonEl) {
  const shareUrl = getPostShareUrl(postId);
  const originalLabel = buttonEl.textContent;

  try {
    await copyTextToClipboard(shareUrl);
    buttonEl.textContent = '✓ Copied!';
    buttonEl.classList.add('copied');
  } catch (err) {
    console.error('Failed to copy link:', err);
    window.prompt('Copy this post link:', shareUrl);
    return;
  }

  clearTimeout(buttonEl._copyTimer);
  buttonEl._copyTimer = setTimeout(() => {
    buttonEl.textContent = originalLabel;
    buttonEl.classList.remove('copied');
  }, 1800);
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

sortTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    const selectedSort = tab.dataset.sort;
    if (!selectedSort || selectedSort === currentSort) return;

    currentSort = selectedSort;
    sortTabs.forEach((btn) => {
      const isActive = btn.dataset.sort === currentSort;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', String(isActive));
    });

    renderPosts();
  });
});

commentInput.addEventListener('input', () => {
  commentInput.style.height = '36px';
  if (commentInput.scrollHeight > 36) {
    commentInput.style.height = `${Math.min(commentInput.scrollHeight, 76)}px`;
  }
});

async function openSharedPostFromUrl() {
  if (hasHandledInitialDeepLink) return;
  hasHandledInitialDeepLink = true;

  const params = new URLSearchParams(window.location.search);
  const sharedPostId = params.get('post');
  if (!sharedPostId) return;

  // Check loaded posts first
  const existing = posts.find((p) => p.id === sharedPostId);
  if (existing) {
    openPostModal(existing.id, { syncUrl: false });
    return;
  }

  // Fetch directly if older than the initial 50 posts
  const { data, error } = await supabase
    .from('posts')
    .select('id, content, created_at, comments(id, content, created_at)')
    .eq('id', sharedPostId)
    .single();

  if (error || !data) {
    console.warn('Shared post not found or unavailable:', error);
    return;
  }

  const normalizedPost = {
    ...data,
    comments: (data.comments || []).sort(
      (a, b) => new Date(a.created_at) - new Date(b.created_at)
    )
  };

  posts = [normalizedPost, ...posts];
  renderPosts();
  openPostModal(normalizedPost.id, { syncUrl: false });
}

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

  posts = (data || []).map((post) => ({
    ...post,
    comments: (post.comments || []).sort(
      (a, b) => new Date(a.created_at) - new Date(b.created_at)
    )
  }));

  renderPosts();
  await openSharedPostFromUrl();

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

  const sortedMatches = [...matches].sort((a, b) => {
    if (currentSort === 'popular') {
      const commentDiff = b.post.comments.length - a.post.comments.length;
      if (commentDiff !== 0) return commentDiff;
    }
    return new Date(b.post.created_at) - new Date(a.post.created_at);
  });

  feed.innerHTML = sortedMatches
    .map(({ post, matchedOnlyInComments, matchingCommentCount }) => {
      const time = formatDateTime(post.created_at);
      const count = post.comments.length;
      const commentLabel = count === 1 ? '1 comment' : `${count} comments`;
      const commentMatchNote = matchedOnlyInComments
        ? `<p class="comment-match-note">Matched in ${matchingCommentCount} ${matchingCommentCount === 1 ? 'comment' : 'comments'} — tap to view</p>`
        : '';

      return `<article class="post-card" data-post-id="${escapeHTML(post.id)}" role="button" tabindex="0"><div class="post-content">${escapeHTML(post.content)}</div>${commentMatchNote}<div class="post-footer"><span class="post-time">${time}</span><div class="post-actions"><button type="button" class="share-btn" data-share-id="${escapeHTML(post.id)}" aria-label="Copy link to post">🔗 Share</button><span class="comment-badge">💬 ${commentLabel}</span></div></div></article>`;
    })
    .join('');
}

function renderModal(post) {
  const time = formatDateTime(post.created_at);
  modalPostBody.innerHTML = `<div class="modal-post-text">${escapeHTML(post.content)}</div><span class="modal-post-time">${time}</span>`;

  const count = post.comments.length;
  commentsHeading.textContent = `Comments (${count})`;

  if (count === 0) {
    commentsList.innerHTML = '<p class="empty-comments">No comments yet. Start the thread below.</p>';
    return;
  }

  commentsList.innerHTML = post.comments
    .map((comment) => {
      const commentDateTime = formatDateTime(comment.created_at);
      return `<div class="comment-item"><div class="comment-text">${escapeHTML(comment.content)}</div><span class="comment-time">${commentDateTime}</span></div>`;
    })
    .join('');
}

function openPostModal(postId, { syncUrl = true } = {}) {
  const post = posts.find((p) => p.id === postId);
  if (!post) return;

  activePostId = postId;
  if (syncUrl) {
    setPostQueryParam(postId);
  }
  renderModal(post);
  modalScrollArea.scrollTop = 0;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
}

function closePostModal() {
  activePostId = null;
  setPostQueryParam(null);
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
}

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
  const shareBtn = e.target.closest('.share-btn');
  if (shareBtn) {
    e.stopPropagation();
    handleSharePost(shareBtn.dataset.shareId, shareBtn);
    return;
  }

  const card = e.target.closest('.post-card');
  if (!card) return;
  openPostModal(card.dataset.postId);
});

feed.addEventListener('keydown', (e) => {
  if (e.target.closest('.share-btn')) return;

  if (e.key === 'Enter' || e.key === ' ') {
    const card = e.target.closest('.post-card');
    if (!card) return;
    e.preventDefault();
    openPostModal(card.dataset.postId);
  }
});

closeModalBtn.addEventListener('click', closePostModal);
backdrop.addEventListener('click', closePostModal);

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
  commentInput.style.height = '36px';
  await loadPosts();

  modalScrollArea.scrollTo({
    top: modalScrollArea.scrollHeight,
    behavior: 'smooth'
  });
});

loadPosts();