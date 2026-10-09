// ==========================================
// LÓGICA DEL WIDGET DE CHAT IA
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  const chatToggle = document.getElementById('chat-toggle');
  const chatWindow = document.getElementById('chat-window');
  const chatClose = document.getElementById('chat-close');
  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-input');
  const chatMessages = document.getElementById('chat-messages');

  if (!chatToggle || !chatWindow || !chatForm) return;

  // Abrir/Cerrar la ventana del chat
  chatToggle.addEventListener('click', () => {
    chatWindow.classList.toggle('scale-0');
    chatWindow.classList.toggle('scale-100');
    
    if (chatWindow.classList.contains('scale-100')) {
      chatInput.focus();
    }
  });

  chatClose.addEventListener('click', () => {
    chatWindow.classList.remove('scale-100');
    chatWindow.classList.add('scale-0');
  });

  // Función para agregar mensajes a la interfaz
  function appendMessage(text, sender) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('flex', 'items-start');
    
    // Convertir **texto** a <strong>texto</strong> para negrillas
    const formattedText = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    if (sender === 'user') {
      messageDiv.classList.add('justify-end');
      messageDiv.innerHTML = `
        <div class="bg-blue-600 text-white p-3 rounded-2xl rounded-br-none max-w-[80%] text-sm shadow-sm">
          ${formattedText}
        </div>
      `;
    } else {
      messageDiv.classList.add('justify-start');
      messageDiv.innerHTML = `
        <div class="bg-slate-700 text-slate-200 p-3 rounded-2xl rounded-bl-none max-w-[80%] text-sm shadow-sm">
          ${formattedText}
        </div>
      `;
    }
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight; // Auto scroll al final
  }

  // Manejar el envío del formulario
  chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    
    if (!text) return;
    
    // 1. Mostrar el mensaje del usuario
    appendMessage(text, 'user');
    chatInput.value = '';
    
    // 2. Consultar la API del Backend
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message: text })
      });

      const data = await response.json();

      if (data && data.reply) {
        appendMessage(data.reply, 'ia');
      } else {
        appendMessage('No pude obtener respuesta del servidor.', 'ia');
      }
    } catch (error) {
      console.error('Error al enviar mensaje:', error);
      appendMessage('Error de conexión con el servidor de AquaPredict.', 'ia');
    }
  });
});