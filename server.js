const express = require('express');
const cors    = require('cors');
const axios   = require('axios');
const fs      = require('fs');
const path    = require('path');

const app      = express();
const PORT     = process.env.PORT ? parseInt(process.env.PORT,10) : 3000;
const OLLAMA_HOST = process.env.OLLAMA_HOST || '192.168.0.100'; // IP del equipo con Ollama
const OLLAMA_PORT = 11434;
const CHATS_DIR = path.join(__dirname, 'data');
const CONTEXT_WINDOW = parseInt(process.env.CONTEXT_WINDOW, 10) || 10; // Mensajes a enviar a Ollama (default 10)

// Crear directorio de datos si no existe
if (!fs.existsSync(CHATS_DIR)) {
  fs.mkdirSync(CHATS_DIR);
}

const CHATS_FILE = path.join(CHATS_DIR, 'chats.json');

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Log todas las peticiones para debug
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// Almacén de conversaciones (en memoria)
const conversations = new Map(); // id -> { name, messages: [{role, content}], createdAt }

// Funciones de persistencia en disco
function cargarConversaciones() {
  try {
    if (fs.existsSync(CHATS_FILE)) {
      const data = fs.readFileSync(CHATS_FILE, 'utf-8');
      const chats = JSON.parse(data);
      Object.entries(chats).forEach(([id, conv]) => conversations.set(id, conv));
      console.log(`[Persistencia] ${conversations.size} conversaciones cargadas`);
    }
  } catch (err) {
    console.error('[Persistencia] Error al cargar:', err.message);
  }
}

function guardarConversaciones() {
  try {
    const chatsObj = {};
    conversations.forEach((conv, id) => { chatsObj[id] = conv; });
    fs.writeFileSync(CHATS_FILE, JSON.stringify(chatsObj, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Persistencia] Error al guardar:', err.message);
  }
}

// Cargar conversaciones al iniciar
cargarConversaciones();

/**
 * Construye una ventana de contexto limitada para enviar a Ollama.
 * Mantiene el par del primer mensaje (contexto inicial) + los últimos N-2 mensajes.
 * Esto evita payloads exponencialmente grandes en conversaciones largas.
 */
function buildContextWindow(messages) {
  if (!messages || messages.length <= CONTEXT_WINDOW) return messages;

  // Primer par user+assistant como contexto global
  const firstUser = messages.find(m => m.role === 'user');
  const contextStart = [];
  
  if (firstUser) {
    contextStart.push({ role: firstUser.role, content: firstUser.content });
    
    // Si hay respuesta del asistente al primer mensaje, también la incluimos
    const firstAssistantIdx = messages.findIndex(m => m.role === 'assistant' && messages.indexOf(m) > messages.indexOf(firstUser));
    if (firstAssistantIdx >= 0) {
      contextStart.push({ role: messages[firstAssistantIdx].role, content: messages[firstAssistantIdx].content });
    }
  }

  // Ventana final: contexto inicial + últimos mensajes restantes
  const remainingCount = CONTEXT_WINDOW - contextStart.length;
  const recentMessages = messages.slice(-Math.max(remainingCount, 0));
  
  return [...contextStart, ...recentMessages];
}

// Generar título basado en el primer mensaje del usuario
function generarTituloConversacion(primerMensaje) {
  if (!primerMensaje) return 'Chat sin título';
  
  // Limitar longitud y limpiar texto
  let titulo = primerMensaje.trim().substring(0, 60);
  
  // Eliminar caracteres de punctuation al final
  titulo = titulo.replace(/[.!?:;]+$/, '').trim();
  
  // Si es muy largo, truncar en palabra completa
  if (primerMensaje.length > 60) {
    titulo += '...';
  }
  
  return titulo || 'Chat sin título';
}

/** GET /api/models */
app.get('/api/models', async (req, res) => {
  try {
    const ollamaUrl = `http://${OLLAMA_HOST}:${OLLAMA_PORT}/api/tags`;
    console.log('Intentando conectarse a Ollama:', ollamaUrl);
    const ollamaResp = await axios.get(ollamaUrl, { timeout: 5000 });
    const names = (ollamaResp.data.models || []).map(m => m.name);
    console.log('Modelos encontrados:', names.length);
    res.json(names);
  } catch (err) {
    let errorMsg = `Error fetching models: ${err.message}`;
    if (err.code === 'ECONNREFUSED') {
      errorMsg += '\n\n>>> ¿Ollama está corriendo? Ejecuta: ollama serve';
    } else if (err.code === 'ENOTFOUND') {
      errorMsg += `\n\n>>> No se pudo resolver el host: ${OLLAMA_HOST}`;
    } else if (err.code === 'ECONNABORTED' || err.code === 'ECONNRESET') {
      errorMsg += '\n\n>>> Ollama no respondió a tiempo. Verifica que esté accesible en ' + ollamaUrl;
    }
    console.error(errorMsg);
    res.status(500).json({ 
      error: 'Could not fetch models',
      detail: err.message,
      ollamaHost: OLLAMA_HOST,
      ollamaPort: OLLAMA_PORT,
      hint: err.code === 'ECONNREFUSED' ? 'Ollama no está corriendo. Ejecuta "ollama serve"' : 'Verifica que Ollama esté accesible en ' + OLLAMA_HOST + ':' + OLLAMA_PORT
    });
  }
});

/** GET /api/conversations - lista todas */
app.get('/api/conversations', (_req, res) => {
  const list = [];
  for (const [id, conv] of conversations.entries()) {
    list.push({ id, name: conv.name, created: id }); // usamos timestamp como nombre
  }
  list.sort((a, b) => b.id.localeCompare(a.id)); // más recientes primero
  res.json(list);
});

/** POST /api/conversations - crea nueva */
app.post('/api/conversations', (req, res) => {
  const { id, name } = req.body;
  if (!id) return res.status(400).json({ error: 'Falta ID' });
  
  const chatName = name || `Chat ${new Date().toLocaleTimeString()}`;
  conversations.set(id, { 
    name: chatName, 
    messages: [],
    createdAt: new Date().toISOString()
  });
  guardarConversaciones();
  res.json({ ok: true, id, name: chatName });
});

/** DELETE /api/conversations/:id - elimina */
app.delete('/api/conversations/:id', (req, res) => {
  if (conversations.has(req.params.id)) {
    conversations.delete(req.params.id);
    guardarConversaciones();
    res.json({ ok: true });
  } else {
    res.status(404).json({ error: 'No encontrada' });
  }
});

/** GET /api/conversations/:id - obtiene mensajes */
app.get('/api/conversations/:id', (req, res) => {
  const conv = conversations.get(req.params.id);
  if (conv) res.json(conv.messages);
  else res.status(404).json({ error: 'No encontrada' });
});

/** POST /api/conversations/:id/complete - frontend envía respuesta completa */
app.post('/api/conversations/:id/complete', (req, res) => {
  const conv = conversations.get(req.params.id);
  if (!conv) return res.status(404).json({ error: 'No encontrada' });
  
  const { assistantContent } = req.body;
  if (!assistantContent) return res.status(400).json({ error: 'Falta contenido' });
  
  // Encontrar el último mensaje del usuario (debe ser la pregunta actual)
  let lastUserIdx = -1;
  for (let i = conv.messages.length - 1; i >= 0; i--) {
    if (conv.messages[i].role === 'user') {
      lastUserIdx = i;
      break;
    }
  }
  
  // Eliminar SOLO los mensajes del asistente que VENGAN DESPUÉS del último user message
  // Esto preserva respuestas anteriores de iteracciones previas
  let toRemoveCount = 0;
  for (let i = lastUserIdx + 1; i < conv.messages.length; i++) {
    if (conv.messages[i].role === 'assistant') {
      toRemoveCount++;
    }
  }
  
  if (toRemoveCount > 0) {
    conv.messages.splice(lastUserIdx + 1, toRemoveCount);
  }
  
  // Agregar la respuesta completa limpia DESPUÉS del último user message
  conv.messages.splice(lastUserIdx + 1, 0, { role: 'assistant', content: assistantContent });
  
  // Generar título si es necesario
  const userMsg = conv.messages.find(m => m.role === 'user');
  if (userMsg) {
    conv.name = generarTituloConversacion(userMsg.content);
  }
  
  guardarConversaciones();
  res.json({ ok: true, name: conv.name });
});

/** POST /api/chat - envía mensaje con historial */
app.post('/api/chat', async (req, res) => {
  const { id, model, message } = req.body;
  
  if (!id || !model || !message) return res.status(400).json({ error: 'Faltan campos' });
  const conv = conversations.get(id);
  if (!conv) return res.status(404).json({ error: 'Conversación no encontrada' });

  // Guardar mensaje del usuario
  conv.messages.push({ role: 'user', content: message });

  try {
    // Enviar solo una ventana de mensajes a Ollama para controlar el payload
    const messagesForContext = buildContextWindow(conv.messages);
    
    const ollamaResp = await axios.post(`http://${OLLAMA_HOST}:${OLLAMA_PORT}/api/chat`, {
      model,
      messages: messagesForContext,
      stream: true
    }, { responseType: 'stream' });

    res.setHeader('Content-Type', 'application/json');
    
    let buffer = '';
    let lastContentSent = ''; // Evitar duplicados al enviar al frontend
    const seenChunks = new Set(); // Tracking de chunks para evitar duplicados al guardar
    let doneSent = false; // Rastrear si ya se envió { done: true }
    
    ollamaResp.data.on('data', chunk => {
      buffer += chunk.toString();
      
      // Procesar líneas completas (Ollama envía un JSON por línea)
      const lines = buffer.split('\n');
      // Mantener la última parte en buffer si está incompleta
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const json = JSON.parse(line);
          
          // Enviar solo el content real al frontend (stream limpio)
          let contentToSend = null;
          
          if (json.message?.content && json.message.content !== lastContentSent) {
            contentToSend = json.message.content;
          } else if (json.message?.thinking && !json.message?.content) {
            // Solo thinking sin contenido aún: enviar como chunk silencioso
            contentToSend = null; // No mostrar thinking al usuario
          }
          
          if (contentToSend !== null && contentToSend !== '') {
            res.write(JSON.stringify({ 
              message: contentToSend,
              done: false 
            }) + '\n');
            lastContentSent = contentToSend;
          }
          
          // No guardar chunks durante el stream - la respuesta completa se guarda vía /complete
          
          if (json.done) {
            // Generar título solo al primer mensaje del usuario (cuando el user message actual es el primero)
            const userMsgCount = conv.messages.filter(m => m.role === 'user').length;
            if (userMsgCount === 1 && !conv.name || conv.name.startsWith('Conversación')) {
              const firstUserMsg = conv.messages.find(m => m.role === 'user');
              if (firstUserMsg) {
                conv.name = generarTituloConversacion(firstUserMsg.content);
              }
            }
            
            guardarConversaciones();
            
            res.write(JSON.stringify({ done: true }) + '\n');
            doneSent = true;
            res.end();
          }
        } catch(e) {
          console.error('Error parsing Ollama chunk:', e.message);
        }
      }
    });

    ollamaResp.data.on('end', () => {
      // Procesar cualquier línea restante en el buffer
      if (buffer.trim() && !doneSent) {
        try {
          const json = JSON.parse(buffer);
          if (json.message?.content && json.message.content !== lastContentSent) {
            res.write(JSON.stringify({ 
              message: json.message.content,
              done: false 
            }) + '\n');
            doneSent = true;
          }
        } catch(e) {}
      }
      if (!doneSent && !res.writableEnded) {
        // Si no se envió nada durante el stream (modelo solo pensó), guardar igual
        const lastUserMsg = conv.messages.find(m => m.role === 'user');
        if (lastUserMsg && !conv.messages.find(m => m.role === 'assistant')) {
          conv.messages.push({ role: 'assistant', content: '(sin respuesta)' });
          const userMsg = conv.messages.find(m => m.role === 'user');
          if (userMsg) {
            conv.name = generarTituloConversacion(userMsg.content);
          }
        }
        guardarConversaciones();
        res.write(JSON.stringify({ done: true }) + '\n');
        doneSent = true;
        res.end();
      }
    });

    ollamaResp.data.on('error', (err) => {
      console.error('Ollama stream error:', err.message);
      // Guardar incluso si hubo error
      conv.messages.push({ role: 'assistant', content: `(Error: ${err.message})` });
      const userMsg = conv.messages.find(m => m.role === 'user');
      if (userMsg) {
        conv.name = generarTituloConversacion(userMsg.content);
      }
      guardarConversaciones();
      if (!res.writableEnded) {
        res.write(JSON.stringify({ error: err.message, done: true }) + '\n');
        res.end();
      }
    });

  } catch (err) {
    console.error('Error contacting Ollama:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`Ollama UI listening on http://localhost:${PORT}`));