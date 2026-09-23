"use client";

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
