const form = document.getElementById('chatForm');
const input = document.getElementById('messageInput');
const messages = document.getElementById('messages');
const historyList = document.getElementById('historyList');
const newChatBtn = document.getElementById('newChatBtn');
const suggestions = document.getElementById('suggestions');
let activeConversationId = null;

function showEmpty(message = 'Pilih riwayat percakapan atau mulai chat baru untuk bertanya tentang wisata, budaya, dan kuliner Bali.') {
  messages.innerHTML = '';
  const empty = document.createElement('div');
  empty.className = 'chat-empty';
  const title = document.createElement('strong');
  title.textContent = 'Selamat datang di TanyaBali!';
  empty.append(title, document.createTextNode(message));
  messages.appendChild(empty);
}

function addMessage(text, role, source) {
  const element = document.createElement('div');
  element.className = `message ${role === 'user' ? 'user' : 'bot'}`;
  element.textContent = text;
  if (source) {
    const meta = document.createElement('small');
    meta.textContent = `Sumber: ${source}`;
    element.appendChild(meta);
  }
  messages.appendChild(element);
  messages.scrollTop = messages.scrollHeight;
  return element;
}

function setActiveItem(id) {
  document.querySelectorAll('.history-item').forEach((item) => {
    item.classList.toggle('active', String(item.dataset.id) === String(id));
  });
}

function addHistoryItem(item) {
  document.getElementById('historyEmpty')?.remove();
  const wrapper = document.createElement('div');
  wrapper.className = 'history-item active';
  wrapper.dataset.id = item.id;

  const open = document.createElement('button');
  open.type = 'button'; open.className = 'history-open'; open.dataset.open = item.id;
  const title = document.createElement('strong'); title.textContent = item.title;
  const date = document.createElement('small'); date.textContent = 'Baru saja';
  open.append(title, date);

  const rename = document.createElement('button');
  rename.type = 'button'; rename.className = 'history-action'; rename.title = 'Ubah judul'; rename.dataset.rename = item.id; rename.textContent = '✎';
  const remove = document.createElement('button');
  remove.type = 'button'; remove.className = 'history-action'; remove.title = 'Hapus percakapan'; remove.dataset.delete = item.id; remove.textContent = '×';
  wrapper.append(open, rename, remove);
  historyList.prepend(wrapper);
}

async function loadConversation(id) {
  try {
    const response = await fetch(`/api/conversations/${id}/messages`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Gagal membuka percakapan.');
    activeConversationId = String(id);
    messages.innerHTML = '';
    if (!result.data.length) showEmpty('Belum ada pesan dalam percakapan ini.');
    result.data.forEach((message) => addMessage(message.content, message.role, message.source));
    setActiveItem(id);
    suggestions.hidden = true;
  } catch (error) { alert(error.message); }
}

async function createNewChat() {
  activeConversationId = null;
  showEmpty();
  suggestions.hidden = false;
  setActiveItem(null);
  input.focus();
}

async function send(text) {
  const question = (text || input.value).trim();
  if (!question) return;
  if (messages.querySelector('.chat-empty')) messages.innerHTML = '';
  addMessage(question, 'user');
  input.value = '';
  input.disabled = true;
  const pending = addMessage('Sedang mencari informasi...', 'bot');
  suggestions.hidden = true;

  try {
    const response = await fetch('/api/chatbot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: question, conversationId: activeConversationId })
    });
    const data = await response.json();
    pending.remove();
    if (!response.ok) throw new Error(data.message || 'Permintaan gagal');
    addMessage(data.answer, 'assistant', data.source);
    if (!activeConversationId) {
      activeConversationId = String(data.conversationId);
      addHistoryItem({ id: activeConversationId, title: data.title || question.slice(0, 60) });
    } else {
      setActiveItem(activeConversationId);
    }
  } catch (error) {
    pending.textContent = error.message || 'Terjadi kesalahan. Coba lagi.';
  } finally {
    input.disabled = false;
    input.focus();
  }
}

form.addEventListener('submit', (event) => { event.preventDefault(); send(input.value); });
newChatBtn.addEventListener('click', createNewChat);
document.getElementById('clearViewBtn').addEventListener('click', createNewChat);
suggestions.querySelectorAll('.suggestion').forEach((button) => button.addEventListener('click', () => send(button.textContent)));

historyList.addEventListener('click', async (event) => {
  const openButton = event.target.closest('[data-open]');
  const renameButton = event.target.closest('[data-rename]');
  const deleteButton = event.target.closest('[data-delete]');

  if (openButton) return loadConversation(openButton.dataset.open);

  if (renameButton) {
    const id = renameButton.dataset.rename;
    const row = renameButton.closest('.history-item');
    const oldTitle = row.querySelector('strong').textContent;
    const title = prompt('Masukkan judul percakapan baru:', oldTitle);
    if (!title || !title.trim()) return;
    try {
      const response = await fetch(`/api/conversations/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim() })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Gagal mengubah judul.');
      row.querySelector('strong').textContent = result.data.title;
    } catch (error) { alert(error.message); }
  }

  if (deleteButton) {
    const id = deleteButton.dataset.delete;
    if (!confirm('Hapus percakapan ini beserta seluruh pesannya?')) return;
    try {
      const response = await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Gagal menghapus percakapan.');
      deleteButton.closest('.history-item').remove();
      if (String(activeConversationId) === String(id)) createNewChat();
      if (!historyList.querySelector('.history-item')) {
        const empty = document.createElement('div');
        empty.className = 'history-empty'; empty.id = 'historyEmpty';
        empty.textContent = 'Belum ada percakapan tersimpan. Mulai chat untuk membuat riwayat.';
        historyList.appendChild(empty);
      }
    } catch (error) { alert(error.message); }
  }
});
