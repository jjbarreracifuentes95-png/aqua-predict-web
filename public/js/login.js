/**
 * AQUA-PREDICT - Sistema de Monitoreo y Analítica Predictiva de Agua
 * Archivo: js/login.js
 * Descripción: Manejo del evento de inicio de sesión y validación de credenciales.
 */

document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("login-form");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const errorAlert = document.getElementById("error-alert");

  if (!loginForm) return;

  loginForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    // CREDENCIALES DE PRUEBA
    const VALID_EMAIL = "jbarreracifuentes@gmail.com";
    const VALID_PASSWORD = "admin1234";

    if (email === VALID_EMAIL && password === VALID_PASSWORD) {
      if (errorAlert) errorAlert.classList.add("hidden");

      // Objeto de usuario estructurado para localStorage
      const userData = {
        name: "Juan José Barrera",
        email: email,
        role: "Administrador"
      };

      // Guardar en localStorage para persistencia compatible con app.js
      localStorage.setItem("aqua_user", JSON.stringify(userData));

      // Redireccionar a la pantalla principal
      window.location.replace("index.html");
    } else {
      if (errorAlert) errorAlert.classList.remove("hidden");
    }
  });
});