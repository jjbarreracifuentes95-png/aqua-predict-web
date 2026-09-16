/**
 * AQUA-PREDICT - Sistema de Monitoreo y Analítica Predictiva de Agua
 * Archivo: js/login.js
 * Descripción: Manejo del evento de inicio de sesión y validación de credenciales.
 */

document.addEventListener("DOMContentLoaded", () => {
  // Captura de referencias de elementos del DOM
  const loginForm = document.getElementById("login-form");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const errorAlert = document.getElementById("error-alert");

  /**
   * MANEJADOR DEL EVENTO DE ENVÍO DEL FORMULARIO (SUBMIT)
   */
  loginForm.addEventListener("submit", (event) => {
    // Previene la recarga automática de la página que hace el navegador por defecto
    event.preventDefault();

    // Obtener valores ingresados limpiando espacios adicionales
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    // CREDENCIALES DE PRUEBA PARA LA DEMOSTRACIÓN / EXPOSICIÓN
    const VALID_EMAIL = "jbarreracifuentes@gmail.com";
    const VALID_PASSWORD = "admin1234";

    // VALIDACIÓN BÁSICA
    if (email === VALID_EMAIL && password === VALID_PASSWORD) {
      // Éxito: Oculta alertas de error si existían
      errorAlert.classList.add("hidden");

      // Guardar sesión simulada en el almacenamiento del navegador (sessionStorage)
      sessionStorage.setItem("aqua_authenticated", "true");
      sessionStorage.setItem("aqua_user", email);

      // Redireccionar al Dashboard principal (index.html)
      window.location.href = "index.html";
    } else {
      // Error: Muestra el cuadro de alerta de credenciales incorrectas
      errorAlert.classList.remove("hidden");
    }
  });
});