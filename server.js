const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

// Serve static frontend
app.use(express.static(path.join(__dirname, 'public')));

// Simple password for your private world (change this!)
const WORLD_PASSWORD = 'love2026'; // <-- CHANGE THIS to something only you two know

const players = {};
const hearts = []; // shared collectible hearts
let heartIdCounter = 0;

// Spawn some hearts in the world
function spawnHearts() {
  hearts.length = 0;
  for (let i = 0; i < 12; i++) {
    hearts.push({
      id: heartIdCounter++,
      x: (Math.random() - 0.5) * 40,
      y: 1 + Math.random() * 2,
      z: (Math.random() - 0.5) * 40
    });
  }
}
spawnHearts();

io.on('connection', (socket) => {
  console.log('Someone connected:', socket.id);

  // Require password
  socket.on('join', (data) => {
    if (data.password !== WORLD_PASSWORD) {
      socket.emit('joinFailed', { message: 'Wrong password 💔' });
      return;
    }

    const name = (data.name || 'Player').slice(0, 20);
    const color = data.color || '#ff6b9d';

    players[socket.id] = {
      id: socket.id,
      name,
      color,
      x: (Math.random() - 0.5) * 6,
      y: 0,
      z: (Math.random() - 0.5) * 6,
      rotY: 0,
      emote: null,
      score: 0
    };

    // Send full state to the new player
    socket.emit('joined', {
      id: socket.id,
      players,
      hearts
    });

    // Tell everyone else
    socket.broadcast.emit('playerJoined', players[socket.id]);
    console.log(`${name} joined the world 💕`);
  });

  // Movement update
  socket.on('move', (data) => {
    const p = players[socket.id];
    if (!p) return;
    p.x = data.x;
    p.y = data.y;
    p.z = data.z;
    p.rotY = data.rotY;
    socket.broadcast.emit('playerMoved', {
      id: socket.id,
      x: p.x,
      y: p.y,
      z: p.z,
      rotY: p.rotY
    });
  });

  // Emote / action
  socket.on('emote', (emote) => {
    const p = players[socket.id];
    if (!p) return;
    p.emote = emote;
    io.emit('playerEmote', { id: socket.id, emote });
    // Clear emote after a few seconds
    setTimeout(() => {
      if (players[socket.id]) {
        players[socket.id].emote = null;
        io.emit('playerEmote', { id: socket.id, emote: null });
      }
    }, 3000);
  });

  // Collect a heart
  socket.on('collectHeart', (heartId) => {
    const idx = hearts.findIndex(h => h.id === heartId);
    if (idx === -1) return;

    hearts.splice(idx, 1);
    if (players[socket.id]) {
      players[socket.id].score = (players[socket.id].score || 0) + 1;
    }

    io.emit('heartCollected', {
      heartId,
      playerId: socket.id,
      score: players[socket.id]?.score || 0
    });

    // Respawn a new heart somewhere
    if (hearts.length < 8) {
      const newHeart = {
        id: heartIdCounter++,
        x: (Math.random() - 0.5) * 40,
        y: 1 + Math.random() * 2,
        z: (Math.random() - 0.5) * 40
      };
      hearts.push(newHeart);
      io.emit('heartSpawned', newHeart);
    }
  });

  // Chat message
  socket.on('chat', (msg) => {
    const p = players[socket.id];
    if (!p) return;
    const text = String(msg).slice(0, 120);
    io.emit('chat', { id: socket.id, name: p.name, text });
  });

  socket.on('disconnect', () => {
    const p = players[socket.id];
    if (p) {
      console.log(`${p.name} left the world`);
      delete players[socket.id];
      io.emit('playerLeft', socket.id);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n💕 Our Cute World is running!`);
  console.log(`   Local:   http://localhost:${PORT}`);
  console.log(`   Password: ${WORLD_PASSWORD}`);
  console.log(`   (Change the password in server.js)\n`);
});
