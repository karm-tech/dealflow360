/** @type {import('tailwindcss').Config} */

// Every colour is read from a CSS variable defined in index.css rather than
// written here as a hex value. That means a dark theme in Phase 9 only has to
// redefine those variables — no component has to be touched.
//
// The variables hold "R G B" channel numbers instead of "#rrggbb" so Tailwind
// can still apply opacity, e.g. bg-ink-700/10.
function token(name) {
  return `rgb(var(--${name}) / <alpha-value>)`;
}

export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // The page itself.
        canvas: token("color-canvas"),
        surface: token("color-surface"),

        // Deep navy. The one accent: primary buttons, active navigation, links.
        // Deliberately NOT green, amber or red — those belong to status, and a
        // brand colour that looks like a status colour makes a dashboard lie.
        ink: {
          50: token("color-ink-50"),
          100: token("color-ink-100"),
          200: token("color-ink-200"),
          400: token("color-ink-400"),
          500: token("color-ink-500"),
          600: token("color-ink-600"),
          700: token("color-ink-700"),
          800: token("color-ink-800"),
          900: token("color-ink-900"),
        },

        // Warm greys for text, borders and fills. Warm on purpose — a cold
        // blue-grey next to a navy accent reads as one flat wash.
        sand: {
          50: token("color-sand-50"),
          100: token("color-sand-100"),
          200: token("color-sand-200"),
          300: token("color-sand-300"),
          400: token("color-sand-400"),
          500: token("color-sand-500"),
          600: token("color-sand-600"),
          700: token("color-sand-700"),
          800: token("color-sand-800"),
          900: token("color-sand-900"),
        },

        // Deal health and approval states. Never used for branding.
        // Each has a soft fill and a border so a pill can be built from one set.
        state: {
          ok: token("color-state-ok"),
          okSoft: token("color-state-ok-soft"),
          okBorder: token("color-state-ok-border"),
          warn: token("color-state-warn"),
          warnSoft: token("color-state-warn-soft"),
          warnBorder: token("color-state-warn-border"),
          bad: token("color-state-bad"),
          badSoft: token("color-state-bad-soft"),
          badBorder: token("color-state-bad-border"),
        },
      },

      fontFamily: {
        // Headings. Geometric, a little characterful, used sparingly.
        display: ['Outfit', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        // Everything else. Holds up at 13–14px inside dense tables.
        sans: ['"IBM Plex Sans"', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        // Money, quote numbers, ids — anything that should line up in a column.
        mono: ['"IBM Plex Mono"', 'Consolas', 'Menlo', 'Courier New', 'monospace'],
      },

      // A fixed scale. Screens pick from these and nothing else, so headings
      // are the same size on every page.
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.06em" }], // 11px label
        xs: ["0.75rem", { lineHeight: "1.125rem" }], // 12px
        sm: ["0.8125rem", { lineHeight: "1.25rem" }], // 13px
        base: ["0.875rem", { lineHeight: "1.5rem" }], // 14px body
        lg: ["1rem", { lineHeight: "1.5rem" }], // 16px
        xl: ["1.125rem", { lineHeight: "1.6rem" }], // 18px section heading
        "2xl": ["1.5rem", { lineHeight: "1.9rem", letterSpacing: "-0.01em" }], // 24px page title
        "3xl": ["2rem", { lineHeight: "2.3rem", letterSpacing: "-0.02em" }], // 32px display
      },

      // Spent by role, not sprinkled everywhere. "card" is the quiet default;
      // "raised" lifts the one thing that is floating; "modal" is for dialogs.
      boxShadow: {
        card: "0 1px 2px rgb(26 25 23 / 0.04), 0 1px 3px rgb(26 25 23 / 0.05)",
        raised: "0 4px 12px rgb(26 25 23 / 0.07), 0 1px 3px rgb(26 25 23 / 0.05)",
        modal: "0 20px 48px rgb(12 29 46 / 0.18)",
      },

      keyframes: {
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        expand: {
          "0%": { opacity: "0", transform: "translateY(-4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        fadeUp: "fadeUp 0.35s ease-out both",
        expand: "expand 0.2s ease-out both",
      },
    },
  },
  plugins: [],
};
