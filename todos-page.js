export const todosPage = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Todos · e2e-hello</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: light-dark(#f6f7f9, #15171a);
    --surface: light-dark(#ffffff, #1f2226);
    --text: light-dark(#1b1d21, #e8eaed);
    --muted: light-dark(#5f6670, #a0a7b1);
    --border: light-dark(#d9dde3, #343941);
    --accent: light-dark(#2457d6, #7aa2ff);
    --accent-text: light-dark(#ffffff, #0d1117);
    --danger: light-dark(#b3261e, #ff8a80);
    --radius: 10px;
    --gap: 12px;
  }
  *, *::before, *::after { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }
  body {
    margin: 0;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans KR", sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.5;
  }
  main { max-width: 640px; margin: 0 auto; padding: 24px 16px 48px; }
  h1 { font-size: 1.5rem; margin: 0 0 16px; }
  form {
    display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-end;
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); padding: var(--gap);
  }
  .field { display: flex; flex-direction: column; gap: 4px; flex: 1 1 200px; min-width: 0; }
  label { font-weight: 600; font-size: 0.9rem; }
  input[type="text"] {
    width: 100%; min-width: 0; font: inherit; color: inherit;
    background: var(--bg); border: 1px solid var(--border);
    border-radius: 8px; padding: 8px 10px;
  }
  button {
    font: inherit; cursor: pointer; border-radius: 8px; padding: 8px 14px;
    border: 1px solid transparent;
  }
  button[type="submit"] { background: var(--accent); color: var(--accent-text); }
  button:disabled { opacity: 0.6; cursor: progress; }
  :focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
  .status { margin: 16px 0 8px; color: var(--muted); min-height: 1.5em; }
  .status.error { color: var(--danger); }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  li {
    display: flex; align-items: center; gap: var(--gap);
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); padding: 10px var(--gap);
  }
  li label { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; font-weight: 400; cursor: pointer; }
  li input[type="checkbox"] { width: 1.2rem; height: 1.2rem; flex: none; accent-color: var(--accent); }
  .title { overflow-wrap: anywhere; min-width: 0; }
  li.done .title { text-decoration: line-through; color: var(--muted); }
  .delete { background: transparent; color: var(--danger); border-color: var(--border); flex: none; }
</style>
</head>
<body>
<main>
  <h1>Todos</h1>
  <form id="add-form" novalidate>
    <div class="field">
      <label for="title">새 할 일</label>
      <input id="title" name="title" type="text" maxlength="200" required autocomplete="off">
    </div>
    <button type="submit">추가</button>
  </form>
  <p id="status" class="status" role="status" aria-live="polite">불러오는 중…</p>
  <ul id="list" aria-label="할 일 목록"></ul>
</main>
<script>
(() => {
  const form = document.getElementById('add-form');
  const input = document.getElementById('title');
  const list = document.getElementById('list');
  const status = document.getElementById('status');
  let todos = [];

  function setStatus(text, isError = false) {
    status.textContent = text;
    status.classList.toggle('error', isError);
  }

  async function api(path, options = {}) {
    const res = await fetch(path, {
      ...options,
      headers: options.body ? { 'content-type': 'application/json' } : undefined,
    });
    if (res.status === 204) return null;
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error((data && data.error) || 'HTTP ' + res.status);
    return data;
  }

  function render() {
    list.replaceChildren();
    for (const todo of todos) {
      const li = document.createElement('li');
      li.classList.toggle('done', todo.done);

      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = todo.done;
      checkbox.addEventListener('change', () => toggle(todo, checkbox));
      const title = document.createElement('span');
      title.className = 'title';
      title.textContent = todo.title;
      label.append(checkbox, title);

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'delete';
      del.textContent = '삭제';
      del.setAttribute('aria-label', '삭제: ' + todo.title);
      del.addEventListener('click', () => remove(todo, del));

      li.append(label, del);
      list.append(li);
    }
    if (todos.length === 0) setStatus('할 일이 없습니다. 위에서 추가해 보세요.');
    else setStatus(todos.filter((t) => !t.done).length + '개 남음 / 전체 ' + todos.length + '개');
  }

  async function load() {
    setStatus('불러오는 중…');
    try {
      todos = await api('/api/todos');
      render();
    } catch (err) {
      setStatus('목록을 불러오지 못했습니다: ' + err.message, true);
    }
  }

  async function toggle(todo, checkbox) {
    checkbox.disabled = true;
    try {
      const updated = await api('/api/todos/' + todo.id, {
        method: 'PATCH',
        body: JSON.stringify({ done: checkbox.checked }),
      });
      Object.assign(todo, updated);
      render();
    } catch (err) {
      checkbox.checked = todo.done;
      checkbox.disabled = false;
      setStatus('변경하지 못했습니다: ' + err.message, true);
    }
  }

  async function remove(todo, button) {
    button.disabled = true;
    try {
      await api('/api/todos/' + todo.id, { method: 'DELETE' });
      todos = todos.filter((t) => t.id !== todo.id);
      render();
      input.focus();
    } catch (err) {
      button.disabled = false;
      setStatus('삭제하지 못했습니다: ' + err.message, true);
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const title = input.value.trim();
    if (!title) {
      setStatus('할 일을 입력하세요.', true);
      input.focus();
      return;
    }
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      const created = await api('/api/todos', { method: 'POST', body: JSON.stringify({ title }) });
      todos.push(created);
      input.value = '';
      render();
    } catch (err) {
      setStatus('추가하지 못했습니다: ' + err.message, true);
    } finally {
      submit.disabled = false;
      input.focus();
    }
  });

  load();
})();
</script>
</body>
</html>
`;
