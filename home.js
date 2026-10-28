export const homeHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>e2e-hello</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: light-dark(#ffffff, #121417);
    --fg: light-dark(#1b1f24, #e6e8eb);
    --muted: light-dark(#57606a, #9aa4af);
    --border: light-dark(#d0d7de, #30363d);
    --subtle: light-dark(#f6f8fa, #1b1f24);
    --link: light-dark(#0550ae, #6cb6ff);
    --ok: light-dark(#116329, #57d364);
    --font: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  *, *::before, *::after { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--fg);
    font-family: var(--font);
    font-size: 1rem;
    line-height: 1.6;
  }
  main, footer {
    max-width: 44rem;
    margin: 0 auto;
    padding: 0 1.25rem;
  }
  main { padding-top: 3rem; padding-bottom: 2rem; }
  h1 { font-size: 1.75rem; margin: 0 0 .25rem; }
  h2 {
    font-size: 1.125rem;
    margin: 2rem 0 .75rem;
    padding-bottom: .375rem;
    border-bottom: 1px solid var(--border);
  }
  p { margin: 0 0 1rem; }
  .lead { color: var(--muted); }
  a { color: var(--link); }
  code {
    font-family: var(--mono);
    font-size: .875em;
    background: var(--subtle);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: .1em .35em;
    overflow-wrap: anywhere;
  }
  .status { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem 1rem; }
  .status-value { font-weight: 600; color: var(--ok); }
  .status-value::before { content: "\\25CF\\00A0"; }
  table { width: 100%; border-collapse: collapse; }
  th, td {
    text-align: left;
    vertical-align: top;
    padding: .5rem .75rem .5rem 0;
    border-bottom: 1px solid var(--border);
  }
  th { font-size: .875rem; color: var(--muted); font-weight: 600; }
  td:first-child { white-space: nowrap; }
  footer {
    padding-top: 1rem;
    padding-bottom: 2rem;
    color: var(--muted);
    font-size: .875rem;
    border-top: 1px solid var(--border);
    overflow-wrap: anywhere;
  }
</style>
</head>
<body>
<main>
  <h1>e2e-hello</h1>
  <p class="lead">An end-to-end example service built and deployed with Agent Forge and Broker.</p>

  <section aria-labelledby="status-heading">
    <h2 id="status-heading">Service status</h2>
    <p class="status">
      <span>Status: <span class="status-value">Running</span></span>
      <span>Health check: <a href="/health"><code>/health</code></a></span>
    </p>
  </section>

  <section aria-labelledby="endpoints-heading">
    <h2 id="endpoints-heading">Endpoints</h2>
    <table>
      <thead>
        <tr><th scope="col">Endpoint</th><th scope="col">Description</th></tr>
      </thead>
      <tbody>
        <tr><td><code>GET /</code></td><td>This page (HTML)</td></tr>
        <tr><td><code>GET /health</code></td><td>Health check, returns <code>{"ok":true}</code></td></tr>
      </tbody>
    </table>
  </section>
</main>
<footer>
  <p>Source: <a href="https://github.com/nalbam/e2e-hello">https://github.com/nalbam/e2e-hello</a></p>
</footer>
</body>
</html>
`;
