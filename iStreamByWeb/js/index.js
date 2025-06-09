// js/index.js

// Função para limpar todas as mensagens de erro visíveis
function clearAllAuthMessages() {
    const errorElements = [
        document.getElementById("email-error"),
        document.getElementById("password-error"),
        document.getElementById("signup-email-error"), // Se for implementar signup
        document.getElementById("signup-password-error"), // Se for implementar signup
        document.getElementById("auth-general-error")
    ];
    errorElements.forEach(el => {
        if (el) {
            el.classList.add('hidden');
            el.textContent = ''; // Limpa o texto
        }
    });
}

// Função para exibir mensagens de erro
function showMessage(elementId, message, isError = true) {
    const el = document.getElementById(elementId);
    if (el) {
        el.textContent = message;
        el.classList.remove('hidden');
        if (isError) {
            el.classList.remove('text-green-400'); // Caso tenha sido usado para sucesso
            el.classList.add('text-red-400');
        } else {
            el.classList.remove('text-red-400');
            el.classList.add('text-green-400'); // Para mensagens de sucesso
        }
    } else {
        console.warn(`Element with ID '${elementId}' not found for showing message.`);
    }
}


document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM completamente carregado e parseado. Tentando carregar Firebase...");

  import("https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js")
    .then(({ initializeApp }) => {
      console.log("Firebase App SDK carregado.");
      import("https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js")
        .then(({ getAuth, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword }) => {
          console.log("Firebase Auth SDK carregado.");


          const firebaseConfig = {
  apiKey: "AIzaSyCqfBDHkKEsHSzdb5KTvagYwoEk1b3da3o",
  authDomain: "istreambyweb.firebaseapp.com",
  projectId: "istreambyweb",
  storageBucket: "istreambyweb.firebasestorage.app",
  messagingSenderId: "458543632560",
  appId: "1:458543632560:web:1de42763df2d1515316b75",
  measurementId: "G-JWNQKK2ZKW"
          };

          try {
            const app = initializeApp(firebaseConfig);
            const auth = getAuth(app);
            auth.languageCode = 'en';
            console.log("Firebase inicializado com sucesso.");

            // --- Lógica de Login com Google ---
            const googleProvider = new GoogleAuthProvider();
            const googleButton = document.getElementById("google-button");

            if (googleButton) {
              googleButton.addEventListener("click", () => {
                clearAllAuthMessages(); // Limpa mensagens de erro anteriores
                console.log("Botão Google clicado. Tentando login com pop-up...");
                signInWithPopup(auth, googleProvider)
                  .then((result) => {
                    const user = result.user;
                    console.log("Usuário logado com Google:", user.displayName, user.email);
                    showMessage("auth-general-error", "Login com Google bem-sucedido! Redirecionando...", false);
                    window.location.href = "pages/home.html"; // Redireciona para a página home
                  })
                  .catch((error) => {
                    console.error("Erro no login com Google:", error.code, error.message);
                    let friendlyMessage = "Falha no login com Google. Tente novamente.";
                    if (error.code === 'auth/popup-closed-by-user') {
                      friendlyMessage = "Login cancelado. A janela de pop-up foi fechada.";
                    } else if (error.code === 'auth/popup-blocked') {
                      friendlyMessage = "Pop-up bloqueado pelo navegador. Por favor, permita pop-ups e tente novamente.";
                    } else if (error.code === 'auth/cancelled-popup-request') {
                        friendlyMessage = "Múltiplas tentativas de login. Tente novamente.";
                    } else if (error.code === 'auth/unauthorized-domain' || error.code === 'auth/operation-not-allowed') {
                        friendlyMessage = "Domínio não autorizado ou método de login desabilitado no Firebase.";
                    }
                    showMessage("auth-general-error", friendlyMessage);
                  });
              });
            } else {
              console.warn("Botão de login do Google (ID: google-button) não encontrado.");
            }

            // --- Lógica de Login com Email/Senha ---
            const loginButton = document.getElementById("login-button");
            const loginEmailInput = document.getElementById("login-email");
            const loginPasswordInput = document.getElementById("login-password");

            if (loginButton && loginEmailInput && loginPasswordInput) {
              loginButton.addEventListener("click", (event) => {
                event.preventDefault(); // Previne o envio padrão do formulário
                clearAllAuthMessages(); // Limpa mensagens de erro anteriores

                const email = loginEmailInput.value.trim();
                const password = loginPasswordInput.value;
                let isValid = true;

                if (email === "") {
                  showMessage("email-error", "O endereço de email é obrigatório.");
                  isValid = false;
                } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                  showMessage("email-error", "Por favor, insira um formato de email válido.");
                  isValid = false;
                }

                if (password === "") {
                  showMessage("password-error", "A senha é obrigatória.");
                  isValid = false;
                } else if (password.length < 6) { // Firebase exige no mínimo 6 caracteres para senha
                  showMessage("password-error", "A senha deve ter pelo menos 6 caracteres.");
                  isValid = false;
                }

                if (!isValid) {
                  return;
                }

                console.log(`Tentando login com Email: ${email}`);
                signInWithEmailAndPassword(auth, email, password)
                  .then((userCredential) => {
                    const user = userCredential.user;
                    console.log("Usuário logado com Email/Senha:", user.email);
                    showMessage("auth-general-error", "Login bem-sucedido! Redirecionando...", false);
                    window.location.href = "pages/home.html"; // Redireciona para a página home
                  })
                  .catch((error) => {
                    console.error("Erro no login com Email/Senha:", error.code, error.message);
                    if (error.code === 'auth/invalid-email') {
                      showMessage("email-error", "O formato do email é inválido.");
                    } else if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                      showMessage("password-error", "Email ou senha incorretos.");
                      showMessage("email-error", "Email ou senha incorretos."); // opcional, para indicar ambos os campos
                    } else {
                      showMessage("auth-general-error", `Falha no login: ${error.message}`);
                    }
                  });
              });
            } else {
              console.warn("Elementos do formulário de login (botão, email, senha) não encontrados.");
            }

            // NOTA: A lógica de SIGN UP (CADASTRO) não foi implementada aqui.
            // O botão signup-button e os campos signup-email, signup-password existem no HTML,
            // mas precisarão de um event listener e da função createUserWithEmailAndPassword
            // similar à lógica de login acima, se desejar implementar o cadastro.

          } catch (e) {
            console.error("Erro ao inicializar o Firebase ou configurar listeners:", e);
            showMessage("auth-general-error", "Erro crítico na configuração da página. Tente recarregar.");
          }
        })
        .catch(err => {
          console.error("Falha ao carregar o Firebase Auth SDK:", err);
          showMessage("auth-general-error", "Não foi possível carregar os recursos de autenticação. Verifique sua conexão ou tente mais tarde.");
        });
    })
    .catch(err => {
      console.error("Falha ao carregar o Firebase App SDK:", err);
      showMessage("auth-general-error", "Não foi possível carregar os recursos principais. Verifique sua conexão ou tente mais tarde.");
    });
});