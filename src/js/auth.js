// src/js/auth.js (versión segura y actualizada)

document.addEventListener('DOMContentLoaded', () => {
    const isLoginPage = !!document.getElementById('login-form');
    const isProtectedPage = window.location.pathname.endsWith('admin.html');

    // --- Lógica para proteger la página de administración (sin cambios) ---
    if (isProtectedPage) {
        const isAuthenticated = sessionStorage.getItem('isAdminAuthenticated');
        if (isAuthenticated !== 'true') {
            window.location.href = 'login.html';
            return;
        }

        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                sessionStorage.removeItem('isAdminAuthenticated');
                window.location.href = 'login.html';
            });
        }
    }

    if (isLoginPage) {
        const form = document.getElementById('login-form');
        const errorMessage = document.getElementById('error-message');

        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            errorMessage.style.display = 'none';

            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;

            try {
                const response = await fetch('/api/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ username, password }),
                });

                // 1. Leemos la respuesta del servidor para obtener los datos (incluido el token)
                const data = await response.json();

                if (response.ok) {
                    // 2. Guardamos AMBAS claves en sessionStorage
                    sessionStorage.setItem('isAdminAuthenticated', 'true');
                    sessionStorage.setItem('authToken', data.token); // ¡Esta es la línea que faltaba!

                    // 3. Redirigimos a la página de administración
                    window.location.href = 'admin.html';
                } else {
                    // Si la respuesta es un error (401, 500), mostramos el mensaje
                    errorMessage.style.display = 'block';
                }
            } catch (error) {
                console.error('Error al intentar iniciar sesión:', error);
                errorMessage.textContent = 'Error de conexión. Inténtalo de nuevo.';
                errorMessage.style.display = 'block';
            }
        });
    }
});