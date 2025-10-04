# YouTube Live Chat Viewer 🎥

A beautiful, real-time YouTube live chat viewer built with Hono and the youtubei.js library. Features special rendering for memberships and superchats, similar to Twitch/YouTube's native interface.

## Features

- 🔴 **Real-time chat streaming** using Server-Sent Events (SSE)
- 💰 **Super Chat highlighting** with custom colors and amounts
- ⭐ **Membership tracking** for new members and milestones
- 📊 **Live statistics** showing message, superchat, and membership counts
- 🎨 **Beautiful UI** with smooth animations and gradients
- 📱 **Responsive design** works on desktop and mobile

## Installation

```bash
# Install dependencies
bun install
```

## Usage

1. Start the development server:

```bash
bun run dev
```

2. Open your browser and navigate to `http://localhost:3000`

3. Enter a YouTube live stream URL or video ID in the input field

4. Click "Connect to Chat" to start viewing messages

## How It Works

- **Backend**: Hono server with SSE endpoint that connects to YouTube's Innertube API
- **Frontend**: Vanilla JavaScript with real-time updates via EventSource
- **Chat Types**:
  - Regular chat messages (left panel)
  - Super Chats & Super Stickers (top right panel)
  - Memberships & Milestones (bottom right panel)

## API Endpoints

- `GET /` - Main application interface
- `GET /api/chat/:videoId` - SSE endpoint for real-time chat streaming

## Technologies

- [Hono](https://hono.dev/) - Fast web framework
- [youtubei.js](https://github.com/LuanRT/YouTube.js) - YouTube Innertube API wrapper
- [Bun](https://bun.sh/) - JavaScript runtime and package manager

## Notes

- Only works with live streams that have live chat enabled
- Some streams may have restricted chat access
- The viewer automatically disconnects when the stream ends

## License

MIT

