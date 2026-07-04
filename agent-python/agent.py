#!/usr/bin/env python3
"""
LegalHack — Agent lecteur de documents
Ouvre la page, clique sur chaque document, extrait le texte complet.
Usage: GOOGLE_API_KEY=... python agent.py <config.json>
"""

import os
import json
import time
import sys
from pathlib import Path

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")

from playwright.sync_api import sync_playwright
from google import genai
from google.genai import types

STATE_FILE = Path("state.json")


def update_state(updates: dict):
    data = {}
    if STATE_FILE.exists():
        try:
            data = json.loads(STATE_FILE.read_text())
        except Exception:
            pass
    data.update(updates)
    STATE_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2))


def classify(client: genai.Client, sujet: str, titre: str, texte: str) -> dict:
    """Gemini classe le document et retourne le texte complet."""
    prompt = f"""Sujet recherche : {sujet}

Document : {titre}
---
{texte[:60000]}
---

Reponds uniquement en JSON valide, sans markdown, avec ce format exact :
{{"pertinent": true, "sujet_detecte": "...", "contenu": "..."}}

- pertinent : true si le document parle du sujet recherche
- sujet_detecte : en une phrase, de quoi parle ce document
- contenu : le texte du document tel quel, sans le raccourcir"""

    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[types.Content(role="user", parts=[types.Part(text=prompt)])],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.0
            )
        )
        data = json.loads(response.text)
        return {
            "pertinent": bool(data.get("pertinent", False)),
            "sujet_detecte": str(data.get("sujet_detecte", "")),
            "contenu": str(data.get("contenu", texte))
        }
    except Exception as e:
        return {
            "pertinent": True,
            "sujet_detecte": "Indetermine",
            "contenu": texte
        }


def read_list_page(page, client, sujet: str, base_url: str) -> list:
    """
    Detecte si la page est un portail liste (div.doc-entry ou li, tr avec liens).
    Clique sur chaque entree, lit le texte du document ouvert, ferme, passe au suivant.
    """
    results = []

    # --- Cas 1 : notre page documents.html (div.doc-entry) ---
    entries = page.query_selector_all(".doc-entry")
    if entries:
        print(f"  Portail detecte : {len(entries)} documents")
        update_state({
            "current_log": f"Portail detecte — {len(entries)} documents a lire",
            "total": len(entries),
            "done": 0
        })

        for i, entry in enumerate(entries):
            title_el  = entry.query_selector(".doc-title")
            num_el    = entry.query_selector(".doc-num")
            cat_el    = entry.query_selector(".doc-category")

            titre     = title_el.inner_text().strip()  if title_el  else f"Document {i+1}"
            ref       = num_el.inner_text().strip()    if num_el    else ""
            categorie = cat_el.inner_text().strip()    if cat_el    else ""

            print(f"\n  [{i+1}/{len(entries)}] {titre}")
            update_state({"current_log": f"Clic sur : {titre}", "current_url": f"{base_url}#{ref}"})

            # Scroll jusqu'a l'entree puis clic visible
            head = entry.query_selector(".doc-head")
            if head:
                head.scroll_into_view_if_needed()
                time.sleep(0.3)
                head.click()
                time.sleep(0.8)

            # Lire le corps maintenant visible
            body = entry.query_selector(".doc-body")
            texte = body.inner_text().strip() if body else entry.inner_text().strip()
            print(f"     {len(texte)} caracteres lus")

            update_state({"current_log": f"Classification de : {titre}..."})
            label = f"{titre} [{categorie}] ({ref})"
            res = classify(client, sujet, label, texte)
            icon = "PERTINENT" if res["pertinent"] else "hors sujet"
            print(f"     [{icon}] {res['sujet_detecte']}")

            results.append({
                "url":      f"{base_url}#{ref}",
                "titre":    titre,
                "categorie": categorie,
                **res
            })
            update_state({"done": i + 1, "results": results})

        return results

    # --- Cas 2 : page generique — on extrait le texte directement ---
    update_state({"current_log": "Lecture de la page...", "total": 1, "done": 0})

    # Scroll complet pour contenu lazy
    prev = 0
    for _ in range(20):
        h = page.evaluate("document.body.scrollHeight")
        if h == prev:
            break
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        time.sleep(0.4)
        prev = h
    page.evaluate("window.scrollTo(0, 0)")
    time.sleep(0.3)

    texte = page.inner_text("body").strip()
    titre = page.title() or page.url
    print(f"  {len(texte)} caracteres lus")

    update_state({"current_log": f"Classification de : {titre}..."})
    res = classify(client, sujet, titre, texte)
    results.append({"url": page.url, "titre": titre, **res})
    update_state({"done": 1, "results": results})

    return results


def run(config_path: str):
    config = json.loads(Path(config_path).read_text())
    sujet  = config["sujet"]
    urls   = config["urls"]

    update_state({
        "status":      "running",
        "sujet":       sujet,
        "total":       len(urls),
        "done":        0,
        "results":     [],
        "current_url": None,
        "current_log": "Demarrage..."
    })

    api_key = os.environ.get("GOOGLE_API_KEY", "")
    if not api_key:
        update_state({"status": "error", "current_log": "GOOGLE_API_KEY manquante dans .env"})
        print("ERREUR: GOOGLE_API_KEY non definie")
        sys.exit(1)

    client  = genai.Client(api_key=api_key)
    all_results = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False, slow_mo=120)
        page    = browser.new_page(viewport={"width": 1280, "height": 800})

        for url in urls:
            print(f"\n>>> Ouverture : {url}")
            update_state({"current_url": url, "current_log": f"Ouverture de {url}..."})

            try:
                page.goto(url, wait_until="domcontentloaded", timeout=30000)
                time.sleep(1.5)
            except Exception as e:
                all_results.append({
                    "url":           url,
                    "titre":         url,
                    "pertinent":     False,
                    "sujet_detecte": "Page inaccessible",
                    "contenu":       str(e)
                })
                continue

            docs = read_list_page(page, client, sujet, url)
            all_results.extend(docs)

        browser.close()

    n = sum(1 for r in all_results if r["pertinent"])
    log = f"Termine : {n}/{len(all_results)} documents pertinents sur '{sujet}'"
    update_state({
        "status":      "done",
        "current_log": log,
        "results":     all_results,
        "total":       len(all_results),
        "done":        len(all_results)
    })
    print(f"\n{log}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python agent.py <config.json>")
        sys.exit(1)
    run(sys.argv[1])
