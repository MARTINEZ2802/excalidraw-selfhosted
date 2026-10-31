#!/usr/bin/env bash
# Compila Excalidraw (con login + carpetas en Supabase) apuntando al servidor de salas propio.
set -euo pipefail

: "${VITE_APP_WS_SERVER_URL:?Define VITE_APP_WS_SERVER_URL (https://<backend>.onrender.com)}"
: "${VITE_SUPABASE_URL:?Define VITE_SUPABASE_URL}"
: "${VITE_SUPABASE_ANON_KEY:?Define VITE_SUPABASE_ANON_KEY}"

REF="${EXCALIDRAW_REF:-e7b534668a60add7f725531f3c9abf32508c7b4e}"
HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$(mktemp -d)"

git clone https://github.com/excalidraw/excalidraw.git "$SRC"
git -C "$SRC" checkout "$REF"
cd "$SRC"
yarn install --frozen-lockfile
(cd excalidraw-app && yarn add @supabase/supabase-js@2.118.0)

# --- Capa propia: login, carpetas, administración ---
cp -r "$HERE/overlay/files" excalidraw-app/files

# Parche 1: index.tsx envuelve la app con el login
sed -i 's#^import ExcalidrawApp from "./App";#import ExcalidrawApp from "./App";\nimport { AuthGate } from "./files/AuthGate";#' excalidraw-app/index.tsx
sed -i 's#<ExcalidrawApp />#<AuthGate><ExcalidrawApp /></AuthGate>#' excalidraw-app/index.tsx

# Parche 2: App.tsx monta el panel de archivos dentro del ExcalidrawAPIProvider
sed -i '0,/^import {$/s##import { FilesLayer } from "./files/FilesLayer";\nimport {#' excalidraw-app/App.tsx
sed -i 's#<ExcalidrawWrapper />#<ExcalidrawWrapper />\n          <FilesLayer />#' excalidraw-app/App.tsx

# Parche 3: quitar banner Excalidraw+, pantalla de bienvenida y opciones del menú
node "$HERE/patch.mjs"

# Falla el build si algún parche no aplicó (p. ej. al cambiar de versión)
grep -q "<AuthGate>" excalidraw-app/index.tsx || { echo "Parche index.tsx falló"; exit 1; }
grep -q "<FilesLayer />" excalidraw-app/App.tsx || { echo "Parche App.tsx falló (<ExcalidrawWrapper />)"; exit 1; }
grep -q 'import { FilesLayer }' excalidraw-app/App.tsx || { echo "Parche App.tsx falló (import)"; exit 1; }

# Las VITE_APP_* / VITE_SUPABASE_* del entorno sobrescriben las de .env.production
VITE_APP_DISABLE_SENTRY=true yarn build:app:docker

rm -rf "$HERE/dist"
cp -r excalidraw-app/build "$HERE/dist"
