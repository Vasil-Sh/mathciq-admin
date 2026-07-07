---
version: alpha
name: MathIQ Admin (Basedash)
description: >
  Midnight data terminal for MatchIQ user administration. A dark observatory
  where metrics glow in violet (#9984d8) and mint (#3fcb7f), serif headlines
  float above the noise, and white pill buttons are the only bright objects in
  a room of soft black surfaces.

  Pure black canvas (#000000), near-black elevated cards (#050607), white type
  that reads like a terminal. Inter does all functional labor at tight
  -0.03em tracking. Alpha Lyrae (EB Garamond fallback) carries hero headlines
  at exactly 48px. Two chromatic notes — violet and mint — appear sparingly
  as accent fills, never as decoration.

  Buttons invert the usual dark-mode expectation: filled actions are white
  pills on black (#ffffff on #000000), outlined actions are ghost links.
  Cards float on the void at 16px radius; buttons are cut to 6px — a split
  that signals "card is a container, button is a tool."

  Source: Basedash (basedash.com) via Refero Styles
  URL: https://styles.refero.design/style/77b723ca-9583-4349-9b5e-2ef8b4fde002

colors:
  void: "#000000"
  carbon: "#050607"
  graphite: "#333333"
  steel: "#808080"
  ash: "#b3b3b3"
  bone: "#e8eaee"
  ghost: "#ffffff"
  lavender: "#9984d8"
  mint: "#3fcb7f"
  danger: "#ef4444"

typography:
  display:
    fontFamily: '"EB Garamond", "Cormorant Garamond", Georgia, serif'
    fontSize: 48px
    fontWeight: 400
    lineHeight: 1.0
    letterSpacing: 0

  heading:
    fontFamily: '"Inter", system-ui, -apple-system, sans-serif'
    fontSize: 34px
    fontWeight: 400
    lineHeight: 1.0
    letterSpacing: -0.03em

  heading-sm:
    fontFamily: '"Inter", system-ui, -apple-system, sans-serif'
    fontSize: 30px
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: -0.03em

  subheading:
    fontFamily: '"Inter", system-ui, -apple-system, sans-serif'
    fontSize: 24px
    fontWeight: 300
    lineHeight: 1.25
    letterSpacing: -0.03em

  body-lg:
    fontFamily: '"Inter", system-ui, -apple-system, sans-serif'
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.56
    letterSpacing: -0.03em

  body:
    fontFamily: '"Inter", system-ui, -apple-system, sans-serif'
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: -0.03em

  body-sm:
    fontFamily: '"Inter", system-ui, -apple-system, sans-serif'
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.43
    letterSpacing: -0.03em

  caption:
    fontFamily: '"Inter", system-ui, -apple-system, sans-serif'
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.38
    letterSpacing: -0.03em

spacing:
  baseUnit: 4px
  maxWidth: 1200px
  sectionGap: "80-120px"
  cardPadding: "16-20px"
  elementGap: 12px

borderRadius:
  inputs: 6px
  buttons: 6px
  cards: 16px

guidelines:
  do:
    - "Use #ffffff as the filled button background on black canvas — this inversion is the signature"
    - "Apply -0.03em letter-spacing to ALL Inter text regardless of size"
    - "Use 6px radius for buttons, 16px radius for cards — never swap"
    - "Reserve violet (#9984d8) and mint (#3fcb7f) for data/chart and status contexts only"
    - "Center-align all hero and section headers"
  dont:
    - "Do NOT use violet or mint as a button fill — primary action is always white-on-black"
    - "Do NOT add box-shadows to cards — near-identical surface values, no shadow language"
    - "Do NOT break the 6px/16px radius rule"
    - "Do NOT use Inter for display headlines — serif at 48px is reserved for h1 only"
    - "Do NOT use full white (#ffffff) for body copy — use Ash Gray (#b3b3b3) for secondary text"
    - "Do NOT use warm grays — all neutrals lean cool, matching the violet accent's temperature"

techStack:
  framework: React 19 + Vite 5
  language: TypeScript
  styling: Tailwind CSS 3
  routing: react-router-dom v6
  icons: lucide-react
  toasts: sonner
  datePicker: react-day-picker v9
