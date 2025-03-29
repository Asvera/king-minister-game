// src/components/Rules.jsx (or wherever you place this file)
import React from 'react';

function Rules() {
    return (
        <div className="rules-container">
            <h2>King-Minister-Thief-Police: Game Rules</h2>

            <p>Welcome! This is a game of deduction and hidden roles for four players.</p>

            <h3>Objective</h3>
            <p>The goal is to accumulate the highest score by the end of the game (after {4} rounds).</p> {/* Assuming TOTAL_ROUNDS is fixed at 4 */}

            <h3>Setup</h3>
            <ul>
                <li><strong>Players:</strong> The game requires exactly 4 players.</li>
                <li><strong>Rounds:</strong> The game lasts for a total of {4} rounds.</li>
                <li><strong>Roles:</strong> In each round, players are randomly and secretly assigned one of four roles:
                    <ul>
                        <li><strong>King</strong></li>
                        <li><strong>Minister</strong></li>
                        <li><strong>Thief</strong></li>
                        <li><strong>Police</strong></li>
                    </ul>
                </li>
            </ul>

            <h3>Gameplay (Per Round)</h3>
            <ol>
                <li><strong>Role Assignment:</strong> At the start of each round, roles are shuffled and assigned secretly. You will only know your own role. The identity of the King is revealed to everyone.</li>
                <li><strong>Minister's Task:</strong> The Minister's job is to correctly identify which of the other two players (excluding the King and themselves) is the Thief and which is the Police.</li>
                <li><strong>Guessing:</strong> Only the Minister takes an action. They will be prompted to select one player they believe is the Thief and one player they believe is the Police.</li>
                <li><strong>Round Results & Scoring:</strong> Once the Minister submits their guess, the results are revealed:
                    <ul>
                        <li><strong>If the Minister guesses CORRECTLY:</strong>
                            <ul>
                                <li>The Minister scores <strong>500 points</strong>.</li>
                                <li>The Police scores <strong>200 points</strong>.</li>
                                <li>The Thief scores <strong>0 points</strong> for the round.</li>
                            </ul>
                        </li>
                        <li><strong>If the Minister guesses INCORRECTLY:</strong>
                            <ul>
                                <li>The Police scores <strong>400 points</strong>.</li>
                                <li>The Thief scores <strong>200 points</strong>.</li>
                                <li>The Minister scores <strong>0 points</strong> for the round.</li>
                             </ul>
                        </li>
                        <li><strong>King's Score:</strong> The King starts with 1000 points at the beginning of the game and doesn't gain or lose points based on the Minister's guess in this version.</li>
                    </ul>
                </li>
                <li><strong>Next Round:</strong> If it's not the final round, roles are shuffled again, scores carry over, and the next round begins.</li>
            </ol>

            <h3>Winning the Game</h3>
            <p>After the final round ({4} rounds total), the player with the highest cumulative score is declared the winner!</p>

            <p>Good luck, and may the best detective (or deceiver) win!</p>
        </div>
    );
}

export default Rules;