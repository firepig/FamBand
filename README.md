# FamBand — Family Chore Heroes

A gamified family chore tracker that turns household tasks into a fun, rewarding experience. Built with React + Vite on the frontend and Express + SQLite on the backend.

## Features

- **Kanban Chore Board** — drag-and-drop tasks across To Do, In Progress, and Done columns
- **Gamification** — earn points, unlock achievements, and climb the leaderboard
- **Snack Shop** — redeem points for custom snack rewards
- **Homework Chart** — track kids' homework progress
- **Bulletin Board** — leave messages for family members
- **Photo Uploads** — attach proof-of-completion photos to chores

## Getting Started

```bash
npm install
npm run dev        # starts both client (Vite) and server (Express)
```

The app runs at `http://localhost:5173` with the API at `http://localhost:3001`.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start client + server concurrently |
| `npm run dev:client` | Vite dev server only |
| `npm run dev:server` | Express API server only |
| `npm run build` | Production build |
| `npm start` | Run production server |

## Tech Stack

- **Frontend**: React 19, React Router 7, Bootstrap 5, dnd-kit, Recharts
- **Backend**: Express 5, better-sqlite3, Multer
- **Build**: Vite 8
