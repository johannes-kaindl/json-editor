#!/bin/sh
# Re-vendor kit modules from ../obsidian-kit. Run after kit updates.
set -e

KIT="${KIT_DIR:-../obsidian-kit}"
# Zweite Quelle seit obsidian-kit 2ab1bb5 ("domaenenfreie pure-Teilmenge zieht nach code-kit"):
# ALLE zwoelf hier vendorten pure-Module liegen dort, nicht mehr unter obsidian-kit/src/pure/.
# Bis 2026-09-02 kopierte dieses Skript weiter von der alten Stelle und starb am ersten Modul
# — mit einem Schaden, der groesser ist als der Abbruch: `set -e` beendet den Lauf, also
# laufen die gekoppelten Module nicht mehr mit und BEIDE VENDOR.json werden nicht geschrieben.
# Die eine Datei, in der man den Vendor-Stand nachschlaegt, behauptet danach den alten — leise.
#
# obsidian-kit traegt unter src/vendor/code-kit/ eigene Kopien einiger Module; die werden hier
# bewusst NICHT genommen. Eine Zwischenkopie als Quelle zu nehmen erzeugt eine Kopier-Kette,
# und die sieht bei der naechsten Zaehlung wie ein unabhaengiger Beleg aus.
CODE_KIT="${CODE_KIT_DIR:-../../libs/code-kit}"
[ -d "$KIT/src/pure" ] || { echo "Kit nicht gefunden unter $KIT (KIT_DIR setzen)" >&2; exit 1; }
[ -d "$CODE_KIT/src/ts" ] || { echo "code-kit nicht gefunden unter $CODE_KIT (CODE_KIT_DIR setzen)" >&2; exit 1; }
# CORE-META-22: gelesen wird aus einer FESTEN REF, nicht aus dem Arbeitsstand des
# Nachbar-Repos. Ein `cp` aus dessen Worktree koppelt dieses Repo an einen fremden HEAD.
# Default ist die package.json-Version der Quelle; ein Upgrade ist eine BEWUSSTE Handlung.
VER="${KIT_REF:-0.41.1}"
CODE_VER="${CODE_KIT_REF:-0.7.0}"
for paar in "$KIT|$VER" "$CODE_KIT|$CODE_VER"; do
  repo=${paar%%|*}; ref=${paar##*|}
  git -C "$repo" rev-parse --verify --quiet "$ref^{commit}" >/dev/null || {
    echo "FEHLER: Ref '$ref' existiert nicht in $repo." >&2
    echo "  Entweder ist die Version dort ungetaggt, oder KIT_REF/CODE_KIT_REF setzen." >&2
    exit 2
  }
done
SHA=$(git -C "$KIT" rev-parse --short "$VER^{commit}")

# Ein pures Modul kann in drei Schichten liegen. Statt fester Zuordnung wird gesucht — die
# naechste Umschichtung soll dieses Skript nicht wieder toeten, sondern nur einen anderen
# Fundort ergeben. Ausgabe: <pfad>|<quelle>|<quell-relativer-pfad>|<version>
# Ausgabe: <repo>|<ref>|<quelle>|<quell-relativer-pfad>|<version>
quelle_fuer() {
  for kandidat in \
    "$KIT|$VER|obsidian-kit|src/pure/$1.ts|$VER" \
    "$CODE_KIT|$CODE_VER|code-kit|src/ts/pure/$1.ts|$CODE_VER" \
    "$CODE_KIT|$CODE_VER|code-kit|src/ts/web/$1.ts|$CODE_VER"; do
    repo=$(printf '%s' "$kandidat" | cut -d'|' -f1)
    ref=$(printf '%s' "$kandidat" | cut -d'|' -f2)
    rel=$(printf '%s' "$kandidat" | cut -d'|' -f4)
    # In der REF nachsehen, nicht im Worktree — sonst faende die Suche eine Datei, die der
    # Lesevorgang danach nicht bekommt.
    if git -C "$repo" cat-file -e "$ref:$rel" 2>/dev/null; then
      printf '%s\n' "$kandidat"; return 0
    fi
  done
  return 1
}

# In eine .tmp lesen und erst bei Erfolg verschieben — eine Ausgabe-Umleitung legt die
# Zieldatei an, BEVOR der Lesebefehl laeuft, und hinterlaesst sonst einen Torso, der mit
# Stempelzeile wie ein gueltiges Vendoring aussieht.
hole() { # hole <repo> <ref> <quell-pfad> <ziel>
  git -C "$1" show "$2:$3" > "$4.tmp" || { rm -f "$4.tmp"; return 1; }
  mv "$4.tmp" "$4"
}

stamp() { # stamp <vendored-file> <quell-relativer-pfad> [<quelle> <version>]
  quelle=${3:-obsidian-kit}
  version=${4:-$VER}
  header="// vendored from $quelle@$version, $2 — do not hand-edit; re-vendor via tools/sync-kit.sh"
  printf '%s\n' "$header" | cat - "$1" > "$1.tmp"
  mv "$1.tmp" "$1"
}

# Kit-interne Querimporte aufs Vendor-Layout umschreiben. Im Kit liegen die Schichten als
# src/obsidian + src/pure nebeneinander, hier als src/vendor/kit-obsidian + src/vendor/kit —
# `../pure/` zeigt hier also ins Leere. Das ist die EINZIGE zulaessige Abweichung von verbatim;
# bei jedem Re-Vendor reproduzieren, sonst darf nichts abweichen.
# Praezedenz: kuro-gamification, markdown-presentation, vault-crews, vim-dojo (seit 0.26.0) —
# neun Importzeilen, in allen vier byte-identisch (md5 3aad7dd28a3a9875a3015a07bb78fc99).
relayer() { # relayer <vendored-file>
  f=$1

  # (0) VORBEDINGUNG. Der Umschrieb setzt die Zwei-Ordner-Form der Kit-README voraus. Ohne sie
  #     zeigt `../kit/` von src/vendor/kit/ aus auf DIE DATEI SELBST — und weil obsidian/clipboard.ts
  #     und pure/clipboard.ts denselben Basenamen tragen, faellt das erst im Typecheck auf (TS2305).
  #     Laut abbrechen statt still falsch vendorieren.
  case "$f" in
    src/vendor/kit-obsidian/*) ;;
    *) echo "sync-kit: $f liegt nicht in src/vendor/kit-obsidian/ — der Querimport-Umschrieb setzt die Zwei-Ordner-Form voraus (obsidian-kit/README.md)" >&2; exit 1 ;;
  esac
  [ -d src/vendor/kit ] || { echo "sync-kit: src/vendor/kit/ fehlt — pure-Schicht anlegen, bevor gekoppelte Module mit Querimport vendoriert werden" >&2; exit 1; }

  # (1) Umschreiben, und feststellen OB umgeschrieben wurde. `cmp` statt md5: portabel,
  #     macOS (md5) und GitHub-CI (md5sum) heissen verschieden.
  # ZWEI Muster, seit obsidian-kit 2ab1bb5: die gekoppelte Schicht importierte frueher
  # `../pure/x`, seit dem code-kit-Umzug importiert sie `../vendor/code-kit/{pure,web}/x`.
  # Beide muessen auf `../kit/` zeigen, denn hier liegt die pure Schicht flach unter
  # src/vendor/kit/ — egal aus welcher Quelle das Modul stammt. Wer nur das alte Muster
  # kennt, laesst den neuen Import stehen: er zeigt ins Leere, und der Fehler erscheint
  # nicht hier, sondern als "Unsafe call of a type that could not be resolved" im Lint
  # einer ganz anderen Datei (gemessen 2026-09-02 an kit-obsidian/clipboard.ts).
  sed -e 's|\(["'"'"']\)\.\./pure/|\1../kit/|g' \
      -e 's|\(["'"'"']\)\.\./vendor/code-kit/pure/|\1../kit/|g' \
      -e 's|\(["'"'"']\)\.\./vendor/code-kit/web/|\1../kit/|g' "$f" > "$f.tmp"
  if cmp -s "$f" "$f.tmp"; then rm -f "$f.tmp"; return 0; fi   # nichts zu tun, KEINE Notiz
  mv "$f.tmp" "$f"

  # (2) Gegenprobe: bleibt eines der Muster stehen, bricht der Build spaeter und woanders.
  if grep -qE '\.\./(pure|vendor/code-kit)/' "$f"; then
    echo "sync-kit: unaufgeloester Kit-Querimport in $f — Muster pruefen" >&2; exit 1
  fi

  # (3) Mitvendorier-Gegenprobe: jedes umgeschriebene Ziel muss auch wirklich da sein.
  for dep in $(sed -n 's|.*from ["'"'"']\.\./kit/\([A-Za-z0-9_/-]*\)["'"'"'].*|\1|p' "$f" | sort -u); do
    [ -f "src/vendor/kit/$dep.ts" ] || {
      echo "sync-kit: $f importiert ../kit/$dep, aber src/vendor/kit/$dep.ts fehlt — mitvendorieren" >&2; exit 1
    }
  done

  note="// ONE mechanical deviation from verbatim: kit-internal imports (../pure/ and ../vendor/code-kit/{pure,web}/) → ../kit/ (vendor layout); reproduce on every re-vendor, nothing else may differ."
  printf '%s\n' "$note" | cat - "$f" > "$f.tmp"
  mv "$f.tmp" "$f"
}

# Zweite Fallgruppe: ein PURE_MODULE, das selbst aus obsidian-kit/src/pure/ stammt, aber einen
# Querimport auf code-kit traegt (dessen eigene Vendor-Kopie unter obsidian-kit/src/vendor/code-kit/
# liegt). Hier landen BEIDE Seiten flach nebeneinander in src/vendor/kit/ — der Zielpfad ist also
# NICHT ../kit/ (das waere fuer kit-obsidian/, das eine Ebene hoeher liegt), sondern ./ (Geschwisterdatei
# in derselben Ablage). Anlass: endpoint-source.ts importiert endpoint_config aus
# ../vendor/code-kit/pure/ (obsidian-kit-Perspektive) — Praezedenz: llm-endpoint-manager/tools/sync-kit.sh.
relayer_pure() { # relayer_pure <vendored-file>
  f=$1
  case "$f" in
    src/vendor/kit/*) ;;
    *) echo "sync-kit: $f liegt nicht in src/vendor/kit/ — relayer_pure gilt nur fuer die pure-Schicht" >&2; exit 1 ;;
  esac

  sed -e 's|\(["'"'"']\)\.\./vendor/code-kit/pure/|\1./|g' \
      -e 's|\(["'"'"']\)\.\./vendor/code-kit/web/|\1./|g' "$f" > "$f.tmp"
  if cmp -s "$f" "$f.tmp"; then rm -f "$f.tmp"; return 0; fi   # nichts zu tun, KEINE Notiz
  mv "$f.tmp" "$f"

  if grep -qE '\.\./vendor/code-kit/' "$f"; then
    echo "sync-kit: unaufgeloester Kit-Querimport in $f — Muster pruefen" >&2; exit 1
  fi

  for dep in $(sed -n 's|.*from ["'"'"']\./\([A-Za-z0-9_/-]*\)["'"'"'].*|\1|p' "$f" | sort -u); do
    [ -f "src/vendor/kit/$dep.ts" ] || {
      echo "sync-kit: $f importiert ./$dep, aber src/vendor/kit/$dep.ts fehlt — mitvendorieren" >&2; exit 1
    }
  done

  note="// ONE mechanical deviation from verbatim: kit-internal import (../vendor/code-kit/{pure,web}/) → ./ (flat vendor layout, sibling module in src/vendor/kit/); reproduce on every re-vendor, nothing else may differ."
  printf '%s\n' "$note" | cat - "$f" > "$f.tmp"
  mv "$f.tmp" "$f"
}

# Einzeldatei-Modus: MODULE=<name> REF=<tag> sh tools/sync-kit.sh --single
#
# Holt GENAU EINE Datei aus einer eigenen, festen Ref, ohne die gemeinsame VER/CODE_VER der
# Sammelliste zu beruehren — der Normalfall (oben) berechnet eine VER fuer PURE_MODULE +
# OBSIDIAN_MODULE zusammen; wer eine einzelne Datei aus einem NEUEREN Tag holen will, wuerde
# damit ungewollt alle uebrigen Module mit anheben. Herkunft: koda-agent `dd55354` (Handarbeit,
# weil dieser Modus noch fehlte) — hier als wiederverwendbarer Modus, weil `tools/sync-kit.sh`
# in lingotuner die Vorlage ist, aus der yijing-oracle, slide-deck und koda-agent kopiert haben.
# Ergebnis landet unter "vendored_mixed_version" in der jeweiligen VENDOR.json (eigenes Feld,
# eigene version/sha je Eintrag) — "version"/"sha" der Sammelliste bleiben unangetastet.
single_vendor() {
  : "${MODULE:?MODULE=<name> setzen (z. B. explain-texts)}"
  : "${REF:?REF=<tag> setzen (z. B. 0.38.0)}"

  git -C "$KIT" rev-parse --verify --quiet "$REF^{commit}" >/dev/null || {
    echo "FEHLER: Ref '$REF' existiert nicht in $KIT (REF pruefen)." >&2
    exit 2
  }
  sha_single=$(git -C "$KIT" rev-parse --short "$REF^{commit}")

  # Nur obsidian-kit selbst, nicht code-kit — der Anlassfall (explain-texts) ist ein neues
  # Kit-Modul; code-kit brauchte bislang keinen Einzeldatei-Zugriff. Erweitern, sobald es
  # einen zweiten Anlassfall gibt (nicht vorab bauen, CORE-AGENT-07).
  if git -C "$KIT" cat-file -e "$REF:src/pure/$MODULE.ts" 2>/dev/null; then
    rel="src/pure/$MODULE.ts"; ziel="src/vendor/kit/$MODULE.ts"; schicht=pure
  elif git -C "$KIT" cat-file -e "$REF:src/obsidian/$MODULE.ts" 2>/dev/null; then
    rel="src/obsidian/$MODULE.ts"; ziel="src/vendor/kit-obsidian/$MODULE.ts"; schicht=obsidian
  else
    echo "FEHLER: $MODULE.ts liegt in $KIT@$REF weder unter src/pure/ noch src/obsidian/." >&2
    exit 2
  fi

  mkdir -p src/vendor/kit src/vendor/kit-obsidian
  hole "$KIT" "$REF" "$rel" "$ziel" || {
    echo "FEHLER: $REF:$rel nicht lesbar in $KIT" >&2; exit 2; }
  # Querimport-Umschrieb wie im Sammellauf — no-op, wenn die Datei keinen traegt (beide
  # Funktionen pruefen selbst per cmp und schreiben nur bei tatsaechlicher Aenderung eine
  # Notiz).
  if [ "$schicht" = pure ]; then relayer_pure "$ziel"; else relayer "$ziel"; fi
  stamp "$ziel" "$rel" obsidian-kit "$REF"

  if [ "$schicht" = pure ]; then vendorjson=src/vendor/kit/VENDOR.json; else vendorjson=src/vendor/kit-obsidian/VENDOR.json; fi
  python3 - "$MODULE.ts" "$rel" "$REF" "$sha_single" "$vendorjson" <<'PY'
import json
import pathlib
import sys

name, rel, ref, sha, path = sys.argv[1:6]
p = pathlib.Path(path)
data = json.loads(p.read_text())
entries = data.setdefault("vendored_mixed_version", [])
modul = name[:-3] if name.endswith(".ts") else name
entry = {
    "file": name,
    "version": ref,
    "sha": sha,
    "note": (
        f"Einzeln vendoriert (git show {ref}:{rel}), NICHT ueber die gemeinsame "
        "PURE_MODULE/OBSIDIAN_MODULE-Liste von tools/sync-kit.sh — ein Lauf ohne --single "
        "haette beim Aufnehmen dieser Datei alle anderen Module ebenfalls auf diese Ref "
        f"gehoben. Re-vendor mit MODULE={modul} REF=<neuer-tag> sh tools/sync-kit.sh "
        "--single; Kopf-Stempel und dieser Eintrag ziehen automatisch nach."
    ),
}
entries[:] = [e for e in entries if e.get("file") != name] + [entry]
p.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
PY

  echo "vendored (single) obsidian-kit@$REF/$rel → $ziel"
}

case "${1:-}" in
  --single) single_vendor; exit 0 ;;
esac

mkdir -p src/vendor/kit src/vendor/kit-obsidian

PURE_MODULE="clipboard settings endpoint endpoint_config endpoint_diagnostics model-choice model-list-cache reasoning capabilities sampling-profiles endpoint-source diff"
# Die gekoppelte Schicht (importiert `obsidian`). stable-writer traegt einen Querimport auf
# ../vendor/code-kit/pure/stream-blocks und braucht deshalb den relayer (Fallgruppe unten);
# endpoint-source ebenso (../pure/endpoint-source + ../vendor/code-kit/pure/*).
# request-section/request-session/thinking-control ebenso, Querimport auf
# ../vendor/code-kit/pure/sampling-profiles (Sampling-Profile-Welle, Teil D 2026-09-23).
OBSIDIAN_MODULE="clipboard endpoint-list model-picker endpoint-source request-section request-session collapsible"

# Die "vendored"-Zeile der VENDOR.json wird aus derselben Liste erzeugt, aus der kopiert wird.
# Zwei Orte fuer dieselbe Wahrheit driften (CORE-META-16) — und zwar leise: die Datei, in der
# man den Vendor-Stand nachschlaegt, waere dann die einzige, die ihn falsch nennt.
liste() { for m in $1; do printf '%s.ts, ' "$m"; done | sed 's/, $//'; }

# Erst ALLE Quellen aufloesen, dann kopieren: ein fehlendes Modul ist ein Aufbaufehler und
# wird als solcher gemeldet, statt den Lauf auf halber Strecke abzubrechen.
for m in $PURE_MODULE; do
  quelle_fuer "$m" >/dev/null || {
    echo "FEHLER: $m.ts liegt weder in $KIT/src/pure/ noch in $CODE_KIT/src/ts/{pure,web}/." >&2
    echo "  Seit obsidian-kit 2ab1bb5 ist code-kit die Quelle der domaenenfreien Module." >&2
    exit 2
  }
done

for m in $PURE_MODULE; do
  fund=$(quelle_fuer "$m")
  repo=$(printf '%s' "$fund" | cut -d'|' -f1)
  ref=$(printf '%s' "$fund" | cut -d'|' -f2)
  quelle=$(printf '%s' "$fund" | cut -d'|' -f3)
  rel=$(printf '%s' "$fund" | cut -d'|' -f4)
  ver=$(printf '%s' "$fund" | cut -d'|' -f5)
  hole "$repo" "$ref" "$rel" "src/vendor/kit/$m.ts" || {
    echo "FEHLER: $ref:$rel nicht lesbar in $repo" >&2; exit 2; }
  # endpoint-source.ts (obsidian-kit/src/pure/) traegt einen Querimport auf code-kit, dessen
  # obsidian-kit-eigene Vendor-Kopie hier nicht existiert — auf die flache Ablage umschreiben.
  case "$m" in endpoint-source) relayer_pure "src/vendor/kit/$m.ts" ;; esac
  stamp "src/vendor/kit/$m.ts" "$rel" "$quelle" "$ver"
  echo "vendored $quelle@$ver/$rel"
done

for m in $OBSIDIAN_MODULE; do
  hole "$KIT" "$VER" "src/obsidian/$m.ts" "src/vendor/kit-obsidian/$m.ts" || {
    echo "FEHLER: $VER:src/obsidian/$m.ts nicht lesbar" >&2; exit 2; }
  # clipboard.ts, endpoint-list.ts, model-picker.ts, stable-writer.ts und endpoint-source.ts
  # tragen Querimporte auf ../vendor/code-kit/{pure,web}/ bzw. ../pure/. Ein pauschaler Aufruf
  # waere wirkungslos, aber irrefuehrend — deshalb gezielt.
  case "$m" in clipboard|endpoint-list|model-picker|stable-writer|endpoint-source|request-section|request-session|thinking-control) relayer "src/vendor/kit-obsidian/$m.ts" ;; esac
  stamp "src/vendor/kit-obsidian/$m.ts" "src/obsidian/$m.ts"
  echo "vendored obsidian-kit@$VER/obsidian/$m.ts"
done

cat > src/vendor/kit/VENDOR.json <<JSON
{
  "source": "obsidian-kit",
  "version": "$VER",
  "sha": "$SHA",
  "code_kit_version": "$CODE_VER",
  "vendored": "$(liste "$PURE_MODULE")",
  "note": "Verbatim snapshot aus ZWEI Quellen (obsidian-kit + code-kit); welche Datei woher stammt, sagt ihr eigener Kopf. Never hand-edit. Re-vendor via tools/sync-kit.sh. version/sha gelten AUSSCHLIESSLICH fuer die unter \"vendored\" gelisteten Dateien. settings_walker.ts liegt ebenfalls hier, ist NICHT gepinnt und wird von diesem Skript NICHT erfasst: es traegt eine deklarierte Abweichung (der \"folder\"-Zweig ist entfernt, damit FolderSuggest nicht nachgezogen wird) und entspricht keinem Kit-Tag — s. Kopf der Datei. kit-obsidian/ siehe dortige VENDOR.json."
}
JSON
cat > src/vendor/kit-obsidian/VENDOR.json <<JSON
{
  "source": "obsidian-kit",
  "version": "$VER",
  "sha": "$SHA",
  "vendored": "$(liste "$OBSIDIAN_MODULE")",
  "note": "Verbatim snapshot. Never hand-edit. Re-vendor via tools/sync-kit.sh. version/sha gelten AUSSCHLIESSLICH fuer die unter \"vendored\" gelisteten Dateien. clipboard.ts, endpoint-list.ts, model-picker.ts und stable-writer.ts tragen EINE mechanische Abweichung: kit-interne Importe ../vendor/code-kit/{pure,web}/ sind auf ../kit/ umgeschrieben (Vendor-Layout). Bei jedem Re-Vendoring reproduzieren; sonst darf nichts abweichen. Praezedenz: vim-dojo, markdown-presentation, vault-crews, kuro-gamification. Eigene Ablage neben src/vendor/kit/, weil diese Module \"obsidian\" importieren."
}
JSON
echo "VENDOR.json → $VER ($SHA)"
