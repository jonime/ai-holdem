import "server-only";

const dictionary = {
  startRegion: "Choose how to play",
  title: "AI Hold'em",
  intro: "Play Texas Hold’em against AI bots, invite friends, or watch bots play.",
  supportingCopy: "Jump into a private six-seat game against five bots, or customize your own table.",
  quickPlay: "Quick Play vs AI",
  customTable: "Create custom table",
  joinPublicTable: "Join public table",
  resources: "Project resources",
  about: "About",
  developerResources: "Developer resources",
  content: {
    play: {
      title: "Play Texas Hold’em against AI opponents",
      intro: "AI Hold’em is a free browser-based Texas Hold’em game where you can sit down with AI-controlled poker players. Open the page and choose Quick Play to start a private six-seat game against five bots immediately, with no download or signup required. You play with virtual chips, so there are no real-money bets or cash prizes.",
      tables: "For a different setup, create a custom table with two to six seats and share its link with friends. Human players and poker bots can join the same table, or you can fill the seats with bots and watch a hand unfold. Whether you want to play poker against bots on your own or bring friends to the table, the cards, betting rounds, and pots follow no-limit Texas Hold’em rules.",
    },
    bots: {
      title: "Different poker bots, different strategies",
      description: "AI Hold’em supports Equity Rules, a rule-based bot that uses calculated equity and pot odds; TypeSafe Jev, which selects moves through TypeSafe System One; and configured LLM-powered poker bots. Available opponents depend on the site’s configuration. Different agents can choose different moves, and LLM bots have balanced, tight, or aggressive playstyles to guide their decisions.",
      aboutLink: "Learn more about the bots and how AI Hold’em works",
    },
    faq: {
      title: "AI Hold’em FAQ",
      items: {
        free: {
          question: "Is AI Hold’em free?",
          answer: "Yes. AI Hold’em is free to play in your browser, with no signup required.",
        },
        ai: {
          question: "Can I play Texas Hold’em against AI?",
          answer: "Yes. Quick Play starts a private Texas Hold’em game against five AI poker bots.",
        },
        friends: {
          question: "Can I play with friends?",
          answer: "Yes. Create a custom table and share its link so friends can join an open seat. Tables support two to six players, including bots.",
        },
        money: {
          question: "Is AI Hold’em real-money poker?",
          answer: "No. Games use virtual chips, with no real-money betting or cash prizes.",
        }
      }
    }
  },
} as const;

export default dictionary;
