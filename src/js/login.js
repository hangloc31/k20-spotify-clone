import { httpRequest, HttpError } from "../services/http.js";
import { saveSession, isLoggedIn } from "../services/auth.js";

const formLogin = document.querySelector(".login-form");
const emailInput = document.querySelector("#email");
const passwordInput = document.querySelector("#password");
const submitBtn = formLogin?.querySelector(".login-form__submit");
const formErrorEl = document.querySelector(".login-form__error");
const toastEl = document.querySelector("#toast");

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let toastTimer;

function showToast(message) {
  if (!toastEl) return;
  toastEl.querySelector(".toast__message").textContent = message;
  toastEl.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("is-visible"), 2500);
}

function setFormError(message) {
  if (!formErrorEl) return;
  formErrorEl.textContent = message || "";
  formErrorEl.hidden = !message;
}

function validateEmail(value) {
  if (!value) return "Vui lòng nhập email.";
  if (!emailPattern.test(value)) return "Vui lòng nhập email hợp lệ.";
  return null;
}

function validatePassword(value) {
  if (!value) return "Vui lòng nhập mật khẩu.";
  if (value.length < 6) return "Mật khẩu phải có ít nhất 6 ký tự.";
  return null;
}

function showError(input, message) {
  const field = input.closest(".login-form__field");
  field.classList.add("is-error");
  field.querySelector(".error-msg").textContent = message;
}

function clearError(input) {
  const field = input.closest(".login-form__field");
  field.classList.remove("is-error");
  field.querySelector(".error-msg").textContent = "";
}

function setLoading(loading) {
  if (!submitBtn) return;
  submitBtn.disabled = loading;
  submitBtn.textContent = loading ? "Đang đăng nhập..." : "Đăng nhập";
}

if (isLoggedIn()) {
  location.href = "/";
}

const messageParam = new URLSearchParams(location.search).get("message");
if (messageParam) {
  showToast(messageParam);
}

formLogin.addEventListener("submit", async (e) => {
  e.preventDefault();

  setFormError();

  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();

  const emailError = validateEmail(email);
  const passwordError = validatePassword(password);

  emailError ? showError(emailInput, emailError) : clearError(emailInput);
  passwordError
    ? showError(passwordInput, passwordError)
    : clearError(passwordInput);

  if (emailError || passwordError) return;

  setLoading(true);

  try {
    const data = await httpRequest.post("/api/auth/login", { email, password });

    saveSession(data);
    showToast("Đăng nhập thành công!");

    setTimeout(() => {
      location.href = "/";
    }, 1500);
  } catch (error) {
    if (error.name === "AbortError") {
      setFormError("Hết thời gian kết nối. Vui lòng thử lại.");
    } else if (error instanceof HttpError) {
      setFormError(error.message);
    } else if (error instanceof TypeError) {
      setFormError("Không thể kết nối đến server. Vui lòng thử lại.");
    } else {
      setFormError(error.message || "Đã xảy ra lỗi. Vui lòng thử lại.");
    }
  } finally {
    setLoading(false);
  }
});

[emailInput, passwordInput].forEach((input) => {
  input.addEventListener("input", () => {
    clearError(input);
    setFormError();
  });
});
