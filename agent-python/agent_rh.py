#!/usr/bin/env python3
"""
LegalHack — Agent Computer Use (API officielle Gemini)
Usage: GOOGLE_API_KEY=... python agent_rh.py config_rh.json
"""

import os, json, time, sys, base64
from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")

from playwright.sync_api import sync_playwright
from google import genai

BASE_DIR   = Path(__file__).parent
STATE_FILE = BASE_DIR / "state.json"
STATE_TMP  = BASE_DIR / "state.json.tmp"
SHOTS_DIR  = BASE_DIR / "screenshots"

W, H = 1440, 900  # viewport de référence (coordonnées Gemini normalisées sur 1000×1000)


def save_state(s: dict) -> None:
    STATE_TMP.write_text(json.dumps(s, ensure_ascii=False, indent=2))
    STATE_TMP.rename(STATE_FILE)


def execute(page, name: str, args: dict) -> None:
    x = lambda: int(args.get("x", 0) / 1000 * W)
    y = lambda: int(args.get("y", 0) / 1000 * H)
    if   name == "click":            page.mouse.click(x(), y())
    elif name == "double_click":     page.mouse.dblclick(x(), y())
    elif name == "type":             page.keyboard.type(args.get("text", ""))
    elif name in ("key","press_key"):page.keyboard.press(args.get("key", ""))
    elif name == "scroll":           page.mouse.wheel(args.get("dx", 0), args.get("dy", 200))
    elif name == "navigate":         page.goto(args.get("url", ""), wait_until="domcontentloaded", timeout=15000)
    elif name == "go_back":          page.go_back()
    elif name == "go_forward":       page.go_forward()
    elif name == "wait":             time.sleep(float(args.get("seconds", 1)))
    else:                            print(f"  [skip] action inconnue : {name}")


def run(config_path: str) -> None:
    cfg = json.loads(Path(config_path).read_text())

    api_key = os.environ.get("GOOGLE_API_KEY", "")
    if not api_key:
        save_state({"status": "error", "current_log": "GOOGLE_API_KEY manquante"})
        sys.exit(1)

    client = genai.Client(api_key=api_key)
    max_steps = cfg.get("max_steps", 40)
    model = cfg.get("model", "gemini-3.5-flash")

    state = {
        "status": "running", "step": 0, "total": max_steps,
        "current_url": None, "current_log": "Démarrage...", "results": [],
    }
    save_state(state)

    print(f">>> Mission : {cfg['mission_text']}")
    print(f">>> Modèle  : {model}")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=cfg.get("headless", False))
        page = browser.new_page(viewport={"width": W, "height": H})

        try:
            page.goto(cfg["start_url"], wait_until="domcontentloaded", timeout=15000)
        except Exception as e:
            state.update({"status": "error", "current_log": str(e)})
            save_state(state)
            browser.close()
            return

        SHOTS_DIR.mkdir(exist_ok=True)

        # Premier appel : envoyer la mission + screenshot initial
        shot = page.screenshot()
        (SHOTS_DIR / "step_000.png").write_bytes(shot)
        shot_b64 = base64.b64encode(shot).decode()

        interaction = client.interactions.create(
            model=model,
            input=[
                {"type": "text", "text": cfg["mission_text"]},
                {"type": "image", "data": shot_b64, "mime_type": "image/png"},
            ],
            tools=[{"type": "computer_use", "environment": "browser"}],
        )

        # Boucle multi-tour
        while state["step"] < max_steps:
            fn_results = []

            for action in interaction.steps:
                if action.type != "function_call":
                    continue

                name = action.name
                args = action.arguments or {}
                print(f"\n─ step {state['step']+1}/{max_steps} | {name} {args}")

                execute(page, name, args)

                # Screenshot après chaque action
                shot = page.screenshot()
                step_num = state["step"] + 1
                (SHOTS_DIR / f"step_{step_num:03d}.png").write_bytes(shot)
                shot_b64 = base64.b64encode(shot).decode()

                fn_results.append({
                    "type": "function_result",
                    "name": name,
                    "call_id": action.id,
                    "result": [
                        {"type": "text", "text": json.dumps({"url": page.url})},
                        {"type": "image", "data": shot_b64, "mime_type": "image/png"},
                    ],
                })

                state.update({
                    "step": step_num,
                    "current_url": page.url,
                    "current_log": f"{name} → {page.url}",
                })
                save_state(state)

            if not fn_results:
                break  # plus d'actions → mission terminée

            interaction = client.interactions.create(
                model=model,
                previous_interaction_id=interaction.id,
                input=fn_results,
                tools=[{"type": "computer_use", "environment": "browser"}],
            )

        browser.close()

    state.update({"status": "done", "current_log": f"Terminé — {state['step']} action(s)"})
    save_state(state)
    print(f"\n>>> Terminé ({state['step']} actions)")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python agent_rh.py <config_rh.json>")
        sys.exit(1)
    run(sys.argv[1])
