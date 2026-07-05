#!/usr/bin/env python3
"""
AGENT ANTIGRAVITY — la phase "cerveau durable" qui prend le relais APRES
Computer Use (cf. docs/audit/).

Repartition des roles (deux agents, deux metiers) :

  - Computer Use (agent_rh.py)  : les "mains & yeux". Il navigue le portail RH,
    ouvre le bon document, le TELECHARGE (PDF -> texte) et releve des NOTES
    (constats, montants, citations). Sa sortie est le "relais".
  - Antigravity (ce module)     : le "cerveau durable". Bac a sable Linux
    distant (agent=antigravity-preview-05-2026, environment="remote"), qui
    execute du Python deterministe, chiffre les passifs, redige les livrables,
    et GARDE L'ETAT nativement (environment_id + previous_interaction_id +
    background). Antigravity NE pilote PAS de navigateur (computer_use n'est pas
    supporte), d'ou le decoupage strict.

Fidele au thesis Legak : le modele lit et redige ; le CODE DETERMINISTe
(audit_engine.py) verifie / calcule / conclut ; l'expert arbitre. Ici, le moteur
deterministe produit TOUJOURS le risk register (source de verite chiffree) ;
l'agent Antigravity, lui, (1) croise les notes de Computer Use avec le document,
(2) reverifie par son propre Python (contradiction croisee, doc 01 §5),
(3) confirme les parametres "a verifier" sur BOSS / Legifrance (google_search),
et (4) redige l'executive summary et la clause SPA a partir des seuls chiffres
du moteur.

Sans cle API (ou si l'appel echoue), on bascule en MODE DEMO : le rapport est
synthetise localement a partir du risk register deterministe.

Usage :
    python3 agent_antigravity.py config_antigravity.json
    python3 agent_antigravity.py config_antigravity.json --continue "Nouvelle tache"
"""

import base64
import json
import os
import sys
import time
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")

import audit_engine as engine
import audit_kb as kb


BASE_DIR      = Path(__file__).parent
STATE_FILE    = BASE_DIR / "antigravity_state.json"
STATE_TMP     = BASE_DIR / "antigravity_state.json.tmp"
RELAIS_FILE   = BASE_DIR / "state.json"          # sortie de Computer Use (agent_rh.py)
DOWNLOADS_DIR = BASE_DIR / "downloads"
OUTPUT_DIR    = BASE_DIR / "audit_output"

AGENT_MODEL   = "antigravity-preview-05-2026"


# ── Etat de mission (streamable en SSE, meme esprit que agent_rh.py) ─────────

def save_state(s: dict):
    STATE_TMP.write_text(json.dumps(s, ensure_ascii=False, indent=2), encoding="utf-8")
    STATE_TMP.rename(STATE_FILE)


def _log(state: dict, msg: str, kind: str = "info"):
    """Ajoute une ligne au journal de mission et persiste."""
    print(f"  [{kind}] {msg}")
    state.setdefault("steps_log", []).append({"kind": kind, "msg": msg})
    state["current_log"] = msg
    save_state(state)


# ── Etape 1 : reconstruire le relais (sortie de Computer Use) ───────────────

def build_relais(base_url: str) -> dict:
    """Assemble les deux parties du relais decrites dans le plan :

      (a) le DOCUMENT telecharge par Computer Use (PDF -> .txt extrait) ;
      (b) les NOTES / extraits releves pendant la navigation (texte).

    Si Computer Use n'a pas encore tourne, on degrade proprement : le document
    est vide et les notes sont reconstituees a partir du dossier crawlable.
    """
    document_text = ""
    document_name = None
    notes: list[str] = []
    metadata = {"source": "computer_use", "mission": None}

    if RELAIS_FILE.exists():
        try:
            relais = json.loads(RELAIS_FILE.read_text(encoding="utf-8"))
        except Exception:
            relais = {}
        metadata["mission"] = relais.get("current_log")
        # (a) document extrait par Computer Use
        txt_path = relais.get("txt")
        if txt_path and Path(txt_path).exists():
            document_text = Path(txt_path).read_text(encoding="utf-8")
            document_name = Path(txt_path).name
        # (b) notes / extraits collectes
        for r in relais.get("results", []):
            if r.get("type") == "download":
                notes.append(f"Document telecharge : {Path(r['pdf']).name} "
                             f"(extrait: {r.get('preview', '')[:200]}...)")
            elif r.get("label"):
                notes.append(f"{r['label']} : {r.get('valeur', '')} ({r.get('url', '')})")

    # A defaut de document telecharge, on prend le texte de reference du contrat
    # prevoyance depuis le dossier (le meme que Computer Use aurait ramene).
    if not notes:
        notes.append("Aucune note Computer Use trouvee : analyse du dossier crawlable en l'etat.")

    return {
        "document_text": document_text,
        "document_name": document_name,
        "notes": notes,
        "metadata": metadata,
    }


# ── Etape 2 : outils "fonction" exposant le moteur deterministe a l'agent ────
# Le modele ne recalcule pas seul les passifs : il APPELLE ces fonctions
# verifiees (function calling). C'est la materialisation du principe
# "le code calcule, le modele redige".

def _tool_definitions(verify_web: bool = False) -> list[dict]:
    """Outils exposes a l'agent.

    `verify_web=True` ajoute google_search + url_context (confirmation live des
    parametres sur BOSS/Legifrance). Ces outils sont les plus lents/couteux :
    on les reserve au mode "rigueur" ou a la continuation (`continue_phase2`),
    pas au run demo rapide.
    """
    tools: list[dict] = [
        {"type": "code_execution"},   # pour la contradiction croisee (re-calcul Python)
    ]
    if verify_web:
        tools += [
            {"type": "google_search"},    # confirmer les parametres "a verifier" (BOSS/Legifrance)
            {"type": "url_context"},
        ]
    tools += [
        {
            "type": "function",
            "name": "get_risk_register",
            "description": ("Renvoie le risk register deterministe (fiches risque, "
                            "Deal Risk Score, exposition) calcule par le moteur d'audit Legak. "
                            "Source de verite chiffree : ne jamais inventer d'autres montants."),
            "parameters": {"type": "object", "properties": {}},
        },
        {
            "type": "function",
            "name": "get_dossier",
            "description": ("Renvoie le perimetre d'audit et le dossier crawle "
                            "(employes, bulletins, contrats) avec leurs routes sources."),
            "parameters": {"type": "object", "properties": {}},
        },
        {
            "type": "function",
            "name": "lookup_parameter",
            "description": ("Renvoie un parametre juridique versionne (time-travel) : "
                            "valeur en vigueur a une date donnee, source et statut."),
            "parameters": {
                "type": "object",
                "properties": {
                    "param_id": {"type": "string", "description": "Identifiant du parametre (ex. PSC-CADRE-MIN-TA)."},
                    "date": {"type": "string", "description": "Date d'exigibilite ISO 'YYYY-MM-DD' (optionnel)."},
                },
                "required": ["param_id"],
            },
        },
    ]
    return tools


def _dispatch_tool(name: str, args: dict, dossier: dict, register: dict) -> dict:
    """Execute une fonction custom demandee par l'agent et renvoie son resultat."""
    if name == "get_risk_register":
        return register
    if name == "get_dossier":
        return dossier
    if name == "lookup_parameter":
        pid = args.get("param_id", "")
        jour = kb.d(args.get("date")) if args.get("date") else None
        try:
            p = kb.parametre(pid, jour)
            return {"id": p.id, "libelle": p.libelle, "valeur": p.valeur,
                    "unite": p.unite, "du": p.du, "au": p.au,
                    "source": p.source, "statut": p.statut}
        except KeyError as e:
            return {"error": str(e)}
    return {"error": f"Fonction inconnue : {name}"}


# ── Instruction de mission (prompt de l'agent Antigravity) ───────────────────

SYSTEM_INSTRUCTION = (
    "Tu es le moteur d'analyse d'audit social M&A de Legak, cote 'cerveau'. "
    "Le calcul est deja fait par un moteur Python deterministe : ta mission est "
    "de VERIFIER et REDIGER, jamais d'inventer un chiffre. Regles non negociables "
    "(docs/audit) : (1) applique les textes en vigueur a la date d'exigibilite "
    "(time-travel) ; (2) l'absence de preuve n'est pas la preuve de conformite ; "
    "(3) toute conclusion doit etre tracable jusqu'a un passage source ; "
    "(4) la decision finale est humaine."
)


def _mission_input(relais: dict, register: dict, verify_web: bool = False) -> str:
    """Compose l'entree texte : instruction + notes Computer Use + register.

    Le register et le dossier sont deja EMBARQUES ci-dessous : on ne demande donc
    plus a l'agent d'appeler get_risk_register/get_dossier (round-trip inutile).
    L'etape de confirmation web (BOSS/Legifrance) n'est incluse que si
    `verify_web=True` — sinon on garde le run rapide et on la traite plus tard
    via une continuation.
    """
    notes = "\n".join(f"  - {n}" for n in relais["notes"])
    doc = relais["document_text"][:4000] if relais["document_text"] else "(aucun document extrait)"
    reg = json.dumps(register, ensure_ascii=False, indent=2)[:6000]

    etapes = [
        "1. Contradiction croisee : recalcule 1 a 2 expositions cle avec ton propre "
        "Python (code_execution) et confirme qu'elles collent au register.",
    ]
    if verify_web:
        etapes.append(
            "2. Confirme les parametres au statut 'a_verifier' (SMIC, PMSS, 1,50% TA "
            "cadres, majoration HS) via google_search/url_context sur BOSS et "
            "Legifrance ; signale tout ecart."
        )
    etapes.append(
        f"{len(etapes) + 1}. Redige, a partir des SEULS chiffres du register : "
        "(a) un executive summary M&A (go/no-go, exposition, closing blocker), "
        "(b) une recommandation SPA par risque (indemnity/escrow/CP/covenant/disclosure), "
        "(c) une clause de garantie type pour le risque le plus grave. "
        "Cite les passages sources. Reponds en francais."
    )

    return (
        SYSTEM_INSTRUCTION + "\n\n"
        "PHASE 2 — analyse deterministe apres Computer Use.\n\n"
        "NOTES relevees par Computer Use pendant la navigation du portail RH :\n"
        f"{notes}\n\n"
        "DOCUMENT extrait (contrat/attestation, texte brut) :\n"
        f"{doc}\n\n"
        "RISK REGISTER deterministe (deja calcule, source de verite ci-dessous — "
        "ne rappelle pas get_risk_register, tout est ici) :\n"
        f"{reg}\n\n"
        "A FAIRE :\n" + "\n".join(etapes)
    )


# ── Etape 3 : boucle d'interaction avec l'agent Antigravity ─────────────────

def _emit_new_steps(state: dict, interaction, seen: int) -> int:
    """Emet dans le journal les nouvelles etapes (intents/appels) de l'agent."""
    steps = getattr(interaction, "steps", []) or []
    for step in steps[seen:]:
        stype = getattr(step, "type", "")
        if stype == "function_call":
            _log(state, f"tool: {getattr(step, 'name', '?')}", "tool")
        elif stype == "model_output":
            for block in (getattr(step, "content", None) or []):
                if getattr(block, "type", "") == "text" and block.text.strip():
                    _log(state, block.text.strip()[:200], "reasoning")
    return len(steps)


def _run_agent_loop(client, state: dict, dossier: dict, register: dict,
                    first_input: str,
                    previous_interaction_id: Optional[str] = None,
                    environment: str = "remote",
                    max_turns: int = 30,
                    poll_seconds: float = 2.0,
                    verify_web: bool = False) -> dict:
    """Lance l'agent en background et pilote la boucle plan/act/observe.

    Gere : polling d'un run background, execution des function_call custom
    (les outils filesystem sont executes automatiquement par l'environnement),
    persistance de environment_id + interaction_id (etat durable natif).

    `poll_seconds` cadence le polling : plus bas = latence percue plus faible
    (on reagit plus vite a `requires_action`). `verify_web` decide si les outils
    web lents (google_search/url_context) sont exposes.
    """
    tools = _tool_definitions(verify_web)
    custom_names = {t["name"] for t in tools if t.get("type") == "function"}

    # NB : les consignes systeme sont integrees a l'entree texte (via
    # _mission_input) plutot qu'a un parametre system_instruction, plus robuste
    # vis-a-vis du schema preview de l'agent Antigravity.
    create_kwargs = dict(agent=AGENT_MODEL, input=first_input,
                         environment=environment, tools=tools,
                         background=True)
    if previous_interaction_id:
        create_kwargs["previous_interaction_id"] = previous_interaction_id

    interaction = client.interactions.create(**create_kwargs)
    state["interaction_id"] = interaction.id
    state["environment_id"] = getattr(interaction, "environment_id", None) or environment
    save_state(state)
    _log(state, f"Agent demarre (interaction {interaction.id})", "info")

    seen = 0
    for _ in range(max_turns):
        status = getattr(interaction, "status", "")
        if status == "in_progress":
            time.sleep(poll_seconds)
            interaction = client.interactions.get(id=interaction.id)
            seen = _emit_new_steps(state, interaction, seen)
            continue

        if status == "requires_action":
            seen = _emit_new_steps(state, interaction, seen)
            executed = {getattr(s, "call_id", None)
                        for s in interaction.steps if getattr(s, "type", "") == "function_result"}
            pending = [s for s in interaction.steps
                       if getattr(s, "type", "") == "function_call"
                       and s.id not in executed
                       and getattr(s, "name", "") in custom_names]
            if not pending:
                # Uniquement des outils environnement (filesystem) en attente :
                # l'environnement les execute, on continue a sonder.
                time.sleep(poll_seconds)
                interaction = client.interactions.get(id=interaction.id)
                continue
            results_input = []
            for s in pending:
                out = _dispatch_tool(s.name, s.arguments or {}, dossier, register)
                _log(state, f"reponse outil: {s.name}", "tool")
                results_input.append({"type": "function_result", "name": s.name,
                                      "call_id": s.id, "result": out})
            interaction = client.interactions.create(
                agent=AGENT_MODEL,
                previous_interaction_id=interaction.id,
                environment=state["environment_id"],
                input=results_input,
                background=True,
            )
            state["interaction_id"] = interaction.id
            save_state(state)
            seen = 0
            continue

        # Etat terminal
        break

    status = getattr(interaction, "status", "")
    output = getattr(interaction, "output_text", "") or ""
    return {"status": status, "output_text": output,
            "interaction_id": interaction.id,
            "environment_id": state.get("environment_id")}


# ── Mode demo (sans cle API / repli) ────────────────────────────────────────

def _demo_report(register: dict, dossier: dict) -> str:
    """Rapport synthetise localement a partir du register deterministe."""
    return engine.render_executive_summary(register, dossier)


# ── Orchestrateur de la phase 2 ─────────────────────────────────────────────

def run_phase2(config: dict) -> dict:
    """Point d'entree : execute la phase Antigravity apres Computer Use."""
    base_url = config.get("base_url", "http://localhost:5001")
    verify_web = bool(config.get("verify_web", False))
    poll_seconds = float(config.get("poll_seconds", 2.0))

    state = {
        "status": "running", "phase": "antigravity",
        "current_log": "Demarrage phase 2 (Antigravity)...",
        "steps_log": [], "interaction_id": None, "environment_id": None,
        "deal_risk_score": None, "report": None,
    }
    save_state(state)

    # 1) Relais Computer Use
    relais = build_relais(base_url)
    _log(state, f"Relais reconstruit ({len(relais['notes'])} note(s), "
                f"document={relais['document_name'] or 'aucun'})", "info")

    # 2) Moteur deterministe = source de verite (toujours execute)
    dossier = engine.build_dossier(base_url)
    findings = engine.run_controles(dossier)
    package = engine.build_deliverables(dossier, findings, OUTPUT_DIR)
    register = package["register"]
    state["deal_risk_score"] = register["deal_risk_score"]
    _log(state, f"Moteur deterministe : {register['nb_risques']} risque(s), "
                f"Deal Risk Score {register['deal_risk_score']}/100", "result")

    # 3) Agent Antigravity (cerveau) ou repli demo
    api_key = os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY")
    report = None
    if api_key and not config.get("demo"):
        try:
            from google import genai
            client = genai.Client(api_key=api_key)
            _log(state, "Connexion a l'agent Antigravity...", "info")
            result = _run_agent_loop(client, state, dossier, register,
                                     first_input=_mission_input(relais, register, verify_web),
                                     environment=config.get("environment", "remote"),
                                     max_turns=config.get("max_turns", 30),
                                     poll_seconds=poll_seconds,
                                     verify_web=verify_web)
            report = result["output_text"]
            state["interaction_id"] = result["interaction_id"]
            state["environment_id"] = result["environment_id"]
            if result["status"] != "completed" or not report:
                _log(state, f"Agent termine avec statut '{result['status']}' — repli demo.", "info")
                report = _demo_report(register, dossier)
        except Exception as e:
            _log(state, f"Antigravity indisponible ({e}) — mode demo.", "info")
            report = _demo_report(register, dossier)
    else:
        _log(state, "Aucune cle API — mode demo (rapport deterministe local).", "info")
        report = _demo_report(register, dossier)

    # 4) Restitution
    (OUTPUT_DIR / "rapport_final.md").write_text(report, encoding="utf-8")
    state.update({"status": "done", "report": report,
                  "current_log": f"Termine — Deal Risk Score {register['deal_risk_score']}/100"})
    save_state(state)
    return state


def continue_phase2(config: dict, task: str) -> dict:
    """Mode 'continuer' : relance une tache sur le MEME bac a sable (etat durable).

    Reutilise environment_id + previous_interaction_id de l'etat precedent :
    le document et les resultats deja calcules sont toujours dans le sandbox.
    """
    prev = json.loads(STATE_FILE.read_text(encoding="utf-8")) if STATE_FILE.exists() else {}
    env_id = prev.get("environment_id")
    prev_iid = prev.get("interaction_id")
    if not env_id or not prev_iid:
        raise RuntimeError("Aucun etat durable a continuer (lance d'abord run_phase2).")

    base_url = config.get("base_url", "http://localhost:5001")
    dossier = engine.build_dossier(base_url)
    findings = engine.run_controles(dossier)
    register = engine.build_register(findings)

    state = {**prev, "status": "running", "current_log": f"Continuation : {task}",
             "steps_log": []}
    save_state(state)

    api_key = os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GOOGLE_API_KEY requise pour continuer une mission Antigravity.")

    from google import genai
    client = genai.Client(api_key=api_key)
    # Continuation = on rouvre la memoire durable et on autorise la verification
    # web (BOSS/Legifrance) : c'est ici qu'on "revient plus tard" sur l'etape 3
    # laissee de cote pendant le run demo rapide.
    result = _run_agent_loop(client, state, dossier, register,
                             first_input=task,
                             previous_interaction_id=prev_iid,
                             environment=env_id,
                             max_turns=config.get("max_turns", 30),
                             poll_seconds=float(config.get("poll_seconds", 2.0)),
                             verify_web=True)
    state.update({"status": "done", "report": result["output_text"],
                  "interaction_id": result["interaction_id"],
                  "environment_id": result["environment_id"],
                  "current_log": "Continuation terminee."})
    save_state(state)
    return state


# ── CLI ──────────────────────────────────────────────────────────────────────

def _load_config(path: str) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8")) if Path(path).exists() else {}


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 agent_antigravity.py <config_antigravity.json> "
              "[--continue \"tache\"]")
        sys.exit(1)

    cfg = _load_config(sys.argv[1])
    if len(sys.argv) >= 4 and sys.argv[2] == "--continue":
        final = continue_phase2(cfg, sys.argv[3])
    else:
        final = run_phase2(cfg)

    print("\n" + "=" * 70)
    print(final.get("report", "(pas de rapport)"))
    print("=" * 70)
    print(f"interaction_id : {final.get('interaction_id')}")
    print(f"environment_id : {final.get('environment_id')}")
