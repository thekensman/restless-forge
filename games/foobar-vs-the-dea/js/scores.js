// scores.js - the high score table.
//
// The original keeps eleven slots in resource 'Bäst' 0, "High scores", inside the
// "Foobar1 Preferences" file (fn2_5D9E): eleven long scores, then eleven 16-byte Pascal names.
// Slot 0 is never shown or used; slots 1 to 10 are the table.
//
// At the end of a game that was not aborted, fn2_5E5A calls fn2_5CB8 with the score.
// A score has to beat slot 10 outright. The Mac beeps and asks for a name (DITL 129, with
// "Your name here" selected); Cancel or an empty name stores nothing. The new score then
// slides up past every lower score and stops under an equal one, the old 10th place drops
// off, and the name is cut to 15 characters. fn2_5ECE shows the table with that row in red
// and waits for a click or a key. The table also comes up after Cancel, as in the original.
//
// The High Scores menu had Show High Scores (the same window, no name check) and Erase High
// Scores (fn2_5FFE, every slot back to "Nobody" and 0, no confirmation).

export const SLOTS = 10;
export const NAME_MAX = 15;
export const DEFAULT_NAME = 'Your name here';
export const EMPTY_NAME = 'Nobody';
export const PROMPT = 'New high score! Please enter your name!';
export const CONTINUE = 'Click mouse or hit any key to continue...';

export function blankTable() {
  return Array.from({ length: SLOTS }, () => ({ name: EMPTY_NAME, score: 0 }));
}

export function qualifies(table, score) {
  return score > table[SLOTS - 1].score;
}

// Returns the new table and the 1-based rank of the entry, or rank 0 when nothing was stored.
export function insertScore(table, score, name) {
  const nm = String(name == null ? '' : name).slice(0, NAME_MAX);
  if (!qualifies(table, score) || nm.length === 0) return { table, rank: 0 };
  const t = table.map(e => ({ name: e.name, score: e.score }));
  let i = SLOTS - 1;
  while (i > 0 && t[i - 1].score < score) { t[i] = t[i - 1]; i--; }
  t[i] = { name: nm, score };
  return { table: t, rank: i + 1 };
}

// Browser storage stands in for the preferences file. It can be missing or throw (private
// windows, blocked storage), and then the table simply lives for this visit only.
export class HighScores {
  constructor(storage, key = 'foobar_highscores') {
    this.storage = storage || null; this.key = key; this.lastRank = 0;
    this.table = this._load();
  }
  _load() {
    try {
      const raw = this.storage && this.storage.getItem(this.key);
      const t = raw ? JSON.parse(raw) : null;
      if (Array.isArray(t) && t.length === SLOTS &&
          t.every(e => e && typeof e.name === 'string' && Number.isFinite(e.score)))
        return t.map(e => ({ name: e.name.slice(0, NAME_MAX), score: e.score }));
    } catch (e) {}
    return blankTable();
  }
  _save() {
    try { this.storage && this.storage.setItem(this.key, JSON.stringify(this.table)); } catch (e) {}
  }
  qualifies(score) { return qualifies(this.table, score); }
  // The original keeps the highlighted rank in a global until the next entry, so Show High
  // Scores later in the same session still shows that row in red. A cancelled entry leaves it.
  submit(score, name) {
    const r = insertScore(this.table, score, name);
    if (r.rank) { this.table = r.table; this.lastRank = r.rank; this._save(); }
    return r.rank;
  }
  erase() { this.table = blankTable(); this._save(); }
}
