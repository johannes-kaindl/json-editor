// Texte der Reparatur-Funktion. Die Texte der Verbindung (Endpunkt-Quelle, Endpunkt-Liste,
// Abschnitt "Anfrage", Abweichungen) kommen seit dem Verbindungs-Tausch aus dem Kit
// (`llm-connection-strings`) und stehen hier nicht mehr. Die uebrige Oberflaeche des Plugins
// ist englisch und steht weiter inline; nur die neue Funktion ist zweisprachig.
import { defineStrings } from "../vendor/kit/i18n";

export const STRINGS = {
  en: {
    "request.dropped": "{0} saved request setting(s) were invalid and were reset to the profile.",
    "set.groupRepair": "Repair with an LLM",
    "repair.button": "Repair",
    "repair.buttonTip": "Repair this JSON with an LLM — you confirm a diff first",
    "repair.cmd": "Repair JSON in the current code block",
    "repair.title": "Repair JSON",
    "repair.error": "Parser error: {0}",
    "repair.original": "Original",
    "repair.proposal": "Proposal",
    "repair.working": "Asking the model…",
    "repair.apply": "Apply",
    "repair.retry": "Try again",
    "repair.discard": "Discard",
    "repair.noChanges": "The model returned the document unchanged.",
    "repair.invalid": "The model's answer is not valid JSON: {0}",
    "repair.noEndpoint": "No reachable LLM endpoint — set one up in the plugin settings.",
    "repair.noEndpointSecretMissing":
      "The endpoint's API key is missing in the LLM Endpoint Manager.",
    "repair.http": "The endpoint answered with an error ({0}): {1}",
    "repair.network": "The endpoint could not be reached.",
    "repair.timeout": "The model did not answer in time.",
    "repair.empty": "The model returned no answer.",
    "repair.notInBlock": "The cursor is not inside a ```json or ```jsonc code block.",
    "repair.alreadyValid": "This code block is already valid JSON — nothing to repair.",
    "repair.applied": "Code block repaired.",
    "repair.stale":
      "The note changed since the request — nothing was written. Run the repair again.",
    "repair.appliedFile": "JSON file repaired — undo restores the old text.",
    "repair.staleFile":
      "The file changed since the request — nothing was written. Run the repair again.",
    "repair.noFile": "The note behind this code block could not be found.",
    "repair.aria.left": "Original code",
    "repair.aria.right": "Proposed repair",
  },
  de: {
    "request.dropped":
      "{0} gespeicherte Anfrage-Einstellung(en) waren ungültig und wurden auf den Profilwert zurückgesetzt.",
    "set.groupRepair": "Reparatur per LLM",
    "repair.button": "Reparieren",
    "repair.buttonTip": "Dieses JSON per LLM reparieren — vorher bestätigst du einen Diff",
    "repair.cmd": "JSON im aktuellen Codeblock reparieren",
    "repair.title": "JSON reparieren",
    "repair.error": "Parser-Fehler: {0}",
    "repair.original": "Original",
    "repair.proposal": "Vorschlag",
    "repair.working": "Das Modell wird gefragt …",
    "repair.apply": "Anwenden",
    "repair.retry": "Neu versuchen",
    "repair.discard": "Verwerfen",
    "repair.noChanges": "Das Modell hat das Dokument unverändert zurückgegeben.",
    "repair.invalid": "Die Antwort des Modells ist kein gültiges JSON: {0}",
    "repair.noEndpoint":
      "Kein erreichbarer LLM-Endpunkt — richte einen in den Plugin-Einstellungen ein.",
    "repair.noEndpointSecretMissing":
      "Der API-Schlüssel des Endpunkts fehlt im LLM Endpoint Manager.",
    "repair.http": "Der Endpunkt antwortete mit einem Fehler ({0}): {1}",
    "repair.network": "Der Endpunkt war nicht erreichbar.",
    "repair.timeout": "Das Modell hat nicht rechtzeitig geantwortet.",
    "repair.empty": "Das Modell hat keine Antwort geliefert.",
    "repair.notInBlock": "Der Cursor steht nicht in einem ```json- oder ```jsonc-Codeblock.",
    "repair.alreadyValid": "Dieser Codeblock ist bereits gültiges JSON — nichts zu reparieren.",
    "repair.applied": "Codeblock repariert.",
    "repair.stale":
      "Die Notiz hat sich seit der Anfrage geändert — es wurde nichts geschrieben. Starte die Reparatur neu.",
    "repair.appliedFile": "JSON-Datei repariert — Rückgängig stellt den alten Text wieder her.",
    "repair.staleFile":
      "Die Datei hat sich seit der Anfrage geändert — es wurde nichts geschrieben. Starte die Reparatur neu.",
    "repair.noFile": "Die Notiz zu diesem Codeblock wurde nicht gefunden.",
    "repair.aria.left": "Originalcode",
    "repair.aria.right": "Vorgeschlagene Reparatur",
  },
};

defineStrings(STRINGS);
