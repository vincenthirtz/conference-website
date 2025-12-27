import nextConfig from "eslint-config-next/core-web-vitals";

const config = [
  {
    ignores: [".history/**"],
  },
  ...nextConfig,
  {
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/static-components": "off",
    },
  },
];

export default config;
