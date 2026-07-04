Ah pardon, tu voulais le plan MVP **du Computer Use seul** — le proto découpé en livrable minimal. Le voilà, resserré :

## MVP COMPUTER USE — le minimum qui prouve tout

**Definition of Done** : `python crawler.py` lit les 4 pages du portail via Gemini qui clique, remplit `state.json`, et relancé → skip les pages déjà vues. Point.

### Étape 1 — Setup + mains (25 min)
```bash
pip install playwright google-genai && playwright install chromium
export GOOGLE_API_KEY="..."
```
`m1.py` : Playwright ouvre une page (le portail de Junior, ou le bulletin.html de test que je t'ai donné), screenshot, print du texte.
✅ **Sortie : le navigateur s'ouvre et shot.png existe.**

### Étape 2 — Yeux = le fallback garanti (20 min)
`m2.py` : le screenshot → Gemini vision (`gemini-2.5-flash`, dispo à coup sûr) → « restitue tout le texte ». 
✅ **Sortie : le texte du bulletin ressort avec "250,00" dedans.**
→ À partir d'ici, ton week-end est sauvé quoi qu'il arrive : marche 1 + marche 2 = un crawler fonctionnel (navigation Playwright scriptée + lecture Gemini).

### Étape 3 — La vraie boucle Computer Use (30-40 min max, chrono strict)
**D'abord le stand Google** avec le `crawler.py` que je t'ai donné : « nom exact du modèle computer use sur nos comptes + noms des actions qu'il émet ». Puis tu lances sur UNE page.
✅ **Sortie : la souris bouge toute seule, le texte revient.**
⛔ **> 30 min de blocage → tu actes le fallback étape 2 et tu n'y reviens plus.** (Tu pourras retenter dimanche matin si tout le reste est fini — pas avant.)

### Étape 4 — L'état + resume (15 min)
La fonction `crawl()` déjà écrite : boucle sur les 4 URLs, `state.json` sauvé à chaque page, `continue` si déjà vue. Lance deux fois.
✅ **Sortie : run 1 = 4 pages lues · run 2 = instantané, rien relu.**

---

**Total : ~1h30, un seul point d'incertitude (étape 3), un fallback verrouillé avant même de l'atteindre, et à la fin tu as LE composant central du projet + la démo du resume sur ton laptop.**

C'est tout le plan. Étape 1, chrono lancé — et tu reviens me voir soit avec « la souris bouge » soit avec l'erreur de l'étape 3. 🔨🚀