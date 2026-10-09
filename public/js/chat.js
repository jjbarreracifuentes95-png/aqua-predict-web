// ==========================================
// LÓGICA DEL WIDGET DE CHAT IA
// ==========================================
const chatToggle = document.getElementById('chat-toggle');
const chatWindow = document.getElementById('chat-window');
const chatClose = document.getElementById('chat-close');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatMessages = document.getElementById('chat-messages');

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
  
  if (sender === 'user') {
    messageDiv.classList.add('justify-end');
    messageDiv.innerHTML = `
      <div class="bg-blue-600 text-white p-3 rounded-2xl rounded-br-none max-w-[80%] text-sm shadow-sm">
        ${text}
      </div>
    `;
  } else {
    messageDiv.classList.add('justify-start');
    messageDiv.innerHTML = `
      <div class="bg-slate-700 text-slate-200 p-3 rounded-2xl rounded-bl-none max-w-[80%] text-sm shadow-sm">
        ${text}
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
  
  // Agregar mensaje del usuario
  appendMessage(text, 'user');
  chatInput.value = '';
  
  // Simular tiempo de respuesta de la IA
  setTimeout(() => {
    // AQUÍ Conectarás con tu backend en Python más adelante
    const iaResponse = `Procesando: "${text}". Esta función estará disponible a las 3:00 p.m.`;
    appendMessage(iaResponse, 'ia');
  }, 800);
});