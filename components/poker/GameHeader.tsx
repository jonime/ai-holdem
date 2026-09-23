"use client";

import { useRouter } from "next/navigation";

import { APP_NAME } from "@/lib/constants";

export function GameHeader() {
  const router = useRouter();

  function handleExit() {
    if (window.confirm("Leave this table and return to the home screen?")) {
      router.push("/");
    }
  }

  return (
    <header className="game-header">
      <div className="game-header-inner">
        <span className="game-header-title">{APP_NAME}</span>
        <button className="exit-game" type="button" onClick={handleExit}>
          Exit
        </button>
      </div>
    </header>
  );
}
