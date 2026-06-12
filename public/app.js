// ============================================
// NEXUSCHAT AI - LÓGICA DE LA INTERFAZ
// ============================================

const API_URL = ''; // Rutas relativas al servidor Express (que sirve desde raíz)

// Estado de la aplicación
let state = {
  currentConversationId: null,
  conversations: new Map(),
  models: [],
  selectedModel: '',
  isSending: false
};

// Elementos del DOM
const elements = {
  // Mobile menu
  menuToggle: document.getElementById('menu-toggle'),
  sidebar: document.getElementById('sidebar'),
  sidebarOverlay: document.getElementById('sidebar-overlay'),
  
  // Sidebar
  newChatBtn: document.getElementById('new-chat-btn'),
  conversationItems: document.getElementById('conversation-items'),
  modelSelect: document.getElementById('model-select'),
  clearAllBtn: document.getElementById('clear-all-btn'),
  
  // Main chat
  emptyState: document.getElementById('empty-state'),
  activeChat: document.getElementById('active-chat'),
  chatTitle: document.getElementById('chat-title'),
  chatModelBadge: document.getElementById('chat-model-badge'),
  messagesContainer: document.getElementById('messages-container'),
  
  // Input
  prompt: document.getElementById('prompt'),
  sendBtn: document.getElementById('send-btn'),
  
  // Empty state
  createFirstBtn: document.getElementById('create-first-btn')
};

// ============================================
// INICIALIZACIÓN
// ============================================

async function init() {
  await loadModels();
  await loadConversations();
  setupEventListeners();
}

async function loadModels() {
  try {
    const response = await fetch(`${API_URL}/api/models`);
    if (!response.ok) throw new Error('No se pudieron cargar los modelos');
    
    state.models = await response.json();
    updateModelSelect();
  } catch (error) {
    console.error('Error al cargar modelos:', error);
    elements.modelSelect.innerHTML = '<option value="">Error al cargar modelos</option>';
  }
}

function updateModelSelect() {
  elements.modelSelect.innerHTML = '';
  
  // Opción placeholder requerida
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Seleccionar modelo';
  placeholder.disabled = true;
  placeholder.selected = true;
  elements.modelSelect.appendChild(placeholder);
  
  if (state.models.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No hay modelos disponibles';
    elements.modelSelect.appendChild(option);
    return;
  }

  state.models.forEach(model => {
    const option = document.createElement('option');
    option.value = model;
    option.textContent = model;
    if (model === state.selectedModel) option.selected = true;
    elements.modelSelect.appendChild(option);
  });
}

async function loadConversations() {
  try {
    const response = await fetch(`${API_URL}/api/conversations`);
    if (!response.ok) throw new Error('No se pudieron cargar las conversaciones');
    
    const conversations = await response.json();
    state.conversations = new Map(conversations.map(conv => [conv.id, conv]));
    
    renderConversationList();
  } catch (error) {
    console.error('Error al cargar conversaciones:', error);
  }
}

function renderConversationList() {
  elements.conversationItems.innerHTML = '';
  
  if (state.conversations.size === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.className = 'conversation-item';
    emptyMsg.style.textAlign = 'center';
    emptyMsg.style.color = 'var(--text-muted)';
    emptyMsg.style.fontStyle = 'italic';
    emptyMsg.textContent = 'No hay conversaciones aún';
    elements.conversationItems.appendChild(emptyMsg);
    return;
  }

  state.conversations.forEach((conv, id) => {
    const item = document.createElement('div');
    item.className = `conversation-item ${id === state.currentConversationId ? 'active' : ''}`;
    
    const convDate = new Date(parseInt(id));
    const timeString = convDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    item.innerHTML = `
      <div class="conv-info">
        <div class="conv-name">${escapeHtml(conv.name)}</div>
        <div class="conv-time">${timeString}</div>
      </div>
      <button class="btn-delete-chat" title="Eliminar conversación">🗑️</button>
    `;
    
    // Click para cargar conversación
    item.addEventListener('click', (e) => {
      if (!e.target.classList.contains('btn-delete-chat')) {
        loadConversation(id);
      }
    });
    
    // Click botón eliminar
    const deleteBtn = item.querySelector('.btn-delete-chat');
    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const confirmed = await showConfirmModal(`¿Eliminar "${conv.name}"?`);
      if (confirmed) {
        await deleteConversation(id);
      }
    });
    
    elements.conversationItems.appendChild(item);
  });
}

// ============================================
// GESTIÓN DE CONVERSACIONES
// ============================================

async function createNewConversation() {
  const id = Date.now().toString();
  const name = `Conversación ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  
  try {
    const response = await fetch(`${API_URL}/api/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name })
    });
    
    if (!response.ok) throw new Error('No se pudo crear la conversación');
    
    const result = await response.json();
    state.conversations.set(result.id, { id: result.id, name: result.name });
    state.currentConversationId = result.id;
    
    // Limpiar mensajes del DOM al iniciar nuevo chat
    elements.messagesContainer.innerHTML = '';
    
    renderConversationList();
    showChatInterface();
  } catch (error) {
    console.error('Error al crear conversación:', error);
    showModal('Error', 'No se pudo crear la conversación. Verifica que el servidor esté corriendo.');
  }
}

async function loadConversation(id) {
  state.currentConversationId = id;
  
  try {
    const response = await fetch(`${API_URL}/api/conversations/${id}`);
    if (!response.ok) throw new Error('No se pudo cargar la conversación');
    
    const messages = await response.json();
    
    renderMessages(messages);
    renderConversationList();
    showChatInterface();
  } catch (error) {
    console.error('Error al cargar conversación:', error);
  }
}

async function deleteConversation(id) {
  try {
    const response = await fetch(`${API_URL}/api/conversations/${id}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('No se pudo eliminar la conversación');
    
    state.conversations.delete(id);
    
    if (state.currentConversationId === id) {
      state.currentConversationId = null;
      hideChatInterface();
    }
    
    renderConversationList();
  } catch (error) {
    console.error('Error al eliminar conversación:', error);
    showModal('Error', 'No se pudo eliminar la conversación');
  }
}

async function clearAllConversations() {
  if (confirm('¿Eliminar todas las conversaciones?')) {
    state.conversations.clear();
    state.currentConversationId = null;
    hideChatInterface();
    renderConversationList();
  }
}

// ============================================
// MENSAJES Y CHAT
// ============================================

function showChatInterface() {
  elements.emptyState.classList.add('hidden');
  elements.activeChat.classList.remove('hidden');
  
  const conv = state.conversations.get(state.currentConversationId);
  if (conv) {
    elements.chatTitle.textContent = conv.name;
  }
}

function hideChatInterface() {
  elements.emptyState.classList.remove('hidden');
  elements.activeChat.classList.add('hidden');
}

function renderMessages(messages) {
  elements.messagesContainer.innerHTML = '';
  
  messages.forEach(msg => {
    addMessageToUI(msg.role, msg.content, false);
  });
  
  scrollToBottom();
}

function addMessageToUI(role, content, animate = true) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${role}`;
  
  if (role === 'assistant') {
    messageDiv.innerHTML = formatMessage(content);
  } else {
    messageDiv.textContent = content;
  }
  
  elements.messagesContainer.appendChild(messageDiv);
  
  // Siempre hacer scroll al final cuando se agrega un mensaje
  scrollToBottom();
  
  return messageDiv;
}

function addTypingIndicator() {
  const indicator = document.createElement('div');
  indicator.className = 'typing-indicator';
  indicator.id = 'typing-indicator';
  indicator.innerHTML = '<span></span><span></span><span></span>';
  elements.messagesContainer.appendChild(indicator);
  scrollToBottom();
}

function removeTypingIndicator() {
  const indicator = document.getElementById('typing-indicator');
  if (indicator) indicator.remove();
}

function scrollToBottom() {
  elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
}

async function sendMessage() {
  if (state.isSending) return;
  
  const text = elements.prompt.value.trim();
  if (!text) {
    if (!state.selectedModel) showModal('Advertencia', 'Por favor selecciona un modelo antes de enviar el mensaje.');
    else if (!state.currentConversationId) showModal('Advertencia', 'Crea o selecciona una conversación primero.');
    return;
  }
  
  // Crear conversación automáticamente si no hay ID asignado
  if (!state.currentConversationId) {
    const id = Date.now().toString();
    const name = `Conversación ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    
    try {
      const response = await fetch(`${API_URL}/api/conversations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name })
      });
      
      if (response.ok) {
        const result = await response.json();
        state.currentConversationId = result.id;
      } else {
        showModal('Error', 'No se pudo crear la conversación automáticamente.');
        return;
      }
    } catch (error) {
      console.error('Error creando conversación automática:', error);
      showModal('Error', 'No se pudo conectar con el servidor.');
      return;
    }
  }
  
  if (!state.selectedModel) {
    showModal('Advertencia', 'Por favor selecciona un modelo antes de enviar el mensaje.');
    return;
  }
  
  state.isSending = true;
  elements.sendBtn.disabled = true;
  
  // Agregar mensaje del usuario a la UI
  addMessageToUI('user', text);
  elements.prompt.value = '';
  
  // Agregar indicador de escritura
  addTypingIndicator();
  
  // Declarar aquí para que esté disponible en el finally
  let assistantMessage = '';
  let buffer = '';
  
  try {
    const response = await fetch(`${API_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: state.currentConversationId,
        model: state.selectedModel,
        message: text
      })
    });
    
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    // Crear contenedor para el mensaje del asistente
    removeTypingIndicator();
    const assistantDiv = addMessageToUI('assistant', '⏳ Escribiendo...');
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      
      // Procesar líneas completas (JSON Lines format)
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Mantener línea incompleta en buffer
      
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const json = JSON.parse(line);
          
          // Diferenciar entre chunks de thinking y contenido real
          if (typeof json.message === 'string') {
            // Servidor Express envía content como string plano
            if (json.isThinking) {
              // Es solo thinking, no actualizar la UI visible
              continue;
            }
            // Acumular para ver la respuesta completa en tiempo real
            assistantMessage += json.message;
            assistantDiv.innerHTML = formatMessage(assistantMessage);
            
          } else if (json.message && typeof json.message === 'object') {
            // Formato directo de Ollama: objeto con content/thinking
            if (json.message.content) {
              assistantMessage += json.message.content;
              assistantDiv.innerHTML = formatMessage(assistantMessage);
            } else if (json.message.thinking) {
              // Solo thinking, ignorar para mostrar al usuario
              continue;
            }
          }
        } catch (e) {
          console.error('Error parsing stream chunk:', e.message, 'line:', line.substring(0, 100));
        }
      }
    }
    
    // Procesar cualquier contenido restante en el buffer (solo mostrar content)
    if (buffer.trim()) {
      try {
        const json = JSON.parse(buffer);
        if (typeof json.message === 'string') {
          assistantMessage += json.message;
          assistantDiv.innerHTML = formatMessage(assistantMessage);
        } else if (json.message?.content) {
          assistantMessage += json.message.content;
          assistantDiv.innerHTML = formatMessage(assistantMessage);
        }
      } catch (e) {}
    }
    
  } catch (error) {
    console.error('Error al enviar mensaje:', error);
    removeTypingIndicator();
    addMessageToUI('system', `❌ Error: ${error.message}`);
  } finally {
    state.isSending = false;
    elements.sendBtn.disabled = false;
    
    // Enviar respuesta completa al servidor para guardar (con retry)
    if (assistantMessage && assistantMessage.trim()) {
      let saveOk = false;
      const maxRetries = 3;
      for (let attempt = 0; attempt < maxRetries && !saveOk; attempt++) {
        try {
          const resp = await fetch(`${API_URL}/api/conversations/${state.currentConversationId}/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ assistantContent: assistantMessage })
          });
          if (resp.ok) saveOk = true;
        } catch (err) {
          console.warn(`Retry ${attempt + 1}/${maxRetries} guardando respuesta:`, err.message);
          await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 500));
        }
      }
      if (!saveOk) console.error('No se pudo guardar la respuesta tras', maxRetries, 'intentos');
      
      // Actualizar estado local con la conversación completa
      loadConversations();
    }
  }
}

// ============================================
// UTILIDADES
// ============================================

function formatMessage(text) {
  // 1) Parsear Markdown con marked.js (tablas, negritas, listas, etc.)
  let html = '';
  try {
    if (typeof marked !== 'undefined') {
      html = marked.parse(text);
    } else {
      console.warn('marked.js no cargó, usando parser de fallback');
      throw new Error('marked.js no disponible');
    }
  } catch (e) {
    console.error('Error al parsear Markdown con marked:', e.message);
    // Fallback robusto: parsea manualmente tablas GFM y otros elementos
    html = parseMarkdownFallback(text);
  }
  
  // 2) Enriquecer emojis EN EL HTML resultante (sin romper tablas/markdown)
  html = enrichFlagsEmojiDom(html);
  
  return html;
}

/** Parser de Markdown fallback sin marked.js - maneja tablas, negritas, listas, etc. */
function parseMarkdownFallback(text) {
  let html = text;
  
  // Pre-procesar: asegurar saltos de línea antes/después de bloques
  html = html.replace(/\n\n/g, '<|BREAK|>');
  
  // Convertir HTML desde el formato raw markdown
  html = parseTables(html);
  html = parseCodeBlocks(html);
  html = parseInlineMarkdown(html);
  
  // Limpiar saltos de línea sobrantes
  html = html.replace(/<\|BREAK\|>\s*\n/g, '');
  html = html.replace(/\n\s*<\|BREAK\|>/g, '');
  html = html.replace(/<\|BREAK\|>/g, '</p><p>');
  
  // Envolver en párrafos si no hay tags
  if (!html.startsWith('<')) {
    html = '<p>' + html + '</p>';
  }
  
  return html;
}

/** Parsea tablas GFM (GitHub Flavored Markdown) */
function parseTables(text) {
  const lines = text.split('\n');
  let inTable = false;
  let tableHtml = '';
  let headers = [];
  let headerParsed = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Detectar inicio de tabla GFM | col | col |
    if (line.startsWith('|') && line.endsWith('|')) {
      if (!inTable) {
        inTable = true;
        tableHtml = '<table class="message-content">';
      }
      
      // Extraer celdas
      const cells = line.slice(1, -1).split('|').map(c => c.trim());
      
      // Saltar filas de separador (---|---|---)
      if (/^[\-|:\s]+$/.test(line)) {
        if (!headerParsed && headers.length > 0) {
          // Headers ya procesados, crear la tabla HTML
          tableHtml += '<thead><tr>';
          headers.forEach(h => {
            tableHtml += `<th>${parseInlineMarkdown(h)}</th>`;
          });
          tableHtml += '</tr></thead><tbody>';
          headerParsed = true;
        }
        continue;
      }
      
      // Primera fila = headers
      if (!headerParsed) {
        headers = cells;
        continue;
      }
      
      // Filas de datos
      tableHtml += '<tr>';
      cells.forEach(cell => {
        tableHtml += `<td>${parseInlineMarkdown(cell)}</td>`;
      });
      tableHtml += '</tr>';
    } else {
      // Fin de tabla
      if (inTable) {
        tableHtml += '</tbody></table>';
        inTable = false;
        headers = [];
        headerParsed = false;
        lines[i] = tableHtml + '\n' + lines[i];
        tableHtml = '';
      }
    }
  }
  
  // Cerrar tabla si quedó abierta
  if (inTable) {
    tableHtml += '</tbody></table>';
    text = text.replace(/\|[\s\S]*$/, tableHtml);
  }
  
  return text;
}

/** Parsea bloques de código ``` ... ``` */
function parseCodeBlocks(text) {
  return text.replace(/```(\w*)\n?([\s\S]*?)```/g, function(match, lang, code) {
    return '<pre><code class="language-' + lang + '">' + escapeHtml(code.trim()) + '</code></pre>';
  });
}

/** Parsea inline markdown: negritas, cursivas, código inline */
function parseInlineMarkdown(text) {
  // Código inline `...`
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
  
  // Negrita **...** o __...__
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/__([^_]+)__ /g, '<strong>$1</strong>');
  
  // Cursiva *...* o _..._
  text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  text = text.replace(/([^_])_([^_]+)_/g, '$1<em>$2</em>');
  
  // Links [text](url)
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
  
  // Listas con - o *
  text = text.replace(/^[ \t]*[-*][ \t]+/gm, function(match) {
    return '\n<li>';
  });
  
  // Envolver lista en <ul>
  if (text.includes('<li>')) {
    text = '<ul>' + text + '</ul>';
  }
  
  return text;
}

/** Enruta flags emoji y emojis iconos en el HTML parseado por marked.js */
function enrichFlagsEmojiDom(html) {
  // Crear un div temporal para manipular DOM sin romper estructura de tablas/markdown
  const temp = document.createElement('div');
  temp.innerHTML = html;
  
  // Recorrer todos los nodos de texto y envolver emojis en spans
  function processNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent;
      // Buscar banderas regionales (emoji de bandera compuesta por 2 regional indicator symbols)
      const flagRegex = /([\u{1F1E6}-\u{1F1FF}]{2})/gu;
      // Buscar emojis especiales
      const iconRegex = /([🏆🥇🥈🥉⭐🔥💡⚽🏅🎖️😊])/gu;
      
      if (flagRegex.test(text) || iconRegex.test(text)) {
        const spans = [];
        let lastIndex = 0;
        const regex = /([\u{1F1E6}-\u{1F1FF}]{2})|([🏆🥇🥈🥉⭐🔥💡⚽🏅🎖️😊])/gu;
        
        let match;
        while ((match = regex.exec(text)) !== null) {
          // Agregar texto antes del emoji
          if (match.index > lastIndex) {
            spans.push(document.createTextNode(text.slice(lastIndex, match.index)));
          }
          
          // Crear span con clase apropiada
          const span = document.createElement('span');
          if (match[1]) {
            // Flag emoji regional
            span.className = 'flag-emoji';
            span.textContent = match[1];
          } else {
            // Icono emoji
            span.className = 'emoji-icon';
            span.textContent = match[2];
          }
          
          spans.push(span);
          lastIndex = match.index + match[0].length;
        }
        
        // Agregar texto restante
        if (lastIndex < text.length) {
          spans.push(document.createTextNode(text.slice(lastIndex)));
        }
        
        // Reemplazar nodo de texto con los spans
        const fragment = document.createDocumentFragment();
        spans.forEach(s => fragment.appendChild(s));
        node.parentNode.replaceChild(fragment, node);
      }
    } else {
      // Recursivamente procesar hijos (pero no dentro de <script> o <style>)
      if (node.tagName && /^(SCRIPT|STYLE)$/.test(node.tagName)) return;
      Array.from(node.childNodes).forEach(processNode);
    }
  }
  
  processNode(temp);
  return temp.innerHTML;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================
// EVENT LISTENERS
// ============================================

function setupEventListeners() {
  // Mobile menu toggle
  if (elements.menuToggle) {
    elements.menuToggle.addEventListener('click', () => {
      const sidebar = document.getElementById('sidebar');
      const overlay = document.getElementById('sidebar-overlay');
      
      sidebar.classList.toggle('open');
      overlay.classList.toggle('show');
    });
  }
  
  // Close sidebar when clicking overlay
  if (elements.sidebarOverlay) {
    elements.sidebarOverlay.addEventListener('click', () => {
      document.getElementById('sidebar').classList.remove('open');
      elements.sidebarOverlay.classList.remove('show');
    });
  }
  
  // Botones de nueva conversación
  elements.newChatBtn.addEventListener('click', createNewConversation);
  elements.createFirstBtn.addEventListener('click', createNewConversation);
  
  // Botón limpiar todo
  elements.clearAllBtn.addEventListener('click', clearAllConversations);
  
  // Envío de mensaje con botón o Enter
  elements.sendBtn.addEventListener('click', sendMessage);
  
  elements.prompt.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  
  // Cambio de modelo
  elements.modelSelect.addEventListener('change', (e) => {
    state.selectedModel = e.target.value;
    
    if (state.currentConversationId) {
      elements.chatModelBadge.textContent = state.selectedModel;
    }
  });
}

// Inicializar la aplicación
document.addEventListener('DOMContentLoaded', init);

// ============================================
// MODALES ESTILIZADOS
// ============================================

function showModal(title, message, type = 'error') {
  const overlay = document.createElement('div');
  overlay.className = `modal-overlay ${type}`;
  overlay.innerHTML = `
    <div class="modal-container">
      <div class="modal-header ${type}">
        ${type === 'error' ? '<span class="modal-icon">⚠️</span>' : type === 'success' ? '<span class="modal-icon">✅</span>' : '<span class="modal-icon">ℹ️</span>'}
        <h3>${title}</h3>
      </div>
      <div class="modal-body"><p>${message}</p></div>
      <div class="modal-footer"><button class="modal-btn-close" autofocus>Cerrar</button></div>
    </div>`;
  document.body.insertBefore(overlay, document.body.lastElementChild);
  const closeBtn = overlay.querySelector('.modal-btn-close');
  closeBtn.addEventListener('click', () => removeModal(overlay));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) removeModal(overlay); });
  setTimeout(() => closeBtn.focus(), 100);
}

function removeModal(modal) { modal.style.animation = 'fadeOut 0.2s ease'; setTimeout(() => modal.remove(), 200); }

async function showConfirmModal(message) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay confirm-modal';
    overlay.innerHTML = `
      <div class="modal-container">
        <div class="modal-header info"><span class="modal-icon">🗑️</span><h3>Confirmar eliminación</h3></div>
        <div class="modal-body"><p>${message}</p></div>
        <div class="modal-footer">
          <button class="modal-btn-cancel">Cancelar</button>
          <button class="modal-btn-confirm" style="background:var(--danger);margin-left:8px;">Eliminar</button>
        </div>
      </div>`;
    document.body.insertBefore(overlay, document.body.lastElementChild);
    const cancelBtn = overlay.querySelector('.modal-btn-cancel');
    const confirmBtn = overlay.querySelector('.modal-btn-confirm');
    cancelBtn.addEventListener('click', () => { removeModal(overlay); resolve(false); });
    confirmBtn.addEventListener('click', () => { removeModal(overlay); resolve(true); });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) { removeModal(overlay); resolve(false); } });
  });
}

function clearAllConversations() {
  showConfirmModal('¿Eliminar todas las conversaciones?').then((confirmed) => {
    if (confirmed) {
      state.conversations.clear();
      state.currentConversationId = null;
      hideChatInterface();
      renderConversationList();
    }
  });
}

// Inyectar estilos del modal al head
const modalStylesEl = document.createElement('style');
modalStylesEl.textContent = `
  .modal-overlay { position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:9999;animation:fadeIn 0.2s ease;backdrop-filter:blur(4px); }
  .modal-container { background:var(--bg-secondary);border-radius:16px;width:90%;max-width:450px;box-shadow:0 20px 60px rgba(0,0,0,0.5);animation:slideUp 0.3s ease;overflow:hidden; }
  .modal-header { padding:20px 24px;display:flex;align-items:center;gap:12px;font-weight:600; }
  .modal-header.error { background:linear-gradient(135deg,rgba(239,68,68,0.2),rgba(239,68,68,0.1));border-bottom:1px solid rgba(239,68,68,0.3);color:#fca5a5; }
  .modal-header.success { background:linear-gradient(135deg,rgba(16,185,129,0.2),rgba(16,185,129,0.1));border-bottom:1px solid rgba(16,185,129,0.3);color:#6ee7b7; }
  .modal-header.info { background:linear-gradient(135deg,rgba(59,130,246,0.2),rgba(59,130,246,0.1));border-bottom:1px solid rgba(59,130,246,0.3);color:#93c5fd; }
  .modal-icon { font-size:1.5rem; }
  .modal-header h3 { margin:0;font-size:1.1rem;font-weight:600; }
  .modal-body { padding:24px;color:var(--text-primary);line-height:1.6; }
  .modal-body p { margin:0; }
  .modal-footer { padding:16px 24px;background:rgba(0,0,0,0.2);display:flex;justify-content:flex-end;gap:8px; }
  .modal-btn-close { padding:10px 24px;background:var(--accent-primary);color:white;border:none;border-radius:8px;font-size:0.95rem;font-weight:600;cursor:pointer;transition:all 0.2s ease; }
  .modal-btn-close:hover { background:var(--accent-secondary);transform:translateY(-1px); }
  .modal-btn-cancel { padding:10px 24px;background:var(--bg-hover);color:var(--text-primary);border:1px solid var(--border-color);border-radius:8px;font-size:0.95rem;cursor:pointer;transition:all 0.2s ease; }
  .modal-btn-cancel:hover { background:var(--accent-primary); }
  @keyframes fadeIn { from{opacity:0}to{opacity:1} }
  @keyframes slideUp { from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)} }
  @keyframes fadeOut { from{opacity:1}to{opacity:0} }
`;
document.head.appendChild(modalStylesEl);