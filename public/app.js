let eventSource = null;
let messageCount = 0;
let superchatCount = 0;
let memberCount = 0;
let lastActiveId = null;
let autoHideTimer = null;
let sessionID = "";
let videoID = "";

// Configuration (can be expanded to settings UI)
let config = {
  highlightWords: ['q', 'question'], // words to highlight in yellow
  showOnlyFirstName: false,
  autoHideSeconds: 0, // 0 means no auto-hide
  remoteWindowURL: "https://chat.aaronpk.tv/overlay/",
  remoteServerURL: "https://chat.aaronpk.tv/overlay/pub",
  version: "1.0.0"
};

const chatMessages = document.getElementById('chatMessages');
const superchats = document.getElementById('superchats');
const memberships = document.getElementById('memberships');
const videoUrlInput = document.getElementById('videoUrl');
const connectBtn = document.getElementById('connectBtn');
const inputSection = document.querySelector('.input-section');

const messageCountEl = document.getElementById('messageCount');
const superchatCountEl = document.getElementById('superchatCount');
const memberCountEl = document.getElementById('memberCount');

// Extract video ID from URL or use as-is if it's already an ID
function extractVideoId(input) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/
  ];
  
  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match) return match[1];
  }
  
  return input;
}

// Check if message contains highlight words
function shouldHighlight(message) {
  if (!config.highlightWords || config.highlightWords.length === 0) return false;
  
  const words = message.toLowerCase().split(/\s+/);
  const cleanWords = words.map(w => w.replace(/[^a-z0-9]/gi, ''));
  
  return cleanWords.some(word => config.highlightWords.includes(word));
}

// Create message element
function createMessageElement(data) {
  const messageDiv = document.createElement('div');
  messageDiv.className = 'message';
  messageDiv.setAttribute('data-message-id', data.id || `msg-${Date.now()}-${Math.random()}`);
  messageDiv.setAttribute('data-type', 'message');
  
  // Store full data for overlay
  messageDiv.dataset.fullData = JSON.stringify(data);
  
  // Check for highlight words
  if (shouldHighlight(data.message)) {
    messageDiv.classList.add('highlighted-message');
  }
  
  let avatarHtml = '';
  if (data.authorPhoto) {
    avatarHtml = `<img src="${data.authorPhoto}" class="message-avatar" alt="${data.author}">`;
  } else {
    avatarHtml = '<div class="message-avatar"></div>';
  }
  
  let badgesHtml = '';
  if (data.badges && data.badges.length > 0) {
    badgesHtml = data.badges
      .filter(b => b.label)
      .map(b => {
        const isMembership = b.label && (b.label.includes('Member') || b.label.includes('month') || b.label.includes('year'));
        if (isMembership) {
          if (b.icon) {
            return `<span class="badge-wrapper"><img src="${b.icon}" class="badge" title="${b.label}" alt="${b.label}"><span class="badge-label">${b.label}</span></span>`;
          } else {
            return `<span class="badge-wrapper badge-no-icon"><span class="badge-label">${b.label}</span></span>`;
          }
        }
        if (b.icon) {
          return `<img src="${b.icon}" class="badge" title="${b.label}" alt="${b.label}">`;
        } else if (b.label) {
          return `<span class="badge-text" title="${b.label}">${b.label}</span>`;
        }
        return '';
      })
      .join('');
  }
  
  messageDiv.innerHTML = `
    ${avatarHtml}
    <div class="message-content">
      <span class="timestamp">${formatTimestamp(data.timestamp)}</span>
      ${badgesHtml}
      <span class="author">${escapeHtml(data.author)}:</span>
      <span class="message-text">${escapeHtml(data.message)}</span>
    </div>
  `;
  
  // Make clickable
  messageDiv.style.cursor = 'pointer';
  messageDiv.addEventListener('click', () => showInOverlay(data, 'message'));
  
  return messageDiv;
}

// Create superchat element
function createSuperchatElement(data) {
  const superchatDiv = document.createElement('div');
  superchatDiv.className = 'superchat';
  superchatDiv.setAttribute('data-message-id', data.id || `sc-${Date.now()}-${Math.random()}`);
  superchatDiv.setAttribute('data-type', 'superchat');
  superchatDiv.dataset.fullData = JSON.stringify(data);
  
  // Use color from YouTube or default gradient
  const color = data.color ? `#${data.color.toString(16).padStart(6, '0')}` : '#1e88e5';
  superchatDiv.style.background = `linear-gradient(135deg, ${color} 0%, ${adjustColor(color, -20)} 100%)`;
  
  let avatarHtml = '';
  if (data.authorPhoto) {
    avatarHtml = `<img src="${data.authorPhoto}" class="message-avatar" alt="${data.author}">`;
  } else {
    avatarHtml = '<div class="message-avatar"></div>';
  }
  
  let contentHtml = '';
  if (data.sticker) {
    contentHtml = `<img src="${data.sticker}" class="sticker" alt="Super Sticker">`;
  } else if (data.message) {
    contentHtml = `<div class="message-text">${escapeHtml(data.message)}</div>`;
  }
  
  superchatDiv.innerHTML = `
    ${avatarHtml}
    <div class="superchat-content">
      <div class="message-header">
        <span class="author">${escapeHtml(data.author)}</span>
        <span class="superchat-amount">${escapeHtml(data.amount)}</span>
      </div>
      ${contentHtml}
    </div>
  `;
  
  // Make clickable
  superchatDiv.style.cursor = 'pointer';
  superchatDiv.addEventListener('click', () => showInOverlay(data, 'superchat'));
  
  return superchatDiv;
}

// Create membership element
function createMembershipElement(data) {
  const membershipDiv = document.createElement('div');
  membershipDiv.className = 'membership';
  membershipDiv.setAttribute('data-message-id', data.id || `mem-${Date.now()}-${Math.random()}`);
  membershipDiv.setAttribute('data-type', 'membership');
  membershipDiv.dataset.fullData = JSON.stringify(data);
  
  let avatarHtml = '';
  if (data.authorPhoto) {
    avatarHtml = `<img src="${data.authorPhoto}" class="message-avatar" alt="${data.author}">`;
  } else {
    avatarHtml = '<div class="message-avatar"></div>';
  }
  
  membershipDiv.innerHTML = `
    ${avatarHtml}
    <div class="membership-content">
      <div class="message-header">
        <span class="author">${escapeHtml(data.author)}</span>
        <span class="timestamp">${formatTimestamp(data.timestamp)}</span>
      </div>
      <div class="message-text">${escapeHtml(data.message)}</div>
    </div>
  `;
  
  // Make clickable
  membershipDiv.style.cursor = 'pointer';
  membershipDiv.addEventListener('click', () => showInOverlay(data, 'membership'));
  
  return membershipDiv;
}

// Helper functions
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatTimestamp(timestamp) {
  if (!timestamp) return '';
  // YouTube timestamps are in microseconds, convert to milliseconds
  const date = new Date(timestamp / 1000);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

function adjustColor(color, amount) {
  // Simple color adjustment for gradient
  const num = parseInt(color.replace('#', ''), 16);
  const r = Math.max(0, Math.min(255, (num >> 16) + amount));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0x00FF) + amount));
  const b = Math.max(0, Math.min(255, (num & 0x0000FF) + amount));
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

function appendMessage(container, element, maxMessages = 100) {
  // Add new message to the end (bottom)
  container.appendChild(element);
  
  // Remove old messages from the top
  while (container.children.length > maxMessages) {
    container.removeChild(container.firstChild);
  }
  
  // Always scroll to bottom (like Twitch)
  requestAnimationFrame(() => {
    container.scrollTop = container.scrollHeight;
  });
}

function updateStats() {
  messageCountEl.textContent = messageCount;
  superchatCountEl.textContent = superchatCount;
  memberCountEl.textContent = memberCount;
}

function clearChat() {
  chatMessages.innerHTML = '';
  superchats.innerHTML = '';
  memberships.innerHTML = '';
  messageCount = 0;
  superchatCount = 0;
  memberCount = 0;
  updateStats();
}

function scrollToBottom(container) {
  container.scrollTop = container.scrollHeight;
}

// Setup overlay URL display
function showOverlayURL() {
  // Generate session ID if not exists
  if (!sessionID) {
    sessionID = generateSessionID();
  }
  
  const overlayURL = config.remoteWindowURL + "#" + sessionID;
  
  // Create overlay URL display if it doesn't exist
  let urlDisplay = document.getElementById('overlay-url-display');
  if (!urlDisplay) {
    urlDisplay = document.createElement('div');
    urlDisplay.id = 'overlay-url-display';
    urlDisplay.className = 'overlay-url-display';
    urlDisplay.innerHTML = `
      <div class="overlay-url-content">
        <strong>🎬 Overlay URL (for OBS/Streamlabs):</strong>
        <input type="text" id="overlay-url-input" value="${overlayURL}" readonly>
        <button id="copy-overlay-url" class="copy-btn">Copy URL</button>
        <a href="${overlayURL}" target="_blank" class="open-overlay-btn">Open Overlay</a>
      </div>
    `;
    document.querySelector('.stats').after(urlDisplay);
    
    // Copy URL button
    document.getElementById('copy-overlay-url').addEventListener('click', () => {
      const input = document.getElementById('overlay-url-input');
      input.select();
      document.execCommand('copy');
      document.getElementById('copy-overlay-url').textContent = '✓ Copied!';
      setTimeout(() => {
        // Hide the overlay URL section after copying
        urlDisplay.style.opacity = '0';
        urlDisplay.style.transform = 'translateY(-10px)';
        setTimeout(() => {
          urlDisplay.style.display = 'none';
        }, 300);
      }, 1000);
    });
    
    // Open Overlay button - also hide after clicking
    document.querySelector('.open-overlay-btn').addEventListener('click', () => {
      setTimeout(() => {
        urlDisplay.style.opacity = '0';
        urlDisplay.style.transform = 'translateY(-10px)';
        setTimeout(() => {
          urlDisplay.style.display = 'none';
        }, 300);
      }, 500);
    });
  }
}

// Connect to chat
function connectToChat() {
  const input = videoUrlInput.value.trim();
  if (!input) {
    alert('Please enter a YouTube video URL or ID');
    return;
  }
  
  const videoId = extractVideoId(input);
  videoID = videoId; // Store for remote server
  
  if (eventSource) {
    eventSource.close();
  }
  
  clearChat();
  connectBtn.textContent = 'Connecting...';
  connectBtn.disabled = true;
  
  // Show overlay URL
  showOverlayURL();
  
  eventSource = new EventSource(`/api/chat/${videoId}`);
  
  eventSource.onopen = () => {
    console.log('Connected to chat stream');
    connectBtn.textContent = '✓ Connected';
    setTimeout(() => {
      connectBtn.textContent = 'Disconnect';
      connectBtn.disabled = false;
      // Hide input section after connection
      inputSection.classList.add('hidden');
    }, 1000);
  };
  
  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case 'connected':
          console.log('Chat connected for video:', data.videoId);
          // Scroll all containers to bottom on connect
          scrollToBottom(chatMessages);
          scrollToBottom(superchats);
          scrollToBottom(memberships);
          break;
          
        case 'message':
          messageCount++;
          const messageEl = createMessageElement(data);
          appendMessage(chatMessages, messageEl);
          updateStats();
          break;
          
        case 'superchat':
          superchatCount++;
          const superchatEl = createSuperchatElement(data);
          appendMessage(superchats, superchatEl, 50);
          updateStats();
          break;
          
        case 'membership':
          memberCount++;
          const membershipEl = createMembershipElement(data);
          appendMessage(memberships, membershipEl, 50);
          updateStats();
          break;
          
        case 'error':
          console.error('Chat error:', data.message);
          alert(`Error: ${data.message}`);
          break;
          
        case 'end':
          console.log('Chat ended');
          eventSource.close();
          connectBtn.textContent = 'Connect to Chat';
          connectBtn.disabled = false;
          inputSection.classList.remove('hidden');
          break;
      }
    } catch (err) {
      console.error('Error parsing message:', err);
    }
  };
  
  eventSource.onerror = (error) => {
    console.error('EventSource error:', error);
    connectBtn.textContent = 'Connect to Chat';
    connectBtn.disabled = false;
    inputSection.classList.remove('hidden');
    
    if (eventSource.readyState === EventSource.CLOSED) {
      alert('Connection to chat failed. Please check the video ID and try again.');
    }
  };
}

// Event listeners
connectBtn.addEventListener('click', () => {
  if (connectBtn.textContent === 'Disconnect') {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    connectBtn.textContent = 'Connect to Chat';
    // Show input section again
    inputSection.classList.remove('hidden');
  } else {
    connectToChat();
  }
});

videoUrlInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    connectToChat();
  }
});

// Generate session ID (same as live-chat-overlay)
function generateSessionID() {
  var text = "";
  var chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  for (var i = 0; i < 10; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}

// Show message in overlay using remote server (like live-chat-overlay)
function showInOverlay(data, type) {
  clearTimeout(autoHideTimer);
  
  const messageId = data.id || `${type}-${Date.now()}`;
  
  // If clicking the same message, hide it
  if (lastActiveId === messageId) {
    hideOverlay();
    return;
  }
  
  lastActiveId = messageId;
  
  // Remove active class from all messages
  document.querySelectorAll('.message.active-message, .superchat.active-message, .membership.active-message').forEach(el => {
    el.classList.remove('active-message');
  });
  
  // Add active class to clicked message
  const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
  if (messageElement) {
    messageElement.classList.add('active-message');
    messageElement.classList.add('shown-message');
  }
  
  // Prepare author name
  let authorName = data.author;
  if (config.showOnlyFirstName) {
    authorName = authorName.split(' ')[0];
  }
  
  // Get high-res avatar (replace s32/s64 with s128)
  let avatarUrl = data.authorPhoto || '';
  if (avatarUrl) {
    const equalIndex = avatarUrl.indexOf('=');
    if (equalIndex !== -1) {
      let part1 = avatarUrl.slice(0, equalIndex);
      let part2 = avatarUrl.slice(equalIndex);
      part2 = part2.replace('s32', 's128').replace('s64', 's128');
      avatarUrl = part1 + part2;
    }
  }
  
  // Build badges HTML
  let badgesHtml = '';
  if (data.badges && data.badges.length > 0) {
    badgesHtml = data.badges
      .filter(b => b.icon)
      .map(b => `<img src="${b.icon}" class="hl-badge" title="${b.label}" alt="${b.label}">`)
      .join('');
  }
  
  // Build content based on type
  let messageContent = escapeHtml(data.message || '');
  let donationHtml = '';
  let membershipHtml = '';
  let backgroundColor = '';
  let textColor = '';
  
  if (type === 'superchat') {
    donationHtml = `<div class="donation">${escapeHtml(data.amount)}</div>`;
    if (data.color) {
      const color = `#${data.color.toString(16).padStart(6, '0')}`;
      backgroundColor = `background-color: ${color};`;
      textColor = 'color: #fff;';
    }
    
    if (data.sticker) {
      messageContent = `<img class="sticker" src="${data.sticker}" alt="Super Sticker">`;
    }
  } else if (type === 'membership') {
    membershipHtml = '<div class="donation membership">NEW<br>MEMBER!</div>';
  }
  
  // Build HTML for remote server
  const html = `<div class="hl-c-cont fadeout">
    <div class="hl-name">${escapeHtml(authorName)}
      <div class="hl-badges">${badgesHtml}</div>
    </div>
    <div class="hl-message" style="${backgroundColor} ${textColor}">${messageContent}</div>
    <div class="hl-img"><img src="${avatarUrl}"></div>
    ${donationHtml}${membershipHtml}
  </div>`;
  
  // If using remote server (sessionID exists)
  if (sessionID) {
    // Send to remote server like live-chat-overlay does
    const remote = {
      version: config.version,
      command: "show",
      html: html,
      config: config,
      v: videoID
    };
    
    // Don't set Content-Type header to avoid CORS preflight
    fetch(config.remoteServerURL + "?v=" + videoID + "&id=" + sessionID, {
      method: 'POST',
      body: JSON.stringify(remote)
    }).catch(err => console.error('Failed to send to remote:', err));
  } else {
    // Local overlay fallback
    let overlay = document.getElementById('highlight-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'highlight-overlay';
      document.body.appendChild(overlay);
    }
    
    overlay.innerHTML = html;
    
    // Trigger animation
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const container = overlay.querySelector('.hl-c-cont');
        if (container) {
          container.classList.remove('fadeout');
        }
      });
    });
  }
  
  // Auto-hide if configured
  if (config.autoHideSeconds > 0) {
    autoHideTimer = setTimeout(() => {
      hideOverlay();
    }, config.autoHideSeconds * 1000);
  }
}

// Hide overlay
function hideOverlay() {
  if (sessionID) {
    // Send hide command to remote server
    const remote = {
      version: config.version,
      command: "hide",
      config: config,
      v: videoID
    };
    
    // Don't set Content-Type header to avoid CORS preflight
    fetch(config.remoteServerURL + "?v=" + videoID + "&id=" + sessionID, {
      method: 'POST',
      body: JSON.stringify(remote)
    }).catch(err => console.error('Failed to send to remote:', err));
  } else {
    // Local overlay
    const overlay = document.getElementById('highlight-overlay');
    if (!overlay) return;
    
    const container = overlay.querySelector('.hl-c-cont');
    if (container) {
      container.classList.add('fadeout');
      setTimeout(() => {
        overlay.innerHTML = '';
      }, 300);
    }
  }
  
  lastActiveId = null;
  
  // Remove active class from all messages
  document.querySelectorAll('.message.active-message, .superchat.active-message, .membership.active-message').forEach(el => {
    el.classList.remove('active-message');
  });
}

// Clear overlay button
function createClearButton() {
  const clearBtn = document.createElement('button');
  clearBtn.className = 'btn-clear-overlay';
  clearBtn.textContent = 'CLEAR';
  clearBtn.addEventListener('click', hideOverlay);
  document.body.appendChild(clearBtn);
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  // Escape key hides overlay
  if (e.key === 'Escape') {
    hideOverlay();
  }
});

// Create clear button on load
window.addEventListener('DOMContentLoaded', () => {
  createClearButton();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (eventSource) {
    eventSource.close();
  }
});

