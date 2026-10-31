// Parches de UI sobre el código de Excalidraw. Se ejecuta desde la raíz del repo clonado.
// Cada parche debe aplicar exactamente una vez; si no, el build falla.
import { readFileSync, writeFileSync } from "node:fs";

const patches = [
  {
    file: "excalidraw-app/components/AppMainMenu.tsx",
    // Menú ☰: quitar Excalidraw+, redes sociales y "Regístrate"
    rules: [
      [/<MainMenu\.ItemLink\s+icon=\{ExcalLogo\}[\s\S]*?<\/MainMenu\.ItemLink>\s*/, "Excalidraw+"],
      [/<MainMenu\.DefaultItems\.Socials \/>\s*/, "Socials"],
      [/<MainMenu\.ItemLink\s+icon=\{loginIcon\}[\s\S]*?<\/MainMenu\.ItemLink>\s*/, "Sign up"],
    ],
  },
  {
    file: "excalidraw-app/App.tsx",
    rules: [
      // Pantalla de bienvenida
      [/<AppWelcomeScreen[\s\S]*?\/>\s*/, "Welcome screen"],
      // Banner de Excalidraw+ (arriba a la derecha)
      [
        /\{excalidrawAPI\?\.getEditorInterface\(\)\.formFactor === "desktop" && \(\s*<ExcalidrawPlusPromoBanner[\s\S]*?\/>\s*\)\}\s*/,
        "Promo banner",
      ],
    ],
  },
];

for (const { file, rules } of patches) {
  let src = readFileSync(file, "utf8");
  for (const [re, label] of rules) {
    if (!re.test(src)) {
      console.error(`Parche "${label}" no aplicó en ${file}`);
      process.exit(1);
    }
    src = src.replace(re, "");
  }
  writeFileSync(file, src);
  console.log(`OK ${file}`);
}
