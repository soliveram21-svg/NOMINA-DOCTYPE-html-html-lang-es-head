const VALID_USERNAME = '1001977786';
const VALID_PASSWORD = '1001977786';

const loginForm = document.getElementById('loginForm');
const errorMessage = document.getElementById('errorMessage');

loginForm.addEventListener('submit', function (event) {
  event.preventDefault();

  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;

  if (username === VALID_USERNAME && password === VALID_PASSWORD) {
    window.location.href = '../inicio/index.html';
    return;
  }

  errorMessage.textContent = 'Usuario o contraseña incorrectos.';
});
