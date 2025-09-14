import daisyui from "daisyui";

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      keyframes: {
        heartRise: {
          "0%": { transform: "translateY(0) scale(0.9)", opacity: "0" },
          "10%": { opacity: "1" },
          "50%": { transform: "translateY(-40vh) scale(1.1)" },
          "100%": { transform: "translateY(-80vh) scale(1)", opacity: "0" },
        },
        heartDrift: {
          "0%": { transform: "translateX(0)" },
          "50%": { transform: "translateX(-12px)" },
          "100%": { transform: "translateX(0)" },
        },
      },
      animation: {
        heartRise: "heartRise 6s ease-in-out forwards",
        heartDrift: "heartDrift 2.5s ease-in-out infinite",
      },
    },
  },
  plugins: [daisyui],
  daisyui: {
    themes: ["cupcake"],
  },
};
