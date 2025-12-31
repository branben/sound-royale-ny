# Sound Royale 🎹

> **The High-Stakes Game Show for Music Producers.**
> Built with React + TypeScript + Tailwind.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![React](https://img.shields.io/badge/Frontend-React-blue)](https://reactjs.org/)

🚀 The Vision
Riddim Royale gamifies the music production workflow, challenging producers to break creative blocks using a 3x3 grid of randomized genre constraints. It bridges the gap between high-speed ideation and competitive spectator engagement.

🏗 Architectural Pillars
This project is architected to handle the unique constraints of creative software, where user "flow" and real-time feedback are mission-critical.

State Normalization: To support 9 unique genre battles simultaneously, I implemented a Flat State Schema in GameContext.tsx. This avoids deeply nested updates and ensures that voting on one tile never triggers a heavy re-render of the entire board.

Atomic Component Design: The BingoBoard is a pure presentational component. By decoupling it from business logic, the same component powers the Producer, Spectator, and Lobby views, significantly reducing the maintenance surface area.

Optimistic UI Pattern: Audio submissions prioritize the artist's "Flow State." The UI confirms actions instantly (<50ms) while handling complex file uploads and metadata sync asynchronously.

'''
    sequenceDiagram
    participant P as 🎵 Producer (User)
    participant UI as 🖥️ Frontend (React)
    participant API as ⚙️ Backend (Django)
    participant DB as 🗄️ Database

    Note over P, UI: The "Optimistic" Flow
    P->>UI: Drops Audio File onto Tile
    UI-->>P: Instantly turns Tile "Yellow" (Loading)
    
    par Async Processing
        UI->>API: Uploads File (Background)
        API->>DB: Validates & Saves Link
    and User continues playing
        P->>UI: Clicks next tile...
    end
    
    API-->>UI: WebSocket: "Upload Complete"
    UI-->>P: Turns Tile "Green" (Success)
'''

🛠 Tech Stack
Core: React 18 (Vite)

Styling: Tailwind CSS (Glass-morphic design for a "DAW" aesthetic)

State Management: React Context + Custom Hooks

Logic: Custom Genre Randomization Engine

🧠 Challenges & Solutions
Challenge: Managing real-time "Battle States" between two players without UI flickering. Solution: Implemented a Game State Manager that diffs incoming snapshots. If a genre is repeated (or missing), the generator automatically re-rolls to ensure a unique 3x3 constraint set, maintaining game balance and data integrity.

🚦 Getting Started
Clone the repo:

Bash
git clone https://github.com/[your-username]/riddim-royale.git
Install dependencies:

Bash
npm install
Launch local development:

Bash
npm run dev

🗺 Roadmap
[x] Responsive 3x3 Grid UI & Layout

[x] Producer vs. Spectator Side-by-Side View

[ ] WebSocket integration for real-time state sync

[ ] AWS S3/Cloudfront Audio Pipeline

[ ] "The Crate" - Dynamic sample pack distribution engine

Created as a deep dive into high-performance, real-time creative tooling.

