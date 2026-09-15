#!/bin/sh
# Re-vendor kit modules from ../obsidian-kit. Run after kit updates.
set -e

KIT="${KIT_DIR:-../obsidian-kit}"
# Zweite Quelle seit obsidian-kit 2ab1bb5 ("domaenenfreie pure-Teilmenge zieht nach code-kit"):
# BEIDE hier vendorten pure-Module liegen dort (settings in src/ts/pure, clipboard in
# src/ts/web), nicht mehr unter obsidian-kit/src/pure/. Bis 2026-09-03 kopierte dieses Skript
# weiter von der alten Stelle und starb am ersten Modul — mit einem Schaden, der groesser ist
# als der Abbruch: `set -e` beendet den Lauf, also lief die gekoppelte Schicht nicht mehr mit
# und VENDOR.json wurde gar nicht erst geschrieben. Die eine Datei, in der man den
# Vendor-Stand nachschlaegt, behauptet danach den alten — leise.
#
# Bewusst NICHT genommen: obsidian-kit traegt unter src/vendor/code-kit/ eigene Kopien.
# Eine Zwischenkopie als Quelle erzeugt eine Kopier-Kette, und die sieht bei der naechsten
# Zaehlung wie ein unabhaengiger Beleg aus (Dach-AGENTS, Kit-first Punkt 1).
CODE_KIT="${CODE_KIT_DIR:-../../libs/code-kit}"
[ -d "$CODE_KIT/src/ts" ] || { echo "code-kit nicht gefunden unter $CODE_KIT (CODE_KIT_DIR setzen)" >&2; exit 1; }
[ -d "$KIT/src/pure" ] || { echo "Kit nicht gefunden unter $KIT (KIT_DIR setzen)" >&2; exit 1; }
# Gelesen wird aus einer festen Ref, nicht aus dem Arbeitsstand des Nachbar-Repos
# (CORE-META-22). Umgestellt 2026-09-07; vorher las dieses Skript per `cp` aus $KIT/
# und stempelte mit `rev-parse HEAD`.
#
# Der Schaden war beim Umstellen messbar: beide VENDOR.json paarten
# "version": "0.30.0" mit "sha": "994efeb" — Tag 0.30.0 zeigt aber auf 6e571a4.
# Gestempelt war der HEAD des Kit-Arbeitsverzeichnisses, einen Commit hinter dem
# Tag. Version und SHA widersprachen sich, und nur die SHA war wahr.
KIT_REF=${KIT_REF:-0.30.0}
CODE_KIT_REF=${CODE_KIT_REF:-0.5.0}

for paar in "$KIT|$KIT_REF" "$CODE_KIT|$CODE_KIT_REF"; do
  repo=${paar%%|*}; ref=${paar##*|}
  git -C "$repo" rev-parse --verify --quiet "$ref^{commit}" >/dev/null \
    || { echo "FEHLER: Ref '$ref' existiert nicht in $repo (KIT_REF/CODE_KIT_REF setzen)." >&2; exit 1; }
done

# ^{commit} ist Pflicht: bei einem annotierten Tag liefert rev-parse sonst das
# Tag-OBJEKT, und in der VENDOR.json steht eine SHA, die im `git log` der Quelle
# gar nicht vorkommt (gemessen an code-kit 0.5.0, 2026-09-02).
VER=$(git -C "$KIT" describe --tags --abbrev=0 "$KIT_REF")
SHA=$(git -C "$KIT" rev-parse --short "$KIT_REF^{commit}")
CODE_VER=$(git -C "$CODE_KIT" describe --tags --abbrev=0 "$CODE_KIT_REF")

# Ein pures Modul kann in drei Schichten liegen. Statt fester Zuordnung wird gesucht — die
# naechste Umschichtung soll dieses Skript nicht wieder toeten, sondern nur einen anderen
# Fundort ergeben. Ausgabe: <pfad>|<quelle>|<quell-relativer-pfad>|<version>
# Gesucht wird in der REF, nicht auf der Platte: `[ -f ]` haette gefunden, was im
# Arbeitsverzeichnis des Kits gerade liegt — auch eine Datei, die es im gepinnten
# Stand nie gab. Ausgabe: <repo>|<quelle>|<quell-relativer-pfad>|<version>|<ref>
quelle_fuer() {
  for kandidat in \
    "$KIT|obsidian-kit|src/pure/$1.ts|$VER|$KIT_REF" \
    "$CODE_KIT|code-kit|src/ts/pure/$1.ts|$CODE_VER|$CODE_KIT_REF" \
    "$CODE_KIT|code-kit|src/ts/web/$1.ts|$CODE_VER|$CODE_KIT_REF"; do
    k_repo=$(printf '%s' "$kandidat" | cut -d'|' -f1)
    k_pfad=$(printf '%s' "$kandidat" | cut -d'|' -f3)
    k_ref=$(printf '%s' "$kandidat" | cut -d'|' -f5)
    if git -C "$k_repo" cat-file -e "$k_ref:$k_pfad" 2>/dev/null; then
      printf '%s\n' "$kandidat"; return 0
    fi
  done
  return 1
}

# vendor_aus_ref <ziel> <repo> <ref> <quell-pfad>
# Schreibt ERST nach .tmp: `git show ... > ziel` legt die Datei an, BEVOR git show
# laeuft — fehlt die Quelle, bleibt ein Stummel liegen, der wie ein Vendoring aussieht.
vendor_aus_ref() {
  git -C "$2" show "$3:$4" > "$1.tmp" || {
    rm -f "$1.tmp"
    echo "FEHLER: $4 fehlt in $2@$3 — nichts geschrieben." >&2
    exit 1
  }
  mv "$1.tmp" "$1"
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
# Praezedenz: kuro-gamification, markdown-presentation, vault-crews, vim-dojo (seit 0.26.0).
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
  # Wer nur das alte kennt, laesst den neuen Import stehen — er zeigt ins Leere, und der
  # Fehler erscheint als "Unsafe call of a type that could not be resolved" im Lint einer
  # anderen Datei (gemessen 2026-09-02 an obsidian-transmute).
  sed -e 's|\(["'"'"']\)\.\./pure/|\1../kit/|g' \
      -e 's|\(["'"'"']\)\.\./vendor/code-kit/pure/|\1../kit/|g' \
      -e 's|\(["'"'"']\)\.\./vendor/code-kit/web/|\1../kit/|g' "$f" > "$f.tmp"
  if cmp -s "$f" "$f.tmp"; then rm -f "$f.tmp"; return 0; fi   # nichts zu tun, KEINE Notiz
  mv "$f.tmp" "$f"

  # (2) Gegenprobe: bleibt ein ../pure/ stehen, bricht der Build spaeter und woanders.
  if grep -qE '\.\./(pure|vendor/code-kit)/' "$f"; then
    echo "sync-kit: unaufgeloester Kit-Querimport in $f — Muster pruefen" >&2; exit 1
  fi

  # (3) Mitvendorier-Gegenprobe: jedes umgeschriebene Ziel muss auch wirklich da sein.
  for dep in $(sed -n 's|.*from ["'"'"']\.\./kit/\([A-Za-z0-9_/-]*\)["'"'"'].*|\1|p' "$f" | sort -u); do
    [ -f "src/vendor/kit/$dep.ts" ] || {
      echo "sync-kit: $f importiert ../kit/$dep, aber src/vendor/kit/$dep.ts fehlt — mitvendorieren" >&2; exit 1
    }
  done

  note="// ONE mechanical deviation from verbatim: kit-internal imports ../pure/ → ../kit/ (vendor layout); reproduce on every re-vendor, nothing else may differ."
  printf '%s\n' "$note" | cat - "$f" > "$f.tmp"
  mv "$f.tmp" "$f"
}

mkdir -p src/vendor/kit src/vendor/kit-obsidian

# settings_walker.ts liegt ebenfalls unter src/vendor/kit/, wird hier aber BEWUSST NICHT
# erfasst: es ist eine deklarierte Uebernahme mit inhaltlicher Abweichung (der "folder"-Zweig
# ist entfernt), kein Verbatim-Snapshot. Siehe Kopf der Datei und die note in VENDOR.json.
PURE_MODULE="clipboard settings"

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
  q_repo=$(printf '%s' "$fund" | cut -d'|' -f1)
  quelle=$(printf '%s' "$fund" | cut -d'|' -f2)
  rel=$(printf '%s' "$fund" | cut -d'|' -f3)
  ver=$(printf '%s' "$fund" | cut -d'|' -f4)
  q_ref=$(printf '%s' "$fund" | cut -d'|' -f5)
  vendor_aus_ref "src/vendor/kit/$m.ts" "$q_repo" "$q_ref" "$rel"
  stamp "src/vendor/kit/$m.ts" "$rel" "$quelle" "$ver"
  echo "vendored $quelle@$ver/$rel"
done

for m in clipboard; do
  vendor_aus_ref "src/vendor/kit-obsidian/$m.ts" "$KIT" "$KIT_REF" "src/obsidian/$m.ts"
  relayer "src/vendor/kit-obsidian/$m.ts"
  stamp "src/vendor/kit-obsidian/$m.ts" "src/obsidian/$m.ts"
  echo "vendored obsidian-kit@$VER/obsidian/$m.ts"
done

cat > src/vendor/kit/VENDOR.json <<JSON
{
  "source": "obsidian-kit",
  "version": "$VER",
  "sha": "$SHA",
  "code_kit_version": "$CODE_VER",
  "vendored": "clipboard.ts, settings.ts",
  "note": "Verbatim snapshot aus ZWEI Quellen (obsidian-kit + code-kit); welche Datei woher stammt, sagt ihr eigener Kopf. Never hand-edit. Re-vendor via tools/sync-kit.sh. version/sha gelten AUSSCHLIESSLICH fuer die unter \"vendored\" gelisteten Dateien. settings_walker.ts liegt ebenfalls hier, ist NICHT gepinnt und wird von diesem Skript NICHT erfasst: es traegt eine deklarierte Abweichung (der \"folder\"-Zweig ist entfernt, damit FolderSuggest nicht nachgezogen wird) und entspricht keinem Kit-Tag (tools/pin_find.py: KEIN MATCH) — s. Kopf der Datei. kit-obsidian/ siehe dortige VENDOR.json."
}
JSON
cat > src/vendor/kit-obsidian/VENDOR.json <<JSON
{
  "source": "obsidian-kit",
  "version": "$VER",
  "sha": "$SHA",
  "vendored": "clipboard.ts",
  "note": "Verbatim snapshot. Never hand-edit. Re-vendor via tools/sync-kit.sh. version/sha gelten AUSSCHLIESSLICH fuer die unter \"vendored\" gelisteten Dateien. clipboard.ts traegt EINE mechanische Abweichung: der kit-interne Import ../pure/clipboard ist auf ../kit/clipboard umgeschrieben (Vendor-Layout). Bei jedem Re-Vendoring reproduzieren; sonst darf nichts abweichen. Praezedenz: vim-dojo, markdown-presentation, vault-crews, kuro-gamification. Eigene Ablage neben src/vendor/kit/, weil dieses Modul \"obsidian\" importiert."
}
JSON
echo "VENDOR.json → $VER ($SHA)"
