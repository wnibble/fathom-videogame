// A minimal DOM overlay for editing the leaderboard callsign — canvas engines
// don't do text input well, so we float a styled input above the canvas.
// Resolves with the entered name, or null if dismissed (Escape / backdrop).

export function promptCallsign(current: string): Promise<string | null> {
  return new Promise((resolve) => {
    const wrap = document.createElement("div");
    wrap.style.cssText =
      "position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;" +
      "background:rgba(4,7,15,0.75);font-family:Consolas,ui-monospace,monospace;";
    const card = document.createElement("div");
    card.style.cssText =
      "background:#0a1426;border:1px solid #1c3a56;border-top:4px solid #ffb64a;border-radius:12px;" +
      "padding:28px 32px;display:flex;flex-direction:column;gap:14px;min-width:320px;";
    const label = document.createElement("div");
    label.textContent = "CALLSIGN — shown on the global leaderboard";
    label.style.cssText = "color:#8ff6ff;font-size:13px;letter-spacing:1px;";
    const input = document.createElement("input");
    input.value = current;
    input.maxLength = 20;
    input.autocomplete = "off";
    input.spellcheck = false;
    input.style.cssText =
      "background:#04070f;color:#ffe08a;border:1px solid #1c3a56;border-radius:8px;" +
      "padding:10px 12px;font-size:18px;font-family:inherit;letter-spacing:2px;outline:none;text-transform:uppercase;";
    const btn = document.createElement("button");
    btn.textContent = "SET CALLSIGN";
    btn.style.cssText =
      "background:#102540;color:#8ff6ff;border:1px solid #39d7e6;border-radius:8px;" +
      "padding:10px 12px;font-size:14px;font-family:inherit;letter-spacing:2px;cursor:pointer;";
    card.append(label, input, btn);
    wrap.append(card);
    document.body.append(wrap);
    input.focus();
    input.select();

    const done = (value: string | null) => {
      wrap.remove();
      resolve(value);
    };
    btn.addEventListener("click", () => done(input.value));
    input.addEventListener("keydown", (e) => {
      e.stopPropagation(); // keep WASD/Enter from leaking into the game's input
      if (e.key === "Enter") done(input.value);
      if (e.key === "Escape") done(null);
    });
    wrap.addEventListener("pointerdown", (e) => {
      if (e.target === wrap) done(null);
    });
  });
}
