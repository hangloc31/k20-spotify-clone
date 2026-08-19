import { httpRequest, HttpError } from "../services/http.js";
import { saveSession, isLoggedIn } from "../services/auth.js";

const formSignup = document.querySelector(".signup-form");
const usernameInput = document.querySelector("#username");
const emailInput = document.querySelector("#email");
const passwordInput = document.querySelector("#password");
const displayNameInput = document.querySelector("#display_name");
const bioInput = document.querySelector("#bio");
const countrySelect = document.querySelector("#country");
const submitBtn = formSignup?.querySelector(".signup-form__submit");
const formErrorEl = document.querySelector(".signup-form__error");
const toastEl = document.querySelector("#toast");

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const usernamePattern = /^[a-zA-Z0-9]+$/;

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

function validateUsername(value) {
  if (!value) return "Vui lòng nhập tên người dùng.";
  if (!usernamePattern.test(value)) return "Tên người dùng chỉ được chứa chữ và số.";
  return null;
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

function validateDisplayName(value) {
  if (!value) return "Vui lòng nhập tên hiển thị.";
  return null;
}

function validateBio(value) {
  if (!value) return "Vui lòng nhập phần giới thiệu bản thân.";
  return null;
}

function showError(input, message) {
  const field = input.closest(".signup-form__field");
  field.classList.add("is-error");
  field.querySelector(".error-msg").textContent = message;
}

function clearError(input) {
  const field = input.closest(".signup-form__field");
  field.classList.remove("is-error");
  field.querySelector(".error-msg").textContent = "";
}

function setLoading(loading) {
  if (!submitBtn) return;
  submitBtn.disabled = loading;
  submitBtn.textContent = loading ? "Đang đăng ký..." : "Đăng ký";
}

if (isLoggedIn()) {
  location.href = "/";
}

const messageParam = new URLSearchParams(location.search).get("message");
if (messageParam) {
  showToast(messageParam);
}

formSignup.addEventListener("submit", async (e) => {
  e.preventDefault();

  setFormError();

  const username = usernameInput.value.trim();
  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();
  const displayName = displayNameInput.value.trim();
  const bio = bioInput.value.trim();
  const country = countrySelect.value;

  const usernameError = validateUsername(username);
  const emailError = validateEmail(email);
  const passwordError = validatePassword(password);
  const displayNameError = validateDisplayName(displayName);
  const bioError = validateBio(bio);

  usernameError ? showError(usernameInput, usernameError) : clearError(usernameInput);
  emailError ? showError(emailInput, emailError) : clearError(emailInput);
  passwordError ? showError(passwordInput, passwordError) : clearError(passwordInput);
  displayNameError
    ? showError(displayNameInput, displayNameError)
    : clearError(displayNameInput);
  bioError ? showError(bioInput, bioError) : clearError(bioInput);

  if (usernameError || emailError || passwordError || displayNameError || bioError) return;

  setLoading(true);

  try {
    const data = await httpRequest.post("/api/auth/register", {
      username,
      email,
      password,
      display_name: displayName,
      bio,
      country,
    });

    saveSession(data);
    showToast("Đăng ký thành công!");

    setTimeout(() => {
      location.href = "/";
    }, 1500);
  } catch (error) {
    if (error.name === "AbortError") {
      setFormError("Hết thời gian kết nối. Vui lòng thử lại.");
    } else if (error instanceof HttpError) {
      const detail = error.details?.[0]?.message;
      setFormError(detail || error.message);
    } else if (error instanceof TypeError) {
      setFormError("Không thể kết nối đến server. Vui lòng thử lại.");
    } else {
      setFormError(error.message || "Đã xảy ra lỗi. Vui lòng thử lại.");
    }
  } finally {
    setLoading(false);
  }
});

[usernameInput, emailInput, passwordInput, displayNameInput, bioInput].forEach(
  (input) => {
    input.addEventListener("input", () => {
      clearError(input);
      setFormError();
    });
  },
);