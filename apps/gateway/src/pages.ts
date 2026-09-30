const page = (title: string, body: string) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 16px/1.5 system-ui, sans-serif; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 16px; }
  main { max-width: 28rem; text-align: center; }
  h1 { font-size: 1.5rem; margin-bottom: .5rem; }
</style>
</head>
<body><main><h1>${title}</h1><p>${body}</p></main></body>
</html>`;

export const connectedPage = page(
  "You're connected",
  "Viktor can use this app now. Head back to Slack and reply in the thread so it can pick up where it left off.",
);

export const connectFailedPage = page(
  "Connection didn't complete",
  "Nothing was connected. Go back to Slack and ask Viktor for a fresh link to try again.",
);
