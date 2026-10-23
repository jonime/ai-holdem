import "server-only";
import type { Locale } from "@/lib/i18n";

export const appearanceLabels = {
  "en-US": {
    "title": "Appearance",
    "system": "System",
    "light": "Light",
    "dark": "Dark",
    "useLight": "Use light mode",
    "useDark": "Use dark mode"
  },
  "fi-FI": {
    "title": "Ulkoasu",
    "system": "Järjestelmä",
    "light": "Vaalea",
    "dark": "Tumma",
    "useLight": "Käytä vaaleaa tilaa",
    "useDark": "Käytä tummaa tilaa"
  },
  "es-ES": {
    "title": "Apariencia",
    "system": "Sistema",
    "light": "Claro",
    "dark": "Oscuro",
    "useLight": "Usar modo claro",
    "useDark": "Usar modo oscuro"
  },
  "de-DE": {
    "title": "Darstellung",
    "system": "System",
    "light": "Hell",
    "dark": "Dunkel",
    "useLight": "Hellen Modus verwenden",
    "useDark": "Dunklen Modus verwenden"
  },
  "sv-SE": {
    "title": "Utseende",
    "system": "System",
    "light": "Ljust",
    "dark": "Mörkt",
    "useLight": "Använd ljust läge",
    "useDark": "Använd mörkt läge"
  },
  "fr-FR": {
    "title": "Apparence",
    "system": "Système",
    "light": "Clair",
    "dark": "Sombre",
    "useLight": "Utiliser le mode clair",
    "useDark": "Utiliser le mode sombre"
  },
  "pt-BR": {
    "title": "Aparência",
    "system": "Sistema",
    "light": "Claro",
    "dark": "Escuro",
    "useLight": "Usar modo claro",
    "useDark": "Usar modo escuro"
  },
  "it-IT": {
    "title": "Aspetto",
    "system": "Sistema",
    "light": "Chiaro",
    "dark": "Scuro",
    "useLight": "Usa modalità chiara",
    "useDark": "Usa modalità scura"
  },
  "nl-NL": {
    "title": "Weergave",
    "system": "Systeem",
    "light": "Licht",
    "dark": "Donker",
    "useLight": "Lichte modus gebruiken",
    "useDark": "Donkere modus gebruiken"
  },
  "pl-PL": {
    "title": "Wygląd",
    "system": "System",
    "light": "Jasny",
    "dark": "Ciemny",
    "useLight": "Użyj jasnego motywu",
    "useDark": "Użyj ciemnego motywu"
  },
  "ja-JP": {
    "title": "外観",
    "system": "システム",
    "light": "ライト",
    "dark": "ダーク",
    "useLight": "ライトモードに切り替える",
    "useDark": "ダークモードに切り替える"
  },
  "zh-Hans": {
    "title": "外观",
    "system": "跟随系统",
    "light": "浅色",
    "dark": "深色",
    "useLight": "使用浅色模式",
    "useDark": "使用深色模式"
  }
} satisfies Record<Locale, { title: string; system: string; light: string; dark: string; useLight: string; useDark: string }>;
