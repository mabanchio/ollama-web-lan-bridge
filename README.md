# ollama-web — LAN Bridge POC

Proof of concept: un servidor web Express ligero que hace puente entre una red LAN y una instancia remota de Ollama, permitiendo conversar con modelos instalados en esa endpoint a través de la red local.

---

## Tabla de Contenidos

- [Descripción General](#descripción-general)
- [Prerrequisitos](#prerrequisitos)
- [Instalación](#instalación)
- [Uso](#uso)
- [Variables de Entorno](#variables-de-entorno)
- [Arquitectura](#arquitectura)
- [Flujo de Petición](#flujo-de-petición)
- [Ventana de Contexto](#ventana-de-contexto)
- [Estructura del Proyecto](#estructura-del-proyecto)
- [Licencia](#licencia)

---

## Descripción General

`ollama-web` es una aplicación full-stack minimalista diseñada como **POC de enlace LAN**: toma un servidor Ollama corriendo en cualquier máquina conectada a la red y lo expone a través de una interfaz web limpia con respuestas en tiempo real. No se requiere inferencia local — solo una conexión funcional entre este servidor web y el endpoint remoto de Ollama.

**Capacidades principales:**

- Respuestas en streaming desde modelos remotos vía chunking JSON
- Persistencia de conversaciones (JSON-based, a nivel de archivo)
- Ventana de contexto acotada para controlar tamaño de payload en threads largos
- Filtrado de contenido "thinking" para modelos que usan reasoning tokens

## Prerrequisitos

- **Ollama** corriendo en una máquina conectada a la LAN (`ollama serve`)
- Al menos un modelo descargado: `ollama pull <nombre-del-modelo>`
- **Node.js 18+** instalado localmente
- Conectividad de red entre el host del servidor web y el host de Ollama

## Instalación

```bash
npm install
```

## Uso

### Iniciar el servidor

```bash
npm start
# o directamente
node server.js
```

La interfaz web estará disponible en `http://localhost:80`.

> **Nota:** El puerto por defecto es 80 para funcionar como endpoint LAN. Cambiar vía `PORT` si otro servicio lo ocupa.

## Environment Variables

| Variable | Default | Descripción |
|----------|---------|-------------|
| `PORT` | `80` | Puerto HTTP donde escucha Express |
| `OLLAMA_HOST` | `192.168.0.100` | IP LAN del equipo donde corre Ollama |
| `OLLAMA_PORT` | `11434` | Puerto API de Ollama (estándar) |
| `CONTEXT_WINDOW` | `10` | Mensajes máximos enviados a Ollama por turno |

### Ejemplo

```bash
OLLAMA_HOST=192.168.0.50 CONTEXT_WINDOW=20 npm start
```

## Arquitectura

```
┌──────────────┐      HTTP / JSON-stream       ┌──────────────────┐
│   Navegador   │ ◄──────────────────────────► │  Servidor Express │
│  (usuario LAN)│                              │  (esta máquina)   │
└──────────────┘                               └────────┬─────────┘
                                                        │
                                            /api/chat  │  POST (streaming)
                                                        ▼
                                               ┌─────────────────┐
                                               │  Ollama (LAN)   │
                                               │  :11434         │
                                               └─────────────────┘
```

## Flujo de Petición

1. El frontend envía un mensaje a `POST /api/chat` con el contexto de la conversación
2. Express proxyea la petición a Ollama usando `responseType: 'stream'`
3. Los tokens de thinking/reasoning se filtran antes de enviarlos al cliente
4. Al completarse el stream, la respuesta completa se persiste en `data/chats.json`

### Ventana de Contexto

Para prevenir payloads que crecen exponencialmente en conversaciones largas, solo se envía a Ollama una **ventana de contexto acotada**:

- El par usuario-asistente inicial se mantiene como contexto global
- Se incluyen los últimos `N - 2` mensajes (donde `N = CONTEXT_WINDOW`)

El historial completo se conserva en memoria para visualización; la ventana reducida protege contra desborde de presupuesto de tokens.

## Estructura del Proyecto

```
server.js              Servidor Express (API + proxy Ollama)
public/
├── index.html         Shell de la interfaz principal
├── app.js             Lógica del cliente
└── style.css          Hoja de estilos
data/
└── chats.json         Almacenamiento persistente de conversaciones
package.json           Dependencias y scripts
```

## Licencia

Este proyecto se libera bajo la **Licencia MIT**. Ver [LICENSE](LICENSE) para más detalles.

---

<div style="text-align:center;margin:10px 0;"><a href="https://ab-tech.com.ar" target="_blank" rel="noopener noreferrer"><img src="https://ab-tech.com.ar/assets/img/logo.png" alt="Logo de AB-Tech" width="100"></a></div>

**Desarrollado por:** [AB-Tech](https://ab-tech.com.ar) — `ollama-web` fue desarrollado con asistencia de IA Qwen3.6.

