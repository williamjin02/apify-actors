# Sanctions list snapshot refresher (private)

Private helper for `swillz/sanctions-screener`. A schedule runs it every 6 hours. It downloads the five official lists, parses them with the same `src/lists.js` / `src/match.js` as the screener (keep the copies in sync) and writes `SNAPSHOT` to the public-read named key-value store `sanctions-lists-snapshot` (M258nvMTE4yWUjoVd). It needs full permissions to write that store. A list that fails or shrinks by more than 30% keeps its previous copy.
