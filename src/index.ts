import { Hono } from 'hono';
import { Innertube, Log } from 'youtubei.js';

// Suppress youtubei.js parser warnings
Log.setLevel(Log.Level.ERROR);

const app = new Hono();

// Static files are automatically served by Cloudflare Workers Assets
// No need for serveStatic middleware

// Serve the main HTML page
app.get('/', (c) => {
  return c.html(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>YouTube Chat Viewer</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <div class="container">
    <div class="input-section">
      <input 
        type="text" 
        id="videoUrl" 
        placeholder="Enter YouTube video/live stream URL or ID..."
        value=""
      />
      <button id="connectBtn">Connect to Chat</button>
    </div>

    <div class="stats">
      <div class="stat-item">
        <span class="stat-label">Messages:</span>
        <span id="messageCount">0</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">Superchats:</span>
        <span id="superchatCount">0</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">Members:</span>
        <span id="memberCount">0</span>
      </div>
    </div>

    <div class="chat-container">
      <div class="chat-section">
        <h2>💬 Chat Messages</h2>
        <div id="chatMessages" class="messages"></div>
      </div>
      
      <div class="special-section">
        <div class="superchat-section">
          <h2>💰 Super Chats</h2>
          <div id="superchats" class="messages"></div>
        </div>
        
        <div class="membership-section">
          <h2>⭐ Memberships & Milestones</h2>
          <div id="memberships" class="messages"></div>
        </div>
      </div>
    </div>
  </div>
  
  <script src="/app.js"></script>
</body>
</html>
  `);
});

// API endpoint to get chat messages
app.get('/api/chat/:videoId', async (c) => {
  const videoId = c.req.param('videoId');
  
  try {
    // Create custom fetch with proper 'this' binding for Cloudflare Workers
    const customFetch = (input: RequestInfo | URL, init?: RequestInit) => {
      return fetch(input, init);
    };
    
    const youtube = await Innertube.create({
      fetch: customFetch
    });
    const info = await youtube.getInfo(videoId);
    
    // console.log(`Video Info:`, {
    //   title: info.basic_info.title,
    //   is_live: info.is_live,
    //   is_upcoming: info.basic_info.is_upcoming,
    //   view_count: info.basic_info.view_count
    // });
    
    // Try to get live chat - works for both live and live replays
    let liveChat;
    try {
      liveChat = await info.getLiveChat();
      if (!liveChat) {
        throw new Error('Live chat not available');
      }
      // console.log('✓ Live chat obtained successfully');
    } catch (chatError: any) {
      // console.error('✗ Live chat error:', chatError.message);
      return c.json({ 
        error: 'Live chat is not available for this video. The stream may not have chat enabled, or it may be a regular video.',
        details: chatError.message 
      }, 400);
    }
    
    // Set up SSE headers
    c.header('Content-Type', 'text/event-stream');
    c.header('Cache-Control', 'no-cache');
    c.header('Connection', 'keep-alive');

    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        
        const sendEvent = (data: any) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          } catch (err) {
            // console.error('Error sending event:', err);
          }
        };

        // Send initial connection message
        sendEvent({ type: 'connected', videoId });
        // console.log('📡 SSE connection established, waiting for chat messages...');

        // Listen for start event
        liveChat.on('start', (initialData: any) => {
          // console.log('🎬 Live chat started!', {
          //   isReplay: liveChat.is_replay,
          //   hasActions: initialData?.actions?.length || 0
          // });
          sendEvent({ type: 'status', message: 'Chat listener started', isReplay: liveChat.is_replay });
        });

        liveChat.on('chat-update', (action: any) => {
          try {
            // console.log('📬 Chat update received:', action.type);
            
            if (action.type === 'AddChatItemAction') {
              const item = action.item;
              // console.log('💬 Item type:', item.type);
              
              // Log all available properties
              if (item.type === 'LiveChatTextMessage') {
                // Regular chat message
                // Debug badge structure
                // if (item.author.badges && item.author.badges.length > 0) {
                //   console.log('  🏷️ Badge structure:', JSON.stringify(item.author.badges[0], null, 2));
                // }
                
                const badges = item.author.badges?.map((b: any) => {
                  // Try multiple possible icon locations
                  const iconUrl = b.icon?.[0]?.url || 
                                 b.thumbnail?.url || 
                                 b.thumbnails?.[0]?.url ||
                                 b.image?.url ||
                                 b.image?.thumbnails?.[0]?.url ||
                                 null;
                  return {
                    label: b.label || b.tooltip || b.accessibility?.label || '',
                    icon: iconUrl
                  };
                }) || [];
                // console.log(`  → Message from ${item.author.name}: ${item.message.toString()}`, 
                //   badges.length > 0 ? `[Badges: ${badges.map((b: any) => b.label).join(', ')}]` : '');
                sendEvent({
                  type: 'message',
                  id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                  author: item.author.name,
                  message: item.message.toString(),
                  timestamp: item.timestamp,
                  badges,
                  authorPhoto: item.author.thumbnails?.[0]?.url || null
                });
              } else if (item.type === 'LiveChatPaidMessage') {
                // Super Chat
                // console.log(`  💰 SuperChat from ${item.author.name}: ${item.purchase_amount}`);
                sendEvent({
                  type: 'superchat',
                  id: `sc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                  author: item.author.name,
                  message: item.message?.toString() || '',
                  amount: item.purchase_amount,
                  timestamp: item.timestamp,
                  color: item.header_background_color,
                  authorPhoto: item.author.thumbnails?.[0]?.url || null
                });
              } else if (item.type === 'LiveChatPaidSticker') {
                // Super Sticker
                // console.log(`  🎨 SuperSticker from ${item.author.name}: ${item.purchase_amount}`);
                sendEvent({
                  type: 'superchat',
                  id: `ss-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                  author: item.author.name,
                  message: '[Super Sticker]',
                  amount: item.purchase_amount,
                  timestamp: item.timestamp,
                  color: item.background_color,
                  sticker: item.sticker?.thumbnails?.[0]?.url || null,
                  authorPhoto: item.author.thumbnails?.[0]?.url || null
                });
              } else if (item.type === 'LiveChatMembershipItem') {
                // New membership or milestone
                // Debug membership structure
                // console.log(`  ⭐ Membership structure:`, JSON.stringify({
                //   header_primary_text: item.header_primary_text,
                //   header_subtext: item.header_subtext,
                //   message: item.message
                // }, null, 2));
                
                const memberMessage = item.header_primary_text?.toString() || 
                                     item.header_subtext?.toString() ||
                                     item.message?.toString() ||
                                     'New member!';
                
                // console.log(`  ⭐ ${item.author.name}: ${memberMessage}`);
                sendEvent({
                  type: 'membership',
                  id: `mem-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                  author: item.author.name,
                  message: memberMessage,
                  timestamp: item.timestamp,
                  authorPhoto: item.author.thumbnails?.[0]?.url || null
                });
              } else if (item.type === 'LiveChatSponsorshipsGiftPurchaseAnnouncement') {
                // Membership gift
                const gifter = item.header?.author_name?.text || 'Someone';
                const giftMessage = item.header?.primary_text?.text || 'Gifted memberships!';
                const gifterPhoto = item.header?.author_photo?.[0]?.url || null;
                
                // console.log(`  🎁 ${gifter}: ${giftMessage}`);
                sendEvent({
                  type: 'membership',
                  id: `gift-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                  author: gifter,
                  message: giftMessage,
                  timestamp: item.timestamp,
                  authorPhoto: gifterPhoto
                });
              } else {
                // console.log(`  ❓ Unknown chat item type: ${item.type}`);
              }
            }
          } catch (err) {
            // console.error('Error processing chat action:', err);
          }
        });

        liveChat.on('error', (err: Error) => {
          // console.error('Live chat error:', err);
          sendEvent({ type: 'error', message: err.message });
        });

        liveChat.on('end', () => {
          // console.log('🛑 Chat stream ended');
          sendEvent({ type: 'end', message: 'Chat stream ended' });
          controller.close();
        });

        // Start listening
        // console.log('🚀 Starting live chat listener...');
        try {
          liveChat.start();
          // console.log('✅ Live chat listener started successfully');
        } catch (startError) {
          // console.error('❌ Failed to start chat listener:', startError);
          sendEvent({ type: 'error', message: 'Failed to start chat listener' });
        }

        // Keep connection alive
        const keepAlive = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(': keepalive\n\n'));
          } catch {
            clearInterval(keepAlive);
          }
        }, 30000);

        // Cleanup on close
        c.req.raw.signal.addEventListener('abort', () => {
          clearInterval(keepAlive);
          liveChat.stop();
          controller.close();
        });
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });

  } catch (error: any) {
    // console.error('Error:', error);
    return c.json({ error: error.message || 'Failed to connect to chat' }, 500);
  }
});

// Export for Cloudflare Workers
export default app;

