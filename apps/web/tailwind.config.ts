import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "1.5rem",
      screens: { "2xl": "1280px" },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        scout: {
          blue: {
            DEFAULT: "#294885",
            mid: "#20649B",
            light: "#6B96CA",
            deep: "#1B3260",
            hero: "#1E5A88",
          },
          // Pozadí hlavičky stanoviště, když se zápisy neodesílají. Tmavý
          // jantar, aby bílý text i žlutý progress nad ním držely kontrast.
          offline: "#5E4418",
          // Tečka stavu v hlavičce — svítivější než scout-green, který se na
          // modré ztrácí.
          online: "#4ADE80",
          yellow: {
            DEFAULT: "#F49E00",
            soft: "#FEF5E0",
            border: "#F4D98A",
          },
          amber: "#ECA038",
          green: {
            DEFAULT: "#008836",
            soft: "#EBF7EE",
            border: "#B8E2C4",
            // Text na zeleném `soft` podkladu; DEFAULT na něm dává jen
            // 4,15:1, tenhle 5,6:1, takže projde AA i pro drobné písmo.
            deep: "#00702C",
          },
          red: {
            DEFAULT: "#EA614A",
            soft: "#FDEFEC",
            border: "#F6C7BD",
            deep: "#C2381F",
          },
          bg: {
            app: "#EDEAE2",
            white: "#FFFFFF",
            subtle: "#FAFAF7",
            table: "#F8F7F4",
            track: "#E4E1D8",
          },
          border: {
            DEFAULT: "#E0DDD5",
            mid: "#CCCAC2",
            track: "#DDD9D0",
          },
          text: {
            DEFAULT: "#18202E",
            secondary: "#566070",
            muted: "#8E97A4",
            warm: "#7A6040",
          },
          category: {
            girls: "#EEF2FA",
            boys: "#E8EFF8",
            open: "#F3EFE8",
          },
          station: {
            blue: "#EBF1FA",
            "blue-border": "#BDD3F0",
          },
        },
      },
      spacing: {
        "0.75": "3px",
        "1.25": "5px",
        "1.75": "7px",
        "2.25": "9px",
        "2.75": "11px",
        "3.25": "13px",
        "4.5": "18px",
        "5.5": "22px",
        "7.5": "30px",
        "8.5": "34px",
        "10.5": "42px",
        "11": "44px",
        "12.5": "50px",
        "13": "52px",
        "41": "164px",
        "43": "172px",
        "97.5": "390px",
        "170": "680px",
        "195": "780px",
        "205": "820px",
        "320": "1280px",
      },
      fontSize: {
        "2xs": ["10px", { lineHeight: "1.25" }],
        "11": ["11px", { lineHeight: "1.35" }],
        "12": ["12px", { lineHeight: "1.35" }],
        "13": ["13px", { lineHeight: "1.4" }],
        "14": ["14px", { lineHeight: "1.45" }],
        "15": ["15px", { lineHeight: "1.45" }],
        "16": ["16px", { lineHeight: "1.45" }],
        "17": ["17px", { lineHeight: "1.35" }],
        "18": ["18px", { lineHeight: "1.35" }],
        "20": ["20px", { lineHeight: "1.2" }],
        "21": ["21px", { lineHeight: "1.15" }],
        "22": ["22px", { lineHeight: "1.1" }],
        "26": ["26px", { lineHeight: "1.1" }],
        "28": ["28px", { lineHeight: "1.15" }],
        "32": ["32px", { lineHeight: "1" }],
      },
      borderRadius: {
        "2": "2px",
        "3": "3px",
        "4": "4px",
        "5": "5px",
        "6": "6px",
        "8": "8px",
        "10": "10px",
        "12": "12px",
        "14": "14px",
        "20": "20px",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      borderWidth: {
        "1.5": "1.5px",
        "2.5": "2.5px",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "DM Sans", "ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
        display: ["var(--font-sans)", "DM Sans", "ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      letterSpacing: {
        tightest: "-0.2px",
        "0.4": "0.4px",
        "0.5": "0.5px",
        "0.6": "0.6px",
        "0.7": "0.7px",
        pin: "8px",
      },
      boxShadow: {
        "scout-ring": "0 0 0 10px rgba(244, 158, 0, 0.15)",
        "slider-thumb": "0 2px 10px rgba(41, 72, 133, 0.3)",
      },
      backgroundImage: {
        "dashboard-hero": "linear-gradient(135deg, #1B3260 0%, #294885 60%, #1E5A88 100%)",
        "qr-hero": "linear-gradient(160deg, #192F5E 0%, #294885 100%)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [animate],
};

export default config;
