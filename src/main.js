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

// Pinned announcement elements
const pinnedMessage = document.getElementById('pinned-message');
const pinnedTitle = document.getElementById('pinned-title');
const pinnedBody = document.getElementById('pinned-body');
const closePinnedBtn = document.getElementById('close-pinned-btn');

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
const replyBanner = document.getElementById('reply-banner');
const replyBannerPreview = document.getElementById('reply-banner-preview');
const cancelReplyBtn = document.getElementById('cancel-reply-btn');
const commentForm = document.getElementById('comment-form');
const commentInput = document.getElementById('comment-input');
const submitCommentBtn = document.getElementById('submit-comment-btn');

let posts = [];
let activePostId = null;
let replyingToComment = null;
let searchQuery = '';
let currentSort = 'latest';
let hasHandledInitialDeepLink = false;

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function stripLegacyQuote(text) {
  const raw = String(text || '');
  const match = raw.match(/^> [^\n]+\n([\s\S]*)$/);
  return match ? match[1] : raw;
}

function truncateSnippet(text, maxLen = 65) {
  const clean = stripLegacyQuote(text).replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, maxLen - 1)}…`;
}

function getLatestCommentTimestamp(post) {
  const comments = post.comments || [];
  if (!comments.length) return null;
  let latest = null;
  for (const comment of comments) {
    const ts = new Date(comment.created_at).getTime();
    if (!Number.isNaN(ts) && (latest === null || ts > latest)) {
      latest = ts;
    }
  }
  return latest;
}

function setReplyTarget(comment) {
  replyingToComment = comment;
  replyBannerPreview.textContent = `"${truncateSnippet(comment.content)}"`;
  replyBanner.hidden = false;
  commentInput.placeholder = 'Write your reply...';
  commentInput.focus();
}

function clearReplyTarget() {
  replyingToComment = null;
  replyBanner.hidden = true;
  replyBannerPreview.textContent = '';
  commentInput.placeholder = 'Write a comment...';
}

function formatCommentContentHTML(content) {
  const raw = String(content || '');
  const match = raw.match(/^> ([^\n]+)\n([\s\S]*)$/);
  if (!match) {
    return `<div class="comment-text">${escapeHTML(raw)}</div>`;
  }

  const [, quotedLine, replyBody] = match;
  return `
    <div class="comment-quote">${escapeHTML(quotedLine)}</div>
    <div class="comment-text">${escapeHTML(replyBody)}</div>
  `;
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

  if (navigator.share) {
    try {
      await navigator.share({
        title: document.title,
        url: shareUrl
      });
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') {
        return;
      }
    }
  }

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

closePinnedBtn.addEventListener('click', () => {
  pinnedMessage.hidden = true;
});

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

cancelReplyBtn.addEventListener('click', () => {
  clearReplyTarget();
  commentInput.focus();
});

commentsList.addEventListener('click', (e) => {
  const replyBtn = e.target.closest('.comment-reply-btn');
  if (!replyBtn || !activePostId) return;

  const post = posts.find((p) => p.id === activePostId);
  const targetComment = post?.comments.find((c) => c.id === replyBtn.dataset.replyId);
  if (targetComment) {
    setReplyTarget(targetComment);
  }
});

async function loadAnnouncement() {
  const { data, error } = await supabase
    .from('announcements')
    .select('id, title, body, created_at')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Error loading announcement:', error);
    pinnedMessage.hidden = true;
    return;
  }

  if (!data) {
    pinnedMessage.hidden = true;
    return;
  }

  pinnedTitle.textContent = data.title ?? '';
  pinnedBody.textContent = data.body ?? '';
  pinnedMessage.hidden = false;
}

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
    .select('id, content, created_at, comments(id, parent_id, content, created_at)')
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
    .select('id, content, created_at, comments(id, parent_id, content, created_at)')
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
    } else if (currentSort === 'recent') {
      const aLatest = getLatestCommentTimestamp(a.post);
      const bLatest = getLatestCommentTimestamp(b.post);

      if (aLatest !== null && bLatest !== null && bLatest !== aLatest) {
        return bLatest - aLatest;
      }
      if (aLatest !== null && bLatest === null) return -1;
      if (aLatest === null && bLatest !== null) return 1;
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

function buildCommentThreads(comments) {
  const byId = new Map(comments.map((c) => [c.id, c]));
  const roots = [];
  const repliesByRootId = new Map();

  for (const comment of comments) {
    if (!comment.parent_id || !byId.has(comment.parent_id)) {
      roots.push(comment);
      repliesByRootId.set(comment.id, []);
    }
  }

  for (const comment of comments) {
    if (!comment.parent_id || !byId.has(comment.parent_id)) continue;

    // Walk up to the top-level root so mobile indentation stays max 2 levels deep
    let cursor = byId.get(comment.parent_id);
    const seen = new Set([comment.id]);
    while (cursor && cursor.parent_id && byId.has(cursor.parent_id) && !seen.has(cursor.id)) {
      seen.add(cursor.id);
      cursor = byId.get(cursor.parent_id);
    }

    const rootId = cursor ? cursor.id : comment.parent_id;
    if (!repliesByRootId.has(rootId)) {
      repliesByRootId.set(rootId, []);
    }

    const directParent = byId.get(comment.parent_id);
    repliesByRootId.get(rootId).push({
      comment,
      // Show a compact "↳ replying to ..." tag when replying to another nested reply
      directParent: directParent && directParent.id !== rootId ? directParent : null
    });
  }

  return roots.map((root) => ({
    root,
    replies: repliesByRootId.get(root.id) || []
  }));
}

function renderCommentCardHTML(comment, { isReply = false, directParent = null } = {}) {
  const commentDateTime = formatDateTime(comment.created_at);
  const replyingTag = directParent
    ? `<div class="comment-replying-tag">↳ Replying to "${escapeHTML(truncateSnippet(directParent.content, 48))}"</div>`
    : '';

  return `
    <div class="comment-item${isReply ? ' is-reply' : ''}" data-comment-id="${escapeHTML(comment.id)}">
      ${replyingTag}
      ${formatCommentContentHTML(comment.content)}
      <div class="comment-meta">
        <span class="comment-time">${commentDateTime}</span>
        <button type="button" class="comment-reply-btn" data-reply-id="${escapeHTML(comment.id)}">↩ Reply</button>
      </div>
    </div>
  `;
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

  const threads = buildCommentThreads(post.comments);

  commentsList.innerHTML = threads
    .map(({ root, replies }) => {
      const rootHTML = renderCommentCardHTML(root);
      if (!replies.length) {
        return `<div class="comment-thread">${rootHTML}</div>`;
      }

      const repliesHTML = replies
        .map(({ comment, directParent }) =>
          renderCommentCardHTML(comment, { isReply: true, directParent })
        )
        .join('');

      return `
        <div class="comment-thread">
          ${rootHTML}
          <div class="comment-replies">${repliesHTML}</div>
        </div>
      `;
    })
    .join('');
}

function openPostModal(postId, { syncUrl = true } = {}) {
  const post = posts.find((p) => p.id === postId);
  if (!post) return;

  activePostId = postId;
  clearReplyTarget();
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
  clearReplyTarget();
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
  const content = commentInput.value.trim().slice(0, 300);
  if (!content || !activePostId) return;

  const targetCommentId = replyingToComment ? replyingToComment.id : null;

  submitCommentBtn.disabled = true;
  const { error } = await supabase
    .from('comments')
    .insert([{ post_id: activePostId, parent_id: targetCommentId, content }]);
  submitCommentBtn.disabled = false;

  if (error) {
    console.error('Error posting comment:', error);
    alert('Could not post your comment. Please try again.');
    return;
  }

  commentInput.value = '';
  commentInput.style.height = '36px';
  clearReplyTarget();
  await loadPosts();

  if (targetCommentId) {
    const targetEl = commentsList.querySelector(`[data-comment-id="${CSS.escape(targetCommentId)}"]`);
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
  }

  modalScrollArea.scrollTo({
    top: modalScrollArea.scrollHeight,
    behavior: 'smooth'
  });
});

loadAnnouncement();
loadPosts();