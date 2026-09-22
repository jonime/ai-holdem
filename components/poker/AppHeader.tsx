"use client";

import { FaGithub } from "react-icons/fa";

interface AppHeaderProps {
  readonly loading?: boolean;
  readonly onNewGame: () => void;
}

export function AppHeader({ loading = false, onNewGame }: AppHeaderProps) {
  return (
    <header className="app-header">
      <div>
        <h1>AI Hold&apos;em</h1>
      </div>
      <div className="header-actions">
        <a
          className="github-link"
          href="https://github.com/jonime/ai-holdem"
          target="_blank"
          rel="noreferrer"
          aria-label="Open the GitHub repository"
          title="Open the GitHub repository"
        >
          <FaGithub aria-hidden="true" size={20} />
        </a>
        <button
          className="new-game"
          type="button"
          onClick={onNewGame}
          disabled={loading}
        >
          {loading ? "Working" : "New Game"}
        </button>
      </div>
    </header>
  );
}
