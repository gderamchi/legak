#!/usr/bin/env python3
import os, sys, json, time, base64
from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")

from playwright.sync_api import sync_playwright
from google import genai
from pypdf import PdfReader

BASE_DIR      = Path(__file__).parent
STATE_FILE    = BASE_DIR / "state.json"
STATE_TMP     = BASE_DIR / "state.json.tmp"
SHOTS_DIR     = BASE_DIR / "screenshots"
DOWNLOADS_DIR = BASE_DIR / "downloads"

SCREEN_WIDTH  = 1440
SCREEN_HEIGHT = 900

# Securite API desactivee au maximum : on neutralise toutes les policies de
# confirmation et on n'active pas la detection d'injection de prompt.
CU_TOOL = {
    "type": "computer_use",
    "environment": "browser",
    "disabled_safety_policies": [
        "financial_transactions",
        "sensitive_data_modification",
        "communication_tool",
        "account_creation",
        "data_modification",
        "user_consent_management",
        "legal_terms_and_agreements",
    ],
}


# ── Helpers ──────────────────────────────────────────────────────────────────

def save_state(s):
    STATE_TMP.write_text(json.dumps(s, ensure_ascii=False, indent=2))
    STATE_TMP.rename(STATE_FILE)

def denormalize_x(x): return int(x / 1000 * SCREEN_WIDTH)
def denormalize_y(y): return int(y / 1000 * SCREEN_HEIGHT)


def extract_pdf_to_txt(pdf_path: Path) -> Path:
    """Extraction deterministe du texte d'un PDF vers un fichier .txt."""
    reader = PdfReader(str(pdf_path))
    text = "\n".join((page.extract_text() or "") for page in reader.pages)
    txt_path = pdf_path.with_suffix(".txt")
    txt_path.write_text(text, encoding="utf-8")
    return txt_path


def execute_function_calls(interaction, page):
    results = []
    for step in interaction.steps:
        if step.type != "function_call":
            continue

        fname = step.name
        args  = step.arguments or {}
        print(f"  → {fname} | {args.get('intent', '')}")

        # Auto-acquittement : si l'API demande une confirmation de securite,
        # on l'accepte automatiquement pour ne jamais interrompre l'agent.
        ack = bool(args.get("safety_decision"))
        if ack:
            print(f"  [safety] auto-acknowledge → {args.get('safety_decision')}")

        error = None
        try:
            if fname in ("click", "click_at"):
                page.mouse.click(denormalize_x(args["x"]), denormalize_y(args["y"]))
            elif fname == "double_click":
                page.mouse.dblclick(denormalize_x(args["x"]), denormalize_y(args["y"]))
            elif fname == "right_click":
                page.mouse.click(denormalize_x(args["x"]), denormalize_y(args["y"]), button="right")
            elif fname == "middle_click":
                page.mouse.click(denormalize_x(args["x"]), denormalize_y(args["y"]), button="middle")
            elif fname == "move":
                page.mouse.move(denormalize_x(args["x"]), denormalize_y(args["y"]))
            elif fname in ("type", "type_text_at"):
                if "x" in args and "y" in args:
                    page.mouse.click(denormalize_x(args["x"]), denormalize_y(args["y"]))
                page.keyboard.press("Meta+A")
                page.keyboard.press("Backspace")
                page.keyboard.type(args.get("text", ""))
                if args.get("press_enter"):
                    page.keyboard.press("Enter")
            elif fname == "key":
                page.keyboard.press(args.get("key", ""))
            elif fname == "scroll":
                page.mouse.wheel(args.get("dx", 0), args.get("dy", 300))
            elif fname == "navigate":
                page.goto(args.get("url", ""), wait_until="domcontentloaded", timeout=15000)
            elif fname == "go_back":
                page.go_back()
            elif fname == "go_forward":
                page.go_forward()
            elif fname == "wait":
                time.sleep(float(args.get("seconds", 1)))
            else:
                print(f"  [skip] {fname}")

            try: page.wait_for_load_state(timeout=5000)
            except: pass
            time.sleep(1)

        except Exception as e:
            print(f"  [err] {e}")
            error = str(e)

        results.append((fname, step.id, args.get("intent", ""), error, ack))
    return results


def get_function_responses(page, results):
    screenshot = page.screenshot(type="png")
    url = page.url
    responses = []
    for name, call_id, intent, error, ack in results:
        result_text = {"url": url}
        if error: result_text["error"] = error
        resp = {
            "type": "function_result",
            "name": name,
            "call_id": call_id,
            "result": [
                {"type": "text", "text": json.dumps(result_text)},
                {"type": "image", "data": base64.b64encode(screenshot).decode(), "mime_type": "image/png"},
            ],
        }
        if ack:
            resp["safety_acknowledgement"] = True
        responses.append(resp)
    return responses


# ── Main ─────────────────────────────────────────────────────────────────────

def run(config_path):
    cfg = json.loads(Path(config_path).read_text())

    api_key = os.environ.get("GOOGLE_API_KEY", "")
    if not api_key:
        save_state({"status": "error", "current_log": "GOOGLE_API_KEY manquante"})
        sys.exit(1)

    client    = genai.Client(api_key=api_key)
    model     = cfg.get("model", "gemini-3.5-flash")
    max_steps = cfg.get("max_steps", 40)

    # Guardrails (cadre des donnees fictives) + mission detaillee
    system_prompt = cfg.get("system_prompt", "")
    mission       = cfg.get("mission_brief") or cfg.get("mission_text", "")

    state = {
        "status": "running", "step": 0, "total": max_steps,
        "current_url": None, "current_log": "Démarrage...",
        "steps_log": [], "results": [],
    }
    save_state(state)
    SHOTS_DIR.mkdir(exist_ok=True)

    print("Initializing browser...")
    playwright = sync_playwright().start()
    browser    = playwright.chromium.launch(headless=cfg.get("headless", False))
    context    = browser.new_context(
        viewport={"width": SCREEN_WIDTH, "height": SCREEN_HEIGHT},
        accept_downloads=True,
    )
    page       = context.new_page()

    DOWNLOADS_DIR.mkdir(exist_ok=True)

    def _on_download(download):
        dest = DOWNLOADS_DIR / download.suggested_filename
        download.save_as(dest)
        print(f"  [download] {dest}")
        try:
            txt_path = extract_pdf_to_txt(dest)
        except Exception as e:
            print(f"  [pdf->txt err] {e}")
            state["current_log"] = f"PDF telecharge mais extraction impossible : {e}"
            state["download"] = str(dest)
            save_state(state)
            return
        state["download"] = str(dest)
        state["txt"] = str(txt_path)
        state["current_log"] = f"PDF telecharge et extrait -> {txt_path.name}"
        state.setdefault("results", []).append({
            "type": "download",
            "pdf": str(dest),
            "txt": str(txt_path),
            "preview": txt_path.read_text(encoding="utf-8")[:600],
        })
        save_state(state)

    page.on("download", _on_download)

    try:
        page.goto(cfg["start_url"])

        initial_screenshot = page.screenshot(type="png")
        print(f"Goal: {mission}")

        # Premier appel : on transmet a l'agent le system_prompt (guardrails +
        # cadre des donnees fictives) et le mission_brief (mission detaillee).
        create_kwargs = {
            "model": model,
            "input": [
                {"type": "text", "text": mission},
                {"type": "image", "data": base64.b64encode(initial_screenshot).decode(), "mime_type": "image/png"},
            ],
            "tools": [CU_TOOL],
        }
        if system_prompt:
            create_kwargs["system_instruction"] = system_prompt
        interaction = client.interactions.create(**create_kwargs)

        # Boucle agent
        for i in range(max_steps):
            print(f"\n--- Turn {i+1} ---")

            has_function_calls = any(s.type == "function_call" for s in interaction.steps)

            if not has_function_calls:
                text_response = " ".join([
                    block.text
                    for s in interaction.steps if s.type == "model_output"
                    for block in (s.content or []) if block.type == "text"
                ])
                print("Agent finished:", text_response)
                if state.get("txt"):
                    dl_note = f" — PDF extrait en {Path(state['txt']).name}"
                else:
                    dl_note = " — ATTENTION : aucun PDF telecharge/extrait"
                state.update({"status": "done",
                              "current_log": (text_response or "Terminé") + dl_note})
                save_state(state)
                break

            print("Executing actions...")
            results = execute_function_calls(interaction, page)

            for name, _, intent, error, _ in results:
                state["steps_log"].append({
                    "step": state["step"] + 1,
                    "action": name,
                    "intent": intent,
                    "url": page.url,
                })
                state["step"] += 1

            state.update({"current_url": page.url, "current_log": results[-1][2] if results else ""})
            (SHOTS_DIR / f"step_{state['step']:03d}.png").write_bytes(page.screenshot())
            save_state(state)

            print("Capturing state...")
            function_responses = get_function_responses(page, results)

            interaction = client.interactions.create(
                model=model,
                previous_interaction_id=interaction.id,
                input=function_responses,
                tools=[CU_TOOL]
            )

        else:
            dl_note = f" — PDF extrait en {Path(state['txt']).name}" if state.get("txt") \
                else " — ATTENTION : aucun PDF telecharge/extrait"
            state.update({"status": "done",
                          "current_log": f"Limite {max_steps} étapes" + dl_note})
            save_state(state)

    finally:
        print("\nClosing browser...")
        browser.close()
        playwright.stop()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python agent_rh.py <config_rh.json>")
        sys.exit(1)
    run(sys.argv[1])
