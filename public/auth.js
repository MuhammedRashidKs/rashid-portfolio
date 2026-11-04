// Login and registration page interactions.
document.addEventListener("DOMContentLoaded", function () {
  const form = document.getElementById("authForm");
  const nameGroup = document.getElementById("nameGroup");
  const nameInput = document.getElementById("name");
  const passwordInput = document.getElementById("password");
  const heading = document.getElementById("heading");
  const subheading = document.getElementById("subheading");
  const submitButton = document.getElementById("submitButton");
  const switchText = document.getElementById("switchText");
  const message = document.getElementById("authMessage");
  let registerMode = false;

  function setMode(register) {
    registerMode = register;
    form.action = register ? "/register" : "/login";
    nameGroup.hidden = !register;
    nameInput.required = register;
    passwordInput.autocomplete = register ? "new-password" : "current-password";
    document.title = (register ? "Create account" : "Login") + " | Rashid Portfolio";
    heading.innerHTML = register ? "Create account<span>.</span>" : "Welcome back<span>.</span>";
    subheading.textContent = register
      ? "Create an account to manage your portfolio."
      : "Sign in to manage your portfolio.";
    submitButton.textContent = register ? "Create account" : "Login to portfolio";
    switchText.innerHTML = register
      ? 'Already registered? <a href="#" id="switchLink">Login</a>'
      : 'New here? <a href="#" id="switchLink">Create an account</a>';
  }

  switchText.addEventListener("click", function (event) {
    if (!event.target.closest("#switchLink")) return;
    event.preventDefault();
    message.textContent = "";
    setMode(!registerMode);
  });

  // The server sends people back here with ?error=... when something goes wrong.
  const params = new URLSearchParams(window.location.search);
  if (params.get("mode") === "register") setMode(true);
  const errors = {
    login: "That email and password don't match. Check them and try again.",
    exists: "An account with this email already exists. Log in instead.",
    invalid: "Enter your full name, a valid email and a password of at least 6 characters."
  };
  if (errors[params.get("error")]) message.textContent = errors[params.get("error")];
});
