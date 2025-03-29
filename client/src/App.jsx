// client/src/App.jsx
import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import './App.css'; // <-- Make sure this is importing the updated CSS
import Rules from './components/Rules';

const SERVER_URL = 'http://localhost:3001';

function App() {
    // --- State Variables ---
    const [isConnected, setIsConnected] = useState(false);
    const [myId, setMyId] = useState('');
    const [message, setMessage] = useState('Connecting...');
    const [view, setView] = useState('home'); // 'home', 'waiting', 'game', 'gameOver'

    // Game Specific State
    const [roomId, setRoomId] = useState(null);
    const [myRole, setMyRole] = useState(null);
    const [myScore, setMyScore] = useState(0);
    const [kingId, setKingId] = useState(null);
    const [playersInRoom, setPlayersInRoom] = useState([]);
    const [currentRound, setCurrentRound] = useState(0);
    const [totalRounds, setTotalRounds] = useState(4);
    const [needsToGuess, setNeedsToGuess] = useState(false);
    const [roundResult, setRoundResult] = useState(null);
    const [finalScores, setFinalScores] = useState(null);
    const [waitingInfo, setWaitingInfo] = useState({ needed: 4, current: 0 }); // Default needed


    const [showRules, setShowRules] = useState(false);

    // --- Refs ---
    const socketRef = useRef(null);
    const guessedThiefRef = useRef(null);
    const guessedPoliceRef = useRef(null);
    const myRoleRef = useRef(myRole);

    // --- Helper to Reset Game State ---
    const resetGameState = () => {
        setRoomId(null);
        setMyRole(null);
        myRoleRef.current = null;
        setMyScore(0);
        setKingId(null);
        setPlayersInRoom([]);
        setCurrentRound(0);
        setTotalRounds(4);
        setNeedsToGuess(false);
        setRoundResult(null);
        setFinalScores(null);
        setWaitingInfo({ needed: 4, current: 0 });
    };

    // --- Socket Connection and Listeners Effect --- (Keep the detailed version from the previous step)
    useEffect(() => {
        if (!socketRef.current) {
            console.log('Attempting to connect to server...');
            socketRef.current = io(SERVER_URL, {
                reconnectionAttempts: 5,
                reconnectionDelay: 1000,
            });
        }
        const socket = socketRef.current;

        socket.on('connect', () => {
            console.log('Connected to server! ID:', socket.id);
            setIsConnected(true);
            setMyId(socket.id);
            // Only reset if not already in a game (e.g., on initial load or after explicit disconnect)
            if (view !== 'game' && view !== 'gameOver') {
                setMessage('Connected. Ready to play!');
                setView('home');
                resetGameState();
            } else {
                // If reconnecting during a game, might need specific logic later
                setMessage('Reconnected.');
            }
        });

        socket.on('disconnect', (reason) => {
            console.log('Disconnected from server. Reason:', reason);
            setIsConnected(false);
            // Don't clear myId immediately on disconnect, might reconnect
            setMessage('Disconnected. Attempting to reconnect...');
            // Don't reset view/game state immediately, allow reconnection attempts
            // If reconnection fails permanently, then reset:
            // socket.io.on("reconnect_failed", () => {
            //    setMessage("Connection failed permanently. Please refresh.");
            //    setView('home');
            //    resetGameState();
            //    setMyId('');
            // });
        });

        socket.on('connect_error', (err) => {
            console.error('Connection Error:', err.message);
            setMessage(`Connection failed: ${err.message}. Retrying...`);
            setIsConnected(false);
        });

        socket.on('waiting_for_players', (data) => {
            console.log('Waiting for players data:', data);
            if (view === 'waiting') { // Only update if already in waiting view
                setMessage(`Waiting for players... ${data.current} / ${data.needed}`);
                setWaitingInfo(data);
            }
        });

        socket.on('game_start', (data) => {
            console.log('Game Start data received:', data);
            setMessage(`Game started! You are the ${data.yourRole}.`);
            setView('game'); // Switch to game view
            setRoomId(data.roomId);
            setMyRole(data.yourRole);
            myRoleRef.current = data.yourRole;
            setMyScore(data.yourScore);
            setKingId(data.kingId);
            setPlayersInRoom(data.players);
            setCurrentRound(data.round);
            setTotalRounds(data.totalRounds);
            setNeedsToGuess(false);
            setRoundResult(null);
            setFinalScores(null);
        });

        socket.on('new_round', (data) => {
            console.log('New Round data received:', data);
            if (view === 'game') {
                setMessage(`Round ${data.round} starting! Your new role: ${data.yourRole}.`);
                setMyRole(data.yourRole);
                myRoleRef.current = data.yourRole;
                setKingId(data.kingId);
                setCurrentRound(data.round);
                setNeedsToGuess(false);
                setRoundResult(null); // Clear previous result display
                if (data.scores && myId && data.scores[myId] !== undefined) {
                    setMyScore(data.scores[myId]);
                }
            } else {
                console.warn("Received 'new_round' event but view is not 'game'. Ignoring.");
            }
        });

        socket.on('action_required', (data) => {
            if (view === 'game') {
                console.log(`[Action Required] Msg: "${data.message}"`, 'Role Ref:', myRoleRef.current);
                const currentRoleFromRef = myRoleRef.current;
                const isMinisterRole = currentRoleFromRef === 'Minister';
                // Make condition more robust - check for role AND specific message part
                const isIdentifyMessage = typeof data.message === 'string' && (data.message.includes("Minister, please identify") || data.message.includes("Minister, please identify Thief/Police"));

                if (isMinisterRole && isIdentifyMessage) {
                    console.log('%c[Action Required] Minister needs to guess. Setting needsToGuess = true.', 'color: green; font-weight: bold;');
                    setNeedsToGuess(true);
                    setMessage("Minister, it's your turn to identify the Thief and Police!");
                } else {
                    // Optional: Provide status messages for other roles
                    if (currentRoleFromRef === 'King') setMessage("King, waiting for Minister's guess.");
                    else if (!isMinisterRole) setMessage(`Waiting for the Minister to make a guess.`);
                }
            } else {
                console.warn("Received 'action_required' event but view is not 'game'. Ignoring.");
            }
        });

        socket.on('round_result', (data) => {
            console.log('Round Result Received:', data);
            if (view === 'game' || view === 'gameOver') { // Process if in game or just finished
                setRoundResult(data);
                setNeedsToGuess(false); // Turn off guessing form
                if (data.scores && myId && data.scores[myId] !== undefined) {
                    setMyScore(data.scores[myId]);
                }
                let resultMessage = `Round ${data.round} Result: Minister guessed T=${data.ministerGuess.thief.substring(0, 4)}, P=${data.ministerGuess.police.substring(0, 4)}. `;
                resultMessage += `Actual: T=${data.actualThief.substring(0, 4)}, P=${data.actualPolice.substring(0, 4)}. `;
                resultMessage += `Minister was ${data.ministerCorrect ? 'CORRECT!' : 'INCORRECT.'}`;

                if (data.isGameOver) {
                    console.log('%cGame Over flag received!', 'color: magenta; font-weight: bold;');
                    setMessage(resultMessage + " --- GAME OVER ---");
                    setView('gameOver');
                    setFinalScores(data.scores);
                } else {
                    setMessage(resultMessage + ` --- Starting Round ${data.round + 1} soon...`);
                }
            } else {
                console.warn("Received 'round_result' but view is not 'game' or 'gameOver'. Ignoring.");
            }
        });

        socket.on('game_interrupted', (data) => {
            console.log('Game Interrupted:', data.message);
            setMessage(`Game interrupted: ${data.message}. Returning to home.`);
            setView('home');
            resetGameState();
        });

        socket.on('error_message', (data) => {
            console.error('Server Error:', data.message);
            setMessage(`Error: ${data.message}`);
            // Maybe go back home on critical errors?
            // setView('home');
            // resetGameState();
        });


        // Cleanup function
        return () => {
            console.log('Cleaning up socket listeners for', socketRef.current?.id);
            socket.off('connect');
            socket.off('disconnect');
            socket.off('connect_error');
            socket.off('waiting_for_players');
            socket.off('game_start');
            socket.off('new_round');
            socket.off('action_required');
            socket.off('round_result');
            socket.off('game_interrupted');
            socket.off('error_message');
        };
        // Add dependencies that, when changed, require listeners to be potentially re-evaluated or cleaned up/re-attached.
        // myId is crucial. view might be useful if logic *inside* the listeners depends heavily on the current view state.
    }, [myId, view]);

    // --- Event Handlers ---
    const handleJoinGame = () => {
        if (socketRef.current && isConnected) {
            console.log('Emitting join_game event');
            socketRef.current.emit('join_game');
            setView('waiting');
            setMessage('Joining game... Looking for players...');
            // Reset waiting info specifically when joining
            setWaitingInfo({ needed: 4, current: 0 });
        } else {
            setMessage('Cannot join game. Not connected to server.');
            console.error('Attempted to join game while not connected.');
        }
    };

    const handleMinisterSubmit = (event) => {
        event.preventDefault();
        const guessedThief = guessedThiefRef.current?.value;
        const guessedPolice = guessedPoliceRef.current?.value;
        const socket = socketRef.current;

        // Add validation for selecting the same player or null selections
        if (!guessedThief || !guessedPolice) {
            alert("Please select one player for Thief and one for Police.");
            return;
        }
        if (guessedThief === guessedPolice) {
            alert("You cannot select the same player for both roles.");
            return;
        }
        if (guessedThief === myId || guessedPolice === myId) {
            alert("You cannot guess yourself, Minister!");
            return;
        }
        if (guessedThief === kingId || guessedPolice === kingId) {
            alert("You cannot select the King!");
            return;
        }
        if (!socket || !roomId) {
            alert("Connection error or invalid game state. Cannot submit guess.");
            return;
        }


        console.log(`Submitting guess: Thief=${guessedThief}, Police=${guessedPolice}`);
        socket.emit('minister_guess', {
            roomId: roomId,
            guessedThiefId: guessedThief,
            guessedPoliceId: guessedPolice
        });
        setNeedsToGuess(false);
        setMessage("Guess submitted. Waiting for results...");
    };


    // --- Render Logic ---
    const renderContent = () => {
        switch (view) {
            // *** UPDATED HOME CASE ***
            case 'home':
                return (
                    <div className="home-screen">
                        <h1 className="game-title">King-Minister-Thief-Police</h1>
                        <p className="tagline">
                            A game of deduction, deception, and justice. Can the Minister find the Thief with the Police's help before time runs out?
                        </p>
                        <button className="play-button" onClick={handleJoinGame} disabled={!isConnected}>
                            {isConnected ? 'Play Game' : 'Connecting...'}
                        </button>
                    </div>
                );

            case 'waiting':
                return (
                    <div className="waiting-screen">
                        <h2>Looking for Players...</h2>
                        <p>{message}</p>
                        {/* Optional: Add a visual indicator like a spinner */}
                        <p>Players Found: {waitingInfo.current} / {waitingInfo.needed}</p>
                    </div>
                );

            case 'game':
                const isMinister = myRole === 'Minister';
                // Derived state for easier reading in JSX
                const guessablePlayers = playersInRoom.filter(p => p.id !== myId && p.id !== kingId);
                return (
                    <div className="game-info">
                        <h2>Game in Progress (Room: {roomId?.substring(0, 6)}...)</h2>
                        <p>Round: {currentRound} / {totalRounds}</p>
                        <p>Your Role: <strong>{myRole}</strong></p>
                        <p>Your Score: <strong>{myScore}</strong></p>
                        <p>Current King: {kingId ? kingId.substring(0, 4) : 'N/A'}{kingId === myId ? ' (You)' : ''}</p>
                        <p>Players: {playersInRoom.map(p => `${p.id.substring(0, 4)}${p.id === myId ? '(You)' : ''}`).join(', ')}</p>

                        {/* Minister's Guessing Form */}
                        {isMinister && needsToGuess && (
                            <form onSubmit={handleMinisterSubmit} className="minister-form">
                                <h3>Minister's Task: Identify Roles</h3>
                                <p style={{ textAlign: 'center', fontSize: '0.9em', marginTop: '-10px', marginBottom: '15px' }}>Select who you believe is the Thief and the Police.</p>
                                <div> {/* Thief Select */}
                                    <label htmlFor="thief-select">Guess Thief:</label>
                                    <select id="thief-select" ref={guessedThiefRef} required defaultValue="">
                                        <option value="" disabled>-- Select Player --</option>
                                        {guessablePlayers.map(player => (
                                            <option key={`thief-${player.id}`} value={player.id}>
                                                Player {player.id.substring(0, 4)}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div> {/* Police Select */}
                                    <label htmlFor="police-select">Guess Police:</label>
                                    <select id="police-select" ref={guessedPoliceRef} required defaultValue="">
                                        <option value="" disabled>-- Select Player --</option>
                                        {guessablePlayers.map(player => (
                                            <option key={`police-${player.id}`} value={player.id}>
                                                Player {player.id.substring(0, 4)}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <button type="submit">Submit Identification</button>
                            </form>
                        )} {/* End Minister Form */}

                        {/* Round Result Display (Only show when results are in and not guessing) */}
                        {roundResult && !needsToGuess && (
                            <div className="round-results">
                                <h3>Round {roundResult.round} Results</h3>
                                <p>
                                    Minister ({roundResult.ministerCorrect ? 'Correctly' : 'Incorrectly'}) guessed:
                                    Thief <strong>{roundResult.ministerGuess.thief.substring(0, 4)}</strong>,
                                    Police <strong>{roundResult.ministerGuess.police.substring(0, 4)}</strong>
                                </p>
                                <p>
                                    Actual Roles:
                                    Thief <strong>{roundResult.actualThief.substring(0, 4)}</strong>,
                                    Police <strong>{roundResult.actualPolice.substring(0, 4)}</strong>
                                </p>
                            </div>
                        )}
                    </div>
                );

            case 'gameOver':
                return (
                    <div className="game-over">
                        <h2>Game Over!</h2>
                        {roundResult && ( // Show final round result message if available
                            <p style={{ textAlign: 'center', fontWeight: 500 }}>Final Round ({roundResult.round}): Minister was {roundResult.ministerCorrect ? 'CORRECT' : 'INCORRECT'}.</p>
                        )}
                        <h3>Final Scores:</h3>
                        {finalScores && typeof finalScores === 'object' ? (
                            <ul>
                                {Object.entries(finalScores)
                                    .sort(([, scoreA], [, scoreB]) => scoreB - scoreA) // Sort descending by score
                                    .map(([pid, score], index) => (
                                        <li key={pid}>
                                            <span>{index === 0 ? '🏆 ' : ''}Player {pid.substring(0, 4)}{pid === myId ? ' (You)' : ''}</span>
                                            <span>{score} points {index === 0 ? ' (Winner!)' : ''}</span>
                                        </li>
                                    ))}
                            </ul>
                        ) : <p>Calculating final scores...</p>}
                        <button onClick={() => { setView('home'); resetGameState(); setMessage('Click "Play Game" to join again.'); }}>
                            Play Again?
                        </button>
                    </div>
                );

            default: // Should not happen ideally
                return <p>Loading or invalid state...</p>;
        }
    };

    return (
        <div className="App">
            {/* Keep status bar only if needed, or integrate into header/footer */}
            <div className="status-bar">
                <p>Status: {isConnected ? `Connected (ID: ${myId ? myId.substring(0, 4) : 'N/A'})` : 'Disconnected'}</p>
                <p className="message-display">{message}</p>
            </div>
            {/* Removed the <hr /> for cleaner look */}
            <div className="main-content">
                {renderContent()}
            </div>

            <div className="rule-section">
                {/* Example button to toggle rules */}
                <button className='button' onClick={() => setShowRules(!showRules)} style={{ position: 'fixed', top: '10px', right: '10px' }}>
                    {showRules ? 'Hide Rules' : 'Show Rules'}
                </button>

                {/* Conditionally render Rules */}
                {showRules && <Rules />}

                {/* ... rest of your App rendering ... */}
            </div>
        </div >
    );
}

export default App;