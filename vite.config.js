import { defineConfig } from 'vite';

// Build every HTML page as a separate entry so internal page links work in dist.
export default defineConfig({
  build: {
    rollupOptions: {
      input: [
        'index.html',
        'admin-dashboard.html',
        'admin-profile.html',
        'admin-system-log.html',
        'Login-codes/blocked-screen.html',
        'Login-codes/breathsafe-admin-login.html',
        'Login-codes/forgot-password.html',
        'Login-codes/privacy-policy.html',
        'Login-codes/signup.html',
        'user-dashboard/user-dashboard.html',
        'user-dashboard/user-profile.html',
        'user-dashboard/user-settings.html',
        'user-dashboard/user-welcome.html'
      ]
    }
  }
});
