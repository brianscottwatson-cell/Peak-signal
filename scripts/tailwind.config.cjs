const { join } = require("node:path");

/** Tailwind 3.4.17, the same version as https://cdn.tailwindcss.com. */
module.exports = {
  content: {
    files: [join(__dirname, "../static-site/**/*.html")],
    extract: {
      html(content) {
        const found = [];
        for (const match of content.matchAll(/class="([^"]*)"/g)) {
          for (const token of match[1].split(/\s+/)) {
            if (token) found.push(token);
          }
        }
        return found;
      },
    },
  },
  theme: { extend: {} },
  plugins: [],
};
