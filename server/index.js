// server/server.js
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const path = require('path'); // <-- Add path module

const app = express();
app.use(cors()); // Allow CORS for Socket.IO and potentially API routes if added later

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*", // Adjust for production if needed
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3001;

// --- Serve Static Files (React Build) ---
// Assuming your client build output is in '../client/dist' relative to server.js
// Adjust the path if your project structure is different.
app.use(express.static(path.join(__dirname, '../client/dist')));
// --- End Serve Static Files ---


// --- Game State ---
let players = {};
let waitingPlayers = [];
let gameRooms = {};
let roomCounter = 0;
const MAX_PLAYERS_PER_ROOM = 4;
const TOTAL_ROUNDS = 4;
const ROLES = ['King', 'Minister', 'Thief', 'Police'];
// --- End Game State ---

// Function to shuffle an array (unchanged)
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// Function to start a game (mostly unchanged, added some console logs for clarity)
function startGame(playerIds) {
    const roomId = `room-${roomCounter++}`;
    console.log(`[Game Start] Attempting to start game in room ${roomId} with players:`, playerIds);
    const initialPlayerIds = [...playerIds];
    let validPlayerIds = [];

    const newRoom = { id: roomId, playerIds: [], roles: {}, king: null, minister: null, thief: null, police: null, round: 1, state: 'assigning', scores: {}, roundInfo: {} };

    initialPlayerIds.forEach(playerId => {
        const socket = io.sockets.sockets.get(playerId);
        if (socket) {
            console.log(`[Game Start] ---> Joining socket ${playerId} to room ${roomId}`);
            socket.join(roomId);
            validPlayerIds.push(playerId);
        } else {
            console.error(`[Game Start] !!! Cannot find socket instance for player ${playerId}. Player excluded.`);
        }
    });

    if (validPlayerIds.length < MAX_PLAYERS_PER_ROOM) {
        console.error(`[Game Start] Room ${roomId}: Not enough valid sockets (${validPlayerIds.length}). Aborting game start.`);
        validPlayerIds.forEach(pid => {
            const sock = io.sockets.sockets.get(pid);
            sock?.emit('game_interrupted', { message: `Error starting game (player issue). Returning to wait list.` });
            sock?.leave(roomId);
            // Put player back in waiting list? Or just let them rejoin from home? Let's have them rejoin.
            // if (!waitingPlayers.includes(pid)) { waitingPlayers.push(pid); } // Let's NOT automatically put back
        });
        // Clean up potentially excluded players from waiting list if they were there
        initialPlayerIds.forEach(pid => {
             const waitingIndex = waitingPlayers.indexOf(pid);
             if (waitingIndex > -1) {
                 waitingPlayers.splice(waitingIndex, 1);
                 console.log(`[Game Start Abort] Removed ${pid} from waiting list.`);
             }
        });
        console.log("[Game Start Abort] Updated waiting players:", waitingPlayers);
        return;
    }

    newRoom.playerIds = validPlayerIds;
    gameRooms[roomId] = newRoom;

    const rolesToAssign = [...ROLES];
    const shuffledRoles = shuffleArray(rolesToAssign);

    validPlayerIds.forEach((playerId, index) => {
        const role = shuffledRoles[index];
        newRoom.roles[playerId] = role;
        if(players[playerId]) {
            players[playerId].role = role;
            players[playerId].roomId = roomId;
            players[playerId].score = 0;
            if (role === 'King') { newRoom.king = playerId; players[playerId].score = 1000; }
            else if (role === 'Minister') newRoom.minister = playerId;
            else if (role === 'Thief') newRoom.thief = playerId;
            else if (role === 'Police') newRoom.police = playerId;
            newRoom.scores[playerId] = players[playerId].score;
        } else {
             console.error("[Game Start] !!! Player data missing for valid player ID:", playerId);
             newRoom.scores[playerId] = 0;
        }
    });

    console.log(`[Game Start] Room ${roomId} roles assigned:`, newRoom.roles);
    console.log(`[Game Start] Room ${roomId} scores initialized:`, newRoom.scores);

    newRoom.playerIds.forEach(playerId => {
        const player = players[playerId];
        if (player) {
             console.log(`[Game Start] Emitting 'game_start' to ${playerId}`);
             io.to(playerId).emit('game_start', {
                 roomId: roomId, yourRole: player.role, yourScore: player.score, kingId: newRoom.king,
                 players: newRoom.playerIds.map(pid => ({ id: pid })), round: newRoom.round, totalRounds: TOTAL_ROUNDS
             });
        }
    });

    newRoom.state = 'minister_turn';
    if (newRoom.king) io.to(roomId).emit('action_required', { forRole: 'King', message: "King, tell the Minister to investigate." });
    if (newRoom.minister) io.to(roomId).emit('action_required', { forRole: 'Minister', message: "Minister, please identify the Thief and Police." });
    console.log(`[Game Start] Room ${roomId} state set to 'minister_turn'. Prompts sent.`);
}

// --- Connection Handler ---
io.on('connection', (socket) => {
    console.log(`User Connected: ${socket.id}`);
    // Initialize player data, but don't add to waiting list yet
    if (!players[socket.id]) {
        players[socket.id] = { id: socket.id, score: 0, role: null, roomId: null };
        console.log(`Player ${socket.id} initialized.`);
    } else {
        // Handle potential reconnection logic here if needed later
        console.log(`Player ${socket.id} reconnected? Current data:`, players[socket.id]);
        // If reconnected and was in a room, might need to rejoin or get game state
    }

    // --- *** NEW: Join Game Handler *** ---
    socket.on('join_game', () => {
        console.log(`Player ${socket.id} requested to join game.`);
        const player = players[socket.id];

        // Prevent joining if already in a room or already waiting
        if (player && player.roomId) {
            console.log(`Player ${socket.id} is already in room ${player.roomId}. Join request ignored.`);
            // Optionally emit an error or status update back to the client
            // socket.emit('already_in_game', { roomId: player.roomId });
            return;
        }
        if (waitingPlayers.includes(socket.id)) {
            console.log(`Player ${socket.id} is already in the waiting list. Join request ignored.`);
            socket.emit('waiting_for_players', { needed: MAX_PLAYERS_PER_ROOM, current: waitingPlayers.length });
            return;
        }

        // Add player to the waiting list
        if (player) { // Ensure player data exists
             waitingPlayers.push(socket.id);
             console.log("Updated Waiting players:", waitingPlayers);
             // Notify the player they are waiting
             socket.emit('waiting_for_players', { needed: MAX_PLAYERS_PER_ROOM, current: waitingPlayers.length });

             // Try starting a game if enough players are waiting
             if (waitingPlayers.length >= MAX_PLAYERS_PER_ROOM) {
                 // Filter waiting list to ensure players still exist in `players` object and are connected
                 const validWaitingPlayers = waitingPlayers.filter(pid => players[pid] && io.sockets.sockets.get(pid));

                 if (validWaitingPlayers.length >= MAX_PLAYERS_PER_ROOM) {
                      console.log("Enough valid players. Attempting to start game...");
                      // Take the first N players for the game
                      const playersForNewGame = validWaitingPlayers.slice(0, MAX_PLAYERS_PER_ROOM);
                      // Remove these players from the waiting list *immediately*
                      waitingPlayers = waitingPlayers.filter(pid => !playersForNewGame.includes(pid));
                      console.log("Players for game:", playersForNewGame);
                      console.log("Remaining waiting players:", waitingPlayers);
                      startGame(playersForNewGame);
                 } else {
                      // If filtering removed players, update the waiting list
                      waitingPlayers = validWaitingPlayers;
                      console.log("Filtered waiting list, not enough valid players yet:", waitingPlayers);
                      // Notify remaining waiting players about the updated count (optional)
                      waitingPlayers.forEach(pid => {
                           const sock = io.sockets.sockets.get(pid);
                           sock?.emit('waiting_for_players', { needed: MAX_PLAYERS_PER_ROOM, current: waitingPlayers.length });
                      });
                 }
             }
        } else {
            console.error(`Cannot add player ${socket.id} to waiting list - player data not found.`);
            socket.emit('error_message', { message: "Error joining game. Please refresh and try again." });
        }
    });
    // --- *** END: Join Game Handler *** ---


    // --- Minister Guess Handler --- (unchanged)
    socket.on('minister_guess', (data) => {
        const { roomId, guessedThiefId, guessedPoliceId } = data;
        const room = gameRooms[roomId];
        const player = players[socket.id];
        if (!room || !player || player.role !== 'Minister' || room.state !== 'minister_turn' || socket.id !== room.minister) {
             console.log("Invalid minister guess attempt"); socket.emit('error_message', { message: "Invalid action." }); return;
        }
        console.log(`Minister ${socket.id} guess in ${roomId}: T=${guessedThiefId}, P=${guessedPoliceId}`);
        room.roundInfo = { guess: { thief: guessedThiefId, police: guessedPoliceId } };
        let ministerCorrect = (room.thief && room.police && guessedThiefId === room.thief && guessedPoliceId === room.police);

        if (ministerCorrect) { console.log(`Correct`); if(players[room.minister]) players[room.minister].score += 500; if(players[room.police]) players[room.police].score += 200; }
        else { console.log(`Incorrect`); if(players[room.police]) players[room.police].score += 400; if(players[room.thief]) players[room.thief].score += 200; }
        room.playerIds.forEach(pid => { if (players[pid]) room.scores[pid] = players[pid].score; else room.scores[pid] = 0; });
        console.log(`Scores round ${room.round}:`, room.scores);

        const roundResults = { round: room.round, ministerGuess: room.roundInfo.guess, actualThief: room.thief, actualPolice: room.police, ministerCorrect: ministerCorrect, scores: room.scores, isGameOver: room.round >= TOTAL_ROUNDS };
        console.log(`---> Preparing emit round ${room.round}. Over=${roundResults.isGameOver}`);

        try {
            io.to(roomId).emit('round_result', roundResults);
            console.log(`---> Successfully emitted round_result to room ${roomId}`);
        } catch (error) { console.error(`!!! Error emitting round_result:`, error); }

        room.state = 'results';

        if (roundResults.isGameOver) {
            console.log(`%cGame over in room ${roomId}`, 'color: magenta; font-weight: bold;');
            room.state = 'game_over';
            // Cleanup could happen here or after players disconnect
        } else {
             // --- Start next round Timeout --- (unchanged logic within timeout)
             setTimeout(() => {
                 if (!gameRooms[roomId] || gameRooms[roomId].state === 'game_over') {
                     console.log(`Room ${roomId} next round aborted (inactive/over).`);
                     return;
                 }
                 room.round += 1;
                 room.roundInfo = {};
                 const playerIdsInRoom = room.playerIds.filter(pid => players[pid] && io.sockets.sockets.get(pid));
                 if (playerIdsInRoom.length < MAX_PLAYERS_PER_ROOM) {
                      console.error(`Room ${roomId}: Not enough active players (${playerIdsInRoom.length}) for round ${room.round}. Ending game.`);
                      io.to(roomId).emit('game_interrupted', { message: `Not enough players to continue round ${room.round}. Game ended.`});
                      room.state = 'game_over';
                      // Consider deleting room or just leaving it inactive
                      return;
                 }
                 const rolesToAssign = [...ROLES];
                 const shuffledRoles = shuffleArray(rolesToAssign);
                 console.log(`[Next Round ${room.round}] Shuffled standard roles:`, shuffledRoles);
                 playerIdsInRoom.forEach((playerId, index) => {
                     if (index < shuffledRoles.length) {
                         const newRole = shuffledRoles[index];
                         console.log(`[Next Round ${room.round}] Assigning ${newRole} to ${playerId.substring(0,4)}`);
                         room.roles[playerId] = newRole;
                         if (players[playerId]) players[playerId].role = newRole;
                         if (newRole === 'King') room.king = playerId;
                         else if (newRole === 'Minister') room.minister = playerId;
                         else if (newRole === 'Thief') room.thief = playerId;
                         else if (newRole === 'Police') room.police = playerId;
                     } else {
                          console.error(`!!! Error assigning role: index ${index} out of bounds for shuffledRoles (length ${shuffledRoles.length}) in room ${roomId}`);
                     }
                 });
                 room.playerIds.forEach(pid => { if (!playerIdsInRoom.includes(pid)) room.roles[pid] = null; });
                 console.log(`Room ${roomId} starting round ${room.round}. New roles assigned:`, room.roles);
                 playerIdsInRoom.forEach(playerId => {
                     if (players[playerId]) {
                         io.to(playerId).emit('new_round', {
                             round: room.round,
                             yourRole: players[playerId].role,
                             kingId: room.king,
                             scores: room.scores
                         });
                     }
                 });
                 room.state = 'minister_turn';
                 if(room.king) io.to(room.king).emit('action_required', { forRole: 'King', message: "King, ensure Minister investigates." }); else console.warn(`[Next Round ${room.round}] No King found to prompt.`);
                 if(room.minister) io.to(room.minister).emit('action_required', { forRole: 'Minister', message: "Minister, please identify Thief/Police." }); else console.warn(`[Next Round ${room.round}] No Minister found to prompt.`);
                 console.log(`Room ${roomId} state set to 'minister_turn' round ${room.round}. Minister ${room.minister} prompted.`);
             }, 5000); // 5 second delay
        }
    });

    // --- Disconnect Handler --- (mostly unchanged, confirms removal from waiting list)
    socket.on('disconnect', (reason) => {
        console.log(`User Disconnected: ${socket.id}. Reason: ${reason}`);
        const player = players[socket.id]; // Get player data before deleting

        // Remove from waiting list if present
        const waitingIndex = waitingPlayers.indexOf(socket.id);
        if (waitingIndex > -1) {
             waitingPlayers.splice(waitingIndex, 1);
             console.log(`Removed ${socket.id} from waiting list. Waiting list now:`, waitingPlayers);
             // Notify remaining waiting players about the change (optional)
             waitingPlayers.forEach(pid => {
                 const sock = io.sockets.sockets.get(pid);
                 sock?.emit('waiting_for_players', { needed: MAX_PLAYERS_PER_ROOM, current: waitingPlayers.length });
             });
        }

        // Handle game interruption if player was in a room (unchanged logic)
        if (player && player.roomId) {
            const roomId = player.roomId;
            const room = gameRooms[roomId];
            socket.leave(roomId); // Explicitly leave the Socket.IO room
             console.log(`Socket ${socket.id} left Socket.IO room ${roomId}`);

            if (room && room.state !== 'game_over') {
                console.log(`Player ${socket.id} disconnected from active room ${roomId}. Notifying others.`);
                room.playerIds = room.playerIds.filter(pid => pid !== socket.id);
                console.log(`Removed ${socket.id} from game room ${roomId} player list.`);
                const remainingPlayerIds = room.playerIds.filter(pid => players[pid]);
                if (remainingPlayerIds.length > 0) {
                    io.to(roomId).emit('game_interrupted', { message: `Player ${socket.id.substring(0,4)} disconnected.`});
                     console.log(`Notified remaining players in room ${roomId}.`);
                    if (remainingPlayerIds.length < MAX_PLAYERS_PER_ROOM) { // Maybe check if < 2?
                         console.log(`Room ${roomId} has insufficient players (${remainingPlayerIds.length}). Ending game.`);
                         io.to(roomId).emit('game_interrupted', { message: `Game ended due to insufficient players.`}); // Send specific message
                         room.state = 'game_over';
                    }
                } else {
                     console.log(`Last player left room ${roomId}. Deleting room.`);
                     delete gameRooms[roomId];
                }
            } else if (room && room.state === 'game_over') {
                  room.playerIds = room.playerIds.filter(pid => pid !== socket.id);
                  if (room.playerIds.length === 0) {
                      console.log(`Last player left finished game room ${roomId}. Deleting room.`);
                      delete gameRooms[roomId];
                  }
            }
        }

        // Remove player data from the main 'players' object AFTER handling room/waiting logic
        delete players[socket.id];
        console.log("Remaining players:", Object.keys(players));
    });
});

// --- Catch-all route to serve index.html ---
// This should be after API routes (if any) but before server.listen
// It ensures that navigating directly to a client-side route (if you add them later)
// still serves the main HTML file, letting React Router handle it.
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist', 'index.html'));
});
// --- End Catch-all Route ---


server.listen(PORT, () => {
    console.log(`Server listening on *:${PORT}`);
});