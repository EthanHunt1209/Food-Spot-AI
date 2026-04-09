// backend/middleware/email.js
// Email sending has been moved entirely to the frontend via EmailJS.
// This file is kept as a stub so nothing breaks if it gets imported elsewhere.
// Backend routes no longer call sendOTPEmail or sendPasswordResetEmail.

async function sendOTPEmail() {
  throw new Error('Backend email sending is disabled. Use /api/auth/prepare-otp instead — EmailJS sends the email from the frontend.');
}

async function sendPasswordResetEmail() {
  throw new Error('Backend email sending is disabled. Use /api/auth/prepare-reset instead — EmailJS sends the email from the frontend.');
}

module.exports = { sendOTPEmail, sendPasswordResetEmail };